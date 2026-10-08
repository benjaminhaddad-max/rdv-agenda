import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventTypeOf } from '@/lib/events-studio/config'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE_END_RE = /\[date_end=(\d{4}-\d{2}-\d{2})\]/

/**
 * GET /api/events-studio/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Nos événements (JPO, salons, webinaires…) sur une période, version légère pour
 * le bandeau « rappel » épinglé en haut des jours dans l'agenda RDV (télépros,
 * closers, admin). Les événements multi-jours ([date_end=…]) sont renvoyés avec
 * leur date de fin.
 */
export async function GET(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response

  const from = req.nextUrl.searchParams.get('from') || ''
  const to = req.nextUrl.searchParams.get('to') || ''
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return NextResponse.json({ error: 'from / to invalides (YYYY-MM-DD)' }, { status: 400 })
  }

  // Marge de 31 jours avant `from` pour attraper les événements multi-jours déjà commencés.
  const lower = new Date(`${from}T00:00:00Z`)
  lower.setUTCDate(lower.getUTCDate() - 31)
  const upper = new Date(`${to}T00:00:00Z`)
  upper.setUTCDate(upper.getUTCDate() + 2)

  const db = createEventsClient()
  const { data, error } = await db
    .from('events')
    .select('id,name,brand,event_type,event_date,event_time_end,location,status,description,zoom_join_url')
    .neq('status', 'cancelled')
    .gte('event_date', lower.toISOString())
    .lt('event_date', upper.toISOString())
    .order('event_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = (data || [])
    .map((e) => {
      const d = new Date(e.event_date)
      const startDay = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
      const m = (e.description || '').match(DATE_END_RE)
      const endDay = m && m[1] > startDay ? m[1] : startDay
      return {
        id: e.id as string,
        name: e.name as string,
        brand: (e.brand as string | null) || 'diploma',
        event_type: eventTypeOf(e).id,
        start_day: startDay,
        end_day: endDay,
        time_start: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Paris' }),
        time_end: (e.event_time_end as string | null) || null,
        location: eventTypeOf(e).id === 'webinaire' ? 'En ligne' : (e.location as string | null),
      }
    })
    .filter((e) => e.end_day >= from && e.start_day <= to)

  return NextResponse.json(
    { events },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}
