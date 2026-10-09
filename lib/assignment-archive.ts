/**
 * Archive des attributions télépro / closer par campagne (table
 * crm_contact_assignment_archive, migration v67).
 *
 * Quand un contact est inscrit, son télépro / closer de la campagne qui l'a
 * vendu est archivé puis vidé sur la fiche (« remis à neuf » pour la nouvelle
 * année). Lecture réservée aux admins. Tolérant à l'absence de la table.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AssignmentArchiveRow {
  hubspot_contact_id: string
  campagne: string
  teleprospecteur: string | null
  telepro_user_id: number | string | null
  closer_du_contact_owner_id: string | null
  hubspot_owner_id: string | null
  hubspot_owner_assigneddate: string | null
  hs_lead_status: string | null
  motif: string | null
  archived_at: string
  restored_at: string | null
}

const COLS =
  'hubspot_contact_id, campagne, teleprospecteur, telepro_user_id, closer_du_contact_owner_id, hubspot_owner_id, hubspot_owner_assigneddate, hs_lead_status, motif, archived_at, restored_at'

/** Historique d'un contact (plus récente campagne d'abord). */
export async function fetchAssignmentArchive(db: SupabaseClient, contactIds: string[]): Promise<AssignmentArchiveRow[]> {
  if (contactIds.length === 0) return []
  const { data, error } = await db
    .from('crm_contact_assignment_archive')
    .select(COLS)
    .in('hubspot_contact_id', contactIds)
    .is('restored_at', null)
    .order('campagne', { ascending: false })
  if (error) return []
  return (data ?? []) as AssignmentArchiveRow[]
}

/**
 * Télépro (telepro_user_id HubSpot) archivé par contact — sert aux stats qui
 * retombent sur la fiche quand le RDV n'a pas de télépro : sans ça, archiver
 * ferait perdre au télépro ses RDV / inscrits passés.
 */
export async function fetchArchivedTeleproByContact(db: SupabaseClient, contactIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(contactIds.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('crm_contact_assignment_archive')
      .select('hubspot_contact_id, telepro_user_id, campagne')
      .in('hubspot_contact_id', ids.slice(i, i + 200))
      .not('telepro_user_id', 'is', null)
      .order('campagne', { ascending: false })
    if (error) return out
    for (const r of data ?? []) {
      if (!out.has(r.hubspot_contact_id)) out.set(r.hubspot_contact_id, String(r.telepro_user_id))
    }
  }
  return out
}
