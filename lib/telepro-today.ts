/**
 * Espace télépro › « À traiter aujourd'hui » : ouvrir le CRM le matin et savoir
 * en 15 secondes qui appeler, pourquoi, et où on en est de ses objectifs.
 *
 * - Objectifs du jour (crm_settings « telepro_daily_goals » : valeurs par défaut
 *   + réglage par télépro) et progression du jour (lib/telepro-planning.ts) ;
 * - ses RDV d'aujourd'hui et de demain (à confirmer) ;
 * - ses relances (crm_tasks) prévues jusqu'à aujourd'hui ;
 * - les leads à appeler, classés par score (lib/lead-score.ts) :
 *   repop (a refait une demande), à relancer / réfléchit, nouveaux jamais
 *   appelés, NRP pas encore rappelés aujourd'hui.
 * Contacts du télépro : crm_contacts.telepro_user_id = ses identifiants HubSpot.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { addParisDays, parisDateKey, parisMidnightUtc } from '@/lib/date-paris'
import { getSettingValue, setSetting } from '@/lib/settings'
import { isHumanAnswered, talkSeconds, type CallRow } from '@/lib/suivi-commercial'
import { buildPlanningReport, type DayReport } from '@/lib/telepro-planning'
import { computeLeadScore, isDeadStatus, lastContactAt, type LeadScore } from '@/lib/lead-score'

export type TodayGoals = { calls: number; talk2: number; rdv: number }
export const DEFAULT_GOALS: TodayGoals = { calls: 80, talk2: 8, rdv: 2 }
const GOALS_KEY = 'telepro_daily_goals'

type GoalsSetting = { default?: Partial<TodayGoals>; users?: Record<string, Partial<TodayGoals>> }

function cleanGoals(g: Partial<TodayGoals> | undefined, base: TodayGoals): TodayGoals {
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d)
  return { calls: n(g?.calls, base.calls), talk2: n(g?.talk2, base.talk2), rdv: n(g?.rdv, base.rdv) }
}

export async function getGoals(userId: string): Promise<{ goals: TodayGoals; custom: boolean; defaults: TodayGoals }> {
  const raw = ((await getSettingValue(GOALS_KEY)) ?? {}) as GoalsSetting
  const defaults = cleanGoals(raw.default, DEFAULT_GOALS)
  const mine = raw.users?.[userId]
  return { goals: cleanGoals(mine, defaults), custom: !!mine, defaults }
}

/** userId null = objectifs par défaut de l'équipe ; goals null = revenir au défaut. */
export async function setGoals(userId: string | null, goals: Partial<TodayGoals> | null): Promise<void> {
  const raw = ((await getSettingValue(GOALS_KEY)) ?? {}) as GoalsSetting
  const next: GoalsSetting = { default: raw.default ?? DEFAULT_GOALS, users: { ...(raw.users ?? {}) } }
  if (!userId) next.default = cleanGoals(goals ?? undefined, DEFAULT_GOALS)
  else if (!goals) delete next.users![userId]
  else next.users![userId] = cleanGoals(goals, cleanGoals(next.default, DEFAULT_GOALS))
  await setSetting(GOALS_KEY, next)
}

// ── Leads à appeler ─────────────────────────────────────────────────────────

export type TodayReason = 'repop' | 'relance' | 'nouveau' | 'nrp'

export type TodayLead = {
  hubspot_contact_id: string
  name: string
  phone: string | null
  classe: string | null
  lead_status: string | null
  reason: TodayReason
  reason_label: string
  score: LeadScore
  last_contact_at: string | null
  last_call_at: string | null
  calls_count: number
}

export type TodayRdv = {
  id: string
  prospect_name: string
  prospect_phone: string | null
  start_at: string
  status: string
  meeting_type: string | null
  closer: string | null
  hubspot_contact_id: string | null
}

export type TodayTask = {
  id: string
  title: string
  due_at: string | null
  task_type: string | null
  hubspot_contact_id: string | null
  contact_name: string | null
  overdue: boolean
}

export type TodayData = {
  date: string
  goals: TodayGoals
  goals_custom: boolean
  progress: Pick<DayReport, 'calls' | 'answered' | 'talk2' | 'rdv' | 'first_call' | 'last_call'>
  rdvs: TodayRdv[]
  tasks: TodayTask[]
  leads: TodayLead[]
  counts: Record<TodayReason, number>
}

type ContactRow = {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  phone: string | null
  mobilephone: string | null
  classe_actuelle: string | null
  hs_lead_status: string | null
  contact_createdate: string | null
  createdate: string | null
  recent_conversion_date: string | null
  recent_conversion_event: string | null
  num_conversion_events: number | null
}

const CONTACT_COLS = 'hubspot_contact_id, firstname, lastname, phone, mobilephone, classe_actuelle, hs_lead_status, contact_createdate, createdate, recent_conversion_date, recent_conversion_event, num_conversion_events'
const PER_SECTION = 300
const MAX_LEADS = 60
const REASON_ORDER: TodayReason[] = ['repop', 'relance', 'nouveau', 'nrp']

type ContactCall = { started_at: string; answered: boolean; talk_sec: number; outbound: boolean }

/** Appels Aircall (tous télépros) des contacts donnés. */
export async function loadContactCalls(db: SupabaseClient, contactIds: string[]): Promise<Map<string, ContactCall[]>> {
  const out = new Map<string, ContactCall[]>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await db.from('aircall_calls')
      .select('hubspot_contact_id, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at')
      .in('hubspot_contact_id', contactIds.slice(i, i + 200))
      .order('started_at', { ascending: false })
      .limit(5000)
    for (const c of (data ?? []) as Array<CallRow & { hubspot_contact_id: string }>) {
      const list = out.get(c.hubspot_contact_id) ?? []
      list.push({
        started_at: c.started_at,
        answered: isHumanAnswered(c),
        talk_sec: isHumanAnswered(c) ? talkSeconds(c) : 0,
        outbound: c.direction === 'outbound',
      })
      out.set(c.hubspot_contact_id, list)
    }
  }
  return out
}

function teleproIds(u: { hubspot_owner_id?: string | null; hubspot_user_id?: string | null }): string[] {
  return [...new Set([u.hubspot_owner_id, u.hubspot_user_id].map(v => String(v ?? '').trim()).filter(v => /^\d+$/.test(v)))]
}

export async function buildToday(
  db: SupabaseClient,
  user: { id: string; hubspot_owner_id?: string | null; hubspot_user_id?: string | null },
): Promise<TodayData> {
  const date = parisDateKey(new Date())
  const todayStart = parisMidnightUtc(date)
  const tomorrowStart = parisMidnightUtc(addParisDays(date, 1))
  const afterTomorrow = parisMidnightUtc(addParisDays(date, 2))
  const ids = teleproIds(user)
  const now = Date.now()

  const contactsQuery = () => db.from('crm_contacts').select(CONTACT_COLS).in('telepro_user_id', ids.length ? ids : ['0'])
  const iso30 = new Date(now - 30 * 86_400_000).toISOString()

  const [planning, goals, rdvRows, repopRows, relanceRows, nouveauRows, nrpRows, tasksMine, tasksOrphan] = await Promise.all([
    buildPlanningReport(db, [user.id], date, 1),
    getGoals(user.id),
    db.from('rdv_appointments').select('id, prospect_name, prospect_phone, start_at, status, meeting_type, hubspot_contact_id, commercial_id')
      .eq('telepro_id', user.id).gte('start_at', todayStart.toISOString()).lt('start_at', afterTomorrow.toISOString())
      .not('status', 'in', '(annule,non_assigne)').order('start_at')
      .then(r => (r.data ?? []) as Array<Omit<TodayRdv, 'closer'> & { commercial_id: string | null }>),
    contactsQuery().gte('recent_conversion_date', iso30).order('recent_conversion_date', { ascending: false }).limit(PER_SECTION)
      .then(r => (r.data ?? []) as ContactRow[]),
    contactsQuery().in('hs_lead_status', ['A relancer', 'En attente / Réfléchit']).limit(PER_SECTION)
      .then(r => (r.data ?? []) as ContactRow[]),
    contactsQuery().or('hs_lead_status.eq.Nouveau,hs_lead_status.is.null').order('contact_createdate', { ascending: false, nullsFirst: false }).limit(PER_SECTION)
      .then(r => (r.data ?? []) as ContactRow[]),
    contactsQuery().in('hs_lead_status', ['NRP1', 'NRP2', 'NRP3']).limit(PER_SECTION)
      .then(r => (r.data ?? []) as ContactRow[]),
    db.from('crm_tasks').select('id, title, due_at, task_type, hubspot_contact_id, owner_id')
      .neq('status', 'completed').in('owner_id', [...ids, user.id]).lt('due_at', tomorrowStart.toISOString()).order('due_at').limit(200)
      .then(r => (r.data ?? []) as Array<Omit<TodayTask, 'contact_name' | 'overdue'>>),
    // Relances sans propriétaire : gardées si le contact est à lui
    db.from('crm_tasks').select('id, title, due_at, task_type, hubspot_contact_id, owner_id')
      .neq('status', 'completed').is('owner_id', null).lt('due_at', tomorrowStart.toISOString()).order('due_at').limit(500)
      .then(r => (r.data ?? []) as Array<Omit<TodayTask, 'contact_name' | 'overdue'>>),
  ])

  // ── Relances ──
  const orphanContactIds = [...new Set(tasksOrphan.map(t => t.hubspot_contact_id).filter((x): x is string => !!x))]
  const taskContacts = new Map<string, { name: string; mine: boolean }>()
  const allTaskContactIds = [...new Set([...orphanContactIds, ...tasksMine.map(t => t.hubspot_contact_id).filter((x): x is string => !!x)])]
  for (let i = 0; i < allTaskContactIds.length; i += 200) {
    const { data } = await db.from('crm_contacts').select('hubspot_contact_id, firstname, lastname, telepro_user_id')
      .in('hubspot_contact_id', allTaskContactIds.slice(i, i + 200))
    for (const c of data ?? []) {
      taskContacts.set(String(c.hubspot_contact_id), {
        name: [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Contact',
        mine: ids.includes(String(c.telepro_user_id ?? '')),
      })
    }
  }
  const tasks: TodayTask[] = [
    ...tasksMine,
    ...tasksOrphan.filter(t => t.hubspot_contact_id && taskContacts.get(t.hubspot_contact_id)?.mine),
  ].map(t => ({
    id: t.id, title: t.title, due_at: t.due_at, task_type: t.task_type, hubspot_contact_id: t.hubspot_contact_id,
    contact_name: t.hubspot_contact_id ? taskContacts.get(t.hubspot_contact_id)?.name ?? null : null,
    overdue: !!t.due_at && Date.parse(t.due_at) < todayStart.getTime(),
  }))

  // ── RDV du jour / de demain ──
  const closerIds = [...new Set(rdvRows.map(r => r.commercial_id).filter((x): x is string => !!x))]
  const closerNames = new Map<string, string>()
  if (closerIds.length) {
    const { data } = await db.from('rdv_users').select('id, name').in('id', closerIds)
    for (const u of data ?? []) closerNames.set(String(u.id), String(u.name))
  }
  const rdvs: TodayRdv[] = rdvRows.map(({ commercial_id, ...r }) => ({ ...r, closer: commercial_id ? closerNames.get(commercial_id) ?? null : null }))

  // ── Leads à appeler ──
  const candidates = new Map<string, { row: ContactRow; reasons: Set<TodayReason> }>()
  const push = (rows: ContactRow[], reason: TodayReason) => {
    for (const row of rows) {
      if (!row.hubspot_contact_id || isDeadStatus(row.hs_lead_status)) continue
      const e = candidates.get(row.hubspot_contact_id) ?? { row, reasons: new Set<TodayReason>() }
      e.reasons.add(reason)
      candidates.set(row.hubspot_contact_id, e)
    }
  }
  push(repopRows, 'repop')
  push(relanceRows, 'relance')
  push(nouveauRows, 'nouveau')
  push(nrpRows, 'nrp')

  const calls = await loadContactCalls(db, [...candidates.keys()])
  const counts: Record<TodayReason, number> = { repop: 0, relance: 0, nouveau: 0, nrp: 0 }
  const leads: TodayLead[] = []

  for (const [id, { row, reasons }] of candidates) {
    const list = calls.get(id) ?? []
    const created = row.contact_createdate || row.createdate
    const lastCall = list[0]?.started_at ?? null
    const lastCallMs = lastCall ? Date.parse(lastCall) : null
    const calledToday = lastCallMs != null && lastCallMs >= todayStart.getTime()
    const formMs = row.recent_conversion_date ? Date.parse(row.recent_conversion_date) : null
    const createdMs = created ? Date.parse(created) : null

    // Chaque rubrique a sa règle ; on garde la plus prioritaire qui s'applique
    const applies: Record<TodayReason, boolean> = {
      // A refait une demande (≥ 1 jour après sa création) et pas rappelé depuis
      repop: reasons.has('repop') && formMs != null && createdMs != null && formMs - createdMs >= 86_400_000
        && (lastCallMs == null || lastCallMs < formMs),
      // À relancer / réfléchit : pas d'appel depuis 2 jours
      relance: reasons.has('relance') && !calledToday && (lastCallMs == null || now - lastCallMs >= 2 * 86_400_000),
      // Nouveau jamais appelé
      nouveau: reasons.has('nouveau') && list.length === 0,
      // NRP : pas encore rappelé aujourd'hui
      nrp: reasons.has('nrp') && !calledToday,
    }
    const reason = REASON_ORDER.find(r => applies[r])
    if (!reason) continue
    counts[reason]++

    const score = computeLeadScore({
      hs_lead_status: row.hs_lead_status,
      created_at: created,
      recent_conversion_date: row.recent_conversion_date,
      recent_conversion_event: row.recent_conversion_event,
      num_conversion_events: row.num_conversion_events,
      calls: list,
    }, now)
    leads.push({
      hubspot_contact_id: id,
      name: [row.firstname, row.lastname].filter(Boolean).join(' ') || 'Contact',
      phone: row.phone || row.mobilephone || null,
      classe: row.classe_actuelle,
      lead_status: row.hs_lead_status,
      reason,
      reason_label: REASON_LABELS[reason],
      score,
      last_contact_at: lastContactAt({ hs_lead_status: row.hs_lead_status, calls: list }),
      last_call_at: lastCall,
      calls_count: list.length,
    })
  }

  leads.sort((a, b) => b.score.score - a.score.score || REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason))

  const day = planning.report[user.id]?.[0]
  return {
    date,
    goals: goals.goals,
    goals_custom: goals.custom,
    progress: {
      calls: day?.calls ?? 0, answered: day?.answered ?? 0, talk2: day?.talk2 ?? 0, rdv: day?.rdv ?? 0,
      first_call: day?.first_call ?? null, last_call: day?.last_call ?? null,
    },
    rdvs,
    tasks,
    leads: leads.slice(0, MAX_LEADS),
    counts,
  }
}

export const REASON_LABELS: Record<TodayReason, string> = {
  repop: 'A refait une demande',
  relance: 'À relancer',
  nouveau: 'Nouveau, jamais appelé',
  nrp: 'NRP à rappeler',
}
