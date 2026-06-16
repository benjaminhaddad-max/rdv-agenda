import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import {
  CONTACT_IDENTITY_COLUMNS,
  COLUMN_TO_HUBSPOT_RAW_KEY,
  HUBSPOT_PROPERTY_TO_COLUMN,
  hubspotRawPatchesFromColumns,
  logContactPropertyHistory,
  mergeSafeHubspotRaw,
} from '@/lib/crm-contact-write'

// HubSpot est déconnecté de la mise à jour des propriétés : Supabase est la
// seule source de vérité. On ne pousse plus rien vers HubSpot ici.
const FIELD_MAP: Record<string, string> = {
  firstname:            'firstname',
  lastname:             'lastname',
  email:                'email',
  phone:                'phone',
  classe_actuelle:      'classe_actuelle',
  hs_lead_status:       'hs_lead_status',
  origine:              'origine',
  hubspot_owner_id:     'hubspot_owner_id',
  zone_localite:        'zone___localite',
  formation_demandee:   'diploma_sante___formation_demandee',
}

// Inverse FIELD_MAP : colonne → nom propriété HubSpot (pour hubspot_raw + historique)
const COLUMN_TO_HUBSPOT_PROP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([col, prop]) => [col, prop])
)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServiceClient()
  const { id: contactId } = await params
  const body = await req.json()

  const { telepro_user_id, closer_du_contact_owner_id, ...contactFields } = body
  const teleprospecteur: string | null | undefined = telepro_user_id

  const supabaseUpdates: Record<string, string | null> = {}

  for (const field of Object.keys(FIELD_MAP)) {
    if (field in contactFields) {
      const nextValue =
        field === 'classe_actuelle'
          ? (normalizeClasseActuelle(contactFields[field]) ?? 'Autres')
          : contactFields[field]
      supabaseUpdates[field] = nextValue
    }
  }

  if (closer_du_contact_owner_id !== undefined) {
    supabaseUpdates.closer_du_contact_owner_id = closer_du_contact_owner_id || null
  }
  if (telepro_user_id !== undefined) {
    supabaseUpdates.telepro_user_id = telepro_user_id || null
  }

  if (Object.keys(supabaseUpdates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  // Charge l'existant pour merger hubspot_raw en sécurité (évite les fiches fantômes).
  const { data: existing, error: fetchErr } = await db
    .from('crm_contacts')
    .select(CONTACT_IDENTITY_COLUMNS.join(','))
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  const existingRow = existing as unknown as Record<string, unknown> | null
  if (!existingRow) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const mergedRow = { ...existingRow, ...supabaseUpdates }
  const rawPatches = hubspotRawPatchesFromColumns(supabaseUpdates)
  const updatePayload: Record<string, unknown> = {
    ...supabaseUpdates,
    synced_at: now,
    hubspot_raw: mergeSafeHubspotRaw(existingRow, rawPatches),
  }

  const { error: updateErr } = await db
    .from('crm_contacts')
    .update(updatePayload)
    .eq('hubspot_contact_id', contactId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Historique des propriétés modifiées (traçabilité + debug).
  for (const [col, val] of Object.entries(supabaseUpdates)) {
    const propName = COLUMN_TO_HUBSPOT_PROP[col]
      ?? Object.entries(HUBSPOT_PROPERTY_TO_COLUMN).find(([, c]) => c === col)?.[0]
      ?? COLUMN_TO_HUBSPOT_RAW_KEY[col]
      ?? col
    await logContactPropertyHistory(
      db,
      contactId,
      propName,
      val === null || val === undefined ? null : String(val),
    )
  }

  // Propagation contact → deals liés (closer + télépro toujours synchronisés)
  const hubspot_owner_id = contactFields.hubspot_owner_id
  const needsDealSync = teleprospecteur !== undefined || hubspot_owner_id !== undefined

  if (needsDealSync) {
    const { data: deals } = await db
      .from('crm_deals')
      .select('hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)

    for (const deal of deals ?? []) {
      const dealUpdate: Record<string, unknown> = { synced_at: now }
      if (teleprospecteur !== undefined) dealUpdate.teleprospecteur = teleprospecteur
      if (hubspot_owner_id !== undefined) dealUpdate.hubspot_owner_id = hubspot_owner_id

      await db
        .from('crm_deals')
        .update(dealUpdate)
        .eq('hubspot_deal_id', deal.hubspot_deal_id)
    }
  }

  return NextResponse.json({
    ok: true,
    contact: {
      hubspot_contact_id: contactId,
      ...mergedRow,
      hubspot_raw: updatePayload.hubspot_raw,
      synced_at: now,
    },
  })
}
