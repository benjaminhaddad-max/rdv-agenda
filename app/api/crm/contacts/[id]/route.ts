import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

// Mapping champ Supabase → propriété HubSpot
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

  const { teleprospecteur, ...contactFields } = body

  // Build updates for Supabase + HubSpot
  const supabaseUpdates: Record<string, string | null> = {}
  const hubspotProps: Record<string, string> = {}

  for (const [field, hsField] of Object.entries(FIELD_MAP)) {
    if (field in contactFields) {
      supabaseUpdates[field] = contactFields[field]
      if (contactFields[field] != null && contactFields[field] !== '') {
        hubspotProps[hsField] = contactFields[field]
      }
    }
  }

  // Update Supabase contact
  if (Object.keys(supabaseUpdates).length > 0) {
    await db
      .from('crm_contacts')
      .update({ ...supabaseUpdates, synced_at: new Date().toISOString() })
      .eq('hubspot_contact_id', contactId)
  }

  // Update HubSpot contact (best-effort)
  if (Object.keys(hubspotProps).length > 0) {
    try {
      await hubspotFetch(`/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: hubspotProps }),
      })
    } catch (e) {
      console.error('[crm/contacts PATCH] HubSpot error:', e)
    }
  }

  // Propagation contact → deals liés (closer + télépro toujours synchronisés)
  const hubspot_owner_id = contactFields.hubspot_owner_id
  const needsDealSync    = teleprospecteur !== undefined || hubspot_owner_id !== undefined

  if (needsDealSync) {
    // Stocker teleprospecteur sur le contact si besoin
    if (teleprospecteur !== undefined) {
      await db
        .from('crm_contacts')
        .update({ teleprospecteur, synced_at: new Date().toISOString() })
        .eq('hubspot_contact_id', contactId)
    }

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

      // Sync HubSpot deal (best-effort)
      try {
        const hsProps: Record<string, string> = {}
        if (teleprospecteur !== undefined)  hsProps.teleprospecteur  = teleprospecteur ?? ''
        if (hubspot_owner_id !== undefined) hsProps.hubspot_owner_id = hubspot_owner_id ?? ''
        if (Object.keys(hsProps).length > 0) {
          await hubspotFetch(`/crm/v3/objects/deals/${deal.hubspot_deal_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties: hsProps }),
          })
        }
      } catch (e) {
        console.error('[crm/contacts PATCH] Deal HubSpot error:', e)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
