import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { addParisDays, parisRangeUtcBounds } from '@/lib/date-paris'
import {
  loadPlanningStore,
  mergeWeekSlots,
  outboundCallCount,
  parisHmUtc,
  planningRoster,
  planningWeekStart,
  plannedHours,
  replacePeople,
  savePlanningStore,
  slotsInWeek,
  type PlanningSlot,
} from '@/lib/suivi-planning'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/reports/suivi-commercial/planning?week=YYYY-MM-DD
 * PUT { week, slots: [{ user_id, date, start, end }] }
 */
export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const weekParam = req.nextUrl.searchParams.get('week') || ''
  const weekStart = planningWeekStart(weekParam)

  const db = createServiceClient()
  const [{ data: usersRaw, error: usersErr }, store] = await Promise.all([
    db.from('rdv_users').select('id, name, email').eq('role', 'telepro').order('name'),
    loadPlanningStore(db),
  ])
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

  const users = (usersRaw ?? []) as Array<{ id: string; name: string; email: string | null }>
  const { roster, available } = planningRoster(store, users)
  const slots = slotsInWeek(store.slots, weekStart)
  const { start, end } = parisRangeUtcBounds(weekStart, addParisDays(weekStart, 6))
  const counts = new Map<string, number>()
  await Promise.all(slots.map(async s => {
    const from = parisHmUtc(s.date, s.start).toISOString()
    const to = parisHmUtc(s.date, s.end).toISOString()
    if (from >= end || to <= start) return
    const n = await outboundCallCount(db, s.user_id, from, to)
    counts.set(s.id, n)
  }))

  const now = Date.now()
  const decorated = slots.map(s => {
    const ended = parisHmUtc(s.date, s.end).getTime() < now
    return {
      ...s,
      outbound_calls: counts.get(s.id) ?? 0,
      ended,
    }
  })

  return NextResponse.json({
    week_start: weekStart,
    director_email: store.director_email,
    roster_configured: store.people.length > 0,
    telepros: roster.map(tp => ({
      ...tp,
      planned_hours: plannedHours(slots.filter(s => s.user_id === tp.id)),
    })),
    available,
    slots: decorated,
  })
}

export async function PUT(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  let body: { week?: string; slots?: unknown; people?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const weekStart = planningWeekStart(body.week || '')

  const incoming = Array.isArray(body.slots) ? body.slots as PlanningSlot[] : []
  const db = createServiceClient()
  try {
    const store = await loadPlanningStore(db)
    store.slots = mergeWeekSlots(store.slots, weekStart, incoming)
    if (body.people !== undefined) store.people = replacePeople(body.people)
    await savePlanningStore(db, store)

    return NextResponse.json({
      ok: true,
      week_start: weekStart,
      saved: slotsInWeek(store.slots, weekStart).length,
      people: store.people.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
