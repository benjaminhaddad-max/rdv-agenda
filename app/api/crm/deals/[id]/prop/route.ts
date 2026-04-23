import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

/**
 * PATCH /api/crm/deals/[id]/prop
 * Body: { property: string, value: string }
 * Écrit Supabase en priorité, mirror HubSpot optionnel.
 */

const KNOWN_COLUMNS: Record<string, string> = {
  dealname:                     'dealname',
  dealstage:                    'dealstage',
  pipeline:                     'pipeline',
  hubspot_owner_id:             'hubspot_owner_id',
  teleprospecteur:              'teleprospecteur',
  closedate:                    'closedate',
  createdate:                   'createdate',
  description:                  'description',
  'diploma_sante___formation':  'formation',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: dealId } = await params
  const { property, value } = await req.json()

  if (!property || typeof property !== 'string') {
    return NextResponse.json({ error: 'property manquant' }, { status: 400 })
  }

  const col = KNOWN_COLUMNS[property]
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { synced_at: now }

  if (col) {
    // Conversion dates HubSpot → ISO
    if ((col === 'closedate' || col === 'createdate') && value) {
      const d = new Date(value)
      update[col] = isNaN(d.getTime()) ? value : d.toISOString()
    } else {
      update[col] = value === '' ? null : value
    }
  }

  const { data: existing } = await db
    .from('crm_deals')
    .select('hubspot_raw')
    .eq('hubspot_deal_id', dealId)
    .maybeSingle()

  if (existing !== null) {
    const raw = (existing as { hubspot_raw?: Record<string, unknown> })?.hubspot_raw ?? {}
    update.hubspot_raw = { ...raw, [property]: value }
  }

  const { error: updateErr } = await db
    .from('crm_deals')
    .update(update)
    .eq('hubspot_deal_id', dealId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const mirrorEnabled = process.env.HUBSPOT_MIRROR_ENABLED !== '0'
  let hubspotError: string | null = null

  if (mirrorEnabled) {
    try {
      await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          properties: { [property]: value ?? '' },
        }),
      })
    } catch (e) {
      hubspotError = e instanceof Error ? e.message : String(e)
      console.error('[crm/deals/[id]/prop] mirror HubSpot failed:', hubspotError)
    }
  }

  return NextResponse.json({ ok: true, hubspot_mirrored: mirrorEnabled && !hubspotError, hubspot_error: hubspotError })
}
