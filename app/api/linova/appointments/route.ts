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

  try {
    const db = createServiceClient()
    const { data: contactRow } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, hubspot_raw, origine, recent_conversion_event, hs_lead_status')
      .eq('hubspot_contact_id', body.contactId)
      .maybeSingle()

    if (!contactRow) {
      return NextResponse.json({ error: 'Contact introuvable dans le CRM' }, { status: 404 })
    }

    const canonicalContactId = contactRow.hubspot_contact_id
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
      externalId: canonicalContactId,
    }

    let created
    try {
      created = await createAppointment(payload)
    } catch (e) {
      // Certains comptes Linova peuvent déjà avoir un RDV actif lié au même externalId.
      // On retente avec un suffixe unique tout en conservant le contact source.
      if (e instanceof LinovaApiError && e.status === 409) {
        created = await createAppointment({
          ...payload,
          externalId: `${canonicalContactId}__${Date.now()}`,
        })
      } else {
        throw e
      }
    }

    const raw = ((contactRow.hubspot_raw as Record<string, unknown> | null) ?? {})
    const nextRaw = {
      ...raw,
      linova_appointment_id: created.appointmentId,
      linova_appointment_date: body.date,
      linova_appointment_slot: body.timeSlot,
      linova_appointment_type: body.appointmentType,
      linova_scheduled_at: created.scheduledAt,
      linova_status: 'confirmed',
      linova_lead: true,
    }

    const currentOrigine = String(contactRow.origine || '')
    const currentRecentEvent = String(contactRow.recent_conversion_event || '')
    const nowIso = new Date().toISOString()
    const hasLinovaOrigine = currentOrigine.toLowerCase().includes('linova')
    const hasLinovaRecentEvent = currentRecentEvent.toLowerCase().includes('linova')

    let defaultLinovaTeleproUserId: string | null = null
    let defaultLinovaTeleproHsUserId: string | null = null
    const { data: defaultLinovaTelepro } = await db
      .from('rdv_users')
      .select('id, hubspot_user_id, hubspot_owner_id')
      .eq('role', 'telepro')
      .eq('crm_brand', 'linova')
      .eq('is_default_brand_telepro', true)
      .limit(1)
      .maybeSingle()
    if (defaultLinovaTelepro) {
      defaultLinovaTeleproUserId = defaultLinovaTelepro.id ?? null
      defaultLinovaTeleproHsUserId =
        defaultLinovaTelepro.hubspot_user_id ??
        defaultLinovaTelepro.hubspot_owner_id ??
        null
    }

    await db
      .from('crm_contacts')
      .update({
        hubspot_raw: nextRaw,
        synced_at: nowIso,
        source: 'linova',
        origine: hasLinovaOrigine ? contactRow.origine : 'Linova',
        recent_conversion_event: hasLinovaRecentEvent ? contactRow.recent_conversion_event : 'LINOVA - RDV admission',
        recent_conversion_date: nowIso,
        hs_lead_status: contactRow.hs_lead_status || 'Nouveau',
        telepro_user_id: defaultLinovaTeleproUserId,
        teleprospecteur: defaultLinovaTeleproHsUserId,
      })
      .eq('hubspot_contact_id', canonicalContactId)

    await db.from('crm_activities').insert({
      activity_type: 'note',
      hubspot_contact_id: canonicalContactId,
      subject: 'RDV admission Linova programmé',
      body: `RDV Linova confirmé le ${body.date} à ${body.timeSlot} (${body.appointmentType}). Appointment ID: ${created.appointmentId}. Le contact est désormais traité comme lead Linova.`,
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
