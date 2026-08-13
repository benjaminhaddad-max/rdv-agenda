import { NextRequest, NextResponse } from 'next/server'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createEventsClient, eventsEdgeUrl, getEventsSupabaseKey } from '@/lib/events-studio/client'
import {
  BRAND_CONFIG,
  EVENT_TYPES,
  eventHasComms,
  type EventBrand,
  type EventTypeId,
} from '@/lib/events-studio/config'
import { createCrmFormForEvent } from '@/lib/events-studio/create-crm-form'

function buildEventDate(date: string, timeStart: string): string {
  const tmpDate = new Date(`${date}T${timeStart}`)
  const offset = -tmpDate.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const oh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const om = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${date}T${timeStart}:00${sign}${oh}:${om}`
}

export async function GET(req: NextRequest) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = req.nextUrl.searchParams.get('brand')
  const status = req.nextUrl.searchParams.get('status')
  const db = createEventsClient()

  let q = db.from('events').select('*').order('event_date', { ascending: false })
  if (brand) q = q.eq('brand', brand)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}

export async function POST(req: NextRequest) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const brand = (body.brand || 'diploma') as EventBrand
  const eventType = (body.event_type || 'jpo') as EventTypeId
  const typeCfg = EVENT_TYPES[eventType] || EVENT_TYPES.autre
  const brandCfg = BRAND_CONFIG[brand] || BRAND_CONFIG.diploma

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const date = typeof body.date === 'string' ? body.date : ''
  const timeStart = typeof body.time_start === 'string' ? body.time_start : ''
  const timeEnd = typeof body.time_end === 'string' ? body.time_end : ''

  if (!name || !date || !timeStart) {
    return NextResponse.json({ error: 'Nom, date et heure de début obligatoires' }, { status: 400 })
  }
  if (!timeEnd) {
    return NextResponse.json({ error: 'Heure de fin obligatoire' }, { status: 400 })
  }

  const isWebinar = eventType === 'webinaire'
  let location = typeof body.location === 'string' ? body.location.trim() : ''
  let zoom = typeof body.zoom_join_url === 'string' ? body.zoom_join_url.trim() : ''

  if (isWebinar) {
    location = 'Visioconference'
    if (!zoom) zoom = brandCfg.defaultZoom || ''
    if (!zoom) {
      return NextResponse.json({ error: 'Lien visioconférence obligatoire' }, { status: 400 })
    }
  } else if (!location) {
    return NextResponse.json({ error: 'Lieu obligatoire' }, { status: 400 })
  }

  const noComms = !typeCfg.comms
  const status = body.status === 'published' ? 'published' : 'draft'
  const article =
    (typeof body.article === 'string' && body.article) || typeCfg.article || 'la'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    name,
    article,
    description: body.description?.trim() || null,
    brief: noComms ? null : body.brief?.trim() || null,
    event_date: buildEventDate(date, timeStart),
    event_time_end: timeEnd,
    location,
    max_capacity: body.max_capacity ? parseInt(String(body.max_capacity), 10) : null,
    status,
    hubspot_property_name: body.hubspot_property_name?.trim() || null,
    sms_factor_enabled: noComms ? false : !!body.sms_factor_enabled,
    sms_sender:
      body.sms_sender?.trim() ||
      (brand === 'edumove' ? 'EDUMOVE' : brand === 'medibox' ? 'MEDIBOX' : 'DIPLOMA'),
    sms_push_type: body.sms_push_type != null ? parseInt(String(body.sms_push_type), 10) : 1,
    sms_stop: !!body.sms_stop,
    zoom_join_url: isWebinar ? zoom : null,
    custom_sms: null,
    custom_emails: null,
    brand,
    event_type: eventType,
  }

  const db = createEventsClient()
  let { data: event, error } = await db.from('events').insert(payload).select().single()

  if (error && /event_type/.test(error.message || '')) {
    delete payload.event_type
    ;({ data: event, error } = await db.from('events').insert(payload).select().single())
  }

  if (error) {
    const msg = error.message || 'Erreur création événement'
    const needsKey =
      error.code === '42501' || /row-level security/i.test(msg)
    return NextResponse.json(
      {
        error: needsKey
          ? 'Écriture Events refusée (RLS). Configurez EVENTS_SUPABASE_SERVICE_ROLE_KEY sur le CRM (projet jhopwqpbaiyjfoggvcaf).'
          : msg,
      },
      { status: needsKey ? 503 : 500 },
    )
  }

  // Créer le formulaire CRM type + lier
  const extraCrmFields: string[] = Array.isArray(body.extra_crm_fields)
    ? body.extra_crm_fields.filter((n: unknown) => typeof n === 'string')
    : []

  // Nom formulaire = "Nom de l'événement — JJ/MM/AAAA"
  const dateLabel = (() => {
    const [y, m, d] = date.split('-')
    if (y && m && d) return `${d}/${m}/${y}`
    try {
      return new Date(event.event_date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Paris',
      })
    } catch {
      return date
    }
  })()
  const formName = `${name} — ${dateLabel}`
  let crmForm: {
    id: string
    slug: string
    name: string
    status: string
    public_url: string
    embed_url: string
  } | null = null
  let formWarning: string | null = null

  try {
    crmForm = await createCrmFormForEvent({
      name: formName,
      title: formName,
      brand,
      folder: brandCfg.folder,
      template: 'event',
      extra_crm_fields: extraCrmFields,
      status: 'published',
    })
    const { error: linkError } = await db.from('event_forms').insert({
      event_id: event.id,
      hubspot_form_id: crmForm.id,
      form_name: crmForm.name || formName,
      form_type: 'crm',
    })
    if (linkError) {
      formWarning = `Form créé mais liaison event_forms: ${linkError.message}`
    }
  } catch (e) {
    formWarning = e instanceof Error ? e.message : 'Erreur création formulaire'
  }

  // Publier + confirmations si demandé
  if (status === 'published' && eventHasComms(eventType)) {
    try {
      await fetch(eventsEdgeUrl('send-pending-confirmations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getEventsSupabaseKey()}`,
        },
        body: JSON.stringify({ event_id: event.id }),
      })
    } catch {
      /* non bloquant */
    }
  }

  return NextResponse.json(
    {
      event,
      form: crmForm,
      form_warning: formWarning,
      public_form_url: crmForm?.public_url || null,
      staff_url: typeCfg.staff
        ? `${req.nextUrl.origin}/events-studio/?staff=${event.id}`
        : null,
    },
    { status: 201 },
  )
}
