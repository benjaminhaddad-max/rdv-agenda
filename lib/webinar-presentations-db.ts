import { createServiceClient } from '@/lib/supabase'
import {
  normalizeSlides,
  type FeedbackStatus,
  type PresentationStatus,
  type WebinarPresentation,
  type WebinarPresentationFeedback,
  type WebinarSlide,
} from '@/lib/webinar-presentations'
import { builtinDeckById, mergeBuiltinHtmlDecks } from '@/lib/webinar-html-decks'

const SETTINGS_KEY = 'webinar_presentations_store'

type SettingsStore = {
  presentations: WebinarPresentation[]
  feedback: WebinarPresentationFeedback[]
}

type Db = ReturnType<typeof createServiceClient>

let tableMode: boolean | null = null

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === 'PGRST205' || /webinar_presentations/i.test(error.message || '')
}

async function usesTable(db: Db): Promise<boolean> {
  if (tableMode != null) return tableMode
  const { error } = await db.from('webinar_presentations').select('id').limit(1)
  if (!error) {
    tableMode = true
    return true
  }
  if (isMissingTable(error)) {
    tableMode = false
    return false
  }
  throw new Error(error.message)
}

function emptyStore(): SettingsStore {
  return { presentations: [], feedback: [] }
}

async function readStore(db: Db): Promise<SettingsStore> {
  const { data, error } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()
  if (error || !data?.value || typeof data.value !== 'object') return emptyStore()
  const raw = data.value as Partial<SettingsStore>
  return {
    presentations: Array.isArray(raw.presentations) ? raw.presentations.map(hydratePresentation) : [],
    feedback: Array.isArray(raw.feedback) ? raw.feedback : [],
  }
}

async function writeStore(db: Db, store: SettingsStore) {
  const { error } = await db.from('crm_settings').upsert(
    {
      key: SETTINGS_KEY,
      value: store,
      description: 'Présentations webinaires (fallback tant que la table SQL n’est pas créée)',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) throw new Error(error.message)
}

function hydratePresentation(row: WebinarPresentation): WebinarPresentation {
  return { ...row, slides: normalizeSlides(row.slides) }
}

function openCount(feedback: WebinarPresentationFeedback[], id: string) {
  return feedback.filter(f => f.presentation_id === id && f.status === 'open').length
}

export type PresentationListItem = WebinarPresentation & { open_feedback: number }
export type PresentationDetail = WebinarPresentation & { feedback: WebinarPresentationFeedback[] }

export async function listPresentations(): Promise<PresentationListItem[]> {
  const db = createServiceClient()
  if (await usesTable(db)) {
    const { data, error } = await db
      .from('webinar_presentations')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    const ids = (data || []).map(r => r.id as string)
    const counts: Record<string, number> = {}
    if (ids.length) {
      const { data: fb } = await db
        .from('webinar_presentation_feedback')
        .select('presentation_id')
        .in('presentation_id', ids)
        .eq('status', 'open')
      for (const row of fb || []) {
        counts[row.presentation_id] = (counts[row.presentation_id] || 0) + 1
      }
    }
    return mergeBuiltinHtmlDecks((data || []).map(row => ({
      ...hydratePresentation(row as WebinarPresentation),
      open_feedback: counts[row.id] || 0,
    })))
  }

  const store = await readStore(db)
  return mergeBuiltinHtmlDecks(
    [...store.presentations]
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
      .map(p => ({ ...hydratePresentation(p), open_feedback: openCount(store.feedback, p.id) })),
  )
}

export async function getPresentation(id: string): Promise<PresentationDetail | null> {
  const db = createServiceClient()
  if (await usesTable(db)) {
    const { data, error } = await db
      .from('webinar_presentations')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) {
      const builtin = builtinDeckById(id)
      return builtin ? { ...builtin, feedback: [] } : null
    }
    const { data: feedback, error: fbErr } = await db
      .from('webinar_presentation_feedback')
      .select('*')
      .eq('presentation_id', id)
      .order('created_at', { ascending: false })
    if (fbErr) throw new Error(fbErr.message)
    return { ...hydratePresentation(data as WebinarPresentation), feedback: feedback || [] }
  }

  const store = await readStore(db)
  const p = store.presentations.find(x => x.id === id)
  if (!p) {
    const builtin = builtinDeckById(id)
    return builtin ? { ...builtin, feedback: [] } : null
  }
  return {
    ...hydratePresentation(p),
    feedback: store.feedback
      .filter(f => f.presentation_id === id)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
  }
}

export async function createPresentation(input: {
  title: string
  subtitle: string | null
  brand: string
  status: PresentationStatus
  brief: string | null
  source_guide: string | null
  slides: WebinarSlide[]
  webinar_date: string | null
  created_by: string | null
}): Promise<WebinarPresentation> {
  const db = createServiceClient()
  const now = new Date().toISOString()
  if (await usesTable(db)) {
    const { data, error } = await db
      .from('webinar_presentations')
      .insert({
        title: input.title,
        subtitle: input.subtitle,
        brand: input.brand,
        status: input.status,
        brief: input.brief,
        source_guide: input.source_guide,
        slides: input.slides,
        webinar_date: input.webinar_date,
        created_by: input.created_by,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return hydratePresentation(data as WebinarPresentation)
  }

  const row: WebinarPresentation = {
    id: crypto.randomUUID(),
    title: input.title,
    subtitle: input.subtitle,
    brand: input.brand,
    status: input.status,
    brief: input.brief,
    source_guide: input.source_guide,
    slides: input.slides,
    webinar_date: input.webinar_date,
    presented_at: null,
    created_by: input.created_by,
    created_at: now,
    updated_at: now,
  }
  const store = await readStore(db)
  store.presentations.unshift(row)
  await writeStore(db, store)
  return row
}

export async function updatePresentation(
  id: string,
  patch: Record<string, unknown>,
): Promise<WebinarPresentation | null> {
  const db = createServiceClient()
  if (await usesTable(db)) {
    const { data, error } = await db
      .from('webinar_presentations')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? hydratePresentation(data as WebinarPresentation) : null
  }

  const store = await readStore(db)
  const i = store.presentations.findIndex(p => p.id === id)
  if (i < 0) return null
  store.presentations[i] = {
    ...store.presentations[i],
    ...patch,
    id,
    updated_at: new Date().toISOString(),
  } as WebinarPresentation
  store.presentations[i].slides = normalizeSlides(store.presentations[i].slides)
  await writeStore(db, store)
  return store.presentations[i]
}

export async function deletePresentation(id: string): Promise<boolean> {
  const db = createServiceClient()
  if (await usesTable(db)) {
    const { error } = await db.from('webinar_presentations').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return true
  }
  const store = await readStore(db)
  const next = store.presentations.filter(p => p.id !== id)
  if (next.length === store.presentations.length) return false
  store.presentations = next
  store.feedback = store.feedback.filter(f => f.presentation_id !== id)
  await writeStore(db, store)
  return true
}

export async function addFeedback(
  presentationId: string,
  body: string,
  createdBy: string | null,
): Promise<WebinarPresentationFeedback> {
  const db = createServiceClient()
  if (await usesTable(db)) {
    const { data: exists } = await db
      .from('webinar_presentations')
      .select('id, status')
      .eq('id', presentationId)
      .maybeSingle()
    if (!exists) throw Object.assign(new Error('Introuvable'), { status: 404 })
    const { data, error } = await db
      .from('webinar_presentation_feedback')
      .insert({ presentation_id: presentationId, body, created_by: createdBy })
      .select()
      .single()
    if (error) throw new Error(error.message)
    if (exists.status === 'presented' || exists.status === 'ready') {
      await db.from('webinar_presentations').update({ status: 'needs_revision' }).eq('id', presentationId)
    }
    return data as WebinarPresentationFeedback
  }

  const store = await readStore(db)
  const p = store.presentations.find(x => x.id === presentationId)
  if (!p) throw Object.assign(new Error('Introuvable'), { status: 404 })
  const row: WebinarPresentationFeedback = {
    id: crypto.randomUUID(),
    presentation_id: presentationId,
    body,
    status: 'open',
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  store.feedback.unshift(row)
  if (p.status === 'presented' || p.status === 'ready') p.status = 'needs_revision'
  p.updated_at = new Date().toISOString()
  await writeStore(db, store)
  return row
}

export async function listFeedback(presentationId: string): Promise<WebinarPresentationFeedback[]> {
  const db = createServiceClient()
  if (await usesTable(db)) {
    const { data, error } = await db
      .from('webinar_presentation_feedback')
      .select('*')
      .eq('presentation_id', presentationId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  }
  const store = await readStore(db)
  return store.feedback
    .filter(f => f.presentation_id === presentationId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
}

export async function updateFeedbackStatus(
  presentationId: string,
  feedbackId: string,
  status: FeedbackStatus,
): Promise<WebinarPresentationFeedback | null> {
  const db = createServiceClient()
  if (await usesTable(db)) {
    const { data, error } = await db
      .from('webinar_presentation_feedback')
      .update({ status })
      .eq('id', feedbackId)
      .eq('presentation_id', presentationId)
      .select()
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data as WebinarPresentationFeedback | null
  }
  const store = await readStore(db)
  const f = store.feedback.find(x => x.id === feedbackId && x.presentation_id === presentationId)
  if (!f) return null
  f.status = status
  await writeStore(db, store)
  return f
}
