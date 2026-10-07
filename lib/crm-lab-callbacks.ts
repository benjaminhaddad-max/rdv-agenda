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

/** Valeurs acceptées par le filtre « Lead app Lab ». */
export const LAB_APP_LEAD_VALUES = ['diplomalab', 'medibox'] as const

/**
 * Résout le filtre « Lead app Lab » (téléchargements / leads des apps
 * Diplomalab et Medibox Lab) en liste de contact_id. Un contact est retenu
 * s'il remplit au moins une de ces conditions :
 *   1. il a soumis un formulaire « Diploma Lab … » / « Medibox Lab … »
 *      (historique complet de form_submissions, pas seulement le dernier) ;
 *   2. son origine est une origine Lab (Diploma LAB, Medibox LAB,
 *      Medibox Lab - Marseille…, quelle que soit la casse) ;
 *   3. son dernier formulaire HubSpot est un formulaire Lab.
 * Valeurs : diplomalab / medibox (OU entre elles) ; vide = les deux apps.
 */
export async function resolveLabAppLeadContactIds(
  db: SupabaseClient,
  rawValue: string,
): Promise<string[]> {
  const values = rawValue.split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const wanted = values.filter(v => (LAB_APP_LEAD_VALUES as readonly string[]).includes(v))
  const apps = wanted.length > 0 ? wanted : [...LAB_APP_LEAD_VALUES]
  const prefixes = apps.map(a => (a === 'medibox' ? 'medibox lab' : 'diploma lab'))

  const ids = new Set<string>()

  // 1. Soumissions des formulaires Lab
  const { data: forms, error: formsErr } = await db
    .from('forms')
    .select('id')
    .or(prefixes.map(p => `name.ilike.${p}*`).join(','))
  if (formsErr) throw new Error(formsErr.message)
  const formIds = (forms ?? []).map(f => f.id as string)
  if (formIds.length > 0) {
    const PAGE = 1000
    for (let off = 0; off < 100000; off += PAGE) {
      const { data: subs, error } = await db
        .from('form_submissions')
        .select('contact_id:data->>_contact_id')
        .in('form_id', formIds)
        .neq('status', 'spam')
        .order('submitted_at', { ascending: true })
        .range(off, off + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const s of (subs ?? []) as Array<{ contact_id: string | null }>) {
        if (s.contact_id) ids.add(s.contact_id)
      }
      if (!subs || subs.length < PAGE) break
    }
  }

  // 2 + 3. Origine Lab ou dernier formulaire Lab
  const orClauses = prefixes.flatMap(p => [
    `origine.ilike.${p}*`,
    `recent_conversion_event.ilike.${p}*`,
  ])
  const PAGE = 1000
  for (let off = 0; off < 100000; off += PAGE) {
    const { data: rows, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id')
      .or(orClauses.join(','))
      .order('hubspot_contact_id', { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) throw new Error(error.message)
    for (const r of (rows ?? []) as Array<{ hubspot_contact_id: string | null }>) {
      if (r.hubspot_contact_id) ids.add(r.hubspot_contact_id)
    }
    if (!rows || rows.length < PAGE) break
  }

  return [...ids]
}
