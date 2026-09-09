import type { SupabaseClient } from '@supabase/supabase-js'
import { addParisDays, parisMidnightUtc, parisWeekStartKey } from '@/lib/date-paris'
import { sendBrevoEmail } from '@/lib/brevo'
import { logger } from '@/lib/logger'

export const PLANNING_SETTING_KEY = 'suivi_telepro_planning'
export const DEFAULT_DIRECTOR_EMAIL = 'pascal@diploma-sante.fr'

/** Minutes after the slot ends before we alert (webhooks Aircall). */
export const ALERT_GRACE_MIN = 20
/** Don't alert for slots older than this. */
export const ALERT_LOOKBACK_HOURS = 36

export type PlanningContract = 'full' | 'part' | 'alternant'

export const CONTRACT_LABELS: Record<PlanningContract, string> = {
  full: 'Temps plein',
  part: 'Temps partiel',
  alternant: 'Alternant',
}

export const DEFAULT_MIN_HOURS: Record<PlanningContract, number> = {
  full: 35,
  part: 12,
  alternant: 21,
}

export type PlanningSlot = {
  id: string
  user_id: string
  date: string
  start: string
  end: string
  alerted_at: string | null
}

export type PlanningPerson = {
  user_id: string
  contract: PlanningContract
  min_hours: number
}

export type PlanningStore = {
  director_email: string
  slots: PlanningSlot[]
  people: PlanningPerson[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** HH:MM, éventuellement avec secondes (input time navigateur). */
export function normalizeHm(raw: string): string | null {
  const m = String(raw).trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/)
  if (!m) return null
  return `${m[1]}:${m[2]}`
}

/** Lundi de la semaine (YYYY-MM-DD) contenant une date calendaire. */
export function planningWeekStart(dateKey: string): string {
  if (!DATE_RE.test(dateKey)) return parisWeekStartKey(new Date())
  const [y, m, d] = dateKey.split('-').map(Number)
  return parisWeekStartKey(new Date(Date.UTC(y, m - 1, d, 12)))
}

export function emptyPlanningStore(): PlanningStore {
  return { director_email: DEFAULT_DIRECTOR_EMAIL, slots: [], people: [] }
}

export function parsePlanningStore(raw: unknown): PlanningStore {
  const store = emptyPlanningStore()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return store
  const obj = raw as Record<string, unknown>
  const email = String(obj.director_email ?? '').trim().toLowerCase()
  if (email.includes('@')) store.director_email = email
  const slots = Array.isArray(obj.slots) ? obj.slots : []
  for (const item of slots) {
    const slot = normalizeSlot(item)
    if (slot) store.slots.push(slot)
  }
  const seen = new Set<string>()
  const people = Array.isArray(obj.people) ? obj.people : []
  for (const item of people) {
    const person = normalizePerson(item)
    if (!person || seen.has(person.user_id)) continue
    seen.add(person.user_id)
    store.people.push(person)
  }
  return store
}

export function normalizeContract(raw: unknown): PlanningContract {
  const v = String(raw ?? '').trim()
  if (v === 'part' || v === 'alternant' || v === 'full') return v
  return 'full'
}

export function defaultMinHours(contract: PlanningContract): number {
  return DEFAULT_MIN_HOURS[contract]
}

export function normalizePerson(raw: unknown): PlanningPerson | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const user_id = String(o.user_id ?? '').trim()
  if (!user_id) return null
  const contract = normalizeContract(o.contract)
  const hours = Number(o.min_hours)
  const min_hours = Number.isFinite(hours) && hours > 0
    ? Math.round(hours * 2) / 2
    : defaultMinHours(contract)
  return { user_id, contract, min_hours: Math.min(48, min_hours) }
}

export function defaultPerson(userId: string): PlanningPerson {
  return { user_id: userId, contract: 'full', min_hours: defaultMinHours('full') }
}

export type CrmTelepro = { id: string; name: string; email: string | null }

export type PlanningRosterRow = CrmTelepro & {
  contract: PlanningContract
  min_hours: number
}

export function planningRoster(
  store: PlanningStore,
  users: CrmTelepro[],
): { roster: PlanningRosterRow[]; available: CrmTelepro[] } {
  const byId = new Map(users.map(u => [u.id, u]))
  if (store.people.length === 0) {
    return {
      roster: users.map(u => {
        const person = defaultPerson(u.id)
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          contract: person.contract,
          min_hours: person.min_hours,
        }
      }),
      available: [],
    }
  }
  const roster: PlanningRosterRow[] = store.people.map(p => {
    const u = byId.get(p.user_id)
    return {
      id: p.user_id,
      name: u?.name || 'Télépro retiré',
      email: u?.email ?? null,
      contract: p.contract,
      min_hours: p.min_hours,
    }
  })
  const inRoster = new Set(store.people.map(p => p.user_id))
  return { roster, available: users.filter(u => !inRoster.has(u.id)) }
}

export function replacePeople(raw: unknown): PlanningPerson[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: PlanningPerson[] = []
  for (const item of raw) {
    const p = normalizePerson(item)
    if (!p || seen.has(p.user_id)) continue
    seen.add(p.user_id)
    out.push(p)
  }
  return out
}

export function slotHours(start: string, end: string): number {
  const s = normalizeHm(start)
  const e = normalizeHm(end)
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  const mins = eh * 60 + em - (sh * 60 + sm)
  return mins > 0 ? mins / 60 : 0
}

export function plannedHours(slots: Array<{ start: string; end: string }>): number {
  return Math.round(slots.reduce((acc, s) => acc + slotHours(s.start, s.end), 0) * 10) / 10
}

export function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h'
  const rounded = Math.round(h * 60) / 60
  if (rounded % 1 === 0) return `${rounded}h`
  const hInt = Math.floor(rounded)
  const m = Math.round((rounded - hInt) * 60)
  return `${hInt}h${String(m).padStart(2, '0')}`
}

function normalizeSlot(raw: unknown): PlanningSlot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const user_id = String(s.user_id ?? '').trim()
  const date = String(s.date ?? '').trim()
  const start = normalizeHm(String(s.start ?? ''))
  const end = normalizeHm(String(s.end ?? ''))
  if (!user_id || !DATE_RE.test(date) || !start || !end) return null
  if (start >= end) return null
  return {
    id: String(s.id ?? '').trim() || crypto.randomUUID(),
    user_id,
    date,
    start,
    end,
    alerted_at: typeof s.alerted_at === 'string' && s.alerted_at ? s.alerted_at : null,
  }
}

export async function loadPlanningStore(db: SupabaseClient): Promise<PlanningStore> {
  const { data } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', PLANNING_SETTING_KEY)
    .maybeSingle()
  return parsePlanningStore(data?.value)
}

export async function savePlanningStore(db: SupabaseClient, store: PlanningStore): Promise<void> {
  const cutoff = addParisDays(parisWeekStartKey(new Date()), -56)
  const slots = store.slots.filter(s => s.date >= cutoff)
  const { error } = await db.from('crm_settings').upsert({
    key: PLANNING_SETTING_KEY,
    value: { director_email: store.director_email, slots, people: store.people },
    description: 'Planning horaires télépros (suivi commercial) + alertes absence d’appels',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

export function slotsInWeek(slots: PlanningSlot[], weekStart: string): PlanningSlot[] {
  const weekEnd = addParisDays(weekStart, 7)
  return slots.filter(s => s.date >= weekStart && s.date < weekEnd)
}

export function slotKey(s: Pick<PlanningSlot, 'user_id' | 'date' | 'start' | 'end'>): string {
  return `${s.user_id}|${s.date}|${s.start}|${s.end}`
}

export function mergeWeekSlots(
  existing: PlanningSlot[],
  weekStart: string,
  incoming: Array<Pick<PlanningSlot, 'user_id' | 'date' | 'start' | 'end'> & { id?: string }>,
): PlanningSlot[] {
  const weekEnd = addParisDays(weekStart, 7)
  const kept = existing.filter(s => s.date < weekStart || s.date >= weekEnd)
  const prev = new Map(slotsInWeek(existing, weekStart).map(s => [slotKey(s), s]))
  const next: PlanningSlot[] = incoming.flatMap(raw => {
    const start = normalizeHm(raw.start)
    const end = normalizeHm(raw.end)
    if (!raw.user_id || !start || !end || !DATE_RE.test(raw.date) || start >= end) return []
    if (raw.date < weekStart || raw.date >= weekEnd) return []
    const base = { user_id: raw.user_id, date: raw.date, start, end }
    const old = prev.get(slotKey(base))
    return [{
      id: old?.id || raw.id || crypto.randomUUID(),
      ...base,
      alerted_at: old?.alerted_at ?? null,
    }]
  })
  return [...kept, ...next]
}

export function parisHmUtc(dateKey: string, hm: string): Date {
  const [h, m] = hm.split(':').map(Number)
  return new Date(parisMidnightUtc(dateKey).getTime() + (h * 60 + m) * 60 * 1000)
}

export async function outboundCallCount(
  db: SupabaseClient,
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const { count, error } = await db
    .from('aircall_calls')
    .select('id', { count: 'exact', head: true })
    .eq('rdv_user_id', userId)
    .eq('direction', 'outbound')
    .gte('started_at', fromIso)
    .lt('started_at', toIso)
  if (error) {
    logger.warn('suivi-planning-calls', error.message, { userId })
    return 0
  }
  return count ?? 0
}

export async function runPlanningAbsenceAlerts(db: SupabaseClient): Promise<{ checked: number; mailed: number }> {
  const store = await loadPlanningStore(db)
  const now = Date.now()
  const names = await loadTeleproNames(db)
  let mailed = 0
  let checked = 0
  let dirty = false

  const rosterIds = new Set(store.people.map(p => p.user_id))

  for (const slot of store.slots) {
    if (slot.alerted_at) continue
    if (rosterIds.size > 0 && !rosterIds.has(slot.user_id)) continue
    const start = parisHmUtc(slot.date, slot.start)
    const end = parisHmUtc(slot.date, slot.end)
    const dueAt = end.getTime() + ALERT_GRACE_MIN * 60 * 1000
    const staleAt = end.getTime() + ALERT_LOOKBACK_HOURS * 60 * 60 * 1000
    if (now < dueAt || now > staleAt) continue
    checked += 1
    const calls = await outboundCallCount(db, slot.user_id, start.toISOString(), end.toISOString())
    if (calls > 0) continue

    const name = names.get(slot.user_id) || 'Télépro'
    const dayLabel = new Date(slot.date + 'T12:00:00Z').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    })
    const html = `
      <p>Bonjour Pascal,</p>
      <p><strong>${escapeHtml(name)}</strong> était prévu(e) en ligne le <strong>${escapeHtml(dayLabel)}</strong> de <strong>${slot.start}</strong> à <strong>${slot.end}</strong>, et n’a passé <strong>aucun appel sortant</strong> sur ce créneau.</p>
      <p>Merci de la / le contacter.</p>
      <p style="color:#888;font-size:12px">Alerte automatique — Suivi commercial Diploma</p>
    `
    try {
      await sendBrevoEmail({
        to: [{ email: store.director_email, name: 'Pascal' }],
        subject: `[Suivi] ${name} n’a pas appelé (${dayLabel} ${slot.start}–${slot.end})`,
        htmlContent: html,
        textContent: `${name} était prévu(e) le ${dayLabel} de ${slot.start} à ${slot.end} et n’a passé aucun appel sortant. Merci de contacter cette personne.`,
        tags: ['suivi-planning', 'absence-appels'],
      })
      slot.alerted_at = new Date().toISOString()
      mailed += 1
      dirty = true
    } catch (err) {
      logger.warn('suivi-planning-mail', err instanceof Error ? err.message : String(err), { userId: slot.user_id })
    }
  }

  if (dirty) await savePlanningStore(db, store)
  return { checked, mailed }
}

async function loadTeleproNames(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from('rdv_users').select('id, name').eq('role', 'telepro')
  return new Map((data ?? []).map(u => [u.id as string, String(u.name || '')]))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}
