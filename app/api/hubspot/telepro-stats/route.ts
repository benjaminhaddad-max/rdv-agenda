import { NextRequest, NextResponse } from 'next/server'
import { PIPELINE_ID, STAGES } from '@/lib/hubspot'

const BASE_URL = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

async function hubspotSearch(filterGroups: object[], properties: string[], limit = 1) {
  const res = await fetch(`${BASE_URL}/crm/v3/objects/deals/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filterGroups, properties, limit }),
  })
  if (!res.ok) throw new Error(`HubSpot ${res.status}`)
  return res.json()
}

// GET /api/hubspot/telepro-stats?hubspot_owner_id=xxx
export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get('hubspot_owner_id')
  if (!ownerId) return NextResponse.json({ error: 'hubspot_owner_id requis' }, { status: 400 })

  const baseFilters = [
    { propertyName: 'teleprospecteur', operator: 'EQ', value: ownerId },
    { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
  ]

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const positifStages = [STAGES.preinscription, STAGES.inscriptionConfirmee]

  try {
    const [total, thisMonth, positifs, aVenir] = await Promise.all([
      // Total placés
      hubspotSearch([{ filters: baseFilters }], ['dealname'], 1),

      // Ce mois (créés depuis le 1er du mois)
      hubspotSearch([{
        filters: [
          ...baseFilters,
          { propertyName: 'createdate', operator: 'GTE', value: String(startOfMonth) },
        ],
      }], ['dealname'], 1),

      // Positifs (preinscription ou inscription confirmée)
      hubspotSearch(
        positifStages.map(stage => ({
          filters: [
            ...baseFilters,
            { propertyName: 'dealstage', operator: 'EQ', value: stage },
          ],
        })),
        ['dealname'],
        1
      ),

      // À venir (closedate dans le futur, stade rdvPris)
      hubspotSearch([{
        filters: [
          ...baseFilters,
          { propertyName: 'dealstage', operator: 'EQ', value: STAGES.rdvPris },
          { propertyName: 'closedate', operator: 'GTE', value: String(now.getTime()) },
        ],
      }], ['dealname'], 1),
    ])

    return NextResponse.json({
      total: total.total ?? 0,
      thisMonth: thisMonth.total ?? 0,
      positifs: positifs.total ?? 0,
      aVenir: aVenir.total ?? 0,
    })
  } catch (e) {
    console.error('HubSpot telepro stats error:', e)
    return NextResponse.json({ error: 'Erreur HubSpot' }, { status: 500 })
  }
}
