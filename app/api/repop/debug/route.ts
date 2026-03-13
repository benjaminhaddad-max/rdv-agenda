/**
 * GET /api/repop/debug
 * Endpoint de diagnostic — retourne les stats intermédiaires pour comprendre
 * pourquoi le journal des repop est vide.
 */
import { NextResponse } from 'next/server'
import {
  searchDealsByStages,
  getDealContactInfo,
  PIPELINE_2026_2027,
  STAGES,
} from '@/lib/hubspot'

export async function GET() {
  const targetStages = [STAGES.aReplanifier, STAGES.delaiReflexion]

  // Étape 1 : récupérer les deals dans les stages cibles
  let deals: Awaited<ReturnType<typeof searchDealsByStages>> = []
  let dealsError: string | null = null
  try {
    deals = await searchDealsByStages(PIPELINE_2026_2027, targetStages)
  } catch (e) {
    dealsError = String(e)
  }

  if (deals.length === 0) {
    return NextResponse.json({
      step: 'searchDealsByStages',
      dealsFound: 0,
      dealsError,
      pipelineId: PIPELINE_2026_2027,
      stages: targetStages,
      message: 'Aucun deal trouvé dans ces stages. Vérifier les IDs de stage et pipeline.',
    })
  }

  // Étape 2 : récupérer les contacts des 10 premiers deals (pour ne pas saturer)
  const sampleDeals = deals.slice(0, 10)
  const contactResults = await Promise.all(
    sampleDeals.map(async (deal) => {
      try {
        const contact = await getDealContactInfo(deal.id)
        const repopMs = contact?.properties.recent_conversion_date
          ? Number(contact.properties.recent_conversion_date)
          : null
        const closedateMs = deal.properties.closedate
          ? new Date(
              deal.properties.closedate.includes('T')
                ? deal.properties.closedate
                : `${deal.properties.closedate}T00:00:00.000Z`
            ).getTime()
          : null

        return {
          dealId: deal.id,
          dealName: deal.properties.dealname,
          dealStage: deal.properties.dealstage,
          closedate: deal.properties.closedate,
          closedateMs,
          hasContact: !!contact,
          contactEmail: contact?.properties.email ?? null,
          recent_conversion_date: contact?.properties.recent_conversion_date ?? null,
          recent_conversion_event_name: contact?.properties.recent_conversion_event_name ?? null,
          repopMs,
          hasRepop: repopMs !== null && closedateMs !== null && repopMs > closedateMs,
          repopDiff: repopMs && closedateMs ? `repop=${new Date(repopMs).toISOString()} vs rdv=${new Date(closedateMs).toISOString()}` : 'N/A',
        }
      } catch (e) {
        return { dealId: deal.id, error: String(e) }
      }
    })
  )

  const withContact = contactResults.filter(r => 'hasContact' in r && r.hasContact)
  const withRepopDate = contactResults.filter(r => 'recent_conversion_date' in r && r.recent_conversion_date)
  const withRepop = contactResults.filter(r => 'hasRepop' in r && r.hasRepop)

  return NextResponse.json({
    step: 'full_debug',
    pipelineId: PIPELINE_2026_2027,
    stages: { aReplanifier: STAGES.aReplanifier, delaiReflexion: STAGES.delaiReflexion },
    totalDealsInStages: deals.length,
    sampleSize: sampleDeals.length,
    sampleStats: {
      withContact: withContact.length,
      withRecentConversionDate: withRepopDate.length,
      withRepop: withRepop.length,
    },
    sampleDetails: contactResults,
  })
}
