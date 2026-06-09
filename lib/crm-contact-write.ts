/**
 * Écritures sûres sur crm_contacts.
 *
 * Contexte (bug "fiche fantôme") : un trigger Postgres peut resynchroniser les
 * colonnes d'identité depuis hubspot_raw à chaque UPDATE de hubspot_raw.
 * Si on réécrit hubspot_raw sans y inclure firstname/email/phone (cas des leads
 * Meta/natifs dont l'identité vit en colonnes), le trigger vide la fiche.
 *
 * Toute mise à jour CRM (PATCH contact, PATCH prop, workflows) doit passer par
 * mergeSafeHubspotRaw() avant d'écrire hubspot_raw.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Colonne Supabase → clé dans hubspot_raw (format HubSpot). */
export const COLUMN_TO_HUBSPOT_RAW_KEY: Record<string, string> = {
  firstname: 'firstname',
  lastname: 'lastname',
  email: 'email',
  phone: 'phone',
  classe_actuelle: 'classe_actuelle',
  departement: 'departement',
  zone_localite: 'zone___localite',
  formation_souhaitee: 'formation_souhaitee',
  formation_demandee: 'diploma_sante___formation_demandee',
  origine: 'origine',
  hubspot_owner_id: 'hubspot_owner_id',
  hs_lead_status: 'hs_lead_status',
  closer_du_contact_owner_id: 'closer_du_contact_owner_id',
  telepro_user_id: 'telepro_user_id',
}

/** Propriété HubSpot (prop route) → colonne Supabase. */
export const HUBSPOT_PROPERTY_TO_COLUMN: Record<string, string> = {
  firstname: 'firstname',
  lastname: 'lastname',
  email: 'email',
  phone: 'phone',
  classe_actuelle: 'classe_actuelle',
  departement: 'departement',
  hs_lead_status: 'hs_lead_status',
  origine: 'origine',
  hubspot_owner_id: 'hubspot_owner_id',
  closer_du_contact_owner_id: 'closer_du_contact_owner_id',
  telepro_user_id: 'telepro_user_id',
  formation_souhaitee: 'formation_souhaitee',
  'zone___localite': 'zone_localite',
  'diploma_sante___formation_demandee': 'formation_demandee',
}

export const CONTACT_IDENTITY_COLUMNS = [
  'hubspot_contact_id',
  'firstname',
  'lastname',
  'email',
  'phone',
  'classe_actuelle',
  'departement',
  'zone_localite',
  'formation_souhaitee',
  'formation_demandee',
  'origine',
  'hubspot_owner_id',
  'hs_lead_status',
  'hubspot_raw',
] as const

type ContactRow = Record<string, unknown>

/** Réinjecte l'identité des colonnes dans hubspot_raw avant écriture. */
export function mergeSafeHubspotRaw(
  existing: ContactRow,
  propertyPatches: Record<string, unknown>,
): Record<string, unknown> {
  const raw = (existing.hubspot_raw && typeof existing.hubspot_raw === 'object')
    ? (existing.hubspot_raw as Record<string, unknown>)
    : {}
  const safeRaw: Record<string, unknown> = { ...raw }

  for (const [colName, rawKey] of Object.entries(COLUMN_TO_HUBSPOT_RAW_KEY)) {
    const colVal = existing[colName]
    const present = colVal !== null && colVal !== undefined && String(colVal).trim() !== ''
    const rawMissing =
      safeRaw[rawKey] === null
      || safeRaw[rawKey] === undefined
      || String(safeRaw[rawKey] ?? '').trim() === ''
    if (present && rawMissing) safeRaw[rawKey] = colVal
  }

  return { ...safeRaw, ...propertyPatches }
}

/** Applique des patches hubspot_raw (clés = noms propriétés HubSpot). */
export function hubspotRawPatchesFromColumns(
  columnUpdates: Record<string, string | null>,
): Record<string, unknown> {
  const patches: Record<string, unknown> = {}
  for (const [col, val] of Object.entries(columnUpdates)) {
    const rawKey = COLUMN_TO_HUBSPOT_RAW_KEY[col]
    if (rawKey) patches[rawKey] = val
  }
  return patches
}

export async function logContactPropertyHistory(
  db: SupabaseClient,
  contactId: string,
  propertyName: string,
  value: string | null,
  sourceLabel = 'Modifié depuis le CRM',
) {
  try {
    await db.from('crm_property_history').insert({
      hubspot_contact_id: contactId,
      property_name: propertyName,
      value,
      changed_at: new Date().toISOString(),
      source_type: 'CRM_UI',
      source_id: null,
      source_label: sourceLabel,
      source_metadata: null,
    })
  } catch {
    // best-effort
  }
}
