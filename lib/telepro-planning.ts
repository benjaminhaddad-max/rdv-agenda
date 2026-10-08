/**
 * Planning d'appel des télépros (table telepro_planning_slots, migration v57)
 * et bilan de chaque journée à partir des appels Aircall.
 *
 * - Un créneau = un télépro, un jour, une plage HH:MM-HH:MM (heure de Paris).
 * - locked = imposé par un admin (Pascal) : le télépro le voit, ne le modifie pas.
 * - Bilan d'un jour passé : appels sortants, décrochés, conversations ≥ 2 min,
 *   premier / dernier appel, couverture de chaque créneau (part des demi-heures
 *   avec au moins un appel), RDV placés → verdict ok / partiel / absent.
 *
 * Tant que la migration v57 n'est pas appliquée, la table est absente :
 * lecture vide (ready = false), écritures refusées avec un message clair.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { addParisDays, parisDateKey, parisMidnightUtc, parisRangeUtcBounds } from '@/lib/date-paris'
import { getAircallTrackedLineIds, getAircallUserMap } from '@/lib/settings'
import { isHumanAnswered, isOutboundTalk2min, talkSeconds, type CallRow } from '@/lib/suivi-commercial'
import { hasTeamRole } from '@/lib/team-roles'

export const PLANNING_TABLE = 'telepro_planning_slots'
export const PLANNING_MIGRATION_MSG = 'Planning pas encore activé (migration BDD v57 à appliquer dans Supabase).'

/** Tolérance autour d'un créneau pour rattacher un appel (minutes). */
const SLOT_MARGIN_MIN = 10
/** Retard / départ anticipé tolérés avant de juger le créneau « partiel » (minutes). */
const LATE_TOLERANCE_MIN = 20
/** Part minimale des demi-heures du créneau avec au moins un appel. */
const MIN_COVERAGE = 0.7

export type PlanningSlotRow = {
  id: string
  user_id: string
  date: string
  start: string
  end: string
  locked: boolean
  created_by: string | null
  alerted_at: string | null
}

export type SlotInput = { start: string; end: string; locked?: boolean }

export type SlotVerdict = 'ok' | 'partiel' | 'absent' | 'en_cours' | 'a_venir'
export type DayVerdict = SlotVerdict | 'hors_planning' | 'repos'

export type SlotReport = PlanningSlotRow & {
  calls: number
  coverage_pct: number | null
  first_call: string | null
  last_call: string | null
  verdict: SlotVerdict
}

export type DayReport = {
  date: string
  calls: number
  answered: number
  talk2: number
  talk_sec: number
  first_call: string | null
  last_call: string | null
  rdv: number
  planned_min: number
  slots: SlotReport[]
  verdict: DayVerdict
}

const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMissingPlanningTable(err: any): boolean {
  if (!err) return false
  const code = String(err.code || '').toUpperCase()
  const text = [err.message, err.details, err.hint].filter(Boolean).join(' ').toLowerCase()
  return code === 'PGRST205' || code === '42P01'
    || (text.includes(PLANNING_TABLE) && (text.includes('does not exist') || text.includes('could not find') || text.includes('schema cache')))
}

export function normalizeHm(raw: unknown): string | null {
  const m = String(raw ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const hm = `${m[1].padStart(2, '0')}:${m[2]}`
  return HM_RE.test(hm) ? hm : null
}

export function hmMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

/** Instant UTC d'une heure HH:MM (Paris) un jour donné. */
export function hmToUtc(date: string, hm: string): Date {
  return new Date(parisMidnightUtc(date).getTime() + hmMinutes(hm) * 60_000)
}

function parisHm(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

/** Plages valides, triées, sans chevauchement (la suivante est rognée). */
export function cleanSlots(input: SlotInput[]): Array<{ start: string; end: string; locked: boolean }> {
  const out = input
    .map(s => ({ start: normalizeHm(s.start), end: normalizeHm(s.end), locked: !!s.locked }))
    .filter((s): s is { start: string; end: string; locked: boolean } => !!s.start && !!s.end && s.start < s.end)
    .sort((a, b) => a.start.localeCompare(b.start))
  const merged: typeof out = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && s.start < last.end) {
      if (s.end > last.end) last.end = s.end
      last.locked = last.locked || s.locked
    } else merged.push({ ...s })
  }
  return merged.slice(0, 6)
}

// ── Lecture / écriture ──────────────────────────────────────────────────────

type DbRow = {
  id: string; user_id: string; date: string; start_hm: string; end_hm: string
  locked: boolean; created_by: string | null; alerted_at: string | null
}

function fromDb(r: DbRow): PlanningSlotRow {
  return {
    id: r.id, user_id: r.user_id, date: String(r.date).slice(0, 10), start: r.start_hm, end: r.end_hm,
    locked: !!r.locked, created_by: r.created_by, alerted_at: r.alerted_at,
  }
}

/** Créneaux de [fromDate, toDateExclusive). */
export async function loadSlots(
  db: SupabaseClient,
  fromDate: string,
  toDateExclusive: string,
  userIds?: string[],
): Promise<{ slots: PlanningSlotRow[]; ready: boolean }> {
  let q = db.from(PLANNING_TABLE)
    .select('id, user_id, date, start_hm, end_hm, locked, created_by, alerted_at')
    .gte('date', fromDate)
    .lt('date', toDateExclusive)
    .order('date')
    .order('start_hm')
  if (userIds) {
    if (!userIds.length) return { slots: [], ready: true }
    q = q.in('user_id', userIds)
  }
  const { data, error } = await q
  if (error) {
    if (isMissingPlanningTable(error)) return { slots: [], ready: false }
    throw new Error(error.message)
  }
  return { slots: ((data ?? []) as DbRow[]).map(fromDb), ready: true }
}

export class PlanningError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/**
 * Remplace les créneaux d'un télépro pour un jour.
 * - asAdmin : remplace tout, le drapeau « imposé » vient de l'entrée ;
 * - sinon (le télépro lui-même) : jour passé ou jour imposé refusés, ne touche
 *   qu'aux créneaux non imposés, toujours enregistrés non imposés.
 */
export async function replaceDaySlots(
  db: SupabaseClient,
  args: { userId: string; date: string; slots: SlotInput[]; actorId: string; asAdmin: boolean },
): Promise<PlanningSlotRow[]> {
  const { userId, date, actorId, asAdmin } = args
  if (!DATE_RE.test(date)) throw new PlanningError('Date invalide')
  const slots = cleanSlots(args.slots)

  if (!asAdmin) {
    if (date < parisDateKey(new Date())) throw new PlanningError('Ce jour est passé : il ne peut plus être modifié.')
    const { data: lockedRows, error } = await db.from(PLANNING_TABLE)
      .select('id').eq('user_id', userId).eq('date', date).eq('locked', true).limit(1)
    if (error) throw isMissingPlanningTable(error) ? new PlanningError(PLANNING_MIGRATION_MSG, 503) : new Error(error.message)
    if (lockedRows?.length) throw new PlanningError('Horaires imposés par la direction pour ce jour : modification impossible.', 403)
  }

  let del = db.from(PLANNING_TABLE).delete().eq('user_id', userId).eq('date', date)
  if (!asAdmin) del = del.eq('locked', false)
  const { error: delErr } = await del
  if (delErr) throw isMissingPlanningTable(delErr) ? new PlanningError(PLANNING_MIGRATION_MSG, 503) : new Error(delErr.message)

  if (!slots.length) return []
  const now = new Date().toISOString()
  const { data, error } = await db.from(PLANNING_TABLE).insert(slots.map(s => ({
    user_id: userId,
    date,
    start_hm: s.start,
    end_hm: s.end,
    locked: asAdmin ? s.locked : false,
    created_by: actorId,
    updated_at: now,
  }))).select('id, user_id, date, start_hm, end_hm, locked, created_by, alerted_at')
  if (error) throw isMissingPlanningTable(error) ? new PlanningError(PLANNING_MIGRATION_MSG, 503) : new Error(error.message)
  return ((data ?? []) as DbRow[]).map(fromDb)
}

export async function markSlotAlerted(db: SupabaseClient, id: string): Promise<void> {
  await db.from(PLANNING_TABLE).update({ alerted_at: new Date().toISOString() }).eq('id', id)
}

// ── Équipe télépros ─────────────────────────────────────────────────────────

export type PlanningMember = { id: string; name: string; email: string | null; avatar_color: string | null }

/** Télépros actifs (rôle ou casquette télépro), hors comptes désactivés. */
export async function loadTeleproTeam(db: SupabaseClient): Promise<PlanningMember[]> {
  const { data } = await db.from('rdv_users').select('*').order('name')
  const users = ((data ?? []) as Array<Record<string, unknown>>).filter(u => hasTeamRole(u, 'telepro'))
  let banned = new Set<string>()
  try {
    const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 })
    const now = Date.now()
    banned = new Set((authList?.users ?? [])
      .filter(u => u.banned_until && new Date(u.banned_until).getTime() > now).map(u => u.id))
  } catch { /* on garde tout le monde */ }
  return users
    .filter(u => !u.auth_id || !banned.has(String(u.auth_id)))
    .map(u => ({
      id: String(u.id),
      name: String(u.name ?? ''),
      email: (u.email as string | null) ?? null,
      avatar_color: (u.avatar_color as string | null) ?? null,
    }))
}

// ── Bilan ───────────────────────────────────────────────────────────────────

async function fetchOutboundCalls(db: SupabaseClient, startIso: string, endIso: string): Promise<CallRow[]> {
  const lineIds = await getAircallTrackedLineIds()
  const out: CallRow[] = []
  for (let from = 0; from < 100_000; from += 1000) {
    let q = db.from('aircall_calls')
      .select('rdv_user_id, agent_email, agent_name, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at, hubspot_contact_id, line_id, line_name, aircall_user_id')
      .eq('direction', 'outbound')
      .gte('started_at', startIso)
      .lt('started_at', endIso)
      .order('started_at', { ascending: true })
      .range(from, from + 999)
    if (lineIds.length) q = q.in('line_id', lineIds)
    const { data, error } = await q
    if (error) return out
    out.push(...((data ?? []) as CallRow[]))
    if (!data || data.length < 1000) break
  }
  return out
}

function slotVerdict(slot: PlanningSlotRow, callTimes: number[], nowMs: number): Omit<SlotReport, keyof PlanningSlotRow> {
  const start = hmToUtc(slot.date, slot.start).getTime()
  const end = hmToUtc(slot.date, slot.end).getTime()
  const margin = SLOT_MARGIN_MIN * 60_000
  const inSlot = callTimes.filter(t => t >= start - margin && t <= end + margin)
  const first = inSlot.length ? new Date(inSlot[0]) : null
  const last = inSlot.length ? new Date(inSlot[inSlot.length - 1]) : null

  const buckets = Math.max(1, Math.ceil((end - start) / (30 * 60_000)))
  let covered = 0
  for (let i = 0; i < buckets; i++) {
    const a = start + i * 30 * 60_000
    const b = Math.min(end, a + 30 * 60_000)
    if (inSlot.some(t => t >= a - (i === 0 ? margin : 0) && t < b + (i === buckets - 1 ? margin : 0))) covered++
  }
  const coverage = covered / buckets

  let verdict: SlotVerdict
  if (nowMs < start) verdict = 'a_venir'
  else if (nowMs < end) verdict = 'en_cours'
  else if (!inSlot.length) verdict = 'absent'
  else {
    const late = first!.getTime() > start + LATE_TOLERANCE_MIN * 60_000
    const early = last!.getTime() < end - LATE_TOLERANCE_MIN * 60_000
    verdict = coverage >= MIN_COVERAGE && !late && !early ? 'ok' : 'partiel'
  }
  return {
    calls: inSlot.length,
    coverage_pct: nowMs < start ? null : Math.round(coverage * 100),
    first_call: first ? parisHm(first) : null,
    last_call: last ? parisHm(last) : null,
    verdict,
  }
}

function dayVerdict(day: DayReport, date: string, today: string): DayVerdict {
  if (!day.slots.length) {
    if (date > today) return 'a_venir'
    return day.calls > 0 ? 'hors_planning' : 'repos'
  }
  const v = day.slots.map(s => s.verdict)
  if (v.includes('en_cours')) return 'en_cours'
  if (v.every(x => x === 'a_venir')) return 'a_venir'
  const done = v.filter(x => x !== 'a_venir')
  if (done.every(x => x === 'absent')) return 'absent'
  if (done.every(x => x === 'ok')) return 'ok'
  return 'partiel'
}

/** Bilan jour par jour d'une semaine (lundi = weekStart) pour des télépros. */
export async function buildPlanningReport(
  db: SupabaseClient,
  userIds: string[],
  weekStart: string,
): Promise<{ ready: boolean; dates: string[]; report: Record<string, DayReport[]> }> {
  const dates = Array.from({ length: 7 }, (_, i) => addParisDays(weekStart, i))
  const weekEnd = addParisDays(weekStart, 7)
  const { start, end } = parisRangeUtcBounds(weekStart, dates[6])
  const ids = new Set(userIds)

  const [{ slots, ready }, calls, userMap, rdvRows] = await Promise.all([
    loadSlots(db, weekStart, weekEnd, userIds),
    fetchOutboundCalls(db, start, end),
    getAircallUserMap(),
    db.from('rdv_appointments').select('telepro_id, created_at')
      .in('telepro_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', start).lt('created_at', end)
      .then(r => (r.data ?? []) as Array<{ telepro_id: string; created_at: string }>),
  ])

  const nowMs = Date.now()
  const today = parisDateKey(new Date())
  const report: Record<string, DayReport[]> = {}
  for (const id of userIds) {
    report[id] = dates.map(date => ({
      date, calls: 0, answered: 0, talk2: 0, talk_sec: 0, first_call: null, last_call: null,
      rdv: 0, planned_min: 0, slots: [], verdict: 'repos',
    }))
  }
  const dayIdx = new Map(dates.map((d, i) => [d, i]))

  // Appels → télépro / jour
  const callTimes = new Map<string, number[]>() // userId|date → instants
  for (const c of calls) {
    const uid = (c.rdv_user_id && ids.has(c.rdv_user_id)) ? c.rdv_user_id
      : (c.aircall_user_id != null ? userMap.get(Number(c.aircall_user_id)) : undefined)
    if (!uid || !ids.has(uid)) continue
    const t = new Date(c.started_at)
    const date = parisDateKey(t)
    const i = dayIdx.get(date)
    if (i == null) continue
    const d = report[uid][i]
    d.calls += 1
    if (isHumanAnswered(c)) { d.answered += 1; d.talk_sec += talkSeconds(c) }
    if (isOutboundTalk2min(c)) d.talk2 += 1
    const hm = parisHm(t)
    if (!d.first_call || hm < d.first_call) d.first_call = hm
    if (!d.last_call || hm > d.last_call) d.last_call = hm
    const k = `${uid}|${date}`
    const arr = callTimes.get(k) ?? []
    arr.push(t.getTime())
    callTimes.set(k, arr)
  }

  for (const r of rdvRows) {
    const i = dayIdx.get(parisDateKey(new Date(r.created_at)))
    if (i != null && report[r.telepro_id]) report[r.telepro_id][i].rdv += 1
  }

  for (const s of slots) {
    const i = dayIdx.get(s.date)
    if (i == null || !report[s.user_id]) continue
    const times = (callTimes.get(`${s.user_id}|${s.date}`) ?? []).sort((a, b) => a - b)
    const d = report[s.user_id][i]
    d.slots.push({ ...s, ...slotVerdict(s, times, nowMs) })
    d.planned_min += hmMinutes(s.end) - hmMinutes(s.start)
  }

  for (const id of userIds) {
    for (const d of report[id]) d.verdict = dayVerdict(d, d.date, today)
  }
  return { ready, dates, report }
}

/** Lundi (YYYY-MM-DD) de la semaine contenant `dateKey` (ou de la semaine courante). */
export function weekStartOf(dateKey: string | null | undefined): string {
  const key = dateKey && DATE_RE.test(dateKey) ? dateKey : parisDateKey(new Date())
  const [y, m, d] = key.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() // 0 = dimanche
  return addParisDays(key, -((dow + 6) % 7))
}
