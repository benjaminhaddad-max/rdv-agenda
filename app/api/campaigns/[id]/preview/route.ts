import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { previewCampaignRecipients, type FilterShape } from '@/lib/campaign-recipients'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/campaigns/[id]/preview
 *
 * Body (optionnel) — si fourni, on prévisualise avec ces valeurs au lieu de
 * celles enregistrées sur la campagne en DB. Permet à l'UI de tester un
 * filtre AVANT de sauvegarder :
 *   {
 *     segment_ids?: string[]
 *     extra_filters?: object
 *     manual_contact_ids?: string[]
 *     sample_size?: number  // défaut 5
 *   }
 *
 * Retourne :
 *   { total: number, sample: ResolvedRecipient[] }
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  // Charge la campagne pour récupérer les valeurs par défaut
  const { data: campaign, error: cErr } = await db
    .from('email_campaigns')
    .select('segment_ids, extra_filters, manual_contact_ids')
    .eq('id', id)
    .single()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const segment_ids       = (body.segment_ids        ?? campaign.segment_ids        ?? []) as string[]
  const extra_filters     = (body.extra_filters      ?? campaign.extra_filters      ?? null) as FilterShape | null
  const manual_contact_ids = (body.manual_contact_ids ?? campaign.manual_contact_ids ?? []) as string[]
  const sampleSize = typeof body.sample_size === 'number' ? Math.max(1, Math.min(50, body.sample_size)) : 5

  try {
    const result = await previewCampaignRecipients(
      db,
      { segment_ids, extra_filters, manual_contact_ids },
      sampleSize,
    )
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
