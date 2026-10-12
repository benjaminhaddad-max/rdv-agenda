import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'
import { ADS_CREATIVES_BUCKET, CREATIVE_ROLES, type CreativeRole } from '@/lib/ads-creatives'

/**
 * POST /api/ads-creatives/items — { token?, event_id, role, kind: 'link'|'file', url?, path?, label?, size?, added_by? }
 * DELETE /api/ads-creatives/items?id=…[&token=…]
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const event_id = String(body.event_id || '').trim()
  const role = String(body.role || '') as CreativeRole
  const kind = body.kind === 'file' ? 'file' : 'link'
  if (!event_id || !CREATIVE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'event_id / role invalides' }, { status: 400 })
  }

  let url: string | null = null
  let path: string | null = null
  if (kind === 'link') {
    url = String(body.url || '').trim()
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 400 })
    }
  } else {
    path = String(body.path || '').trim()
    if (!path.startsWith(`${event_id}/`)) return NextResponse.json({ error: 'Fichier invalide' }, { status: 400 })
  }

  const { data, error } = await access.db
    .from('event_ad_creative_items')
    .insert({
      event_id,
      role,
      kind,
      url,
      path,
      label: String(body.label || '').trim().slice(0, 200) || null,
      size: Number(body.size) || null,
      added_by: String(body.added_by || '').trim().slice(0, 80) || null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const access = await resolveAdsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const id = req.nextUrl.searchParams.get('id') || ''
  const { data, error } = await access.db.from('event_ad_creative_items').delete().eq('id', id).select('path').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data?.path) await access.db.storage.from(ADS_CREATIVES_BUCKET).remove([data.path])
  return NextResponse.json({ ok: true })
}
