/**
 * POST /api/visio/token — génère un token LiveKit pour rejoindre une room.
 *
 * Body JSON :
 *   { room: "rdv-xxx", name: "Marie Dupont", identity?: "user-uuid-or-email" }
 *
 * Pas d'authentification requise — la room name elle-même est le "secret"
 * (12 chars aléatoires, partagés uniquement entre commercial et lead).
 * Pour durcir : ajouter un check sur la base que la room existe et n'est pas
 * expirée. Pour l'instant on garde simple.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateAccessToken, getLivekitWsUrl } from '@/lib/livekit'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function POST(req: NextRequest) {
  let body: { room?: string; name?: string; identity?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const room = (body.room || '').trim()
  const name = (body.name || 'Invité').trim().slice(0, 80) || 'Invité'
  const identity = (body.identity || '').trim() || `guest-${Math.random().toString(36).slice(2, 10)}`

  // Valide le nom de room : "rdv-" + 12 chars alphanumeric (ou format souple)
  if (!room || !/^[a-z0-9-]{4,64}$/i.test(room)) {
    return NextResponse.json({ error: 'Invalid room name' }, { status: 400 })
  }

  try {
    const token = await generateAccessToken(room, name, identity)
    return NextResponse.json({
      token,
      url: getLivekitWsUrl(),
      room,
      identity,
      name,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Token generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
