import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Demandes de rappel Lab — source partagée entre la page dédiée
 * (/admin/crm/rappels-lab) et le filtre « Demande de rappel Lab » des contacts.
 *
 * Source : soumissions des formulaires « … Lab … » dont le champ `demande`
 * contient « rappel » (l'app envoie « Être rappelé (depuis : écran) »),
 * complétées par les événements d'activité `callback_requested` des apps.
 */

export type LabCallbackAgg = {
  contactId: string
  count: number
  first: string
  last: string
  apps: Set<string>
  screens: Set<string>
}

type Submission = { data: Record<string, unknown> | null; submitted_at: string; form_id: string }

const SUBMISSIONS_LIMIT = 2000

/** Agrège les demandes de rappel Lab par contact (une entrée par contact). */
export async function fetchLabCallbackAggregates(
  db: SupabaseClient,
): Promise<Map<string, LabCallbackAgg>> {
  const byContact = new Map<string, LabCallbackAgg>()

  const { data: forms, error: formsErr } = await db.from('forms').select('id, name').ilike('name', '%Lab%')
  if (formsErr) throw new Error(formsErr.message)
  const formApp = new Map(
    (forms ?? []).map(f => [f.id as string, /medibox/i.test(f.name as string) ? 'Medibox Lab' : 'Diplomalab']),
  )
  if (formApp.size === 0) return byContact

  const { data: subs, error } = await db
    .from('form_submissions')
    .select('data, submitted_at, form_id')
    .in('form_id', [...formApp.keys()])
    .ilike('data->>demande', '%rappel%')
    .neq('status', 'spam')
    .order('submitted_at', { ascending: false })
    .limit(SUBMISSIONS_LIMIT)
  if (error) throw new Error(error.message)

  for (const s of (subs ?? []) as Submission[]) {
    const contactId = typeof s.data?._contact_id === 'string' ? s.data._contact_id : null
    if (!contactId) continue
    const agg = byContact.get(contactId)
      ?? { contactId, count: 0, first: s.submitted_at, last: s.submitted_at, apps: new Set<string>(), screens: new Set<string>() }
    agg.count++
    if (s.submitted_at < agg.first) agg.first = s.submitted_at
    if (s.submitted_at > agg.last) agg.last = s.submitted_at
    agg.apps.add(formApp.get(s.form_id) ?? 'Lab')
    // « Être rappelé (depuis : accueil:reussite) | Être rappelé (depuis : catalogue:barre) »
    for (const m of String(s.data?.demande ?? '').matchAll(/depuis\s*:\s*([^)|]+)\)/g)) agg.screens.add(m[1].trim())
    byContact.set(contactId, agg)
  }

  // Seconde source : événements d'activité `callback_requested` envoyés par les
  // apps (visitor_id = app-<app>-<contactId>). Un même clic arrive souvent aussi
  // en soumission de formulaire : on ne compte pas deux fois à ±10 min près.
  const { data: events, error: evErr } = await db
    .from('web_events')
    .select('visitor_id, occurred_at, site, metadata')
    .eq('event_name', 'callback_requested')
    .like('visitor_id', 'app-%')
    .order('occurred_at', { ascending: false })
    .limit(SUBMISSIONS_LIMIT)
  if (evErr) throw new Error(evErr.message)

  for (const e of events ?? []) {
    const site = String(e.site ?? '')
    const prefix = `app-${site}-`
    const visitorId = String(e.visitor_id ?? '')
    if (!site || !visitorId.startsWith(prefix)) continue
    const contactId = visitorId.slice(prefix.length)
    const at = e.occurred_at as string
    const app = /medibox/i.test(site) ? 'Medibox Lab' : 'Diplomalab'
    const existing = byContact.get(contactId)
    const agg = existing
      ?? { contactId, count: 0, first: at, last: at, apps: new Set<string>(), screens: new Set<string>() }
    const t = Date.parse(at)
    const duplicate = !!existing && [existing.first, existing.last].some(d => Math.abs(Date.parse(d) - t) < 600_000)
    if (!duplicate) agg.count++
    if (at < agg.first) agg.first = at
    if (at > agg.last) agg.last = at
    agg.apps.add(app)
    const screen = (e.metadata as Record<string, unknown> | null)?.ecran
    if (typeof screen === 'string' && screen) agg.screens.add(screen)
    byContact.set(contactId, agg)
  }

  return byContact
}

/** Dernier appel loggé par contact (pour savoir qui a déjà été rappelé). */
export async function fetchLastCallByContact(
  db: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, string>> {
  const lastCall = new Map<string, string>()
  if (contactIds.length === 0) return lastCall
  const { data } = await db
    .from('crm_activities')
    .select('hubspot_contact_id, occurred_at')
    .eq('activity_type', 'call')
    .in('hubspot_contact_id', contactIds)
    .order('occurred_at', { ascending: false })
  for (const a of data ?? []) {
    const id = a.hubspot_contact_id as string
    if (!lastCall.has(id) && a.occurred_at) lastCall.set(id, a.occurred_at as string)
  }
  return lastCall
}

/** Valeurs acceptées par le filtre « Demande de rappel Lab ». */
export const LAB_CALLBACK_STATUS_VALUES = ['oui', 'todo', 'done'] as const
export const LAB_CALLBACK_APP_VALUES = ['diplomalab', 'medibox'] as const

/**
 * Résout le filtre « Demande de rappel Lab » en liste de contact_id.
 *
 * Les valeurs de statut (oui / todo / done) sont combinées en OU entre elles,
 * les valeurs d'app (diplomalab / medibox) aussi, et les deux familles sont
 * combinées en ET : « À rappeler » + « Medibox Lab » = à rappeler sur Medibox.
 */
export async function resolveLabCallbackContactIds(
  db: SupabaseClient,
  rawValue: string,
): Promise<string[]> {
  const values = rawValue.split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const statuses = values.filter(v => (LAB_CALLBACK_STATUS_VALUES as readonly string[]).includes(v))
  const apps = values.filter(v => (LAB_CALLBACK_APP_VALUES as readonly string[]).includes(v))

  const byContact = await fetchLabCallbackAggregates(db)
  let ids = [...byContact.keys()]
  if (ids.length === 0) return []

  if (apps.length > 0) {
    const wanted = new Set<string>(apps.map(a => (a === 'medibox' ? 'Medibox Lab' : 'Diplomalab')))
    ids = ids.filter(id => [...byContact.get(id)!.apps].some(a => wanted.has(a)))
  }

  const needsCallState = statuses.some(s => s === 'todo' || s === 'done')
  if (needsCallState && !statuses.includes('oui')) {
    const lastCall = await fetchLastCallByContact(db, ids)
    ids = ids.filter(id => {
      const call = lastCall.get(id)
      const calledBack = !!call && call >= byContact.get(id)!.last
      return (statuses.includes('done') && calledBack) || (statuses.includes('todo') && !calledBack)
    })
  }

  return ids
}

/**
 * Valeurs acceptées par le filtre « Lead app Lab », par famille.
 * OU entre les valeurs d'une même famille, ET entre familles :
 * « Medibox Lab » + « Marseille » + « A demandé un rappel ».
 */
export const LAB_APP_LEAD_APPS = ['diplomalab', 'medibox'] as const
export const LAB_APP_LEAD_CITIES = ['ville_marseille', 'ville_montpellier', 'ville_lille', 'ville_bordeaux', 'ville_autre'] as const
export const LAB_APP_LEAD_ACTIONS = ['essai', 'rappel', 'candidature'] as const
export const LAB_APP_LEAD_VALUES = [...LAB_APP_LEAD_APPS, ...LAB_APP_LEAD_CITIES, ...LAB_APP_LEAD_ACTIONS] as const

type LabAppAgg = { apps: Set<string>; cities: Set<string>; actions: Set<string> }

const KNOWN_CITIES = ['marseille', 'montpellier', 'lille', 'bordeaux']

/** « Medibox Lab - Marseille » → marseille ; sinon null. */
function labCityOf(origine: unknown): string | null {
  const m = String(origine ?? '').toLowerCase().match(/^medibox lab\s*[-–—]\s*(.+)$/)
  if (!m) return null
  const city = KNOWN_CITIES.find(c => m[1].includes(c))
  return city ?? null
}

function labAppOf(text: unknown): 'diplomalab' | 'medibox' | null {
  const t = String(text ?? '').toLowerCase().trim()
  if (t.startsWith('medibox lab')) return 'medibox'
  if (t.startsWith('diploma lab')) return 'diplomalab'
  return null
}

/**
 * Agrège, par contact, les apps Lab / villes Medibox / actions faites dans
 * l'app. Sources :
 *   1. soumissions des formulaires « Diploma Lab … » / « Medibox Lab … »
 *      (historique complet) : app = formulaire, ville = data.origine,
 *      action = data.demande (essai gratuit, « Être rappelé », candidature) ;
 *   2. contacts dont l'origine ou le dernier formulaire est Lab (toutes casses).
 */
export async function fetchLabAppLeadAggregates(db: SupabaseClient): Promise<Map<string, LabAppAgg>> {
  const byContact = new Map<string, LabAppAgg>()
  const agg = (id: string) => {
    let a = byContact.get(id)
    if (!a) { a = { apps: new Set(), cities: new Set(), actions: new Set() }; byContact.set(id, a) }
    return a
  }
  const PAGE = 1000

  const { data: forms, error: formsErr } = await db
    .from('forms')
    .select('id, name')
    .or('name.ilike.diploma lab*,name.ilike.medibox lab*')
  if (formsErr) throw new Error(formsErr.message)
  const formApp = new Map((forms ?? []).map(f => [f.id as string, labAppOf(f.name)]))
  if (formApp.size > 0) {
    for (let off = 0; off < 100000; off += PAGE) {
      const { data: subs, error } = await db
        .from('form_submissions')
        .select('form_id, contact_id:data->>_contact_id, origine:data->>origine, demande:data->>demande')
        .in('form_id', [...formApp.keys()])
        .neq('status', 'spam')
        .order('submitted_at', { ascending: true })
        .range(off, off + PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = (subs ?? []) as Array<{ form_id: string; contact_id: string | null; origine: string | null; demande: string | null }>
      for (const s of rows) {
        if (!s.contact_id) continue
        const a = agg(s.contact_id)
        const app = formApp.get(s.form_id) ?? labAppOf(s.origine)
        if (app) a.apps.add(app)
        const city = labCityOf(s.origine)
        if (city) a.cities.add(city)
        const demande = String(s.demande ?? '').toLowerCase()
        if (demande.includes('rappel')) a.actions.add('rappel')
        if (demande.includes('candidature')) a.actions.add('candidature')
        if (!demande || demande.includes('essai')) a.actions.add('essai')
      }
      if (rows.length < PAGE) break
    }
  }

  for (let off = 0; off < 100000; off += PAGE) {
    const { data: rows, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, origine, recent_conversion_event')
      .or('origine.ilike.diploma lab*,origine.ilike.medibox lab*,recent_conversion_event.ilike.diploma lab*,recent_conversion_event.ilike.medibox lab*')
      .order('hubspot_contact_id', { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) throw new Error(error.message)
    const list = (rows ?? []) as Array<{ hubspot_contact_id: string | null; origine: string | null; recent_conversion_event: string | null }>
    for (const r of list) {
      if (!r.hubspot_contact_id) continue
      const a = agg(r.hubspot_contact_id)
      const app = labAppOf(r.origine) ?? labAppOf(r.recent_conversion_event)
      if (app) a.apps.add(app)
      const city = labCityOf(r.origine)
      if (city) a.cities.add(city)
    }
    if (list.length < PAGE) break
  }

  return byContact
}

// L'agrégat Lab parcourt toute la table des contacts (ILIKE non indexé) :
// une liste + ses compteurs d'onglets le demandaient 5 à 10 fois de suite.
// Gardé 2 min par instance, requête en cours partagée.
const LAB_APP_AGG_TTL_MS = 120_000
let labAppAggCache: { at: number; value: Promise<Map<string, LabAppAgg>> } | null = null

export function fetchLabAppLeadAggregatesCached(db: SupabaseClient): Promise<Map<string, LabAppAgg>> {
  if (labAppAggCache && Date.now() - labAppAggCache.at < LAB_APP_AGG_TTL_MS) return labAppAggCache.value
  const value = fetchLabAppLeadAggregates(db)
  labAppAggCache = { at: Date.now(), value }
  value.catch(() => { if (labAppAggCache?.value === value) labAppAggCache = null })
  return value
}

/**
 * Résout le filtre « Lead app Lab » (téléchargements / leads des apps
 * Diplomalab et Medibox Lab) en liste de contact_id.
 * Valeurs vides ou inconnues = tous les leads des deux apps.
 */
export async function resolveLabAppLeadContactIds(
  db: SupabaseClient,
  rawValue: string,
): Promise<string[]> {
  return filterLabAppLeads(await fetchLabAppLeadAggregates(db), rawValue)
}

/** Applique une valeur du filtre « Lead app Lab » à des agrégats déjà chargés. */
export function filterLabAppLeads(byContact: Map<string, LabAppAgg>, rawValue: string): string[] {
  const values = rawValue.split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const apps = values.filter(v => (LAB_APP_LEAD_APPS as readonly string[]).includes(v))
  const cities = values
    .filter(v => (LAB_APP_LEAD_CITIES as readonly string[]).includes(v))
    .map(v => v.replace(/^ville_/, ''))
  const actions = values.filter(v => (LAB_APP_LEAD_ACTIONS as readonly string[]).includes(v))

  const ids: string[] = []
  for (const [id, a] of byContact) {
    if (a.apps.size === 0) continue
    if (apps.length > 0 && !apps.some(x => a.apps.has(x))) continue
    if (cities.length > 0) {
      // Une ville = un lead Medibox Lab ; « autre » = Medibox Lab sans ville connue.
      if (!a.apps.has('medibox')) continue
      const ok = cities.some(c => (c === 'autre' ? a.cities.size === 0 : a.cities.has(c)))
      if (!ok) continue
    }
    if (actions.length > 0 && !actions.some(x => a.actions.has(x))) continue
    ids.push(id)
  }
  return ids
}
