import { NextRequest, NextResponse } from 'next/server'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventTypeOf, planningPublicUrl } from '@/lib/events-studio/config'

/**
 * GET /api/events-studio/planning?year=2026
 * Planning annuel Diploma : JPO + salons de l'année + compteurs staff.
 */
export async function GET(req: NextRequest) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const yearParam = parseInt(req.nextUrl.searchParams.get('year') || '', 10)
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear()
  const typeFilter = req.nextUrl.searchParams.get('type') // jpo | salon | ''

  const yearStart = `${year}-01-01T00:00:00+01:00`
  const yearEnd = `${year + 1}-01-01T00:00:00+01:00`
  // Ne pas afficher les événements déjà passés (à partir de maintenant)
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let events = (data || []).filter((e) => {
    const t = eventTypeOf(e).id
    return t === 'jpo' || t === 'salon'
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

  const origin = req.nextUrl.origin
  return NextResponse.json({
    year,
    public_url: planningPublicUrl(year, origin),
    events: events.map((e) => ({
      ...e,
      type: eventTypeOf(e),
      staff_count: staffCounts[e.id] || 0,
    })),
    totals: {
      events: events.length,
      jpo: events.filter((e) => eventTypeOf(e).id === 'jpo').length,
      salon: events.filter((e) => eventTypeOf(e).id === 'salon').length,
      staff: Object.values(staffCounts).reduce((a, b) => a + b, 0),
    },
  })
}
