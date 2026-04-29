import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchUserProfile,
  fetchUserPages,
  metaConfigured,
} from '@/lib/meta'

/**
 * GET /api/meta/oauth/callback
 * Reçoit le code OAuth après l'autorisation FB et stocke les page tokens.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const origin = req.nextUrl.origin

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorDesc = searchParams.get('error_description') || searchParams.get('error')

  if (errorDesc) {
    return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=${encodeURIComponent(errorDesc)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=missing_code`)
  }
  if (!metaConfigured()) {
    return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=not_configured`)
  }

  // Vérif CSRF
  const cookieState = req.cookies.get('meta_oauth_state')?.value
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=invalid_state`)
  }

  try {
    const redirectUri = `${origin}/api/meta/oauth/callback`

    // 1. Code → short-lived user token
    const shortToken = (await exchangeCodeForUserToken(code, redirectUri)).access_token
    // 2. Short-lived → long-lived (~60 jours)
    const userToken = await exchangeForLongLivedUserToken(shortToken)

    // 3. Profil user
    const profile = await fetchUserProfile(userToken)

    // 4. Pages dont l'user est admin (avec page tokens long-lived)
    const pages = await fetchUserPages(userToken)

    if (pages.length === 0) {
      return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=no_pages`)
    }

    // 5. Upsert chaque page
    const db = createServiceClient()
    for (const p of pages) {
      await db.from('meta_lead_pages').upsert({
        page_id: p.id,
        page_name: p.name,
        access_token: p.access_token,
        user_id: profile.id,
        user_name: profile.name,
        active: true,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'page_id' })
    }

    const res = NextResponse.redirect(`${origin}/admin/crm/meta-ads?connected=${pages.length}`)
    res.cookies.delete('meta_oauth_state')
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=${encodeURIComponent(msg)}`)
  }
}
