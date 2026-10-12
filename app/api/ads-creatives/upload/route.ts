import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'
import { ADS_CREATIVES_BUCKET, ADS_CREATIVES_MAX_FILE_BYTES } from '@/lib/ads-creatives'

/**
 * POST /api/ads-creatives/upload — { token?, event_id, fileName, size }
 * URL d'upload signée : le navigateur envoie le fichier directement à Supabase Storage.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const eventId = String(body.event_id || '').replace(/[^a-zA-Z0-9-]/g, '')
  if (!eventId) return NextResponse.json({ error: 'event_id manquant' }, { status: 400 })
  if ((Number(body.size) || 0) > ADS_CREATIVES_MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Fichier trop lourd (500 Mo max) — mets plutôt un lien Drive / WeTransfer' }, { status: 400 })
  }
  const safeName = String(body.fileName || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'fichier'
  const path = `${eventId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`

  const { data, error } = await access.db.storage.from(ADS_CREATIVES_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Upload impossible' }, { status: 500 })
  return NextResponse.json({ path, token: data.token })
}
