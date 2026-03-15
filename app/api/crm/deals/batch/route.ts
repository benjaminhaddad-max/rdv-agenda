import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { updateDealStage, STAGES, hubspotFetch } from '@/lib/hubspot'

// PATCH /api/crm/deals/batch
// Met à jour l'étape de plusieurs deals en une seule requête
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { dealIds, dealstage } = body as { dealIds: string[]; dealstage: string }

  if (!Array.isArray(dealIds) || dealIds.length === 0 || !dealstage) {
    return NextResponse.json({ error: 'dealIds (array) et dealstage requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const errors: string[] = []
  let updated = 0

  // Mise à jour Supabase en batch
  const { error: dbErr } = await db
    .from('crm_deals')
    .update({ dealstage, synced_at: new Date().toISOString() })
    .in('hubspot_deal_id', dealIds)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  // Sync HubSpot — best-effort, un par un
  const stageKey = (Object.entries(STAGES) as [string, string][])
    .find(([, v]) => v === dealstage)?.[0] as keyof typeof STAGES | undefined

  for (const dealId of dealIds) {
    try {
      if (stageKey) {
        await updateDealStage(dealId, stageKey)
      } else {
        // Fallback : PATCH direct via API HubSpot
        await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: { dealstage } }),
        })
      }
      updated++
    } catch (e) {
      errors.push(`${dealId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    updated,
    total: dealIds.length,
    hubspot_errors: errors.length > 0 ? errors : null,
  })
}
