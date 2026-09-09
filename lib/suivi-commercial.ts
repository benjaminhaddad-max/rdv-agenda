import { parisDateKey } from '@/lib/date-paris'

export type SuiviRole = 'telepro' | 'closer'

/** Conversation réelle : décroché humain d'au moins 2 minutes. */
export const TALK_MIN_SEC = 120

/**
 * En dessous de 10 s de conversation réelle, un « décroché » n'en est pas un
 * (messagerie du mobile qui prend, raccroché immédiat, mauvais numéro) :
 * on le compte comme « pas de réponse ».
 */
export const ANSWER_MIN_SEC = 10

/**
 * Temps de conversation réel. La `duration` Aircall inclut la sonnerie
 * (souvent 20-25 s avant que la messagerie du mobile prenne), donc on
 * mesure ended_at − answered_at quand on les a, sinon on retombe sur duration.
 */
export function talkSeconds(call: CallRow): number {
  const answeredAt = Number(call.answered_at)
  const endedAt = call.ended_at ? Date.parse(call.ended_at) / 1000 : NaN
  if (Number.isFinite(answeredAt) && answeredAt > 0 && Number.isFinite(endedAt)) {
    return Math.max(0, Math.round(endedAt - answeredAt))
  }
  return Math.max(0, Number(call.duration_sec) || 0)
}

export type DayPoint = {
  date: string
  calls_outbound: number
  calls_answered: number
  calls_talk_2min: number
  rdv: number
}

export type LineUsage = {
  line_id: number | null
  line_name: string | null
  calls: number
}

export type AgentMetrics = {
  user_id: string
  name: string
  avatar_color: string | null
  unmapped: boolean
  calls_total: number
  calls_outbound: number
  calls_inbound: number
  calls_answered: number
  calls_answered_outbound: number
  calls_outbound_unanswered: number
  calls_outbound_talk_short: number
  calls_outbound_talk_2min: number
  calls_voicemail: number
  calls_missed: number
  calls_no_answer: number
  calls_unmatched: number
  talk_time_sec: number
  talk_time_2min_sec: number
  avg_duration_sec: number | null
  avg_talk_2min_sec: number | null
  answer_rate: number | null
  talk_2min_rate: number | null
  rdv_total: number
  rdv_positifs: number
  rdv_preinscriptions: number
  rdv_annules: number
  rdv_no_show: number
  rdv_autres: number
  rdv_honored: number
  conversion_outbound: number | null
  conversion_answered: number | null
  conversion_talk_2min: number | null
  show_rate: number | null
  closing_rate: number | null
  previous_calls_outbound: number
  previous_rdv_total: number
  delta_calls_outbound: number
  delta_rdv: number
  by_day: DayPoint[]
  lines: LineUsage[]
}

export type TeamTotals = {
  calls_total: number
  calls_outbound: number
  calls_inbound: number
  calls_answered: number
  calls_answered_outbound: number
  calls_outbound_unanswered: number
  calls_outbound_talk_short: number
  calls_outbound_talk_2min: number
  talk_time_sec: number
  avg_duration_sec: number | null
  answer_rate: number | null
  talk_2min_rate: number | null
  rdv_total: number
  rdv_positifs: number
  rdv_preinscriptions: number
  rdv_annules: number
  rdv_no_show: number
  conversion_outbound: number | null
  conversion_answered: number | null
  conversion_talk_2min: number | null
  show_rate: number | null
  closing_rate: number | null
}

export type SuiviCommercialResponse = {
  generated_at: string
  from: string
  to: string
  role: SuiviRole
  needs_lines: boolean
  tracked_line_ids: number[]
  needs_users?: boolean
  tracked_user_ids?: number[]
  migration_pending?: boolean
  totals: TeamTotals
  previous_totals: TeamTotals
  agents: AgentMetrics[]
  unassigned_rdv: {
    total: number
    positifs: number
    preinscriptions: number
    annules: number
    no_show: number
    autres: number
  }
}

export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

export function emptyDay(date: string): DayPoint {
  return { date, calls_outbound: 0, calls_answered: 0, calls_talk_2min: 0, rdv: 0 }
}

export function isVoicemail(call: CallRow): boolean {
  return call.status === 'voicemail'
}

/** Décroché humain (pas la messagerie), d'au moins ANSWER_MIN_SEC. */
export function isHumanAnswered(call: CallRow): boolean {
  return Boolean(call.answered)
    && !isVoicemail(call)
    && talkSeconds(call) >= ANSWER_MIN_SEC
}

export function isOutboundUnanswered(call: CallRow): boolean {
  return call.direction === 'outbound' && !isHumanAnswered(call)
}

export function isOutboundTalk2min(call: CallRow): boolean {
  return call.direction === 'outbound'
    && isHumanAnswered(call)
    && talkSeconds(call) >= TALK_MIN_SEC
}

export function isOutboundTalkShort(call: CallRow): boolean {
  return call.direction === 'outbound'
    && isHumanAnswered(call)
    && talkSeconds(call) < TALK_MIN_SEC
}

export function emptyAgent(
  userId: string,
  name: string,
  avatarColor: string | null,
  unmapped: boolean,
  dates: string[],
): AgentMetrics {
  return {
    user_id: userId,
    name,
    avatar_color: avatarColor,
    unmapped,
    calls_total: 0,
    calls_outbound: 0,
    calls_inbound: 0,
    calls_answered: 0,
    calls_answered_outbound: 0,
    calls_outbound_unanswered: 0,
    calls_outbound_talk_short: 0,
    calls_outbound_talk_2min: 0,
    calls_voicemail: 0,
    calls_missed: 0,
    calls_no_answer: 0,
    calls_unmatched: 0,
    talk_time_sec: 0,
    talk_time_2min_sec: 0,
    avg_duration_sec: null,
    avg_talk_2min_sec: null,
    answer_rate: null,
    talk_2min_rate: null,
    rdv_total: 0,
    rdv_positifs: 0,
    rdv_preinscriptions: 0,
    rdv_annules: 0,
    rdv_no_show: 0,
    rdv_autres: 0,
    rdv_honored: 0,
    conversion_outbound: null,
    conversion_answered: null,
    conversion_talk_2min: null,
    show_rate: null,
    closing_rate: null,
    previous_calls_outbound: 0,
    previous_rdv_total: 0,
    delta_calls_outbound: 0,
    delta_rdv: 0,
    by_day: dates.map(emptyDay),
    lines: [],
  }
}

export function finalizeAgent(agent: AgentMetrics, role: SuiviRole): void {
  const humanOutbound = agent.calls_outbound_talk_2min + agent.calls_outbound_talk_short
  agent.avg_duration_sec = agent.calls_answered > 0
    ? Math.round(agent.talk_time_sec / agent.calls_answered)
    : null
  agent.avg_talk_2min_sec = agent.calls_outbound_talk_2min > 0
    ? Math.round(agent.talk_time_2min_sec / agent.calls_outbound_talk_2min)
    : null
  agent.answer_rate = rate(humanOutbound, agent.calls_outbound)
  agent.talk_2min_rate = rate(agent.calls_outbound_talk_2min, agent.calls_outbound)
  agent.conversion_outbound = rate(agent.rdv_total, agent.calls_outbound)
  agent.conversion_answered = rate(agent.rdv_total, humanOutbound)
  agent.conversion_talk_2min = rate(agent.rdv_total, agent.calls_outbound_talk_2min)
  if (role === 'closer') {
    const denom = agent.rdv_honored + agent.rdv_no_show
    agent.show_rate = rate(agent.rdv_honored, denom)
    agent.closing_rate = rate(agent.rdv_positifs + agent.rdv_preinscriptions, agent.rdv_honored)
  }
  agent.delta_calls_outbound = agent.calls_outbound - agent.previous_calls_outbound
  agent.delta_rdv = agent.rdv_total - agent.previous_rdv_total
}

export function totalsFromAgents(agents: AgentMetrics[], role: SuiviRole): TeamTotals {
  const mapped = agents.filter(a => !a.unmapped)
  const calls_total = mapped.reduce((s, a) => s + a.calls_total, 0)
  const calls_outbound = mapped.reduce((s, a) => s + a.calls_outbound, 0)
  const calls_inbound = mapped.reduce((s, a) => s + a.calls_inbound, 0)
  const calls_answered = mapped.reduce((s, a) => s + a.calls_answered, 0)
  const calls_answered_outbound = mapped.reduce((s, a) => s + a.calls_answered_outbound, 0)
  const calls_outbound_unanswered = mapped.reduce((s, a) => s + a.calls_outbound_unanswered, 0)
  const calls_outbound_talk_short = mapped.reduce((s, a) => s + a.calls_outbound_talk_short, 0)
  const calls_outbound_talk_2min = mapped.reduce((s, a) => s + a.calls_outbound_talk_2min, 0)
  const talk_time_sec = mapped.reduce((s, a) => s + a.talk_time_sec, 0)
  const rdv_total = mapped.reduce((s, a) => s + a.rdv_total, 0)
  const rdv_positifs = mapped.reduce((s, a) => s + a.rdv_positifs, 0)
  const rdv_preinscriptions = mapped.reduce((s, a) => s + a.rdv_preinscriptions, 0)
  const rdv_annules = mapped.reduce((s, a) => s + a.rdv_annules, 0)
  const rdv_no_show = mapped.reduce((s, a) => s + a.rdv_no_show, 0)
  const rdv_honored = mapped.reduce((s, a) => s + a.rdv_honored, 0)
  const humanOutbound = calls_outbound_talk_2min + calls_outbound_talk_short
  return {
    calls_total,
    calls_outbound,
    calls_inbound,
    calls_answered,
    calls_answered_outbound,
    calls_outbound_unanswered,
    calls_outbound_talk_short,
    calls_outbound_talk_2min,
    talk_time_sec,
    avg_duration_sec: calls_answered > 0 ? Math.round(talk_time_sec / calls_answered) : null,
    answer_rate: rate(humanOutbound, calls_outbound),
    talk_2min_rate: rate(calls_outbound_talk_2min, calls_outbound),
    rdv_total,
    rdv_positifs,
    rdv_preinscriptions,
    rdv_annules,
    rdv_no_show,
    conversion_outbound: rate(rdv_total, calls_outbound),
    conversion_answered: rate(rdv_total, humanOutbound),
    conversion_talk_2min: rate(rdv_total, calls_outbound_talk_2min),
    show_rate: role === 'closer' ? rate(rdv_honored, rdv_honored + rdv_no_show) : null,
    closing_rate: role === 'closer' ? rate(rdv_positifs + rdv_preinscriptions, rdv_honored) : null,
  }
}

export type CallRow = {
  rdv_user_id: string | null
  agent_email: string | null
  agent_name: string | null
  direction: string | null
  answered: boolean | null
  status: string | null
  duration_sec: number | null
  started_at: string
  ended_at?: string | null
  /** Epoch secondes (payload Aircall), présent sur tous les décrochés. */
  answered_at?: number | string | null
  hubspot_contact_id: string | null
  line_id: number | null
  line_name: string | null
  aircall_user_id: number | null
}

export function applyCall(agent: AgentMetrics, call: CallRow, dayIndex: Map<string, number>): void {
  agent.calls_total += 1
  const outbound = call.direction === 'outbound'
  if (outbound) agent.calls_outbound += 1
  else agent.calls_inbound += 1

  const human = isHumanAnswered(call)
  const duration = talkSeconds(call)
  if (human) {
    agent.calls_answered += 1
    agent.talk_time_sec += duration
    if (outbound) agent.calls_answered_outbound += 1
  }
  if (isOutboundUnanswered(call)) agent.calls_outbound_unanswered += 1
  if (isOutboundTalk2min(call)) {
    agent.calls_outbound_talk_2min += 1
    agent.talk_time_2min_sec += duration
  }
  if (isOutboundTalkShort(call)) agent.calls_outbound_talk_short += 1

  if (call.status === 'voicemail') agent.calls_voicemail += 1
  else if (call.status === 'missed') agent.calls_missed += 1
  else if (call.status === 'no_answer') agent.calls_no_answer += 1
  if (!call.hubspot_contact_id) agent.calls_unmatched += 1

  const day = parisDateKey(new Date(call.started_at))
  const idx = dayIndex.get(day)
  if (idx != null && agent.by_day[idx]) {
    if (outbound) agent.by_day[idx].calls_outbound += 1
    if (human && outbound) agent.by_day[idx].calls_answered += 1
    if (isOutboundTalk2min(call)) agent.by_day[idx].calls_talk_2min += 1
  }

  const lineKey = call.line_id != null ? String(call.line_id) : call.line_name || '?'
  const existing = agent.lines.find(l => String(l.line_id ?? l.line_name ?? '?') === lineKey)
  if (existing) existing.calls += 1
  else agent.lines.push({ line_id: call.line_id, line_name: call.line_name, calls: 1 })
}

export type RdvBucket = 'positifs' | 'preinscriptions' | 'annules' | 'no_show' | 'autres'

export function rdvBucket(status: string | null): RdvBucket {
  const s = (status || '').toLowerCase()
  if (s === 'positif') return 'positifs'
  if (s === 'preinscription') return 'preinscriptions'
  if (s === 'annule') return 'annules'
  if (s === 'no_show') return 'no_show'
  return 'autres'
}

export function applyRdv(
  agent: AgentMetrics,
  status: string | null,
  startAt: string | null,
  createdAt: string,
  nowMs: number,
  dayIndex: Map<string, number>,
  role: SuiviRole,
): void {
  agent.rdv_total += 1
  const bucket = rdvBucket(status)
  if (bucket === 'positifs') agent.rdv_positifs += 1
  else if (bucket === 'preinscriptions') agent.rdv_preinscriptions += 1
  else if (bucket === 'annules') agent.rdv_annules += 1
  else if (bucket === 'no_show') agent.rdv_no_show += 1
  else agent.rdv_autres += 1

  if (role === 'closer') {
    const when = startAt ? new Date(startAt).getTime() : 0
    if (when > 0 && when <= nowMs && bucket !== 'annules' && bucket !== 'no_show') {
      agent.rdv_honored += 1
    }
  }

  const day = parisDateKey(new Date(role === 'closer' && startAt ? startAt : createdAt))
  const idx = dayIndex.get(day)
  if (idx != null && agent.by_day[idx]) agent.by_day[idx].rdv += 1
}

export function unmappedKey(call: CallRow): string {
  const email = (call.agent_email || '').trim().toLowerCase()
  if (email) return `unmapped:${email}`
  const name = (call.agent_name || '').trim()
  if (name) return `unmapped:name:${name}`
  return 'unmapped:unknown'
}

export function unmappedLabel(call: CallRow): string {
  return call.agent_name || call.agent_email || 'Non mappé'
}
