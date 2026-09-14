import { NextRequest, NextResponse } from 'next/server'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventTypeOf } from '@/lib/events-studio/config'
import { extractQrCode, isEventId } from '@/lib/events-studio/public-checkin'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * GET /api/events-studio/scan/[eventId]
 * Infos publiques du scanner (nom + stats), sans auth.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params
  if (!isEventId(eventId)) {
    return NextResponse.json({ error: 'Événement introuvable' }, { status: 404, headers: CORS })
  }

  const db = createEventsClient()
  const { data: event, error } = await db
    .from('events')
    .select('id, name, event_date, event_time_end, location, event_type, brand, status, zoom_join_url')
    .eq('id', eventId)
    .maybeSingle()

  if (error || !event) {
    return NextResponse.json({ error: 'Événement introuvable' }, { status: 404, headers: CORS })
  }

  const type = eventTypeOf(event)
  if (!type.physical) {
    return NextResponse.json({ error: 'Pas de check-in QR pour cet événement' }, { status: 400, headers: CORS })
  }

  const { count: registered } = await db
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
  const { count: present } = await db
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('checked_in', true)

  const total = registered || 0
  const checkedIn = present || 0

  return NextResponse.json(
    {
      event: {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        location: event.location,
      },
      stats: {
        registered: total,
        present: checkedIn,
        rate: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
      },
    },
    { headers: CORS },
  )
}

/**
 * POST /api/events-studio/scan/[eventId]
 * Check-in public par QR. Corps : { code: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params
  if (!isEventId(eventId)) {
    return NextResponse.json({ status: 'invalid', message: 'Événement introuvable' }, { status: 404, headers: CORS })
  }

  const body = await req.json().catch(() => ({}))
  const code = extractQrCode(String(body.code || ''))
  if (!code || code.length < 4) {
    return NextResponse.json({ status: 'invalid', message: 'QR code invalide' }, { status: 400, headers: CORS })
  }

  const db = createEventsClient()
  const { data: event } = await db.from('events').select('id, event_type, brand, zoom_join_url').eq('id', eventId).maybeSingle()
  if (!event || !eventTypeOf(event).physical) {
    return NextResponse.json({ status: 'invalid', message: 'Événement introuvable' }, { status: 404, headers: CORS })
  }

  const { data: reg } = await db
    .from('registrations')
    .select('id, first_name, last_name, email, company, checked_in, event_id')
    .eq('qr_code', code)
    .maybeSingle()

  if (!reg) {
    return NextResponse.json(
      { status: 'invalid', message: 'Inscription introuvable' },
      { status: 200, headers: CORS },
    )
  }

  if (reg.event_id !== eventId) {
    return NextResponse.json(
      { status: 'invalid', message: 'Ce QR code n’est pas pour cet événement' },
      { status: 200, headers: CORS },
    )
  }

  const person = {
    first_name: reg.first_name || '',
    last_name: reg.last_name || '',
    email: reg.email || '',
    company: reg.company || '',
  }

  if (reg.checked_in) {
    return NextResponse.json({ status: 'already_checked_in', ...person }, { headers: CORS })
  }

  const { error } = await db
    .from('registrations')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('id', reg.id)

  if (error) {
    return NextResponse.json({ status: 'invalid', message: error.message }, { status: 500, headers: CORS })
  }

  return NextResponse.json({ status: 'checked_in', ...person }, { headers: CORS })
}
