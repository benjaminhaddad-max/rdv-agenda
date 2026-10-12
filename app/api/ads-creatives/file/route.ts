import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'
import { ADS_CREATIVES_BUCKET } from '@/lib/ads-creatives'

/** GET /api/ads-creatives/file?path=…[&name=…][&token=…] — redirige vers une URL signée (1 h), téléchargement sous `name`. */
export async function GET(req: NextRequest) {
  const access = await resolveAdsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const path = req.nextUrl.searchParams.get('path') || ''
  const name = req.nextUrl.searchParams.get('name')
  const { data, error } = await access.db.storage
    .from(ADS_CREATIVES_BUCKET)
    .createSignedUrl(path, 3600, name ? { download: name.split('/').pop() || true } : undefined)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Fichier introuvable' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
