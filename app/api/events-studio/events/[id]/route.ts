import { NextRequest, NextResponse } from 'next/server'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createEventsClient, eventsEdgeUrl, getEventsSupabaseKey } from '@/lib/events-studio/client'
import { getSalonCapacitySnapshot } from '@/lib/events-studio/capacity'
import { mergeCommsWithDefaults } from '@/lib/events-studio/comms-defaults'
import { eventHasComms, EVENT_TYPES, eventTypeOf, type EventTypeId } from '@/lib/events-studio/config'
import { parseStaffNeeded, setStaffNeededInDescription } from '@/lib/events-studio/event-meta'
import {
  listEventAttendees,
  syncEventRegistrationsFromSources,
} from '@/lib/events-studio/sync-attendees'
import { createServiceClient } from '@/lib/supabase'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const db = createEventsClient()

  const { data: event, error } = await db.from('events').select('*').eq('id', id).single()
  if (error || !event) {
    return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
  }

  // Comme Events Studio : si emails/SMS vides, générer + persister les templates
  if (eventHasComms(event)) {
    const merged = mergeCommsWithDefaults(event, event.custom_emails, event.custom_sms)
    if (merged.needsPersist) {
      const { data: updated } = await db
        .from('events')
        .update({ custom_emails: merged.emails, custom_sms: merged.sms })
        .eq('id', id)
        .select('*')
        .single()
      if (updated) {
        Object.assign(event, updated)
      } else {
        event.custom_emails = merged.emails
        event.custom_sms = merged.sms
      }
    }
  }

  const [{ data: forms }, { data: staff }, attendeesPack] = await Promise.all([
    db.from('event_forms').select('*').eq('event_id', id),
    db
      .from('staff_registrations')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: true }),
    listEventAttendees(id).catch(() => ({
      attendees: [] as Awaited<ReturnType<typeof listEventAttendees>>['attendees'],
      counts: { total: 0, crm: 0, meta: 0, events: 0 },
    })),
  ])

  const attendees = attendeesPack.attendees
  const attendeeCounts = attendeesPack.counts
  // Compat UI : registrations = vue unifiée (CRM + Meta + Events)
  const registrations = attendees.slice(0, 500).map((a, i) => ({
    id: a.id || `attendee-${i}`,
    first_name: a.first_name,
    last_name: a.last_name,
    email: a.email,
    phone: a.phone,
    checked_in: a.checked_in ?? false,
    created_at: a.created_at,
    source: a.source,
  }))

  // Enrich CRM forms with public URL
  const crmDb = createServiceClient()
  const crmFormIds = (forms || [])
    .filter((f) => f.form_type === 'crm' || !String(f.hubspot_form_id || '').startsWith('meta:'))
    .map((f) => f.hubspot_form_id)
    .filter(Boolean)

  let crmFormsMeta: Array<{ id: string; slug: string; name: string; status: string }> = []
  if (crmFormIds.length > 0) {
    const { data } = await crmDb.from('forms').select('id, slug, name, status').in('id', crmFormIds)
    crmFormsMeta = data || []
  }

  const formsEnriched = (forms || []).map((f) => {
    const meta = crmFormsMeta.find((m) => m.id === f.hubspot_form_id)
    return {
      ...f,
      slug: meta?.slug || null,
      public_url: meta?.slug ? `https://hub.diploma-sante.fr/forms/${meta.slug}` : null,
      crm_status: meta?.status || null,
    }
  })

  let capacity = null
  try {
    capacity = await getSalonCapacitySnapshot(id)
  } catch {
    capacity = null
  }

  const staffNeeded = parseStaffNeeded(event.description)
  const staffCount = (staff || []).length
  const type = eventTypeOf(event)
  const checkedIn = registrations.filter((r) => r.checked_in).length
  const registeredTotal = attendeeCounts.total

  // Aligner le compteur capacité sur tous les inscrits (pas seulement CRM form_submissions)
  if (capacity) {
    capacity = {
      ...capacity,
      registered_count: registeredTotal,
      remaining:
        capacity.max_capacity != null
          ? Math.max(0, capacity.max_capacity - registeredTotal)
          : null,
      is_full:
        capacity.max_capacity != null ? registeredTotal >= capacity.max_capacity : false,
    }
  }

  return NextResponse.json({
    event,
    forms: formsEnriched,
    registrations,
    attendees,
    attendee_counts: attendeeCounts,
    staff: staff || [],
    type,
    capacity,
    staff_needed: staffNeeded,
    staff_remaining: staffNeeded != null ? Math.max(0, staffNeeded - staffCount) : null,
    staff_full: staffNeeded != null && staffCount >= staffNeeded,
    staff_url: type.staff ? `https://hub.diploma-sante.fr/events-studio/?staff=${id}` : null,
    studio_url: `https://hub.diploma-sante.fr/events-studio/#event/${id}`,
    scanner_url: type.checkin ? `https://hub.diploma-sante.fr/events-studio/#scan/${id}` : null,
    checkin_stats: type.checkin
      ? {
          registered: registeredTotal,
          present: checkedIn,
          absent: Math.max(0, registeredTotal - checkedIn),
          rate: registeredTotal > 0 ? Math.round((checkedIn / registeredTotal) * 100) : 0,
        }
      : null,
  })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const db = createEventsClient()

  const { data: current } = await db.from('events').select('*').eq('id', id).single()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.description === 'string') patch.description = body.description.trim() || null
  if (typeof body.location === 'string') patch.location = body.location.trim()
  if (typeof body.status === 'string' && ['draft', 'published', 'cancelled'].includes(body.status)) {
    patch.status = body.status
  }
  if (typeof body.zoom_join_url === 'string') patch.zoom_join_url = body.zoom_join_url.trim() || null

  // Webinaire : impossible de publier sans lien Zoom
  const nextType =
    typeof body.event_type === 'string' &&
    (body.event_type === 'jpo' || body.event_type === 'salon' || body.event_type === 'webinaire')
      ? (body.event_type as EventTypeId)
      : eventTypeOf(current).id
  const nextZoom =
    typeof body.zoom_join_url === 'string'
      ? body.zoom_join_url.trim() || null
      : current.zoom_join_url || null
  if (patch.status === 'published' && nextType === 'webinaire' && !nextZoom) {
    return NextResponse.json(
      {
        error:
          'Impossible de publier un webinaire sans lien Zoom. Ajoutez le lien Zoom avant de publier.',
        code: 'ZOOM_REQUIRED',
      },
      { status: 400 },
    )
  }

  // Webinaire : dès qu’un Zoom est enregistré, injecter le lien dans J-1 / Jour J
  const zoomChanged =
    typeof body.zoom_join_url === 'string' &&
    (body.zoom_join_url.trim() || null) !== (current.zoom_join_url || null)
  if (zoomChanged && nextType === 'webinaire' && nextZoom) {
    const evForComms = {
      ...current,
      ...patch,
      event_type: nextType,
      zoom_join_url: nextZoom,
    }
    const merged = mergeCommsWithDefaults(evForComms, current.custom_emails, current.custom_sms)
    patch.custom_emails = merged.emails
    patch.custom_sms = merged.sms
  }
  if (body.max_capacity !== undefined) {
    patch.max_capacity = body.max_capacity ? parseInt(String(body.max_capacity), 10) : null
  }
  if (body.staff_needed !== undefined) {
    const n =
      body.staff_needed === null || body.staff_needed === ''
        ? null
        : parseInt(String(body.staff_needed), 10)
    const baseDesc =
      typeof body.description === 'string'
        ? body.description
        : (patch.description ?? current.description)
    patch.description = setStaffNeededInDescription(baseDesc, Number.isFinite(n as number) ? (n as number) : null)
  }
  if (typeof body.event_type === 'string') {
    const typeId = body.event_type as EventTypeId
    if (typeId === 'jpo' || typeId === 'salon' || typeId === 'webinaire') {
      patch.event_type = typeId
      patch.article = EVENT_TYPES[typeId].article
    }
  }
  if (body.custom_sms !== undefined) {
    patch.custom_sms =
      body.custom_sms && typeof body.custom_sms === 'object' && !Array.isArray(body.custom_sms)
        ? body.custom_sms
        : null
  }
  if (body.custom_emails !== undefined) {
    patch.custom_emails =
      body.custom_emails && typeof body.custom_emails === 'object' && !Array.isArray(body.custom_emails)
        ? body.custom_emails
        : null
  }

  const hasFormsUpdate = Array.isArray(body.forms)
  if (Object.keys(patch).length === 0 && !hasFormsUpdate) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  let event = current
  if (Object.keys(patch).length > 0) {
    const { data: updated, error } = await db.from('events').update(patch).eq('id', id).select().single()
    if (error) {
      const needsKey = error.code === '42501' || /row-level security/i.test(error.message || '')
      return NextResponse.json(
        {
          error: needsKey
            ? 'Écriture Events refusée (RLS). Configurez EVENTS_SUPABASE_SERVICE_ROLE_KEY.'
            : error.message,
        },
        { status: needsKey ? 503 : 500 },
      )
    }
    event = updated
  }

  if (hasFormsUpdate) {
    const forms = (body.forms as Array<{ hubspot_form_id?: string; form_name?: string; form_type?: string }>)
      .map((f) => ({
        event_id: id,
        hubspot_form_id: String(f.hubspot_form_id || '').trim(),
        form_name: String(f.form_name || f.hubspot_form_id || '').trim() || 'Formulaire',
        form_type: f.form_type === 'meta' ? 'meta' : 'crm',
      }))
      .filter((f) => f.hubspot_form_id)

    const { error: delErr } = await db.from('event_forms').delete().eq('event_id', id)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }
    if (forms.length > 0) {
      const { error: insErr } = await db.from('event_forms').insert(forms)
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }
  }

  // Publish : sync Meta/CRM → registrations, puis envoi des confirmations
  let syncResult: Awaited<ReturnType<typeof syncEventRegistrationsFromSources>> | null = null
  let sendResult: { success?: boolean; sent?: number; message?: string } | null = null
  if (patch.status === 'published' && eventHasComms(event)) {
    try {
      syncResult = await syncEventRegistrationsFromSources(id)
    } catch (e) {
      syncResult = {
        inserted: 0,
        total: 0,
        meta: 0,
        crm: 0,
        errors: [e instanceof Error ? e.message : 'sync failed'],
      }
    }
    try {
      const sendRes = await fetch(eventsEdgeUrl('send-pending-confirmations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getEventsSupabaseKey()}`,
        },
        body: JSON.stringify({ event_id: id }),
      })
      sendResult = (await sendRes.json().catch(() => ({}))) as typeof sendResult
    } catch (e) {
      sendResult = {
        success: false,
        sent: 0,
        message: e instanceof Error ? e.message : 'send failed',
      }
    }
  }

  return NextResponse.json({ event, sync: syncResult, send: sendResult })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const db = createEventsClient()
  const { error } = await db.from('events').delete().eq('id', id)
  if (error) {
    const needsKey = error.code === '42501' || /row-level security/i.test(error.message || '')
    return NextResponse.json(
      {
        error: needsKey
          ? 'Écriture Events refusée (RLS). Configurez EVENTS_SUPABASE_SERVICE_ROLE_KEY.'
          : error.message,
      },
      { status: needsKey ? 503 : 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
