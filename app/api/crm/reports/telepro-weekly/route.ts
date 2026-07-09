import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  addParisWeeks,
  formatParisWeekRange,
  parisWeekStartKey,
  parisWeekUtcBounds,
} from '@/lib/date-paris'

interface ApptRow {
  id: string
  telepro_id: string | null
  hubspot_contact_id: string | null
  status: string | null
  source: string | null
  created_at: string
}

interface TeleproRow {
  id: string
  name: string
  avatar_color: string | null
  hubspot_user_id: string | null
}

/**
 * GET /api/crm/reports/telepro-weekly?week=2026-06-30
 *
 * Compte les RDV placés par télépro sur une semaine calendaire (lun→dim, Paris),
 * basé sur created_at (= moment où le RDV a été pris).
 */
export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const weekParam = (req.nextUrl.searchParams.get('week') || '').trim()
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
    ? weekParam
    : parisWeekStartKey(new Date())

  const { start, end } = parisWeekUtcBounds(weekStart)
  const prevWeekStart = addParisWeeks(weekStart, -1)
  const prevBounds = parisWeekUtcBounds(prevWeekStart)

  const db = createServiceClient()

  const [{ data: telepros, error: tpErr }, currentRows, prevRows] = await Promise.all([
    db.from('rdv_users')
      .select('id, name, avatar_color, hubspot_user_id')
      .eq('role', 'telepro')
      .order('name'),
    fetchWeekAppointments(db, start, end),
    fetchWeekAppointments(db, prevBounds.start, prevBounds.end),
  ])

  if (tpErr) {
    return NextResponse.json({ error: tpErr.message }, { status: 500 })
  }

  const teleproList = (telepros ?? []) as TeleproRow[]
  const hsUserToTelepro = new Map<string, string>()
  for (const tp of teleproList) {
    if (tp.hubspot_user_id) hsUserToTelepro.set(tp.hubspot_user_id, tp.id)
  }

  const contactTeleproMap = await resolveContactTelepros(
    db,
    [...currentRows, ...prevRows],
    hsUserToTelepro,
  )

  const currentCounts = aggregateByTelepro(currentRows, teleproList, contactTeleproMap)
  const prevCounts = aggregateByTelepro(prevRows, teleproList, contactTeleproMap)

  const rows = teleproList.map(tp => {
    const stats = currentCounts.get(tp.id) ?? emptyStats()
    const prev = prevCounts.get(tp.id)?.total ?? 0
    const delta = stats.total - prev
    return {
      telepro_id: tp.id,
      name: tp.name,
      avatar_color: tp.avatar_color,
      total: stats.total,
      positifs: stats.positifs,
      annules: stats.annules,
      no_show: stats.no_show,
      autres: stats.autres,
      previous_week: prev,
      delta,
    }
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fr'))

  const unassigned = currentCounts.get('__unassigned__') ?? emptyStats()

  const [y, m, d] = weekStart.split('-').map(Number)
  const weekEnd = new Date(Date.UTC(y, m - 1, d + 6, 12)).toISOString().slice(0, 10)

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    week_start: weekStart,
    week_end: weekEnd,
    week_label: formatParisWeekRange(weekStart),
    previous_week_start: prevWeekStart,
    total: rows.reduce((s, r) => s + r.total, 0) + unassigned.total,
    unassigned: {
      total: unassigned.total,
      positifs: unassigned.positifs,
      annules: unassigned.annules,
      no_show: unassigned.no_show,
      autres: unassigned.autres,
    },
    telepros: rows,
  }, {
    headers: {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      'X-Response-Time-Ms': String(Date.now() - startedAt),
    },
  })
}

function emptyStats() {
  return { total: 0, positifs: 0, annules: 0, no_show: 0, autres: 0 }
}

type Stats = ReturnType<typeof emptyStats>

function statusBucket(status: string | null): keyof Omit<Stats, 'total'> {
  const s = (status || '').toLowerCase()
  if (s === 'positif' || s === 'preinscription') return 'positifs'
  if (s === 'annule') return 'annules'
  if (s === 'no_show') return 'no_show'
  return 'autres'
}

function aggregateByTelepro(
  rows: ApptRow[],
  telepros: TeleproRow[],
  contactTeleproMap: Map<string, string>,
): Map<string, Stats> {
  const validIds = new Set(telepros.map(t => t.id))
  const counts = new Map<string, Stats>()

  const bump = (key: string, status: string | null) => {
    const cur = counts.get(key) ?? emptyStats()
    cur.total += 1
    cur[statusBucket(status)] += 1
    counts.set(key, cur)
  }

  for (const row of rows) {
    let tpId = row.telepro_id
    if (!tpId && row.hubspot_contact_id) {
      tpId = contactTeleproMap.get(row.hubspot_contact_id) ?? null
    }
    if (!tpId || !validIds.has(tpId)) {
      bump('__unassigned__', row.status)
      continue
    }
    bump(tpId, row.status)
  }

  return counts
}

async function fetchWeekAppointments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  start: string,
  end: string,
): Promise<ApptRow[]> {
  const pageSize = 1000
  const all: ApptRow[] = []
  let from = 0
  while (from < 100_000) {
    const { data, error } = await db
      .from('rdv_appointments')
      .select('id, telepro_id, hubspot_contact_id, status, source, created_at')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })
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
