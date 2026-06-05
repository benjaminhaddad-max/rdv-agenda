import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// PATCH /api/crm/deals/[id]
// Met à jour un deal depuis le CRM interne. HubSpot est déconnecté de la mise à
// jour des propriétés : Supabase est la seule source de vérité, on ne pousse
// plus rien vers HubSpot ici.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params
  const body = await req.json()
  const { dealstage, hubspot_owner_id, teleprospecteur, dealname, formation, closedate, description } = body

  const db = createServiceClient()

  // Récupérer le deal actuel
  const { data: deal, error: fetchErr } = await db
    .from('crm_deals')
    .select('hubspot_deal_id, hubspot_contact_id, supabase_appt_id')
    .eq('hubspot_deal_id', dealId)
    .single()

  if (fetchErr || !deal) {
    return NextResponse.json({ error: 'Deal introuvable' }, { status: 404 })
  }

  // Préparer la mise à jour Supabase
  const updatePayload: Record<string, unknown> = { synced_at: new Date().toISOString() }
  if (dealstage !== undefined) updatePayload.dealstage = dealstage
  if (hubspot_owner_id !== undefined) updatePayload.hubspot_owner_id = hubspot_owner_id
  if (teleprospecteur !== undefined) updatePayload.teleprospecteur = teleprospecteur
  if (dealname !== undefined) updatePayload.dealname = dealname
  if (formation !== undefined) updatePayload.formation = formation
  if (closedate !== undefined) updatePayload.closedate = closedate
  if (description !== undefined) updatePayload.description = description

  // Mise à jour Supabase
  const { data: updated, error: updateErr } = await db
    .from('crm_deals')
    .update(updatePayload)
    .eq('hubspot_deal_id', dealId)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Synchroniser closer + télépro sur le contact lié (cohérence contact ↔ deal)
  if (deal.hubspot_contact_id && (hubspot_owner_id !== undefined || teleprospecteur !== undefined)) {
    const contactUpdate: Record<string, unknown> = { synced_at: new Date().toISOString() }
    if (hubspot_owner_id !== undefined) contactUpdate.hubspot_owner_id = hubspot_owner_id
    if (teleprospecteur !== undefined)  contactUpdate.telepro_user_id  = teleprospecteur
    await db
      .from('crm_contacts')
      .update(contactUpdate)
      .eq('hubspot_contact_id', deal.hubspot_contact_id)
  }

  // Si le changement de closer est lié à un rdv_appointment → mettre aussi à
  // jour commercial_id côté Supabase (logique interne, sans HubSpot).
  if (hubspot_owner_id !== undefined && deal.supabase_appt_id && hubspot_owner_id) {
    const { data: closer } = await db
      .from('rdv_users')
      .select('id')
      .eq('hubspot_owner_id', hubspot_owner_id)
      .single()
    if (closer) {
      await db
        .from('rdv_appointments')
        .update({ commercial_id: closer.id })
        .eq('id', deal.supabase_appt_id)
    }
  }

  return NextResponse.json({ deal: updated, hubspot_errors: null })
}
