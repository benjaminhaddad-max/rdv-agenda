import { NextRequest, NextResponse } from 'next/server'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventTypeOf, planningPublicUrl } from '@/lib/events-studio/config'
import { formatEventSchedule, eventDayCount, multiDayLabel, publicStaffDescription, parseStaffNeeded, staffPayForEvent } from '@/lib/events-studio/event-meta'

function enrichPlanningEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[],
  staffCounts: Record<string, number>,
) {
  return events.map((e) => {
    const type = eventTypeOf(e)
    const staffNeeded = parseStaffNeeded(e.description)
    const staffCount = staffCounts[e.id] || 0
    const pay = staffPayForEvent(e)
    const dayCount = eventDayCount(e)
    return {
      ...e,
      description_public: publicStaffDescription(e.description),
      schedule_label: formatEventSchedule(e),
      day_count: dayCount,
      multi_day_label: multiDayLabel(dayCount),
      type,
      staff_count: staffCount,
      staff_needed: staffNeeded,
      staff_remaining: staffNeeded != null ? Math.max(0, staffNeeded - staffCount) : null,
      staff_full: staffNeeded != null && staffCount >= staffNeeded,
      pay_label: pay?.label || null,
      pay_hint: pay?.hint || null,
    }
  })
}

async function loadDiplomaPlanning(year: number, typeFilter: string) {
  const yearStart = `${year}-01-01T00:00:00+01:00`
  const yearEnd = `${year + 1}-01-01T00:00:00+01:00`
  const nowIso = new Date().toISOString()
  const start = nowIso > yearStart ? nowIso : yearStart

  const db = createEventsClient()
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('brand', 'diploma')
    .gte('event_date', start)
    .lt('event_date', yearEnd)
    .order('event_date', { ascending: true })

  if (error) throw new Error(error.message)

  let events = (data || []).filter((e) => {
    const t = eventTypeOf(e).id
    return (t === 'jpo' || t === 'salon') && e.status !== 'cancelled'
  })

  if (typeFilter === 'jpo' || typeFilter === 'salon') {
    events = events.filter((e) => eventTypeOf(e).id === typeFilter)
  }

  const staffCounts: Record<string, number> = {}
  if (events.length > 0) {
    const ids = events.map((e) => e.id)
    const { data: staffRows } = await db
      .from('staff_registrations')
      .select('event_id')
      .in('event_id', ids)
    for (const row of staffRows || []) {
      staffCounts[row.event_id] = (staffCounts[row.event_id] || 0) + 1
    }
  }

  return { events: enrichPlanningEvents(events, staffCounts), staffCounts }
}

/**
 * GET /api/events-studio/planning?year=2026 — admin (auth)
 */
export async function GET(req: NextRequest) {
  const { requireCrmUserId } = await import('@/lib/events-studio/auth')
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const yearParam = parseInt(req.nextUrl.searchParams.get('year') || '', 10)
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear()
  const typeFilter = req.nextUrl.searchParams.get('type') || ''

  try {
    const { events, staffCounts } = await loadDiplomaPlanning(year, typeFilter)
    return NextResponse.json({
      year,
      public_url: planningPublicUrl(year, req.nextUrl.origin),
      events,
      pay_rules: {
        intro: 'Rémunération : salons = 120 € / jour · JPO (après-midi) = 60 €.',
        salon_full_day: '120 € / jour',
        jpo: '60 € / après-midi',
      },
      totals: {
        events: events.length,
        jpo: events.filter((e) => e.type.id === 'jpo').length,
        salon: events.filter((e) => e.type.id === 'salon').length,
        staff: Object.values(staffCounts).reduce((a, b) => a + b, 0),
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
