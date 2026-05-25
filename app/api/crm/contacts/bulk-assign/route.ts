import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const {
    contact_ids,
    telepro_user_id,
    teleprospecteur,
  }: {
    contact_ids: string[]
    telepro_user_id?: string | null
    teleprospecteur?: string | null
  } = await req.json()

  if (!contact_ids?.length || !telepro_user_id) {
    return NextResponse.json({ error: 'contact_ids and telepro_user_id required' }, { status: 400 })
  }

  // Backward-compat: si seul teleprospecteur est fourni (ancien front),
  // on tente de retrouver le user interne pour remplir telepro_user_id.
  let teleproUserId = String(telepro_user_id).trim()
  let teleprospecteurHsUserId = teleprospecteur ? String(teleprospecteur).trim() : ''
  if (!teleprospecteurHsUserId) {
    const { data: rdvUser } = await db
      .from('rdv_users')
      .select('id, hubspot_user_id')
      .eq('id', teleproUserId)
      .maybeSingle()
    teleproUserId = rdvUser?.id ?? teleproUserId
    teleprospecteurHsUserId = rdvUser?.hubspot_user_id ?? ''
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
        teleprospecteur: teleprospecteurHsUserId || null,
        synced_at: new Date().toISOString(),
      })
      .in('hubspot_contact_id', chunk)
    if (contactUpdateError) {
      errors.push(`contacts chunk ${i / BATCH + 1}: ${contactUpdateError.message}`)
    }

    // Update deals in Supabase
    if (deals && deals.length > 0) {
      const { error: dealsUpdateError } = await db
        .from('crm_deals')
        .update({ teleprospecteur: teleprospecteurHsUserId || null, synced_at: new Date().toISOString() })
        .in('hubspot_contact_id', chunk)
      if (dealsUpdateError) {
        errors.push(`deals chunk ${i / BATCH + 1}: ${dealsUpdateError.message}`)
      }

      // Update HubSpot deals uniquement si hubspot_user_id du télépro disponible.
      if (teleprospecteurHsUserId) {
        await Promise.allSettled(deals.map(deal =>
          hubspotFetch(`/crm/v3/objects/deals/${deal.hubspot_deal_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties: { teleprospecteur: teleprospecteurHsUserId } }),
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

  return NextResponse.json({ ok: true, done, errors: errors.length > 0 ? errors : undefined })
}
