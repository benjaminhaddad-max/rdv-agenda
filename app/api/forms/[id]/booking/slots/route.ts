/**
 * GET /api/forms/[slug]/booking/slots?date=YYYY-MM-DD
 *
 * Endpoint PUBLIC consommé par le wizard de prise de rendez-vous (BookingRenderer)
 * et par l'embed JS. Renvoie les créneaux dispos pour la journée demandée selon
 * la config du formulaire (durée, préavis, horizon, owner).
 *
 * Réponse :
 *   200 OK { slots: [{ start, end }], duration_minutes, horizon_days, meeting_types }
 *   404 Form not found / not published / not a booking form
 *   400 date invalide
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { buildBookingConfig, getBookingSlotsForDate, getPascalUserId } from '@/lib/booking-forms'

type Params = { params: Promise<{ id: string }> }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest, { params }: Params) {
  // Le paramètre Next "id" correspond au slug du form (cf. /[id]/submit, /[id]/public)
  const { id: slug } = await params

  const url = new URL(req.url)
  const date = url.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) requis' }, { status: 400, headers: CORS_HEADERS })
  }

  const db = createServiceClient()
  const { data: form, error } = await db
    .from('forms')
    .select('id, form_type, booking_duration_minutes, booking_horizon_days, booking_min_notice_hours, booking_owner_user_id, booking_meeting_types, booking_location_label, booking_default_meeting_type, status')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error || !form) {
    return NextResponse.json({ error: 'Formulaire introuvable ou non publié' }, { status: 404, headers: CORS_HEADERS })
  }
  if ((form.form_type || 'lead') !== 'booking') {
    return NextResponse.json({ error: "Ce formulaire n'est pas un formulaire de prise de rendez-vous" }, { status: 400, headers: CORS_HEADERS })
  }

  const cfg = buildBookingConfig(form)

  // Owner du calendrier : champ form.booking_owner_user_id sinon Pascal par défaut
  const ownerId = cfg.owner_user_id || (await getPascalUserId())
  if (!ownerId) {
    return NextResponse.json({
      slots: [],
      duration_minutes: cfg.duration_minutes,
      horizon_days: cfg.horizon_days,
      meeting_types: cfg.meeting_types,
      location_label: cfg.location_label,
      default_meeting_type: cfg.default_meeting_type,
      warning: 'no_owner_configured',
    }, { headers: CORS_HEADERS })
  }

  const slots = await getBookingSlotsForDate(
    ownerId,
    date,
    cfg.duration_minutes,
    cfg.min_notice_hours,
  )

  return NextResponse.json({
    slots,
    duration_minutes: cfg.duration_minutes,
    horizon_days: cfg.horizon_days,
    meeting_types: cfg.meeting_types,
    location_label: cfg.location_label,
    default_meeting_type: cfg.default_meeting_type,
  }, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'no-store',
    },
  })
}
