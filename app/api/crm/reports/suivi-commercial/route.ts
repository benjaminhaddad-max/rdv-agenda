/**
 * GET /api/crm/reports/suivi-commercial?from=YYYY-MM-DD&to=YYYY-MM-DD&role=telepro|closer
 *
 * Agrège appels Aircall (lignes cochées) + RDV par télépro ou closer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { getAircallTrackedLineIds, getAircallTrackedUserIds } from '@/lib/settings'
import {
  addParisDays,
  eachParisDate,
  parisRangeUtcBounds,
  parisWeekStartKey,
} from '@/lib/date-paris'
import {
  applyCall,
  applyRdv,
  emptyAgent,
  finalizeAgent,
  totalsFromAgents,
  unmappedKey,
  unmappedLabel,
  type AgentMetrics,
  type CallRow,
  type SuiviRole,
} from '@/lib/suivi-commercial'

export const dynamic = 'force-dynamic'

type UserRow = {
  id: string
  name: string
  avatar_color: string | null
  hubspot_user_id: string | null
}

type ApptRow = {
  id: string
  telepro_id: string | null
  commercial_id: string | null
  hubspot_contact_id: string | null
  status: string | null
  created_at: string
  start_at: string | null
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  try {
    return await buildReport(req, startedAt)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/aircall_calls|does not exist|schema cache/i.test(msg)) {
      return NextResponse.json({ error: msg, migration_pending: true }, { status: 503 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function buildReport(req: NextRequest, startedAt: number) {

  const roleParam = (req.nextUrl.searchParams.get('role') || 'telepro').trim()
  const role: SuiviRole = roleParam === 'closer' ? 'closer' : 'telepro'

  const defaultFrom = parisWeekStartKey(new Date())
  const defaultTo = addParisDays(defaultFrom, 6)

  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get('from') || '')
    ? req.nextUrl.searchParams.get('from') as string
    : defaultFrom
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get('to') || '')
    ? req.nextUrl.searchParams.get('to') as string
    : defaultTo

  const dates = eachParisDate(from, to)
  const dayIndex = new Map(dates.map((d, i) => [d, i]))
  const { start, end } = parisRangeUtcBounds(from, to)

  const dayCount = dates.length
  const prevTo = addParisDays(from, -1)
  const prevFrom = addParisDays(from, -dayCount)
  const prevBounds = parisRangeUtcBounds(prevFrom, prevTo)

  const trackedLineIds = await getAircallTrackedLineIds()
  const trackedUserIds = await getAircallTrackedUserIds()
  const needsLines = trackedLineIds.length === 0
  const needsUsers = trackedUserIds.length === 0

  const db = createServiceClient()
  const [{ data: users, error: usersErr }, currentAppts, prevAppts, currentCalls, prevCalls] = await Promise.all([
    db.from('rdv_users')
      .select('id, name, avatar_color, hubspot_user_id')
      .eq('role', role)
      .order('name'),
    fetchAppointments(db, start, end, role),
    fetchAppointments(db, prevBounds.start, prevBounds.end, role),
    needsLines ? Promise.resolve([] as CallRow[]) : fetchCalls(db, start, end, trackedLineIds, trackedUserIds),
    needsLines ? Promise.resolve([] as CallRow[]) : fetchCalls(db, prevBounds.start, prevBounds.end, trackedLineIds, trackedUserIds),
  ])

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 })
  }

  const userList = (users ?? []) as UserRow[]
  const agents = new Map<string, AgentMetrics>()
  for (const u of userList) {
    agents.set(u.id, emptyAgent(u.id, u.name, u.avatar_color, false, dates))
  }

  const hsUserToTelepro = new Map<string, string>()
  if (role === 'telepro') {
    for (const u of userList) {
      if (u.hubspot_user_id) hsUserToTelepro.set(u.hubspot_user_id, u.id)
    }
  }

  const contactTeleproMap = role === 'telepro'
    ? await resolveContactTelepros(db, [...currentAppts, ...prevAppts], hsUserToTelepro)
    : new Map<string, string>()

  const validIds = new Set(userList.map(u => u.id))
  const nowMs = Date.now()

  const unassigned = { total: 0, positifs: 0, preinscriptions: 0, annules: 0, no_show: 0, autres: 0 }

  const resolveAgentId = (row: ApptRow): string | null => {
    if (role === 'closer') {
      return row.commercial_id && validIds.has(row.commercial_id) ? row.commercial_id : null
    }
    let tpId = row.telepro_id
    if (!tpId && row.hubspot_contact_id) {
      tpId = contactTeleproMap.get(row.hubspot_contact_id) ?? null
    }
    return tpId && validIds.has(tpId) ? tpId : null
  }

  const bumpUnassigned = (status: string | null) => {
    unassigned.total += 1
    const s = (status || '').toLowerCase()
    if (s === 'positif') unassigned.positifs += 1
    else if (s === 'preinscription') unassigned.preinscriptions += 1
    else if (s === 'annule') unassigned.annules += 1
    else if (s === 'no_show') unassigned.no_show += 1
    else unassigned.autres += 1
  }

  for (const row of currentAppts) {
    const id = resolveAgentId(row)
    if (!id) {
      bumpUnassigned(row.status)
      continue
    }
    applyRdv(agents.get(id)!, row.status, row.start_at, row.created_at, nowMs, dayIndex, role)
  }

  const prevRdv = new Map<string, number>()
  for (const row of prevAppts) {
    const id = resolveAgentId(row)
    if (!id) continue
    prevRdv.set(id, (prevRdv.get(id) ?? 0) + 1)
  }

  const prevCallsByAgent = new Map<string, number>()
  for (const call of prevCalls) {
    const key = call.rdv_user_id && agents.has(call.rdv_user_id)
      ? call.rdv_user_id
      : unmappedKey(call)
    if (call.direction === 'outbound') {
      prevCallsByAgent.set(key, (prevCallsByAgent.get(key) ?? 0) + 1)
    }
  }

  for (const call of currentCalls) {
    let agent: AgentMetrics | undefined
    if (call.rdv_user_id && agents.has(call.rdv_user_id)) {
      agent = agents.get(call.rdv_user_id)
    } else if (!needsUsers) {
      const key = unmappedKey(call)
      agent = agents.get(key)
      if (!agent) {
        agent = emptyAgent(key, unmappedLabel(call), null, true, dates)
        agents.set(key, agent)
      }
    }
    if (agent) applyCall(agent, call, dayIndex)
  }

  for (const [id, agent] of agents) {
    agent.previous_rdv_total = prevRdv.get(id) ?? 0
    agent.previous_calls_outbound = prevCallsByAgent.get(id) ?? 0
    finalizeAgent(agent, role)
  }

  const rows = [...agents.values()].sort((a, b) => {
    if (a.unmapped !== b.unmapped) return a.unmapped ? 1 : -1
    if (b.calls_outbound !== a.calls_outbound) return b.calls_outbound - a.calls_outbound
    if (b.rdv_total !== a.rdv_total) return b.rdv_total - a.rdv_total
    return a.name.localeCompare(b.name, 'fr')
  })

  const mapped = rows.filter(a => !a.unmapped)
  const prevTotalsAgents: AgentMetrics[] = mapped.map(a => ({
    ...a,
    calls_outbound: a.previous_calls_outbound,
    rdv_total: a.previous_rdv_total,
    rdv_honored: 0,
    rdv_no_show: 0,
    rdv_positifs: 0,
    rdv_preinscriptions: 0,
    calls_answered_outbound: 0,
    calls_answered: 0,
    talk_time_sec: 0,
    calls_total: 0,
    calls_inbound: 0,
  }))

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    from,
    to,
    role,
    needs_lines: needsLines,
    tracked_line_ids: trackedLineIds,
    needs_users: needsUsers,
    tracked_user_ids: trackedUserIds,
    totals: totalsFromAgents(mapped, role),
    previous_totals: {
      ...totalsFromAgents(prevTotalsAgents, role),
      rdv_total: mapped.reduce((s, a) => s + a.previous_rdv_total, 0),
      calls_outbound: mapped.reduce((s, a) => s + a.previous_calls_outbound, 0),
    },
    agents: rows,
    unassigned_rdv: unassigned,
  }, {
    headers: {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      'X-Response-Time-Ms': String(Date.now() - startedAt),
    },
  })
}

async function fetchCalls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  start: string,
  end: string,
  lineIds: number[],
  userIds: number[],
): Promise<CallRow[]> {
  const pageSize = 1000
  const all: CallRow[] = []
  let from = 0
  while (from < 200_000) {
    let q = db
      .from('aircall_calls')
      .select('rdv_user_id, agent_email, agent_name, direction, answered, status, duration_sec, started_at, hubspot_contact_id, line_id, line_name, aircall_user_id')
      .in('line_id', lineIds)
      .gte('started_at', start)
      .lt('started_at', end)
      .order('started_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (userIds.length > 0) {
      q = q.in('aircall_user_id', userIds)
    }
    const { data, error } = await q
    if (error) {
      if (/aircall_calls|does not exist|schema cache/i.test(error.message)) return []
      throw new Error(error.message)
    }
    if (!data?.length) break
    all.push(...(data as CallRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function fetchAppointments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  start: string,
  end: string,
  role: SuiviRole,
): Promise<ApptRow[]> {
  const pageSize = 1000
  const all: ApptRow[] = []
  const dateCol = role === 'closer' ? 'start_at' : 'created_at'
  let from = 0
  while (from < 100_000) {
    const { data, error } = await db
      .from('rdv_appointments')
      .select('id, telepro_id, commercial_id, hubspot_contact_id, status, created_at, start_at')
      .gte(dateCol, start)
      .lt(dateCol, end)
      .order(dateCol, { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...(data as ApptRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function resolveContactTelepros(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  rows: ApptRow[],
  hsUserToTelepro: Map<string, string>,
): Promise<Map<string, string>> {
  const missingContactIds = [
    ...new Set(
      rows
        .filter(r => !r.telepro_id && r.hubspot_contact_id)
        .map(r => r.hubspot_contact_id as string),
    ),
  ]
  const map = new Map<string, string>()
  if (!missingContactIds.length) return map

  const batchSize = 200
  for (let i = 0; i < missingContactIds.length; i += batchSize) {
    const batch = missingContactIds.slice(i, i + batchSize)
    const { data: contacts } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, telepro_user_id')
      .in('hubspot_contact_id', batch)
    for (const c of contacts ?? []) {
      const tpId = c.telepro_user_id ? hsUserToTelepro.get(String(c.telepro_user_id)) : undefined
      if (tpId) map.set(c.hubspot_contact_id, tpId)
    }
  }
  return map
}
