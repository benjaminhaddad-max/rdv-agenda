import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  BookingPayload,
  createAppointment,
  LinovaApiError,
} from '@/lib/linova'
import { requireApiUser } from '@/lib/api-auth'

type CreateLinovaAppointmentBody = {
  contactId: string
  appointmentType: 'initial' | 'alternance'
  date: string
  timeSlot: string
  firstName: string
  lastName: string
  email: string
  phone: string
  currentStudies?: string
  message?: string
}

export async function POST(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response

  const body = (await req.json()) as CreateLinovaAppointmentBody
  if (!body?.contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  const payload: BookingPayload = {
    appointmentType: body.appointmentType,
    date: body.date,
    timeSlot: body.timeSlot,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    currentStudies: body.currentStudies || undefined,
    message: body.message || undefined,
    source: 'crm',
    externalId: body.contactId,
  }

  try {
    const created = await createAppointment(payload)
    const db = createServiceClient()
    const { data: existing } = await db
      .from('crm_contacts')
      .select('hubspot_raw')
      .eq('hubspot_contact_id', body.contactId)
      .maybeSingle()

    const raw = ((existing?.hubspot_raw as Record<string, unknown> | null) ?? {})
    const nextRaw = {
      ...raw,
      linova_appointment_id: created.appointmentId,
      linova_appointment_date: body.date,
      linova_appointment_slot: body.timeSlot,
      linova_appointment_type: body.appointmentType,
      linova_scheduled_at: created.scheduledAt,
      linova_status: 'confirmed',
    }

    await db
      .from('crm_contacts')
      .update({
        hubspot_raw: nextRaw,
        synced_at: new Date().toISOString(),
      })
      .eq('hubspot_contact_id', body.contactId)

    await db.from('crm_activities').insert({
      activity_type: 'note',
      hubspot_contact_id: body.contactId,
      subject: 'RDV admission Linova programmé',
      body: `RDV Linova confirmé le ${body.date} à ${body.timeSlot} (${body.appointmentType}). Appointment ID: ${created.appointmentId}`,
      metadata: {
        source: 'linova_api',
        appointment_id: created.appointmentId,
        scheduled_at: created.scheduledAt,
        google_event_id: created.googleEventId ?? null,
      },
      occurred_at: new Date().toISOString(),
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    if (e instanceof LinovaApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'Failed to create Linova appointment' }, { status: 500 })
  }
}
