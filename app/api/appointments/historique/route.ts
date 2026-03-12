import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { searchDealsByOwner, PIPELINE_2026_2027, STAGES } from '@/lib/hubspot'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  [STAGES.aReplanifier]:         { label: 'À replanifier',        color: '#f97316' },
  [STAGES.rdvPris]:              { label: 'RDV Pris',             color: '#6b87ff' },
  [STAGES.delaiReflexion]:       { label: 'Délai de réflexion',   color: '#eab308' },
  [STAGES.preinscription]:       { label: 'Pré-inscription',      color: '#a855f7' },
  [STAGES.finalisation]:         { label: 'Finalisation',         color: '#14b8a6' },
  [STAGES.inscriptionConfirmee]: { label: 'Inscrit ✓',           color: '#22c55e' },
  [STAGES.fermePerdu]:           { label: 'Fermé / Perdu',        color: '#ef4444' },
}

// Oct 1 2025 en millisecondes (timestamp pour l'API HubSpot)
const HISTORIQUE_START_MS = new Date('2025-10-01T00:00:00.000Z').getTime()

// GET /api/appointments/historique?hubspot_owner_id=xxx
export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get('hubspot_owner_id')
  if (!ownerId) return NextResponse.json({ error: 'hubspot_owner_id requis' }, { status: 400 })

  // 1. Chercher tous les deals HubSpot de ce télépro sur la pipeline 2026-2027 depuis oct. 2025
  const hsDeals = await searchDealsByOwner(ownerId, PIPELINE_2026_2027, HISTORIQUE_START_MS)
  if (hsDeals.length === 0) return NextResponse.json([])

  const dealIds = hsDeals.map(d => d.id)

  // 2. Retrouver les appointments Supabase correspondants (par hubspot_deal_id)
  const db = createServiceClient()
  const { data: appointments } = await db
    .from('rdv_appointments')
    .select(`
      *,
      rdv_users:commercial_id (id, name, avatar_color, slug),
      telepro:telepro_id (id, name)
    `)
    .in('hubspot_deal_id', dealIds)
    .order('start_at', { ascending: false })

  // 3. Construire un Map des deals HubSpot pour lookup rapide
  const dealMap = new Map(hsDeals.map(d => [d.id, d]))

  // 4. Enrichir chaque appointment avec le stage HubSpot actuel
  const result = (appointments ?? []).map(appt => {
    const deal = dealMap.get(appt.hubspot_deal_id as string)
    const stageInfo = deal
      ? (STAGE_LABELS[deal.properties.dealstage] ?? { label: deal.properties.dealstage, color: '#8b8fa8' })
      : null
    return {
      ...appt,
      hs_stage: deal?.properties.dealstage ?? null,
      hs_stage_label: stageInfo?.label ?? null,
      hs_stage_color: stageInfo?.color ?? null,
    }
  })

  return NextResponse.json(result)
}
