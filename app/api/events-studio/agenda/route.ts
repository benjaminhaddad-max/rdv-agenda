import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventTypeOf } from '@/lib/events-studio/config'
import { createServiceClient } from '@/lib/supabase'
import { COMPETITORS, type CompetitorId } from '@/lib/competitor-events'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE_END_RE = /\[date_end=(\d{4}-\d{2}-\d{2})\]/

/**
 * GET /api/events-studio/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Nos événements (JPO, salons, webinaires…) sur une période, version légère pour
 * le bandeau « rappel » épinglé en haut des jours dans l'agenda RDV (télépros,
 * closers, admin). Les événements multi-jours ([date_end=…]) sont renvoyés avec
 * leur date de fin. Les événements des prépas concurrentes (veille) sont ajoutés
 * avec `competitor` renseigné.
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

  // Événements concurrents (table CRM competitor_events) — non bloquant si la table manque.
  const crm = createServiceClient()
  const { data: compRows } = await crm
    .from('competitor_events')
    .select('id,competitor,name,event_type,start_date,end_date,time_start,time_end,location')
    .eq('hidden', false)
    .lte('start_date', to)
    .gte('start_date', lower.toISOString().slice(0, 10))
  const competitorEvents = (compRows || [])
    .map((e) => ({
      id: `c:${e.id}`,
      name: e.name as string,
      brand: null,
      competitor: COMPETITORS[e.competitor as CompetitorId]?.name || (e.competitor as string),
      event_type: e.event_type as string,
      start_day: e.start_date as string,
      end_day: (e.end_date as string | null) || (e.start_date as string),
      time_start: (e.time_start as string | null) || null,
      time_end: (e.time_end as string | null) || null,
      location: (e.location as string | null) || null,
    }))
    .filter((e) => e.end_day >= from)

  return NextResponse.json(
    { events: [...events.map((e) => ({ ...e, competitor: null })), ...competitorEvents] },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}
