import { NextRequest, NextResponse } from 'next/server'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createEventsClient } from '@/lib/events-studio/client'
import {
  BRAND_CONFIG,
  EVENT_TYPES,
  type EventBrand,
  type EventTypeId,
} from '@/lib/events-studio/config'
import { createCrmFormForEvent } from '@/lib/events-studio/create-crm-form'
import {
  planningCsvToDrafts,
  type ImportDraftEvent,
} from '@/lib/events-studio/import-csv'

function buildEventDate(date: string, timeStart: string): string {
  const tmpDate = new Date(`${date}T${timeStart}`)
  const offset = -tmpDate.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const oh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const om = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${date}T${timeStart}:00${sign}${oh}:${om}`
}

function dateLabelFr(date: string): string {
  const [y, m, d] = date.split('-')
  if (y && m && d) return `${d}/${m}/${y}`
  return date
}

async function createOneFromDraft(draft: ImportDraftEvent): Promise<{
  ok: boolean
  event_id?: string
  form_url?: string | null
  form_warning?: string | null
  error?: string
  skipped_duplicate?: boolean
}> {
  const brand = draft.brand
  const eventType = draft.event_type as EventTypeId
  const typeCfg = EVENT_TYPES[eventType] || EVENT_TYPES.autre
  const brandCfg = BRAND_CONFIG[brand] || BRAND_CONFIG.diploma
  const db = createEventsClient()

  // Doublon : même marque + même nom + même jour (Europe/Paris)
  const dayStart = `${draft.date}T00:00:00+02:00`
  const dayEnd = `${draft.date}T23:59:59+02:00`
  const { data: existing } = await db
    .from('events')
    .select('id, name, event_date')
    .eq('brand', brand)
    .eq('name', draft.name)
    .gte('event_date', dayStart)
    .lte('event_date', dayEnd)
    .limit(1)

  if (existing && existing.length > 0) {
    return {
      ok: true,
      skipped_duplicate: true,
      event_id: existing[0].id,
      error: 'Déjà existant (même nom + date)',
    }
  }

  const isWebinar = eventType === 'webinaire'
  const noComms = !typeCfg.comms
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    name: draft.name,
    article: typeCfg.article || 'la',
    description: draft.description,
    brief: noComms ? null : draft.brief,
    event_date: buildEventDate(draft.date, draft.time_start),
    event_time_end: draft.time_end,
    location: draft.location,
    max_capacity: null,
    status: 'draft',
    hubspot_property_name: null,
    sms_factor_enabled: !noComms,
    sms_sender: brand === 'edumove' ? 'EDUMOVE' : brand === 'medibox' ? 'MEDIBOX' : 'DIPLOMA',
    sms_push_type: 1,
    sms_stop: false,
    zoom_join_url: isWebinar ? draft.zoom_join_url || brandCfg.defaultZoom || null : null,
    custom_sms: null,
    custom_emails: null,
    brand,
    event_type: eventType,
  }

  let { data: event, error } = await db.from('events').insert(payload).select().single()
  if (error && /event_type/.test(error.message || '')) {
    delete payload.event_type
    ;({ data: event, error } = await db.from('events').insert(payload).select().single())
  }
  if (error || !event) {
    return { ok: false, error: error?.message || 'Création événement échouée' }
  }

  const formName = `${draft.name} — ${dateLabelFr(draft.date)}`
  let formWarning: string | null = null
  let formUrl: string | null = null

  if (typeCfg.autoCrmForm) {
    try {
      const crmForm = await createCrmFormForEvent({
        name: formName,
        title: formName,
        brand,
        folder: brandCfg.folder,
        template: 'event',
        status: 'published',
      })
      formUrl = crmForm.public_url
      const { error: linkError } = await db.from('event_forms').insert({
        event_id: event.id,
        hubspot_form_id: crmForm.id,
        form_name: crmForm.name || formName,
        form_type: 'crm',
      })
      if (linkError) formWarning = `Form créé mais liaison: ${linkError.message}`
    } catch (e) {
      formWarning = e instanceof Error ? e.message : 'Erreur formulaire'
    }
  }

  return {
    ok: true,
    event_id: event.id,
    form_url: formUrl,
    form_warning: formWarning,
  }
}

export async function POST(req: NextRequest) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const brand = (body.brand || 'diploma') as EventBrand
  if (!BRAND_CONFIG[brand]) {
    return NextResponse.json({ error: 'Marque invalide' }, { status: 400 })
  }

  const mode = body.mode === 'commit' ? 'commit' : 'preview'
  const csvText = typeof body.csv === 'string' ? body.csv : ''
  if (!csvText.trim()) {
    return NextResponse.json({ error: 'CSV manquant' }, { status: 400 })
  }

  const { drafts, errors } = planningCsvToDrafts(csvText, brand)
  const toCreate = drafts.filter((d) => !d.skip)
  const skipped = drafts.filter((d) => d.skip)

  if (mode === 'preview') {
    return NextResponse.json({
      mode: 'preview',
      brand,
      errors,
      total_rows: drafts.length,
      will_create: toCreate.length,
      skipped: skipped.length,
      drafts,
    })
  }

  const results: Array<{
    row: number
    name: string
    event_type: string
    date: string
    ok: boolean
    event_id?: string
    form_url?: string | null
    form_warning?: string | null
    error?: string
    skipped_duplicate?: boolean
  }> = []

  for (const draft of toCreate) {
    const r = await createOneFromDraft(draft)
    results.push({
      row: draft.row,
      name: draft.name,
      event_type: draft.event_type,
      date: draft.date,
      ...r,
    })
  }

  const created = results.filter((r) => r.ok && !r.skipped_duplicate).length
  const duplicates = results.filter((r) => r.skipped_duplicate).length
  const failed = results.filter((r) => !r.ok).length

  return NextResponse.json({
    mode: 'commit',
    brand,
    errors,
    skipped_rows: skipped,
    created,
    duplicates,
    failed,
    results,
  })
}
