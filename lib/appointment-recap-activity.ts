import type { SupabaseClient } from '@supabase/supabase-js'
import { formatParis } from '@/lib/date-paris'

export const APPOINTMENT_RECAP_SOURCE = 'appointment_recap'

export function buildAppointmentRecapBody(
  reportSummary: string | null | undefined,
  reportTeleproAdvice: string | null | undefined,
): string | null {
  const summary = (reportSummary || '').trim()
  const telepro = (reportTeleproAdvice || '').trim()
  if (!summary && !telepro) return null

  const parts: string[] = []
  if (summary) parts.push(summary)
  if (telepro) {
    parts.push(`Conseil pour le télépro :\n${telepro}`)
  }
  return parts.join('\n\n')
}

export function appointmentRecapSubject(startAt: string | null | undefined): string {
  if (!startAt) return 'Rapport RDV'
  try {
    return `Rapport RDV — ${formatParis(new Date(startAt))}`
  } catch {
    return 'Rapport RDV'
  }
}

type AppointmentRow = {
  id: string
  hubspot_contact_id?: string | null
  hubspot_deal_id?: string | null
  prospect_email?: string | null
  prospect_phone?: string | null
  commercial_id?: string | null
  start_at?: string | null
  report_summary?: string | null
  report_telepro_advice?: string | null
}

export async function resolveAppointmentContactId(
  db: SupabaseClient,
  appointment: AppointmentRow,
): Promise<string | null> {
  if (appointment.hubspot_contact_id) return appointment.hubspot_contact_id

  const email = (appointment.prospect_email || '').trim().toLowerCase()
  if (email) {
    const { data: byEmail } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id')
      .ilike('email', email)
      .maybeSingle()
    if (byEmail?.hubspot_contact_id) return byEmail.hubspot_contact_id as string
  }

  if (appointment.prospect_phone) {
    const digits = String(appointment.prospect_phone).replace(/\D/g, '')
    if (digits.length >= 9) {
      const last9 = digits.slice(-9)
      const variants = [`+33${last9}`, `0${last9}`, digits, `+${digits}`]
      const { data: byPhone } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .in('phone', variants)
        .maybeSingle()
      if (byPhone?.hubspot_contact_id) return byPhone.hubspot_contact_id as string
    }
  }

  return null
}

async function resolveCloserOwnerId(
  db: SupabaseClient,
  commercialId: string | null | undefined,
): Promise<string | null> {
  if (!commercialId) return null
  const { data: closer } = await db
    .from('rdv_users')
    .select('hubspot_owner_id')
    .eq('id', commercialId)
    .maybeSingle()
  return (closer?.hubspot_owner_id as string | null) || null
}

/**
 * Crée ou met à jour une activité native sur la fiche contact pour le recap
 * closer (report_summary + report_telepro_advice). Idempotent via metadata.
 */
export async function syncAppointmentRecapToContactActivity(
  db: SupabaseClient,
  appointment: AppointmentRow,
): Promise<void> {
  const body = buildAppointmentRecapBody(
    appointment.report_summary,
    appointment.report_telepro_advice,
  )
  if (!body) return

  const contactId = await resolveAppointmentContactId(db, appointment)
  if (!contactId) return

  const subject = appointmentRecapSubject(appointment.start_at)
  const ownerId = await resolveCloserOwnerId(db, appointment.commercial_id)
  const occurredAt = appointment.start_at || new Date().toISOString()
  const metadata = {
    source: APPOINTMENT_RECAP_SOURCE,
    appointment_id: appointment.id,
  }

  const { data: existing } = await db
    .from('crm_activities')
    .select('id')
    .eq('hubspot_contact_id', contactId)
    .is('hubspot_engagement_id', null)
    .contains('metadata', metadata)
    .maybeSingle()

  if (existing?.id) {
    await db
      .from('crm_activities')
      .update({
        subject,
        body,
        owner_id: ownerId,
        occurred_at: occurredAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return
  }

  await db.from('crm_activities').insert({
    activity_type: 'note',
    hubspot_contact_id: contactId,
    hubspot_deal_id: appointment.hubspot_deal_id || null,
    subject,
    body,
    owner_id: ownerId,
    metadata,
    occurred_at: occurredAt,
  })
}
