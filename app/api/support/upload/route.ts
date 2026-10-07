import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUser } from '@/lib/api-auth'
import { SUPPORT_BUCKET, SUPPORT_MAX_FILE_BYTES } from '@/lib/support'

/**
 * POST /api/support/upload — { fileName, size }
 * Renvoie une URL d'upload signée : le navigateur envoie le fichier directement à Supabase Storage
 * (pas de limite de body Vercel pour les vidéos / notes vocales).
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const { ctx } = auth

  const body = await req.json().catch(() => ({}))
  const size = Number(body.size) || 0
  if (size > SUPPORT_MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Fichier trop lourd (50 Mo max)' }, { status: 400 })
  }
  const safeName = String(body.fileName || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'fichier'
  const path = `${ctx.appUserId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`

  const db = createServiceClient()
  const { data, error } = await db.storage.from(SUPPORT_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Upload impossible' }, { status: 500 })

  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl })
}
