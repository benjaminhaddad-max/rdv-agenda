import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'
import { ADS_CREATIVES_BUCKET } from '@/lib/ads-creatives'

/** GET /api/ads-creatives/file?path=…[&token=…] — redirige vers une URL signée (1 h). */
export async function GET(req: NextRequest) {
  const access = await resolveAdsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const path = req.nextUrl.searchParams.get('path') || ''
  const { data, error } = await access.db.storage.from(ADS_CREATIVES_BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Fichier introuvable' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
