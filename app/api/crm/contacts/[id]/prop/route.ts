import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

/**
 * PATCH /api/crm/contacts/[id]/prop
 * Body: { property: string, value: string }
 *
 * Écrit en PRIORITÉ dans Supabase (sur hubspot_raw JSONB + colonne individuelle si connue).
 * Mirror HubSpot uniquement si HUBSPOT_MIRROR_ENABLED != '0'
 * (permet de couper HubSpot en un flip d'env var).
 */

// Mapping propriété HubSpot → colonne Supabase dédiée
const KNOWN_COLUMNS: Record<string, string> = {
  firstname:                             'firstname',
  lastname:                              'lastname',
  email:                                 'email',
  phone:                                 'phone',
  classe_actuelle:                       'classe_actuelle',
  departement:                           'departement',
  hs_lead_status:                        'hs_lead_status',
  origine:                               'origine',
  hubspot_owner_id:                      'hubspot_owner_id',
  formation_souhaitee:                   'formation_souhaitee',
  'zone___localite':                     'zone_localite',
  'diploma_sante___formation_demandee':  'formation_demandee',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params
  const { property, value } = await req.json()

  if (!property || typeof property !== 'string') {
    return NextResponse.json({ error: 'property manquant' }, { status: 400 })
  }

  const col = KNOWN_COLUMNS[property]
  const now = new Date().toISOString()

  // ── 1. Update Supabase ─────────────────────────────────────────────
  // On met à jour la colonne individuelle si connue + hubspot_raw JSONB
  const update: Record<string, unknown> = { synced_at: now }
  if (col) update[col] = value === '' ? null : value

  // MAJ du JSONB hubspot_raw via expression SQL "jsonb_set"
  // (on passe par un update classique + merge côté serveur)
  const { data: existing } = await db
    .from('crm_contacts')
    .select('hubspot_raw')
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (existing !== null) {
    const raw = (existing as { hubspot_raw?: Record<string, unknown> })?.hubspot_raw ?? {}
    update.hubspot_raw = { ...raw, [property]: value }
  }

  const { error: updateErr } = await db
    .from('crm_contacts')
    .update(update)
    .eq('hubspot_contact_id', contactId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── 1.b Historique du changement (table crm_property_history) ──
  // On enregistre la nouvelle valeur avec source CRM_UI pour qu'elle apparaisse
  // dans le panneau "Historique" de la fiche contact.
  try {
    await db.from('crm_property_history').insert({
      hubspot_contact_id: contactId,
      property_name:      property,
      value:              value === '' ? null : String(value ?? ''),
      changed_at:         now,
      source_type:        'CRM_UI',
      source_id:          null,
      source_label:       'Modifié depuis le CRM',
      source_metadata:    null,
    })
  } catch (e) {
    // Ne pas bloquer la modif si la table n'existe pas / problème transitoire
    console.warn('[crm/contacts/[id]/prop] history insert failed:', e)
  }

  // ── 2. Mirror HubSpot (optionnel, activable pendant la transition) ──
  const mirrorEnabled = process.env.HUBSPOT_MIRROR_ENABLED !== '0'
  let hubspotError: string | null = null

  if (mirrorEnabled) {
    try {
      await hubspotFetch(`/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          properties: { [property]: value ?? '' },
        }),
      })
    } catch (e) {
      hubspotError = e instanceof Error ? e.message : String(e)
      console.error('[crm/contacts/[id]/prop] mirror HubSpot failed:', hubspotError)
    }
  }

  return NextResponse.json({ ok: true, hubspot_mirrored: mirrorEnabled && !hubspotError, hubspot_error: hubspotError })
}
