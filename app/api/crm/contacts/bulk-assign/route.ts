import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'
import { BENJAMIN_TELEPRO_ID, triggerBenjaminSheetSyncForContacts } from '@/lib/benjamin-sheet-sync'

export async function POST(req: NextRequest) {
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

  let done = 0
  const errors: string[] = []

  // Process in batches of 20 to avoid rate limits
  const BATCH = 20
  for (let i = 0; i < contact_ids.length; i += BATCH) {
    const chunk = contact_ids.slice(i, i + BATCH)

    // Get their deals
    const { data: deals } = await db.from('crm_deals').select('hubspot_deal_id, hubspot_contact_id').in('hubspot_contact_id', chunk)

    // Update contacts in Supabase (source of truth for CRM filtering/telepro column)
    const { error: contactUpdateError } = await db
      .from('crm_contacts')
      .update({
        telepro_user_id: teleproUserId,
        synced_at: new Date().toISOString(),
      })
      .in('hubspot_contact_id', chunk)
    if (contactUpdateError) {
      errors.push(`contacts chunk ${i / BATCH + 1}: ${contactUpdateError.message}`)
    }

    // Update deals in Supabase (crm_deals.teleprospecteur = HubSpot deal property)
    if (deals && deals.length > 0) {
      const { error: dealsUpdateError } = await db
        .from('crm_deals')
        .update({ teleprospecteur: teleproUserId || null, synced_at: new Date().toISOString() })
        .in('hubspot_contact_id', chunk)
      if (dealsUpdateError) {
        errors.push(`deals chunk ${i / BATCH + 1}: ${dealsUpdateError.message}`)
      }

      // Update HubSpot deals uniquement si hubspot_user_id du télépro disponible.
      if (teleproUserId) {
        await Promise.allSettled(deals.map(deal =>
          hubspotFetch(`/crm/v3/objects/deals/${deal.hubspot_deal_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties: { teleprospecteur: teleproUserId } }),
          }).catch((e: Error) => errors.push(`deal ${deal.hubspot_deal_id}: ${e.message}`))
        ))
      }
    }

    done += chunk.length
  }

  // Le listing CRM lit souvent la vue matérialisée rapide. On force un refresh
  // pour refléter immédiatement l'assignation télépro dans l'UI.
  const { error: refreshError } = await db.rpc('crm_refresh_contacts_fast_mv')
  if (refreshError) {
    errors.push(`fast_mv_refresh: ${refreshError.message}`)
  }

  if (teleproUserId === BENJAMIN_TELEPRO_ID) {
    await triggerBenjaminSheetSyncForContacts(db, contact_ids)
  }

  return NextResponse.json({ ok: true, done, errors: errors.length > 0 ? errors : undefined })
}
