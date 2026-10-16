/**
 * Session d'appels télépro (v89 dialer_attempts) : les appels s'enchaînent
 * tout seuls depuis la ligne Aircall du télépro (ses 07 restent affichés).
 *
 * - File : relances plus tard arrivées à échéance, puis « À traiter aujourd'hui »
 *   (lib/telepro-today.ts, même ordre), sans les leads déjà travaillés aujourd'hui.
 * - Appel : POST Aircall /v1/users/:id/calls depuis la ligne qu'il utilise le
 *   plus (aircall_calls des 14 derniers jours) ; l'appel part tout seul dans
 *   Aircall Workspace.
 * - Webhook Aircall (call.created / call.answered / call.ended) : rattaché à la
 *   tentative ouverte sur ce numéro → l'écran sait si ça a répondu.
 * - Pas de réponse : double appel (réglable), puis relance plus tard dans la
 *   journée (retry_after_min, max_rounds_per_day) et statut NRP (auto_nrp).
 * Réglages : crm_settings « dialer_settings » (lib/dialer-shared.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { startAircallOutboundCall } from '@/lib/aircall'
import { classifyAircallCall, type AircallCallPayload } from '@/lib/aircall-crm'
import { parisDateKey } from '@/lib/date-paris'
import { toE164French } from '@/lib/phone-e164'
import { getAircallUserMap, getSettingValue, setSetting } from '@/lib/settings'
import { buildToday } from '@/lib/telepro-today'
import {
  cleanDialerSettings, FAILED_QUALIFICATIONS, inCallWindow, nextNrpStatus, parisHm,
  type DialerAttempt, type DialerLead, type DialerSettings,
} from '@/lib/dialer-shared'

const SETTINGS_KEY = 'dialer_settings'
const ATTEMPT_COLS = 'id, hubspot_contact_id, phone, round_no, try_no, reason, status, outcome, qualification, aircall_call_id, duration_sec, error, started_at, answered_at, ended_at'

export class DialerUnavailableError extends Error {
  constructor() {
    super('Session d\'appels pas encore activée (migration v89 à appliquer)')
  }
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /dialer_attempts/.test(err.message ?? ''))
}

function check(err: { code?: string; message?: string } | null): void {
  if (!err) return
  if (isMissingTable(err)) throw new DialerUnavailableError()
  throw new Error(err.message)
}

export type DialerUser = { id: string; hubspot_owner_id?: string | null; hubspot_user_id?: string | null }

function ownerIds(u: DialerUser): string[] {
  return [...new Set([u.id, u.hubspot_owner_id, u.hubspot_user_id].map(v => String(v ?? '').trim()).filter(Boolean))]
}

// ── Réglages ────────────────────────────────────────────────────────────────

export async function getDialerSettings(): Promise<DialerSettings> {
  return cleanDialerSettings(await getSettingValue(SETTINGS_KEY))
}

export async function setDialerSettings(raw: unknown): Promise<DialerSettings> {
  const next = cleanDialerSettings(raw)
  await setSetting(SETTINGS_KEY, next)
  return next
}

// ── Ligne Aircall du télépro ────────────────────────────────────────────────

export type DialerLine =
  | { ok: true; aircall_user_id: number; number_id: number; number_label: string | null }
  | { ok: false; error: string }

/**
 * Compte Aircall + ligne utilisés pour lancer ses appels : la ligne qu'il a le
 * plus utilisée en sortant ces 14 derniers jours (ses 07 habituels).
 */
export async function resolveDialerLine(db: SupabaseClient, userId: string): Promise<DialerLine> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const { data } = await db.from('aircall_calls')
    .select('aircall_user_id, line_id, line_name, line_digits, started_at')
    .eq('rdv_user_id', userId).eq('direction', 'outbound')
    .not('aircall_user_id', 'is', null).not('line_id', 'is', null)
    .gte('started_at', since).order('started_at', { ascending: false }).limit(500)
  const rows = (data ?? []) as Array<{ aircall_user_id: number; line_id: number; line_name: string | null; line_digits: string | null }>

  let aircallUserId = rows[0]?.aircall_user_id ?? null
  if (!aircallUserId) {
    for (const [acId, rdvId] of await getAircallUserMap()) if (rdvId === userId) aircallUserId = acId
  }
  if (!aircallUserId) {
    return { ok: false, error: 'Ton compte Aircall n\'est pas encore relié à la plateforme : passe un premier appel depuis Aircall, puis réessaie.' }
  }
  const uses = new Map<number, { n: number; label: string | null }>()
  for (const r of rows) {
    if (r.aircall_user_id !== aircallUserId) continue
    const e = uses.get(r.line_id) ?? { n: 0, label: r.line_digits || r.line_name }
    e.n++
    uses.set(r.line_id, e)
  }
  const best = [...uses.entries()].sort((a, b) => b[1].n - a[1].n)[0]
  if (!best) {
    return { ok: false, error: 'Aucune ligne Aircall trouvée pour toi ces 14 derniers jours : passe un appel depuis ta ligne habituelle, puis réessaie.' }
  }
  return { ok: true, aircall_user_id: aircallUserId, number_id: best[0], number_label: best[1].label }
}

// ── Tentatives du jour ──────────────────────────────────────────────────────

async function todayAttempts(db: SupabaseClient, userId: string, dayKey: string): Promise<DialerAttempt[]> {
  const { data, error } = await db.from('dialer_attempts').select(ATTEMPT_COLS)
    .eq('rdv_user_id', userId).eq('day_key', dayKey).order('started_at', { ascending: true }).limit(2000)
  check(error)
  return (data ?? []) as DialerAttempt[]
}

type LeadDay = {
  rounds: number
  /** Un passage a abouti (conversation, qualification autre qu'un échec) */
  reached: boolean
  open: boolean
  last_at: number
}

function summarize(attempts: DialerAttempt[]): Map<string, LeadDay> {
  const map = new Map<string, LeadDay>()
  for (const a of attempts) {
    // Appel qu'Aircall n'a pas lancé : le lead reste dans la file normale
    if (a.status === 'failed') continue
    const e = map.get(a.hubspot_contact_id) ?? { rounds: 0, reached: false, open: false, last_at: 0 }
    e.rounds = Math.max(e.rounds, a.round_no)
    if (a.qualification ? !FAILED_QUALIFICATIONS.has(a.qualification) : a.outcome === 'answered') e.reached = true
    if (!a.ended_at && Date.now() - Date.parse(a.started_at) < 10 * 60_000) e.open = true
    e.last_at = Math.max(e.last_at, Date.parse(a.ended_at ?? a.started_at))
    map.set(a.hubspot_contact_id, e)
  }
  return map
}

export type DialerStats = { calls: number; answered: number; talks: number; rdv: number }

function statsOf(attempts: DialerAttempt[]): DialerStats {
  const live = attempts.filter(a => a.status !== 'failed')
  return {
    calls: live.length,
    answered: live.filter(a => a.outcome === 'answered').length,
    talks: live.filter(a => a.outcome === 'answered' && (a.duration_sec ?? 0) >= 30).length,
    rdv: live.filter(a => a.qualification === 'rdv').length,
  }
}

// ── File d'appels ───────────────────────────────────────────────────────────

const CONTACT_COLS = 'hubspot_contact_id, firstname, lastname, phone, mobilephone, classe_actuelle, hs_lead_status, recent_conversion_event, recent_conversion_date, origine, telepro_user_id'

type ContactRow = {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  phone: string | null
  mobilephone: string | null
  classe_actuelle: string | null
  hs_lead_status: string | null
  recent_conversion_event: string | null
  recent_conversion_date: string | null
  origine: string | null
  telepro_user_id: string | null
}

export type DialerQueue = {
  queue: DialerLead[]
  /** Relances plus tard pas encore arrivées à échéance */
  later: Array<{ lead: DialerLead; due_at: string }>
  stats: DialerStats
  in_window: boolean
  /** Leads déjà appelés aujourd'hui par la session (exclus d'une liste lancée depuis « Mes contacts ») */
  worked_today: string[]
}

/**
 * opts.today = false : file lancée depuis une vue de « Mes contacts » — le
 * client fournit la liste (filtres + ordre de la vue), le serveur ne renvoie
 * que les relances plus tard et les leads déjà travaillés aujourd'hui.
 */
export async function buildDialerQueue(
  db: SupabaseClient, user: DialerUser, settings: DialerSettings, opts: { today?: boolean } = {},
): Promise<DialerQueue> {
  const dayKey = parisDateKey(new Date())
  const attempts = await todayAttempts(db, user.id, dayKey)
  const byLead = summarize(attempts)
  const now = Date.now()

  // Relances plus tard : passage échoué, pas encore au maximum, avant la fin de journée
  const retries: Array<{ id: string; due: number; round: number }> = []
  for (const [id, d] of byLead) {
    if (d.reached || d.open || d.rounds >= settings.max_rounds_per_day) continue
    const due = d.last_at + settings.retry_after_min * 60_000
    if (parisHm(new Date(due)) >= settings.day_end || parisDateKey(new Date(due)) !== dayKey) continue
    retries.push({ id, due, round: d.rounds + 1 })
  }
  const retryRows = new Map<string, ContactRow>()
  const retryIds = retries.map(r => r.id)
  for (let i = 0; i < retryIds.length; i += 200) {
    const { data } = await db.from('crm_contacts').select(CONTACT_COLS).in('hubspot_contact_id', retryIds.slice(i, i + 200))
    for (const c of (data ?? []) as ContactRow[]) retryRows.set(c.hubspot_contact_id, c)
  }
  const retryLead = (c: ContactRow, round: number): DialerLead => ({
    hubspot_contact_id: c.hubspot_contact_id,
    name: [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Contact',
    phone: c.phone || c.mobilephone || null,
    classe: c.classe_actuelle,
    lead_status: c.hs_lead_status,
    reason: 'retry',
    reason_label: `Relance plus tard (${round}e passage)`,
    score: null,
    last_call_at: null,
    calls_count: 0,
    form_name: c.recent_conversion_event,
    form_at: c.recent_conversion_date,
    origine: c.origine,
    round_no: round,
  })

  const queue: DialerLead[] = []
  const later: DialerQueue['later'] = []
  for (const r of retries.sort((a, b) => a.due - b.due)) {
    const c = retryRows.get(r.id)
    if (!c || !toE164French(c.phone || c.mobilephone)) continue
    if (r.due <= now) queue.push(retryLead(c, r.round))
    else later.push({ lead: retryLead(c, r.round), due_at: new Date(r.due).toISOString() })
  }

  const base = { later, stats: statsOf(attempts), in_window: inCallWindow(settings), worked_today: [...byLead.keys()] }
  if (opts.today === false) return { queue, ...base }

  const today = await buildToday(db, user)
  for (const l of today.leads) {
    if (byLead.has(l.hubspot_contact_id) || !toE164French(l.phone)) continue
    queue.push({
      hubspot_contact_id: l.hubspot_contact_id,
      name: l.name,
      phone: l.phone,
      classe: l.classe,
      lead_status: l.lead_status,
      reason: l.reason,
      reason_label: l.reason_label,
      score: { score: l.score.score, level: l.score.level },
      last_call_at: l.last_call_at,
      calls_count: l.calls_count,
      form_name: l.form_name,
      form_at: l.form_at,
      origine: l.origine,
      round_no: 1,
    })
  }

  return { queue, ...base }
}

// ── Lancer un appel ─────────────────────────────────────────────────────────

export type DialResult =
  | { ok: true; attempt: DialerAttempt }
  | { ok: false; error: string; attempt?: DialerAttempt; busy?: boolean }

function aircallErrorMessage(status: number, raw: string): string {
  if (status === 429) return 'Aircall est saturé (trop d\'appels à la minute) : réessaie dans quelques secondes.'
  if (status === 405) return 'Aircall te voit encore en appel ou en fin d\'appel : nouvel essai dans quelques secondes.'
  if (status === 0) return 'Aircall injoignable : réessaie dans quelques secondes.'
  const detail = raw.replace(/\s+/g, ' ').slice(0, 160)
  return `Aircall n'a pas lancé l'appel : ouvre Aircall sur ton ordinateur et passe en « Disponible », puis relance. (${status}${detail ? ` · ${detail}` : ''})`
}

export async function dialLead(
  db: SupabaseClient,
  user: DialerUser & { isAdmin?: boolean },
  input: { contactId: string; reason?: string | null; redialOf?: number | null; manual?: boolean },
  settings: DialerSettings,
): Promise<DialResult> {
  // manual : iPad / téléphone — l'API Aircall ne lance pas d'appel sur les applis
  // mobiles (elle répond 204 sans rien faire). Le télépro appuie sur « Appeler »,
  // la tentative est suivie par le webhook comme un appel lancé par l'API.
  const { data: c } = await db.from('crm_contacts').select(CONTACT_COLS).eq('hubspot_contact_id', input.contactId).maybeSingle()
  const contact = c as ContactRow | null
  if (!contact) return { ok: false, error: 'Contact introuvable' }
  if (!user.isAdmin && !ownerIds(user).includes(String(contact.telepro_user_id ?? ''))) {
    return { ok: false, error: 'Ce contact n\'est pas attribué à toi' }
  }
  const phone = toE164French(contact.phone || contact.mobilephone)
  if (!phone) return { ok: false, error: 'Numéro de téléphone invalide sur la fiche' }

  const line = input.manual ? null : await resolveDialerLine(db, user.id)
  if (line && !line.ok) return { ok: false, error: line.error }

  const dayKey = parisDateKey(new Date())
  const attempts = await todayAttempts(db, user.id, dayKey)
  const mine = attempts.filter(a => a.hubspot_contact_id === contact.hubspot_contact_id && a.status !== 'failed')

  let roundNo = Math.max(0, ...mine.map(a => a.round_no)) + 1
  let tryNo = 1
  if (input.redialOf) {
    const prev = mine.find(a => a.id === input.redialOf)
    if (!prev) return { ok: false, error: 'Appel précédent introuvable' }
    roundNo = prev.round_no
    tryNo = Math.max(...mine.filter(a => a.round_no === prev.round_no).map(a => a.try_no)) + 1
    if (tryNo > 1 + settings.double_calls) return { ok: false, error: 'Double appel déjà fait sur ce passage' }
  }

  // Un seul appel ouvert à la fois : les précédents restés sans webhook sont fermés
  const nowIso = new Date().toISOString()
  const stale = attempts.filter(a => !a.ended_at && a.status !== 'failed').map(a => a.id)
  if (stale.length) {
    await db.from('dialer_attempts').update({ status: 'ended', ended_at: nowIso }).in('id', stale)
  }

  const { data: inserted, error: insErr } = await db.from('dialer_attempts').insert({
    rdv_user_id: user.id,
    hubspot_contact_id: contact.hubspot_contact_id,
    phone,
    day_key: dayKey,
    round_no: roundNo,
    try_no: tryNo,
    reason: input.reason ?? (input.redialOf ? mine.find(a => a.id === input.redialOf)?.reason ?? null : null),
    status: 'dialing',
    aircall_user_id: line?.aircall_user_id ?? null,
    aircall_number_id: line?.number_id ?? null,
  }).select(ATTEMPT_COLS).single()
  check(insErr)
  const attempt = inserted as DialerAttempt
  if (!line) return { ok: true, attempt }

  let started = await startAircallOutboundCall(line.aircall_user_id, line.number_id, phone)
  if (!started.ok && started.status === 429) {
    await new Promise(r => setTimeout(r, 1500))
    started = await startAircallOutboundCall(line.aircall_user_id, line.number_id, phone)
  }
  if (!started.ok) {
    const error = aircallErrorMessage(started.status, started.error)
    // 405 : encore en appel ou en temps de post-appel Aircall → l'écran réessaie tout seul.
    // La tentative n'a jamais existé : on l'efface (sinon les webhooks de l'appel précédent s'y rattachent)
    if (started.status === 405) {
      await db.from('dialer_attempts').delete().eq('id', attempt.id)
      return { ok: false, error, attempt: { ...attempt, status: 'failed', error }, busy: true }
    }
    const { data: failed } = await db.from('dialer_attempts')
      .update({ status: 'failed', error: error.slice(0, 500), ended_at: new Date().toISOString() })
      .eq('id', attempt.id).select(ATTEMPT_COLS).single()
    return { ok: false, error, attempt: (failed as DialerAttempt | null) ?? attempt }
  }
  return { ok: true, attempt }
}

// ── Suivi d'un appel ────────────────────────────────────────────────────────

export async function getAttempt(db: SupabaseClient, userId: string | null, id: number): Promise<DialerAttempt | null> {
  let q = db.from('dialer_attempts').select(ATTEMPT_COLS).eq('id', id)
  if (userId) q = q.eq('rdv_user_id', userId)
  const { data, error } = await q.maybeSingle()
  check(error)
  return (data as DialerAttempt | null) ?? null
}

export type QualifyResult = {
  attempt: DialerAttempt
  /** Encore un double appel possible sur ce passage */
  can_redial: boolean
  /** Passage terminé sans réponse */
  round_failed: boolean
  /** Statut NRP à poser sur la fiche (auto_nrp), sinon null */
  nrp_status: string | null
}

export async function qualifyAttempt(
  db: SupabaseClient,
  userId: string | null,
  id: number,
  qualification: string,
  settings: DialerSettings,
  /** Bouton « Suivant » du télépro : pas de double appel sur ce passage */
  noRedial = false,
): Promise<QualifyResult | null> {
  const current = await getAttempt(db, userId, id)
  if (!current) return null
  const { data, error } = await db.from('dialer_attempts')
    .update({ qualification: qualification.slice(0, 60), qualified_at: new Date().toISOString() })
    .eq('id', id).select(ATTEMPT_COLS).single()
  check(error)
  const attempt = data as DialerAttempt

  const failed = FAILED_QUALIFICATIONS.has(qualification)
  const canRedial = failed && !noRedial && attempt.try_no < 1 + settings.double_calls
  const roundFailed = failed && !canRedial
  let nrp: string | null = null
  if (roundFailed && settings.auto_nrp) {
    const { data: c } = await db.from('crm_contacts').select('hs_lead_status').eq('hubspot_contact_id', attempt.hubspot_contact_id).maybeSingle()
    nrp = nextNrpStatus((c as { hs_lead_status?: string | null } | null)?.hs_lead_status ?? null)
  }
  return { attempt, can_redial: canRedial, round_failed: roundFailed, nrp_status: nrp }
}

/**
 * Webhook Aircall → tentative ouverte sur ce numéro (appel sortant).
 * Silencieux si la migration v89 n'est pas appliquée ou si rien ne correspond.
 */
export async function syncDialerAttemptFromAircall(
  db: SupabaseClient,
  event: string,
  call: AircallCallPayload,
): Promise<boolean> {
  if (String(call.direction) !== 'outbound') return false
  const phone = toE164French(call.raw_digits)
  if (!phone) return false
  const since = new Date(Date.now() - 30 * 60_000).toISOString()
  // 1. Appel Aircall déjà rattaché à une tentative
  let target: { id: number } | null = null
  if (call.id) {
    const { data, error } = await db.from('dialer_attempts').select('id').eq('aircall_call_id', call.id).gte('started_at', since).limit(1)
    if (error) return false
    target = (data?.[0] as { id: number } | undefined) ?? null
  }
  // 2. Sinon la tentative lancée juste avant cet appel, encore ouverte et sans appel. Garde-fou :
  //    le webhook tardif d'un appel précédent (call.ended ~30 s après) ne doit jamais se
  //    rattacher au double appel qui vient de partir sur le même numéro.
  if (!target) {
    const callStart = call.started_at ? call.started_at * 1000 : Date.now()
    const { data, error } = await db.from('dialer_attempts').select('id')
      .eq('phone', phone).is('aircall_call_id', null).is('ended_at', null).eq('status', 'dialing')
      .gte('started_at', since).lte('started_at', new Date(callStart + 5_000).toISOString())
      .order('started_at', { ascending: false }).limit(1)
    if (error) return false
    target = (data?.[0] as { id: number } | undefined) ?? null
  }
  if (!target) return false

  const patch: Record<string, unknown> = { aircall_call_id: call.id ?? null }
  if (event === 'call.created') patch.status = 'in_call'
  if (event === 'call.answered') {
    patch.status = 'in_call'
    patch.answered_at = call.answered_at ? new Date(call.answered_at * 1000).toISOString() : new Date().toISOString()
  }
  // call.hungup arrive au raccroché, call.ended ~30 s plus tard (il complète le résultat)
  if (event === 'call.hungup') {
    patch.status = 'ended'
    patch.outcome = call.answered_at ? 'answered' : 'no_answer'
    patch.ended_at = new Date().toISOString()
  }
  if (event === 'call.ended') {
    const { answered, status } = classifyAircallCall(call)
    patch.status = 'ended'
    patch.outcome = status === 'voicemail' ? 'voicemail' : answered ? 'answered' : 'no_answer'
    patch.duration_sec = Math.max(0, Math.round(Number(call.duration) || 0))
    patch.ended_at = call.ended_at ? new Date(call.ended_at * 1000).toISOString() : new Date().toISOString()
    if (call.answered_at) patch.answered_at = new Date(call.answered_at * 1000).toISOString()
  }
  const { error: upErr } = await db.from('dialer_attempts').update(patch).eq('id', target.id)
  return !upErr
}
