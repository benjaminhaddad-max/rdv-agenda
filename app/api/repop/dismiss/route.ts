/**
 * POST /api/repop/dismiss
 *
 * Marque un repop comme "traité" pour le masquer de la liste.
 * Ajoute une note HubSpot sur le deal ou le contact.
 *
 * Body:
 *   { type: 'deal', hubspot_deal_id: string }   — repop avec transaction
 *   { type: 'orphan', contact_id: string }       — repop sans transaction
 *
 * GET /api/repop/dismiss
 *   Retourne la liste des IDs dismissés { deals: string[], contacts: string[] }
 *
 * TABLE SQL (à créer dans Supabase si elle n'existe pas) :
 *   CREATE TABLE IF NOT EXISTS rdv_repop_dismissed (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     type text NOT NULL CHECK (type IN ('deal', 'orphan')),
 *     hubspot_id text NOT NULL,
 *     dismissed_at timestamptz DEFAULT now(),
 *     dismissed_by text,
 *     UNIQUE (type, hubspot_id)
 *   );
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, hubspot_deal_id, contact_id, dismissed_by } = body

    if (type === 'deal' && !hubspot_deal_id) {
      return NextResponse.json({ error: 'hubspot_deal_id required' }, { status: 400 })
    }
    if (type === 'orphan' && !contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 })
    }

    const hubspotId = type === 'deal' ? hubspot_deal_id : contact_id

    // 1. Save to Supabase
    const db = createServiceClient()
    const { error } = await db
      .from('rdv_repop_dismissed')
      .upsert(
        { type, hubspot_id: hubspotId, dismissed_by: dismissed_by || null },
        { onConflict: 'type,hubspot_id' }
      )

    if (error) {
      console.error('[dismiss] Supabase error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Add HubSpot note
    const now = format(new Date(), "d MMMM yyyy 'à' HH'h'mm", { locale: fr })
    const noteBody = `✅ REPOP TRAITÉ — ${now}\n\nCe repop a été marqué comme traité dans RDV Agenda.`

    try {
      if (type === 'deal') {
        await hubspotFetch('/engagements/v1/engagements', {
          method: 'POST',
          body: JSON.stringify({
            engagement: { active: true, type: 'NOTE' },
            associations: { dealIds: [Number(hubspotId)] },
            metadata: { body: noteBody },
          }),
        })
      } else {
        await hubspotFetch('/engagements/v1/engagements', {
          method: 'POST',
          body: JSON.stringify({
            engagement: { active: true, type: 'NOTE' },
            associations: { contactIds: [Number(hubspotId)] },
            metadata: { body: noteBody },
          }),
        })
      }
    } catch {
      // Note failure is non-blocking
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_repop_dismissed')
    .select('type, hubspot_id')

  if (error) {
    // Table might not exist yet — return empty
    return NextResponse.json({ deals: [], contacts: [] })
  }

  const deals = (data ?? []).filter(d => d.type === 'deal').map(d => d.hubspot_id)
  const contacts = (data ?? []).filter(d => d.type === 'orphan').map(d => d.hubspot_id)

  return NextResponse.json({ deals, contacts })
}
