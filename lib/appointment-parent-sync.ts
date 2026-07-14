import type { SupabaseClient } from '@supabase/supabase-js'
import { CONTACT_IDENTITY_COLUMNS, mergeSafeHubspotRaw } from '@/lib/crm-contact-write'

/** Met à jour email_parent / telephone_parent sur la fiche contact liée (hubspot_raw). */
export async function syncAppointmentParentInfoToContact(
  db: SupabaseClient,
  hubspotContactId: string | null | undefined,
  fields: { email_parent?: string | null; phone_parent?: string | null },
): Promise<void> {
  if (!hubspotContactId) return
  if (fields.email_parent === undefined && fields.phone_parent === undefined) return

  const { data: existing } = await db
    .from('crm_contacts')
    .select(CONTACT_IDENTITY_COLUMNS.join(','))
    .eq('hubspot_contact_id', hubspotContactId)
    .maybeSingle()

  if (!existing) return

  const ex = existing as unknown as Record<string, unknown>
  const rawPatches: Record<string, unknown> = {}
  if (fields.email_parent !== undefined) rawPatches.email_parent = fields.email_parent
  if (fields.phone_parent !== undefined) rawPatches.telephone_parent = fields.phone_parent

  await db
    .from('crm_contacts')
    .update({
      synced_at: new Date().toISOString(),
      hubspot_raw: mergeSafeHubspotRaw(ex, rawPatches),
    })
    .eq('hubspot_contact_id', hubspotContactId)
}
