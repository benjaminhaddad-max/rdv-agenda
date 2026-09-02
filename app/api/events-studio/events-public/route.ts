import { NextRequest, NextResponse } from 'next/server'
import { createEventsClient } from '@/lib/events-studio/client'
import { getSalonCapacitySnapshot } from '@/lib/events-studio/capacity'
import { eventTypeOf, type EventTypeId } from '@/lib/events-studio/config'
import { formatEventSchedule, humanDescription } from '@/lib/events-studio/event-meta'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PUBLIC_TYPES: EventTypeId[] = ['jpo', 'salon', 'webinaire']

const CACHE_HEADERS = {
  ...CORS_HEADERS,
  'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=60',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })
}

function formatTimeLabel(iso: string, timeEnd: string | null): string {
  const start = new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
  return timeEnd ? `${start} – ${timeEnd}` : start
}

/**
 * GET /api/events-studio/events-public?brand=diploma&type=jpo,salon,webinaire
 * Liste publique des événements Diploma publiés à venir (site diploma-sante.fr).
 * Pas d’auth. CORS ouvert.
 */
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand') || 'diploma'
  const typeParam = req.nextUrl.searchParams.get('type')
  const wanted = new Set<EventTypeId>(
    typeParam
      ? typeParam
          .split(',')
          .map((t) => t.trim().toLowerCase() as EventTypeId)
          .filter((t) => PUBLIC_TYPES.includes(t))
      : PUBLIC_TYPES,
  )

  if (wanted.size === 0) {
    return NextResponse.json(
      { error: 'type invalide. Valeurs : jpo, salon, webinaire' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const db = createEventsClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await db
    .from('events')
    .select(
      'id,name,description,location,event_date,event_time_end,event_type,brand,status,max_capacity',
    )
    .eq('brand', brand)
    .eq('status', 'published')
    .gte('event_date', nowIso)
    .order('event_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  const events = (data || []).filter((e) => wanted.has(eventTypeOf(e).id as EventTypeId))
  const base = 'https://hub.diploma-sante.fr'

  const items = []
  for (const e of events) {
    const type = eventTypeOf(e)
    const cap = await getSalonCapacitySnapshot(e.id)
    const slug = cap.form_slug
    items.push({
      id: e.id,
      name: e.name,
      type: { id: type.id, short: type.short, label: type.label },
      description: humanDescription(e.description) || null,
      location: type.id === 'webinaire' ? null : e.location,
      is_online: type.id === 'webinaire',
      event_date: e.event_date,
      event_time_end: e.event_time_end,
      date_label: formatDateLabel(e.event_date),
      time_label: formatTimeLabel(e.event_date, e.event_time_end),
      schedule_label: formatEventSchedule(e),
      max_capacity: cap.max_capacity,
      registered_count: cap.registered_count,
      remaining: cap.remaining,
      is_full: cap.is_full,
      form_slug: slug,
      form_url: cap.public_url,
      embed_js_url: slug ? `${base}/api/forms/${slug}/embed.js` : null,
      embed_iframe_url: slug ? `${base}/embed/forms/${slug}` : null,
    })
  }

  return NextResponse.json({ brand, events: items }, { headers: CACHE_HEADERS })
}
