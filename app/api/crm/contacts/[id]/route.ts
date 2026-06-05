import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'

// HubSpot est déconnecté de la mise à jour des propriétés : Supabase est la
// seule source de vérité. On ne pousse plus rien vers HubSpot ici.
// Mapping conservé pour la normalisation des champs connus.
const FIELD_MAP: Record<string, string> = {
  firstname:            'firstname',
  lastname:             'lastname',
  email:                'email',
  phone:                'phone',
  classe_actuelle:      'classe_actuelle',
  hs_lead_status:       'hs_lead_status',
  origine:              'origine',
  hubspot_owner_id:     'hubspot_owner_id',
  zone_localite:        'zone___localite',           // propriété HubSpot avec triple _
  formation_demandee:   'diploma_sante___formation_demandee',
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServiceClient()
  const { id: contactId } = await params
  const body = await req.json()

  const { telepro_user_id, closer_du_contact_owner_id, ...contactFields } = body
  // Le télépro est mis à jour via telepro_user_id (colonne native crm_contacts).
  // La valeur est aussi propagée aux deals liés (crm_deals.teleprospecteur).
  const teleprospecteur: string | null | undefined = telepro_user_id

  // Build updates for Supabase (HubSpot déconnecté)
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

  // closer_du_contact_owner_id : Supabase uniquement (pas de propriété HubSpot)
  if (closer_du_contact_owner_id !== undefined) {
    supabaseUpdates.closer_du_contact_owner_id = closer_du_contact_owner_id || null
  }
  // telepro_user_id : Supabase uniquement (colonne native indépendante de HubSpot)
  if (telepro_user_id !== undefined) {
    supabaseUpdates.telepro_user_id = telepro_user_id || null
  }

  // Update Supabase contact
  if (Object.keys(supabaseUpdates).length > 0) {
    await db
      .from('crm_contacts')
      .update({ ...supabaseUpdates, synced_at: new Date().toISOString() })
      .eq('hubspot_contact_id', contactId)
  }

  // Propagation contact → deals liés (closer + télépro toujours synchronisés)
  const hubspot_owner_id = contactFields.hubspot_owner_id
  const needsDealSync    = teleprospecteur !== undefined || hubspot_owner_id !== undefined

  if (needsDealSync) {
    // Récupérer tous les deals liés
    const { data: deals } = await db
      .from('crm_deals')
      .select('hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)

    for (const deal of deals ?? []) {
      const dealUpdate: Record<string, unknown> = { synced_at: new Date().toISOString() }
      if (teleprospecteur !== undefined)  dealUpdate.teleprospecteur  = teleprospecteur
      if (hubspot_owner_id !== undefined) dealUpdate.hubspot_owner_id = hubspot_owner_id

      await db
        .from('crm_deals')
        .update(dealUpdate)
        .eq('hubspot_deal_id', deal.hubspot_deal_id)
    }
  }

  return NextResponse.json({ ok: true })
}
