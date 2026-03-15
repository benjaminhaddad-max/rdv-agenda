import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServiceClient()
  const { id: contactId } = await params
  const body = await req.json()

  const { firstname, lastname, phone, email, classe_actuelle, hs_lead_status, hubspot_owner_id, teleprospecteur } = body

  // Build updates for Supabase
  const supabaseUpdates: Record<string, string | null> = {}
  const hubspotProps: Record<string, string | null> = {}

  if (firstname !== undefined)       { supabaseUpdates.firstname = firstname;             hubspotProps.firstname = firstname }
  if (lastname !== undefined)        { supabaseUpdates.lastname = lastname;               hubspotProps.lastname = lastname }
  if (phone !== undefined)           { supabaseUpdates.phone = phone;                     hubspotProps.phone = phone }
  if (email !== undefined)           { supabaseUpdates.email = email;                     hubspotProps.email = email }
  if (classe_actuelle !== undefined) { supabaseUpdates.classe_actuelle = classe_actuelle; hubspotProps.classe_actuelle = classe_actuelle }
  if (hs_lead_status !== undefined)  { supabaseUpdates.hs_lead_status = hs_lead_status;   hubspotProps.hs_lead_status = hs_lead_status }
  if (hubspot_owner_id !== undefined){ supabaseUpdates.hubspot_owner_id = hubspot_owner_id; hubspotProps.hubspot_owner_id = hubspot_owner_id }
  if (teleprospecteur !== undefined) { supabaseUpdates.teleprospecteur = teleprospecteur }

  // Update Supabase contact
  if (Object.keys(supabaseUpdates).length > 0) {
    await db.from('crm_contacts').update({ ...supabaseUpdates, synced_at: new Date().toISOString() }).eq('hubspot_contact_id', contactId)
  }

  // Update HubSpot contact
  if (Object.keys(hubspotProps).length > 0) {
    const cleanProps: Record<string, string> = {}
    for (const [k, v] of Object.entries(hubspotProps)) {
      if (v !== null && v !== undefined) cleanProps[k] = v
    }
    if (Object.keys(cleanProps).length > 0) {
      await hubspotFetch(`/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: cleanProps }),
      })
    }
  }

  // If teleprospecteur provided, also update deals linked to this contact
  if (teleprospecteur !== undefined) {
    const { data: deals } = await db.from('crm_deals').select('hubspot_deal_id').eq('hubspot_contact_id', contactId)
    for (const deal of deals ?? []) {
      await db.from('crm_deals').update({ teleprospecteur, synced_at: new Date().toISOString() }).eq('hubspot_deal_id', deal.hubspot_deal_id)
      await hubspotFetch(`/crm/v3/objects/deals/${deal.hubspot_deal_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: { teleprospecteur: teleprospecteur ?? '' } }),
      })
    }
  }

  return NextResponse.json({ ok: true })
}
