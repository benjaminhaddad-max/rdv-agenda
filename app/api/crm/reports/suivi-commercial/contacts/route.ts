/**
 * GET /api/crm/reports/suivi-commercial/contacts?from=YYYY-MM-DD&to=YYYY-MM-DD&role=telepro|closer&agent=<user_id>
 *
 * Contacts réellement joints au téléphone (décroché humain ≥ 10 s, hors messagerie)
 * par un agent sur la période, avec leur statut lead actuel et le changement de
 * statut éventuel survenu à partir du premier appel joint.
 *
 * Même rattachement appel → agent que le rapport principal (rdv_user_id puis
 * liaison manuelle Aircall → CRM, sinon clé « unmapped:… »).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { getAircallTrackedLineIds, getAircallTrackedUserIds, getAircallUserMap } from '@/lib/settings'
import { addParisDays, parisRangeUtcBounds, parisWeekStartKey } from '@/lib/date-paris'
import {
  isHumanAnswered,
  talkSeconds,
  TALK_MIN_SEC,
  unmappedKey,
  type CallRow,
  type ReachedContact,
  type SuiviRole,
} from '@/lib/suivi-commercial'

export const dynamic = 'force-dynamic'

type ReachedCallRow = CallRow & { raw_digits: string | null }

type ContactRow = {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  phone: string | null
  hs_lead_status: string | null
}

type HistoryRow = {
  hubspot_contact_id: string
  value: string | null
  changed_at: string
}

const BATCH = 200

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  try {
    return await build(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function build(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const role: SuiviRole = sp.get('role') === 'closer' ? 'closer' : 'telepro'
  const agentId = (sp.get('agent') || '').trim()
  if (!agentId) return NextResponse.json({ error: 'agent requis' }, { status: 400 })

  const defaultFrom = parisWeekStartKey(new Date())
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('from') || '') ? sp.get('from') as string : defaultFrom
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('to') || '') ? sp.get('to') as string : addParisDays(defaultFrom, 6)
  const { start, end } = parisRangeUtcBounds(from, to)

  const [trackedLineIds, trackedUserIds, aircallUserMap] = await Promise.all([
    getAircallTrackedLineIds(),
    getAircallTrackedUserIds(),
    getAircallUserMap(),
  ])
  const empty = { from, to, agent_id: agentId, contacts: [] as ReachedContact[] }
  if (trackedLineIds.length === 0) return NextResponse.json(empty)
  const needsUsers = trackedUserIds.length === 0

  const db = createServiceClient()
  const { data: users, error: usersErr } = await db
    .from('rdv_users')
    .select('id')
    .eq('role', role)
  if (usersErr) throw new Error(usersErr.message)
  const validIds = new Set((users ?? []).map((u: { id: string }) => u.id))

  const isUnmappedAgent = agentId.startsWith('unmapped:')
  if (!isUnmappedAgent && !validIds.has(agentId)) return NextResponse.json(empty)

  // Pré-filtre SQL : pour un agent mappé, seuls ses appels (rdv_user_id ou comptes Aircall liés).
  const mappedAircallIds = [...aircallUserMap.entries()].filter(([, v]) => v === agentId).map(([k]) => k)
  const agentFilter = isUnmappedAgent
    ? null
    : [`rdv_user_id.eq.${agentId}`, ...(mappedAircallIds.length ? [`aircall_user_id.in.(${mappedAircallIds.join(',')})`] : [])].join(',')

  const calls = await fetchAnsweredCalls(db, start, end, trackedLineIds, trackedUserIds, agentFilter)

  // Rattachement identique au rapport principal.
  const resolveAgent = (call: CallRow): string | null => {
    if (call.rdv_user_id && validIds.has(call.rdv_user_id)) return call.rdv_user_id
    if (call.aircall_user_id) {
      const mapped = aircallUserMap.get(call.aircall_user_id)
      if (mapped && validIds.has(mapped)) return mapped
    }
    return needsUsers ? null : unmappedKey(call)
  }

  const byKey = new Map<string, ReachedContact>()
  for (const call of calls) {
    if (!isHumanAnswered(call)) continue
    if (resolveAgent(call) !== agentId) continue
    const phone = call.raw_digits?.trim() || null
    const key = call.hubspot_contact_id || (phone ? `phone:${phone}` : null)
    if (!key) continue
    const talk = talkSeconds(call)
    let c = byKey.get(key)
    if (!c) {
      c = {
        key,
        hubspot_contact_id: call.hubspot_contact_id,
        name: null,
        phone,
        calls: 0,
        calls_2min: 0,
        talk_sec: 0,
        max_talk_sec: 0,
        first_call_at: call.started_at,
        last_call_at: call.started_at,
        lead_status: null,
        status_before: null,
        status_changed_to: null,
        status_changed_at: null,
      }
      byKey.set(key, c)
    }
    c.calls += 1
    if (talk >= TALK_MIN_SEC) c.calls_2min += 1
    c.talk_sec += talk
    c.max_talk_sec = Math.max(c.max_talk_sec, talk)
    if (call.started_at < c.first_call_at) c.first_call_at = call.started_at
    if (call.started_at > c.last_call_at) c.last_call_at = call.started_at
    if (!c.phone && phone) c.phone = phone
  }

  const contactIds = [...new Set([...byKey.values()].map(c => c.hubspot_contact_id).filter((x): x is string => !!x))]
  const [contacts, history] = await Promise.all([
    fetchContacts(db, contactIds),
    fetchLeadStatusHistory(db, contactIds),
  ])

  const contactMap = new Map(contacts.map(c => [c.hubspot_contact_id, c]))
  const historyMap = new Map<string, HistoryRow[]>()
  for (const h of history) {
    const list = historyMap.get(h.hubspot_contact_id)
    if (list) list.push(h)
    else historyMap.set(h.hubspot_contact_id, [h])
  }

  for (const c of byKey.values()) {
    if (!c.hubspot_contact_id) continue
    const row = contactMap.get(c.hubspot_contact_id)
    if (row) {
      const name = [row.firstname, row.lastname].filter(Boolean).join(' ').trim()
      c.name = name || null
      c.lead_status = row.hs_lead_status
      if (!c.phone) c.phone = row.phone
    }
    const hist = (historyMap.get(c.hubspot_contact_id) ?? [])
      .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    const firstMs = Date.parse(c.first_call_at)
    let before: string | null = null
    let after: HistoryRow | null = null
    for (const h of hist) {
      if (Date.parse(h.changed_at) < firstMs) before = h.value
      else after = h
    }
    c.status_before = before
    if (after && after.value !== before) {
      c.status_changed_to = after.value
      c.status_changed_at = after.changed_at
    }
  }

  const list = [...byKey.values()].sort((a, b) =>
    b.max_talk_sec - a.max_talk_sec || b.talk_sec - a.talk_sec || b.last_call_at.localeCompare(a.last_call_at),
  )

  return NextResponse.json({ ...empty, contacts: list }, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
  })
}

async function fetchAnsweredCalls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  start: string,
  end: string,
  lineIds: number[],
  userIds: number[],
  agentFilter: string | null,
): Promise<ReachedCallRow[]> {
  const pageSize = 1000
  const all: ReachedCallRow[] = []
  let offset = 0
  while (offset < 100_000) {
    let q = db
      .from('aircall_calls')
      .select('rdv_user_id, agent_email, agent_name, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at, hubspot_contact_id, line_id, line_name, aircall_user_id, raw_digits')
      .eq('answered', true)
      .in('line_id', lineIds)
      .gte('started_at', start)
      .lt('started_at', end)
      .order('started_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (userIds.length > 0) q = q.in('aircall_user_id', userIds)
    if (agentFilter) q = q.or(agentFilter)
    const { data, error } = await q
    if (error) {
      if (/aircall_calls|does not exist|schema cache/i.test(error.message)) return []
      throw new Error(error.message)
    }
    if (!data?.length) break
    all.push(...(data as ReachedCallRow[]))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

async function fetchContacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ids: string[],
): Promise<ContactRow[]> {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH))
  const results = await Promise.all(batches.map(async batch => {
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, phone, hs_lead_status')
      .in('hubspot_contact_id', batch)
    if (error) throw new Error(error.message)
    return (data ?? []) as ContactRow[]
  }))
  return results.flat()
}

async function fetchLeadStatusHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ids: string[],
): Promise<HistoryRow[]> {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH))
  const results = await Promise.all(batches.map(async batch => {
    const rows: HistoryRow[] = []
    let offset = 0
    while (offset < 20_000) {
      const { data, error } = await db
        .from('crm_property_history')
        .select('hubspot_contact_id, value, changed_at')
        .eq('property_name', 'hs_lead_status')
        .in('hubspot_contact_id', batch)
        .order('changed_at', { ascending: true })
        .range(offset, offset + 999)
      if (error) {
        // Table d'historique absente : on affiche juste le statut actuel.
        if (/crm_property_history|does not exist|schema cache/i.test(error.message)) return rows
        throw new Error(error.message)
      }
      if (!data?.length) break
      rows.push(...(data as HistoryRow[]))
      if (data.length < 1000) break
      offset += 1000
    }
    return rows
  }))
  return results.flat()
}
