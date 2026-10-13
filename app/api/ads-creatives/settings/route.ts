import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { ADS_BRANDS } from '@/lib/ads-creatives'

/**
 * PUT /api/ads-creatives/settings — responsables, relances (CRM).
 *   { delays: { medibox: { launch_days, webinar_launch_days, creas_days, end_days, guide_creas_days } } } → délais par marque
 *   { regenerate_token: true } → nouveau lien partagé
 */
export async function PUT(req: NextRequest) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() }
  for (const k of ['campaign_days', 'lead_days'] as const) {
    if (k in body) {
      const n = Math.round(Number(body[k]))
      if (!Number.isFinite(n) || n < 0 || n > 120) return NextResponse.json({ error: `${k} invalide` }, { status: 400 })
      patch[k] = n
    }
  }
  for (const k of ['static_owner_name', 'static_owner_phone', 'video_owner_name', 'video_owner_phone', 'ads_owner_name', 'ads_owner_phone'] as const) {
    if (k in body) patch[k] = String(body[k] || '').trim().slice(0, 80) || null
  }
  if ('reminders_enabled' in body) patch.reminders_enabled = !!body.reminders_enabled
  if (body.regenerate_token) patch.share_token = crypto.randomUUID().replace(/-/g, '')

  const db = createServiceClient()
  if (body.delays && typeof body.delays === 'object') {
    for (const brand of ADS_BRANDS) {
      const d = body.delays[brand]
      if (!d) continue
      const row: Record<string, unknown> = { brand, updated_at: new Date().toISOString() }
      for (const k of ['launch_days', 'webinar_launch_days', 'creas_days', 'end_days', 'guide_creas_days'] as const) {
        if (d[k] == null) continue
        const n = Math.round(Number(d[k]))
        if (!Number.isFinite(n) || n < 0 || n > 120) return NextResponse.json({ error: `${brand} ${k} invalide` }, { status: 400 })
        row[k] = n
      }
      const { error } = await db.from('ads_brand_settings').upsert(row, { onConflict: 'brand' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  const { error } = await db.from('ads_creatives_settings').upsert(patch, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
