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

// Oct 1 2025 en millisecondes (timestamp pour closedate HubSpot)
const HISTORIQUE_START_MS = new Date('2025-10-01T00:00:00.000Z').getTime()

// GET /api/appointments/historique?hubspot_owner_id=xxx
export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get('hubspot_owner_id')
  if (!ownerId) return NextResponse.json([])

  // 1. Chercher les deals HubSpot via la propriété "teleprospecteur" (custom field)
  //    Filtre HubSpot : pipeline uniquement (closedate filtrée côté JS pour éviter les erreurs silencieuses)
  const allDeals = await searchDealsByOwner(ownerId, PIPELINE_2026_2027, 0)
  if (allDeals.length === 0) return NextResponse.json([])

  // Filtrer côté JS : RDVs passés depuis le 1er oct. 2025
  const historicStart = new Date(HISTORIQUE_START_MS)
  const now = new Date()
  const hsDeals = allDeals.filter(d => {
    if (!d.properties.closedate) return false
    const cd = new Date(d.properties.closedate)
    return cd >= historicStart && cd <= now
  })
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

  // Map : hubspot_deal_id → appointment Supabase
  const apptByDealId = new Map((appointments ?? []).map(a => [a.hubspot_deal_id as string, a]))

  // 3. Construire les résultats : préférer la data Supabase, sinon data HubSpot seule
  const result = hsDeals.map(deal => {
    const stageInfo = STAGE_LABELS[deal.properties.dealstage]
      ?? { label: deal.properties.dealstage ?? '—', color: '#8b8fa8' }
    const appt = apptByDealId.get(deal.id)

    if (appt) {
      // Appointment trouvé en Supabase : enrichir avec le stage HubSpot actuel
      return {
        ...appt,
        hs_stage: deal.properties.dealstage ?? null,
        hs_stage_label: stageInfo.label,
        hs_stage_color: stageInfo.color,
      }
    }

    // Pas de match Supabase : retourner les données HubSpot seules
    // Le nom du deal est "RDV Découverte — Prénom Nom"
    const dealname = deal.properties.dealname ?? ''
    const prospectName = dealname.replace(/^RDV Découverte — /i, '').trim() || dealname
    const closedateStr = deal.properties.closedate // "YYYY-MM-DD" ou ISO
    const startAt = closedateStr
      ? (closedateStr.includes('T') ? closedateStr : `${closedateStr}T00:00:00.000Z`)
      : new Date(parseInt(deal.properties.createdate ?? '0')).toISOString()

    return {
      id: deal.id,
      prospect_name: prospectName,
      prospect_email: '',
      prospect_phone: null,
      start_at: startAt,
      end_at: startAt,
      status: 'confirme' as const,
      hubspot_deal_id: deal.id,
      hubspot_contact_id: null,
      notes: null,
      report_summary: null,
      report_telepro_advice: null,
      formation_type: null,
      meeting_type: null,
      meeting_link: null,
      source: 'telepro',
      classe_actuelle: null,
      departement: null,
      rdv_users: null,
      hs_stage: deal.properties.dealstage ?? null,
      hs_stage_label: stageInfo.label,
      hs_stage_color: stageInfo.color,
    }
  })

  // Trier par date décroissante
  result.sort((a, b) => b.start_at.localeCompare(a.start_at))

  return NextResponse.json(result)
}
