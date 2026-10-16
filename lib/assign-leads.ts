import type { SupabaseClient } from '@supabase/supabase-js'
import { hubspotFetch } from '@/lib/hubspot'
import { BENJAMIN_TELEPRO_ID, triggerBenjaminSheetSyncForContacts } from '@/lib/benjamin-sheet-sync'

/**
 * Attribue des contacts à un télépro (crm_contacts.telepro_user_id +
 * transactions Supabase / HubSpot), puis rafraîchit la vue rapide.
 * Utilisé par l'attribution en masse du CRM et par l'assistant de
 * distribution des leads.
 *
 * Par défaut, un lead réattribué repasse en « Nouveau » (sinon il se perd
 * dans les filtres du télépro qui le reçoit) — sauf inscrits / finalisés et
 * RDV en cours. `keepStatus` garde le statut tel quel (NRP, À relancer…).
 */
export async function assignContactsToTelepro(
  db: SupabaseClient,
  contactIds: string[],
  teleproUserId: string,
  opts: { keepStatus?: boolean } = {},
): Promise<{ done: number; errors: string[] }> {
  let done = 0
  const errors: string[] = []

  // Process in batches of 20 to avoid rate limits
  const BATCH = 20
  for (let i = 0; i < contactIds.length; i += BATCH) {
    const chunk = contactIds.slice(i, i + BATCH)

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

    // Lead réattribué = nouveau pour le télépro qui le reçoit : statut « Nouveau »
    // (sinon il se perd dans ses filtres). On garde les inscrits / finalisés et
    // les RDV en cours (pris / à replanifier).
    if (!opts.keepStatus) {
      const { error: statusUpdateError } = await db
        .from('crm_contacts')
        .update({ hs_lead_status: 'Nouveau' })
        .in('hubspot_contact_id', chunk)
        .or('hs_lead_status.is.null,and(hs_lead_status.not.ilike.*inscri*,hs_lead_status.not.ilike.*finalis*,hs_lead_status.not.ilike.*rdv*,hs_lead_status.not.ilike.*replanif*,hs_lead_status.not.ilike.nouveau*)')
      if (statusUpdateError) {
        errors.push(`statut chunk ${i / BATCH + 1}: ${statusUpdateError.message}`)
      }
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
    await triggerBenjaminSheetSyncForContacts(db, contactIds)
  }

  return { done, errors }
}
