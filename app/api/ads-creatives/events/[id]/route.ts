import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'

/** PATCH /api/ads-creatives/events/[id] — { launched?, by?, notes?, no_campaign?, campaign_start? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const patch: Record<string, unknown> = { event_id: id, updated_at: new Date().toISOString() }
  // Lien partagé : note + coche « en ligne » ; le reste est réservé au CRM.
  if ('notes' in body) patch.notes = String(body.notes || '').slice(0, 2000) || null
  // Coche « campagne en ligne » (colonne Ads Manager)
  if ('launched' in body) {
    patch.launched_at = body.launched ? new Date().toISOString() : null
    patch.launched_by = body.launched ? String(body.by || '').trim().slice(0, 80) || null : null
  }
  if (access.crm) {
    if ('no_campaign' in body) patch.no_campaign = !!body.no_campaign
    if ('campaign_start' in body) {
      const v = String(body.campaign_start || '')
      patch.campaign_start = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
    }
  }
  const { error } = await access.db.from('event_ad_creatives').upsert(patch, { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
