import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

// POST /api/crm/deals/revert
// Revert les deals qui ont été déplacés par erreur
// Body: { dealIds: string[], originalStage: string }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { dealIds, originalStage } = body as { dealIds: string[]; originalStage: string }

  if (!Array.isArray(dealIds) || dealIds.length === 0 || !originalStage) {
    return NextResponse.json({ error: 'dealIds (array) et originalStage requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const errors: string[] = []

  // Revert Supabase en batch
  const { error: dbErr } = await db
    .from('crm_deals')
    .update({ dealstage: originalStage, synced_at: new Date().toISOString() })
    .in('hubspot_deal_id', dealIds)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  // Revert HubSpot — best-effort, un par un
  for (const dealId of dealIds) {
    try {
      await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: { dealstage: originalStage } }),
      })
    } catch (e) {
      errors.push(`${dealId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    reverted: dealIds.length,
    hubspot_errors: errors.length > 0 ? errors : null,
  })
}
