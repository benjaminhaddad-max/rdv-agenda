import { NextResponse } from 'next/server'
import { getDeal, getDealEngagements, getDealContactInfo, updateDealStage, STAGES, PIPELINE_2026_2027 } from '@/lib/hubspot'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  [STAGES.aReplanifier]:         { label: 'À replanifier',        color: '#f97316' },
  [STAGES.rdvPris]:              { label: 'RDV Pris',             color: '#6b87ff' },
  [STAGES.delaiReflexion]:       { label: 'Délai de réflexion',   color: '#eab308' },
  [STAGES.preinscription]:       { label: 'Pré-inscription',      color: '#a855f7' },
  [STAGES.finalisation]:         { label: 'Finalisation',         color: '#14b8a6' },
  [STAGES.inscriptionConfirmee]: { label: 'Inscrit ✓',           color: '#22c55e' },
  [STAGES.fermePerdu]:           { label: 'Fermé / Perdu',        color: '#ef4444' },
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const [deal, engagements, contactInfo] = await Promise.all([
    getDeal(id),
    getDealEngagements(id),
    getDealContactInfo(id),
  ])

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const stageInfo = STAGE_LABELS[deal.dealstage] ?? { label: deal.dealstage, color: '#8b8fa8' }

  return NextResponse.json({
    stage: deal.dealstage,
    stageLabel: stageInfo.label,
    stageColor: stageInfo.color,
    pipeline: deal.pipeline,
    isCorrectPipeline: deal.pipeline === PIPELINE_2026_2027,
    closedate: deal.closedate,
    engagements: engagements
      .map(e => ({
        id: e.engagement.id,
        type: e.engagement.type,
        createdAt: e.engagement.createdAt,
        body: e.metadata?.body ?? null,
        direction: e.metadata?.direction ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt),
    contact: contactInfo ? {
      email: contactInfo.properties.email ?? null,
      phone: contactInfo.properties.phone ?? null,
      firstname: contactInfo.properties.firstname ?? null,
      lastname: contactInfo.properties.lastname ?? null,
      classe_actuelle: contactInfo.properties.classe_actuelle ?? null,
      departement: contactInfo.properties.departement ?? null,
      formation: contactInfo.properties.diploma_sante___formation_demandee ?? null,
    } : null,
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { stage } = await req.json() as { stage: keyof typeof STAGES }
  if (!stage || !(stage in STAGES)) {
    return NextResponse.json({ error: 'stage invalide' }, { status: 400 })
  }
  try {
    await updateDealStage(id, stage)
    const stageInfo = STAGE_LABELS[STAGES[stage]] ?? { label: String(stage), color: '#8b8fa8' }
    return NextResponse.json({ ok: true, stageLabel: stageInfo.label, stageColor: stageInfo.color })
  } catch (e) {
    console.error('updateDealStage error:', e)
    return NextResponse.json({ error: 'Erreur HubSpot' }, { status: 500 })
  }
}
