import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

// Suppression en masse de contacts CRM.
// - Supprime d'abord les deals liés (HubSpot best-effort + Supabase).
// - Puis archive les contacts côté HubSpot (best-effort, no-op si mirror off).
// - Puis supprime les contacts dans Supabase. Les tables liées avec ON DELETE
//   CASCADE (crm_activities, crm_form_submissions, crm_notes…) sont nettoyées
//   automatiquement par Postgres.
// - Force enfin un refresh de la vue matérialisée rapide pour que l'UI reflète
//   immédiatement la suppression.
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const { contact_ids }: { contact_ids: string[] } = await req.json()

  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return NextResponse.json({ error: 'contact_ids required' }, { status: 400 })
  }

  let deletedContacts = 0
  let deletedDeals = 0
  const errors: string[] = []

  const BATCH = 50
  for (let i = 0; i < contact_ids.length; i += BATCH) {
    const chunk = contact_ids.slice(i, i + BATCH)

    // 1) Récupérer les deals liés pour les supprimer dans HubSpot.
    const { data: deals } = await db
      .from('crm_deals')
      .select('hubspot_deal_id')
      .in('hubspot_contact_id', chunk)

    if (deals && deals.length > 0) {
      // HubSpot DELETE deals (best-effort, parallèle)
      await Promise.allSettled(
        deals.map(d =>
          hubspotFetch(`/crm/v3/objects/deals/${d.hubspot_deal_id}`, { method: 'DELETE' })
            .catch((e: Error) => errors.push(`hubspot deal ${d.hubspot_deal_id}: ${e.message}`))
        )
      )
      // Supabase DELETE deals
      const { data: deletedDealRows, error: dealsError } = await db
        .from('crm_deals')
        .delete()
        .in('hubspot_contact_id', chunk)
        .select('hubspot_deal_id')
      if (dealsError) {
        errors.push(`deals chunk ${i / BATCH + 1}: ${dealsError.message}`)
      } else if (deletedDealRows) {
        deletedDeals += deletedDealRows.length
      }
    }

    // 2) HubSpot DELETE contacts (best-effort, no-op si mirror off)
    await Promise.allSettled(
      chunk.map(id =>
        hubspotFetch(`/crm/v3/objects/contacts/${id}`, { method: 'DELETE' })
          .catch((e: Error) => errors.push(`hubspot contact ${id}: ${e.message}`))
      )
    )

    // 3) Supabase DELETE contacts (cascade sur les tables filles)
    const { data: deletedRows, error: contactsError } = await db
      .from('crm_contacts')
      .delete()
      .in('hubspot_contact_id', chunk)
      .select('hubspot_contact_id')
    if (contactsError) {
      errors.push(`contacts chunk ${i / BATCH + 1}: ${contactsError.message}`)
    } else if (deletedRows) {
      deletedContacts += deletedRows.length
    }
  }

  // 4) Refresh de la vue matérialisée rapide pour que la liste CRM
  // se mette à jour immédiatement après la suppression.
  const { error: refreshError } = await db.rpc('crm_refresh_contacts_fast_mv')
  if (refreshError) errors.push(`fast_mv_refresh: ${refreshError.message}`)

  return NextResponse.json({
    ok: true,
    deleted_contacts: deletedContacts,
    deleted_deals: deletedDeals,
    errors: errors.length > 0 ? errors : undefined,
  })
}
