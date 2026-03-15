/**
 * GET /api/cron/hubspot-sync
 *
 * Planifié toutes les 5 minutes via Vercel CRON.
 *
 * Synchronisation bidirectionnelle HubSpot → Plateforme :
 * - Détecte les deals modifiés dans HubSpot dans les 10 dernières minutes
 * - Met à jour le statut et/ou le closer dans la plateforme si nécessaire
 * - Protection anti-boucle via `hubspot_synced_at`
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { searchRecentlyModifiedDeals, PIPELINE_ID } from '@/lib/hubspot'
import { REVERSE_STAGE_MAP, SKIP_STAGES, isAppOriginated } from '@/lib/hubspot-sync'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const log: string[] = []
  let synced = 0
  let skipped = 0

  try {
    // 1. Récupérer les deals modifiés dans les 10 dernières minutes
    const deals = await searchRecentlyModifiedDeals(PIPELINE_ID, 10)
    log.push(`Deals modifiés trouvés : ${deals.length}`)

    if (deals.length === 0) {
      return NextResponse.json({ message: 'Aucun deal modifié', synced: 0, skipped: 0 })
    }

    // 2. Récupérer les RDV correspondants en une seule requête
    const dealIds = deals.map(d => d.id)
    const { data: appointments, error: fetchErr } = await db
      .from('rdv_appointments')
      .select('id, hubspot_deal_id, status, commercial_id, hubspot_synced_at')
      .in('hubspot_deal_id', dealIds)

    if (fetchErr) {
      log.push(`Erreur fetch RDV : ${fetchErr.message}`)
      return NextResponse.json({ error: fetchErr.message, log }, { status: 500 })
    }

    // Index par hubspot_deal_id pour accès rapide
    const rdvByDealId = new Map(
      (appointments || []).map(a => [a.hubspot_deal_id, a])
    )

    // 3. Préparer un index des closers par hubspot_owner_id
    const { data: allClosers } = await db
      .from('rdv_users')
      .select('id, hubspot_owner_id')
      .not('hubspot_owner_id', 'is', null)

    const closerByHsOwner = new Map(
      (allClosers || []).map(c => [c.hubspot_owner_id, c.id])
    )

    // 4. Traiter chaque deal
    for (const deal of deals) {
      const rdv = rdvByDealId.get(deal.id)
      if (!rdv) {
        // Deal pas lié à un RDV dans notre base → ignorer
        continue
      }

      // Anti-boucle : si le changement vient de notre app, skip
      if (isAppOriginated(deal.properties.hs_lastmodifieddate, rdv.hubspot_synced_at)) {
        skipped++
        continue
      }

      const updates: Record<string, unknown> = {}
      const reasons: string[] = []

      // === Sync stage → status ===
      const hsStage = deal.properties.dealstage
      if (hsStage && !SKIP_STAGES.has(hsStage)) {
        const mappedStatus = REVERSE_STAGE_MAP[hsStage]
        if (mappedStatus && mappedStatus !== rdv.status) {
          updates.status = mappedStatus
          reasons.push(`stage ${hsStage} → status ${mappedStatus}`)
        }
      }

      // === Sync owner → commercial_id ===
      const hsOwnerId = deal.properties.hubspot_owner_id
      if (hsOwnerId) {
        const closerId = closerByHsOwner.get(hsOwnerId)
        if (closerId && closerId !== rdv.commercial_id) {
          updates.commercial_id = closerId
          reasons.push(`owner ${hsOwnerId} → closer ${closerId}`)
        }
      }

      // Rien à mettre à jour
      if (Object.keys(updates).length === 0) {
        skipped++
        continue
      }

      // Appliquer les mises à jour
      const { error: updateErr } = await db
        .from('rdv_appointments')
        .update(updates)
        .eq('id', rdv.id)

      if (updateErr) {
        log.push(`❌ RDV ${rdv.id} : ${updateErr.message}`)
      } else {
        synced++
        log.push(`✅ RDV ${rdv.id} : ${reasons.join(', ')}`)
      }
    }

    log.push(`Résumé : ${synced} synchro, ${skipped} ignorés`)
    return NextResponse.json({ synced, skipped, log })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`Erreur globale : ${msg}`)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}
