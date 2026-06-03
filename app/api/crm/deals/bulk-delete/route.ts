import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'
import { isDeletableStage } from '@/lib/dealstage-rules'

// Suppression en masse de transactions (deals) CRM.
//
// REGLE METIER CRITIQUE :
//   Il est IMPOSSIBLE de supprimer une transaction qui se trouve dans une
//   colonne pilotee par la plateforme de preinscription (Pre-inscription,
//   Finalisation, Inscription Confirmee, Ferme Perdu) — exactement comme il est
//   impossible d'y deplacer une transaction. Seuls les stages amont
//   (A Replanifier, RDV Pris, Delai Reflexion) sont supprimables.
//   Ce garde-fou serveur est la source de verite (le verrou UI n'est qu'un
//   confort). Si UNE seule transaction du lot est protegee, on refuse tout le
//   lot pour rester previsible.
//
// Flux :
//   - Verifie le stage de chaque deal (garde-fou).
//   - Supprime cote HubSpot (best-effort ; on saute les deals "dpl_*" qui sont
//     des miroirs plateforme et n'existent pas dans HubSpot).
//   - Supprime cote Supabase (crm_deals).
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const { deal_ids }: { deal_ids: string[] } = await req.json()

  if (!Array.isArray(deal_ids) || deal_ids.length === 0) {
    return NextResponse.json({ error: 'deal_ids required' }, { status: 400 })
  }

  // 1) Charger les deals cibles pour verifier leur stage.
  const { data: deals, error: fetchErr } = await db
    .from('crm_deals')
    .select('hubspot_deal_id, dealstage')
    .in('hubspot_deal_id', deal_ids)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  // 2) Garde-fou : refuser le lot si une transaction est dans un stage aval.
  const blocked = (deals ?? []).filter(d => !isDeletableStage(d.dealstage))
  if (blocked.length > 0) {
    return NextResponse.json(
      {
        error:
          'Suppression interdite : une ou plusieurs transactions sont dans une ' +
          'colonne pilotée par la plateforme de préinscription (Pré-inscription, ' +
          'Finalisation, Inscription Confirmée, Fermé Perdu).',
        blocked_deal_ids: blocked.map(d => d.hubspot_deal_id),
      },
      { status: 403 },
    )
  }

  const deletableIds = (deals ?? []).map(d => d.hubspot_deal_id)
  if (deletableIds.length === 0) {
    return NextResponse.json({ ok: true, deleted_deals: 0 })
  }

  let deletedDeals = 0
  const errors: string[] = []

  const BATCH = 50
  for (let i = 0; i < deletableIds.length; i += BATCH) {
    const chunk = deletableIds.slice(i, i + BATCH)

    // HubSpot DELETE (best-effort, parallele). On saute les miroirs plateforme
    // (ids "dpl_*") qui n'existent pas dans HubSpot.
    await Promise.allSettled(
      chunk
        .filter(id => !String(id).startsWith('dpl_'))
        .map(id =>
          hubspotFetch(`/crm/v3/objects/deals/${id}`, { method: 'DELETE' })
            .catch((e: Error) => errors.push(`hubspot deal ${id}: ${e.message}`)),
        ),
    )

    // Supabase DELETE
    const { data: deletedRows, error: delErr } = await db
      .from('crm_deals')
      .delete()
      .in('hubspot_deal_id', chunk)
      .select('hubspot_deal_id')

    if (delErr) {
      errors.push(`deals chunk ${i / BATCH + 1}: ${delErr.message}`)
    } else if (deletedRows) {
      deletedDeals += deletedRows.length
    }
  }

  return NextResponse.json({
    ok: true,
    deleted_deals: deletedDeals,
    errors: errors.length > 0 ? errors : undefined,
  })
}
