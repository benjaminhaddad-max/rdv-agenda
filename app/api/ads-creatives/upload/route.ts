import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'
import { ADS_CREATIVES_BUCKET, ADS_CREATIVES_MAX_FOLDER_BYTES } from '@/lib/ads-creatives'

/**
 * POST /api/ads-creatives/upload — { token?, campaign_id, folder, fileName, size }
 * Token d'upload signé : le navigateur envoie le fichier directement à Supabase Storage
 * (upload reprenable TUS, header x-signature) — pas de limite de body Vercel.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const eventId = String(body.campaign_id || body.event_id || '').replace(/[^a-zA-Z0-9-]/g, '')
  if (!eventId) return NextResponse.json({ error: 'campaign_id manquant' }, { status: 400 })
  if ((Number(body.size) || 0) > ADS_CREATIVES_MAX_FOLDER_BYTES) {
    return NextResponse.json({ error: 'Fichier trop lourd (10 Go max)' }, { status: 400 })
  }
  // Un dépôt = un sous-dossier unique ; on garde l'arborescence relative du dossier.
  const folder = String(body.folder || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `${Date.now()}`
  const safeName = String(body.fileName || 'fichier')
    .split('/')
    .map((part) => part.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120))
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/') || 'fichier'
  const path = `${eventId}/${folder}/${safeName}`

  const { data, error } = await access.db.storage.from(ADS_CREATIVES_BUCKET).createSignedUploadUrl(path, { upsert: true })
  if (error || !data) return NextResponse.json({ error: error?.message || 'Upload impossible' }, { status: 500 })
  return NextResponse.json({ path, token: data.token })
}
