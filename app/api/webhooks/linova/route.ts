import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isValidLinovaWebhookSignature } from '@/lib/linova'

type LinovaStatusWebhookEvent = {
  event: 'appointment.status_changed'
  appointmentId: string
  externalId?: string
  previousStatus?: string
  newStatus?: string
  occurredAt?: string
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('X-Linova-Signature')
  const secret = process.env.CRM_WEBHOOK_SECRET || ''
  const rawBody = await req.text()

  if (!isValidLinovaWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: LinovaStatusWebhookEvent
  try {
    payload = JSON.parse(rawBody) as LinovaStatusWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (payload.event !== 'appointment.status_changed') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  if (!payload.externalId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Compat: externalId peut être suffixé (ex: "<contactId>__<timestamp>").
  const hubspotContactId = String(payload.externalId).split('__')[0] || payload.externalId
  const db = createServiceClient()

  const { data: existing } = await db
    .from('crm_contacts')
    .select('hubspot_raw')
    .eq('hubspot_contact_id', hubspotContactId)
    .maybeSingle()

  const currentRaw = (existing?.hubspot_raw as Record<string, unknown> | null) ?? {}
  const updatedRaw = {
    ...currentRaw,
    linova_appointment_id: payload.appointmentId,
    linova_status: payload.newStatus ?? null,
    linova_previous_status: payload.previousStatus ?? null,
    linova_status_updated_at: payload.occurredAt ?? new Date().toISOString(),
  }

  await db
    .from('crm_contacts')
    .update({
      hubspot_raw: updatedRaw,
      synced_at: new Date().toISOString(),
    })
    .eq('hubspot_contact_id', hubspotContactId)

  await db.from('crm_activities').insert({
    activity_type: 'note',
    hubspot_contact_id: hubspotContactId,
    subject: 'Mise à jour statut Linova',
    body: `Linova: ${payload.previousStatus ?? 'unknown'} -> ${payload.newStatus ?? 'unknown'}`,
    metadata: {
      source: 'linova_webhook',
      event: payload.event,
      appointment_id: payload.appointmentId,
      previous_status: payload.previousStatus ?? null,
      new_status: payload.newStatus ?? null,
    },
    occurred_at: payload.occurredAt || new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
