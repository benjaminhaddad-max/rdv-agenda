import { NextRequest, NextResponse } from 'next/server'
import { createEventsClient } from '@/lib/events-studio/client'
import { getSalonCapacitySnapshot } from '@/lib/events-studio/capacity'
import { eventTypeOf } from '@/lib/events-studio/config'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/events-studio/salons-public?brand=diploma
 * Liste publique des salons publiés (choix du lieu + places restantes).
 */
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand') || 'diploma'
  const db = createEventsClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('brand', brand)
    .eq('status', 'published')
    .gte('event_date', nowIso)
    .order('event_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })

  const salons = (data || []).filter((e) => eventTypeOf(e).id === 'salon')

  const items = []
  for (const e of salons) {
    const cap = await getSalonCapacitySnapshot(e.id)
    const start = new Date(e.event_date)
    items.push({
      id: e.id,
      name: e.name,
      description: e.description,
      location: e.location,
      event_date: e.event_date,
      event_time_end: e.event_time_end,
      date_label: start.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Paris',
      }),
      time_label: `${start.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      })}${e.event_time_end ? ` – ${e.event_time_end}` : ''}`,
      max_capacity: cap.max_capacity,
      registered_count: cap.registered_count,
      remaining: cap.remaining,
      is_full: cap.is_full,
      form_url: cap.public_url,
    })
  }

  return NextResponse.json(
    { brand, salons: items },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=60',
      },
    },
  )
}
