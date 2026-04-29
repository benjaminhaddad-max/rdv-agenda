import { NextRequest, NextResponse } from 'next/server'
import { buildOauthStartUrl, metaConfigured } from '@/lib/meta'

/**
 * GET /api/meta/oauth/start
 * Redirige l'utilisateur vers Facebook pour le flow OAuth.
 */
export async function GET(req: NextRequest) {
  if (!metaConfigured()) {
    return NextResponse.json({ error: 'META_APP_ID / META_APP_SECRET non configurés' }, { status: 500 })
  }
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/meta/oauth/callback`
  // CSRF state
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const url = buildOauthStartUrl(redirectUri, state)
  // On stocke le state en cookie httpOnly pour vérification au callback
  const res = NextResponse.redirect(url)
  res.cookies.set('meta_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  })
  return res
}
