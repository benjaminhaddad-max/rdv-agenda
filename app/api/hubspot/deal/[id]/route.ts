import { NextResponse } from 'next/server'
import { getDeal, getDealEngagements, STAGES, PIPELINE_2026_2027 } from '@/lib/hubspot'

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
  const [deal, engagements] = await Promise.all([
    getDeal(id),
    getDealEngagements(id),
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
  })
}
