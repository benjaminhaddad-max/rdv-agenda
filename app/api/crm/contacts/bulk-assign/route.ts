import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const { contact_ids, teleprospecteur }: { contact_ids: string[]; teleprospecteur: string } = await req.json()

  if (!contact_ids?.length || !teleprospecteur) {
    return NextResponse.json({ error: 'contact_ids and teleprospecteur required' }, { status: 400 })
  }

  let done = 0
  const errors: string[] = []

  // Process in batches of 20 to avoid rate limits
  const BATCH = 20
  for (let i = 0; i < contact_ids.length; i += BATCH) {
    const chunk = contact_ids.slice(i, i + BATCH)

    // Get their deals
    const { data: deals } = await db.from('crm_deals').select('hubspot_deal_id, hubspot_contact_id').in('hubspot_contact_id', chunk)

    // Update deals in Supabase
    if (deals && deals.length > 0) {
      await db.from('crm_deals').update({ teleprospecteur, synced_at: new Date().toISOString() }).in('hubspot_contact_id', chunk)

      // Update HubSpot deals in parallel batches
      await Promise.allSettled(deals.map(deal =>
        hubspotFetch(`/crm/v3/objects/deals/${deal.hubspot_deal_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: { teleprospecteur } }),
        }).catch((e: Error) => errors.push(`deal ${deal.hubspot_deal_id}: ${e.message}`))
      ))
    }

    done += chunk.length
  }

  return NextResponse.json({ ok: true, done, errors: errors.length > 0 ? errors : undefined })
}
