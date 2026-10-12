import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'
import { ADS_CREATIVES_BUCKET } from '@/lib/ads-creatives'

/**
 * GET /api/ads-creatives/file?path=…[&name=…][&w=…][&token=…] — redirige vers une URL signée (1 h) :
 * téléchargement sous `name`, sinon affichage ; `w` = miniature d'image redimensionnée (aperçus).
 */
export async function GET(req: NextRequest) {
  const access = await resolveAdsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const path = req.nextUrl.searchParams.get('path') || ''
  const name = req.nextUrl.searchParams.get('name')
  const width = Math.min(1200, Math.max(0, Number(req.nextUrl.searchParams.get('w')) || 0))
  const { data, error } = await access.db.storage
    .from(ADS_CREATIVES_BUCKET)
    .createSignedUrl(path, 3600, name
      ? { download: name.split('/').pop() || true }
      : width ? { transform: { width, height: width, resize: 'contain' } } : undefined)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Fichier introuvable' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
