import { NextRequest, NextResponse } from 'next/server'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventTypeOf } from '@/lib/events-studio/config'
import {
  eventDayCount,
  formatEventSchedule,
  multiDayLabel,
  multiDayWarning,
  parseDateEnd,
  publicStaffDescription,
  parseStaffNeeded,
  staffPayForEvent,
} from '@/lib/events-studio/event-meta'

/**
 * GET /api/events-studio/planning-public?year=2026
 * Planning staff public (sans auth) — JPO + salons Diploma à venir.
 */
export async function GET(req: NextRequest) {
  const yearParam = parseInt(req.nextUrl.searchParams.get('year') || '', 10)
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear()

  const yearStart = `${year}-01-01T00:00:00+01:00`
  const yearEnd = `${year + 1}-01-01T00:00:00+01:00`
  const nowIso = new Date().toISOString()
  const start = nowIso > yearStart ? nowIso : yearStart

  const db = createEventsClient()
  const { data, error } = await db
    .from('events')
    .select('id,name,event_date,event_time_end,location,event_type,status,brand,description')
    .eq('brand', 'diploma')
    .gte('event_date', start)
    .lt('event_date', yearEnd)
    .order('event_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = (data || []).filter((e) => {
    const t = eventTypeOf(e).id
    return (t === 'jpo' || t === 'salon') && e.status !== 'cancelled'
  })

  const staffCounts: Record<string, number> = {}
  if (events.length > 0) {
    const { data: staffRows } = await db
      .from('staff_registrations')
      .select('event_id')
      .in(
        'event_id',
        events.map((e) => e.id),
      )
    for (const row of staffRows || []) {
      staffCounts[row.event_id] = (staffCounts[row.event_id] || 0) + 1
    }
  }

  return NextResponse.json(
    {
      year,
      pay_rules: {
        intro: 'Rémunération : salons = 120 € / jour · JPO (après-midi) = 60 €.',
        salon_full_day: '120 € / jour',
        jpo: '60 € / après-midi',
      },
      events: events.map((e) => {
        const type = eventTypeOf(e)
        const staffNeeded = parseStaffNeeded(e.description)
        const staffCount = staffCounts[e.id] || 0
        const pay = staffPayForEvent(e)
        const dateEnd = parseDateEnd(e.description)
        const dayCount = eventDayCount(e)
        return {
          id: e.id,
          name: e.name,
          event_date: e.event_date,
          event_time_end: e.event_time_end,
          date_end: dateEnd,
          day_count: dayCount,
          multi_day_label: multiDayLabel(dayCount),
          multi_day_warning: multiDayWarning(dayCount),
          schedule_label: formatEventSchedule(e),
          location: e.location,
          description: publicStaffDescription(e.description) || null,
          type: { id: type.id, short: type.short, label: type.label },
          staff_count: staffCount,
          staff_needed: staffNeeded,
          staff_remaining: staffNeeded != null ? Math.max(0, staffNeeded - staffCount) : null,
          staff_full: staffNeeded != null && staffCount >= staffNeeded,
          pay_label: pay?.label || null,
        }
      }),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
