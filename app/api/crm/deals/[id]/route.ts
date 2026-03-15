import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { updateDealStage, updateDealOwner, addNoteToEngagements, STAGES } from '@/lib/hubspot'

// PATCH /api/crm/deals/[id]
// Met à jour un deal depuis le CRM interne → sync HubSpot
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: dealId } = await params
  const body = await req.json()
  const { dealstage, hubspot_owner_id, teleprospecteur, note } = body

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

  // Mise à jour Supabase
  const { data: updated, error: updateErr } = await db
    .from('crm_deals')
    .update(updatePayload)
    .eq('hubspot_deal_id', dealId)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Sync HubSpot (best-effort)
  const errors: string[] = []

  try {
    if (dealstage !== undefined) {
      // Chercher la clé STAGES correspondant à l'ID de stage
      const stageKey = (Object.entries(STAGES) as [string, string][])
        .find(([, v]) => v === dealstage)?.[0] as keyof typeof STAGES | undefined
      if (stageKey) {
        await updateDealStage(dealId, stageKey)
      }
    }
  } catch (e) {
    errors.push(`stage: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    if (hubspot_owner_id !== undefined) {
      await updateDealOwner(dealId, hubspot_owner_id)

      // Si lié à un rdv_appointment → mettre aussi à jour commercial_id
      if (deal.supabase_appt_id && hubspot_owner_id) {
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
    }
  } catch (e) {
    errors.push(`owner: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    if (note?.trim()) {
      await addNoteToEngagements({
        dealId,
        contactId: deal.hubspot_contact_id ?? null,
        body: note.trim(),
      })
    }
  } catch (e) {
    errors.push(`note: ${e instanceof Error ? e.message : String(e)}`)
  }

  return NextResponse.json({
    deal: updated,
    hubspot_errors: errors.length > 0 ? errors : null,
  })
}
