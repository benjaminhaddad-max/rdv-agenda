import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import {
  isReadOnlyProperty,
  normalizePropertyValueForDbColumn,
  normalizePropertyValueForHubSpot,
} from '@/lib/crm-property-normalization'

/**
 * PATCH /api/crm/contacts/[id]/prop
 * Body: { property: string, value: string }
 *
 * Écrit dans Supabase (colonne individuelle si connue + hubspot_raw JSONB).
 * HubSpot est déconnecté : on ne pousse plus rien vers HubSpot ici.
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
  closer_du_contact_owner_id:            'closer_du_contact_owner_id',
  telepro_user_id:                       'telepro_user_id',
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
  const body = await req.json()
  const property = typeof body?.property === 'string' ? body.property : ''
  const value = body?.value as unknown

  if (!property || typeof property !== 'string') {
    return NextResponse.json({ error: 'property manquant' }, { status: 400 })
  }

  const { data: propertyMeta } = await db
    .from('crm_properties')
    .select('type, field_type')
    .eq('object_type', 'contacts')
    .eq('name', property)
    .maybeSingle()

  if (isReadOnlyProperty(propertyMeta)) {
    return NextResponse.json({ error: 'Propriété en lecture seule (calculée ou fichier)' }, { status: 400 })
  }

  const col = KNOWN_COLUMNS[property]
  const now = new Date().toISOString()
  const normalizedByType = normalizePropertyValueForHubSpot(value, propertyMeta)
  const normalizedValue =
    property === 'classe_actuelle'
      ? (normalizeClasseActuelle(String(normalizedByType ?? '')) ?? 'Autres')
      : normalizedByType

  // ── 1. Update Supabase ─────────────────────────────────────────────
  // On met à jour la colonne individuelle si connue + hubspot_raw JSONB
  const update: Record<string, unknown> = { synced_at: now }
  if (col) update[col] = normalizePropertyValueForDbColumn(normalizedValue, propertyMeta)

  // MAJ du JSONB hubspot_raw via expression SQL "jsonb_set"
  // (on passe par un update classique + merge côté serveur)
  const { data: existing } = await db
    .from('crm_contacts')
    .select('hubspot_raw, firstname, lastname, email, phone, classe_actuelle, departement, zone_localite, formation_souhaitee, formation_demandee, origine, hubspot_owner_id')
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (existing !== null) {
    const ex = existing as Record<string, unknown>
    const raw = (ex.hubspot_raw && typeof ex.hubspot_raw === 'object')
      ? (ex.hubspot_raw as Record<string, unknown>)
      : {}
    // GARDE-FOU : un trigger en base resynchronise les colonnes depuis hubspot_raw.
    // Si on réécrit hubspot_raw sans l'identité (cas des leads Meta/natifs dont
    // l'identité est dans les colonnes, pas dans le JSONB), le trigger vide
    // nom/email/téléphone. On réinjecte donc l'identité présente en colonnes
    // dans hubspot_raw avant d'écrire, pour que le trigger reste neutre.
    const COLUMN_TO_RAW_KEY: Record<string, string> = {
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
    }
    const safeRaw: Record<string, unknown> = { ...raw }
    for (const [colName, rawKey] of Object.entries(COLUMN_TO_RAW_KEY)) {
      const colVal = ex[colName]
      const present = colVal !== null && colVal !== undefined && String(colVal).trim() !== ''
      const rawMissing = safeRaw[rawKey] === null || safeRaw[rawKey] === undefined || String(safeRaw[rawKey] ?? '').trim() === ''
      if (present && rawMissing) safeRaw[rawKey] = colVal
    }
    update.hubspot_raw = { ...safeRaw, [property]: normalizedValue }
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
      value:              normalizedValue === null ? null : String(normalizedValue),
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

  // ── 2. Déclenche les workflows trigger_type='property_changed' ──
  try {
    const { enrollContact } = await import('@/lib/workflow-engine')
    const { data: workflows } = await db
      .from('crm_workflows')
      .select('id, trigger_config')
      .eq('status', 'active')
      .eq('trigger_type', 'property_changed')
    for (const wf of (workflows ?? [])) {
      const cfg = (wf.trigger_config ?? {}) as { property?: string; to?: string | string[] }
      if (cfg.property && cfg.property !== property) continue
      if (cfg.to !== undefined && cfg.to !== null) {
        const expected = Array.isArray(cfg.to) ? cfg.to : [cfg.to]
        if (!expected.includes(String(normalizedValue ?? ''))) continue
      }
      await enrollContact(db, wf.id, contactId, { property, value: normalizedValue, source: 'CRM_UI' })
    }
  } catch (e) {
    console.warn('[crm/contacts/[id]/prop] workflow trigger failed:', e)
  }

  return NextResponse.json({ ok: true, hubspot_mirrored: false, hubspot_error: null })
}
