import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { assignContactsToTelepro } from '@/lib/assign-leads'

export async function POST(req: NextRequest) {
  const apiGuard = await requireApiUser()
  if (!apiGuard.ok) return apiGuard.response
  const db = createServiceClient()
  const {
    contact_ids,
    telepro_rdv_user_id,
    telepro_user_id,
  }: {
    contact_ids: string[]
    telepro_rdv_user_id?: string | null
    telepro_user_id?: string | null
  } = await req.json()

  if (!contact_ids?.length || (!telepro_user_id && !telepro_rdv_user_id)) {
    return NextResponse.json({ error: 'contact_ids and telepro_user_id or telepro_rdv_user_id required' }, { status: 400 })
  }

  // telepro_user_id dans crm_contacts = HubSpot user id (bigint).
  // Si le front ne l'a pas (nouveau user sans mapping), on le récupère depuis rdv_users
  // et on crée un identifiant local numérique de secours pour permettre l'assignation CRM.
  let teleproUserId = String(telepro_user_id ?? '').trim()
  if (!teleproUserId && telepro_rdv_user_id) {
    const { data: rdvUser } = await db
      .from('rdv_users')
      .select('id, hubspot_user_id, hubspot_owner_id')
      .eq('id', telepro_rdv_user_id)
      .maybeSingle()

    let resolved = rdvUser?.hubspot_user_id || rdvUser?.hubspot_owner_id || ''
    if (!resolved && rdvUser?.id) {
      // Génère un identifiant local numérique de secours (non HubSpot)
      // pour conserver un mapping télépro stable côté CRM.
      resolved = String(Date.now())
      await db
        .from('rdv_users')
        .update({ hubspot_user_id: resolved })
        .eq('id', rdvUser.id)
        .is('hubspot_user_id', null)
    }
    teleproUserId = teleproUserId || resolved
  }

  if (!teleproUserId) {
    return NextResponse.json({ error: 'Cannot resolve telepro_user_id for selected telepro' }, { status: 400 })
  }

  const { done, errors } = await assignContactsToTelepro(db, contact_ids, teleproUserId)

  return NextResponse.json({ ok: true, done, errors: errors.length > 0 ? errors : undefined })
}
