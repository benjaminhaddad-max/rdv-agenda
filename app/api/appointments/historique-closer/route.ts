import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { searchDealsByCloser, PIPELINE_2026_2027, STAGES } from '@/lib/hubspot'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  [STAGES.aReplanifier]:         { label: 'À replanifier',        color: '#f97316' },
  [STAGES.rdvPris]:              { label: 'RDV Pris',             color: '#6b87ff' },
  [STAGES.delaiReflexion]:       { label: 'Délai de réflexion',   color: '#eab308' },
  [STAGES.preinscription]:       { label: 'Pré-inscription',      color: '#a855f7' },
  [STAGES.finalisation]:         { label: 'Finalisation',         color: '#14b8a6' },
  [STAGES.inscriptionConfirmee]: { label: 'Inscrit ✓',           color: '#22c55e' },
  [STAGES.fermePerdu]:           { label: 'Fermé / Perdu',        color: '#ef4444' },
}

// GET /api/appointments/historique-closer?hubspot_owner_id=xxx
export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get('hubspot_owner_id')
  if (!ownerId) return NextResponse.json([])

  const allDeals = await searchDealsByCloser(ownerId, PIPELINE_2026_2027, 0)
  if (allDeals.length === 0) return NextResponse.json([])

  // Filtrer : RDVs passés (closedate <= now)
  const now = new Date()
  const hsDeals = allDeals.filter(d => {
    if (!d.properties.closedate) return false
    return new Date(d.properties.closedate) <= now
  })
  if (hsDeals.length === 0) return NextResponse.json([])

  const dealIds = hsDeals.map(d => d.id)

  // Retrouver les appointments Supabase correspondants
  const db = createServiceClient()
  const { data: appointments } = await db
    .from('rdv_appointments')
    .select(`
      *,
      telepro:telepro_id (id, name)
    `)
    .in('hubspot_deal_id', dealIds)

  const apptByDealId = new Map((appointments ?? []).map(a => [a.hubspot_deal_id as string, a]))

  // Mapping clés HubSpot → labels lisibles
  const HS_FORMATION_MAP: Record<string, string> = {
    'PAS': 'PASS', 'LAS': 'LAS', 'P-1': 'P-1', 'P-2': 'P-2',
    'APES0': 'APES0', 'LAS 2 UPEC': 'LAS 2 UPEC', 'LAS 3 UPEC': 'LAS 3 UPEC',
  }

  function getFormation(deal: typeof hsDeals[0]): string | null {
    const raw = deal.properties.diploma_sante___formation
    if (raw) return HS_FORMATION_MAP[raw] ?? raw
    return parseFormationFromDesc(deal.properties.description) || null
  }

  function parseFormationFromDesc(desc: string | undefined): string | null {
    if (!desc) return null
    const match = desc.match(/Formation souhait[ée]+\s*:\s*([^\n]+)/i)
    return match ? match[1].trim() : null
  }

  // Construire les résultats
  const result = hsDeals.map(deal => {
    const stageInfo = STAGE_LABELS[deal.properties.dealstage]
      ?? { label: deal.properties.dealstage ?? '—', color: '#8b8fa8' }
    const appt = apptByDealId.get(deal.id)

    if (appt) {
      return {
        ...appt,
        formation_type: appt.formation_type ?? getFormation(deal),
        hs_stage: deal.properties.dealstage ?? null,
        hs_stage_label: stageInfo.label,
        hs_stage_color: stageInfo.color,
      }
    }

    // Pas de match Supabase : données HubSpot seules
    const dealname = deal.properties.dealname ?? ''
    const prospectName = dealname.replace(/^RDV Découverte — /i, '').trim() || dealname
    const closedateStr = deal.properties.closedate
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
      formation_type: getFormation(deal),
      meeting_type: null,
      meeting_link: null,
      source: 'closer',
      classe_actuelle: null,
      departement: null,
      telepro: null,
      hs_stage: deal.properties.dealstage ?? null,
      hs_stage_label: stageInfo.label,
      hs_stage_color: stageInfo.color,
    }
  })

  // Trier par date décroissante
  result.sort((a, b) => b.start_at.localeCompare(a.start_at))

  return NextResponse.json(result)
}
