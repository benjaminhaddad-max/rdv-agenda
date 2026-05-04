import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchUserProfile,
  fetchUserPages,
  fetchUserAdAccounts,
  metaConfigured,
} from '@/lib/meta'
import { logger } from '@/lib/logger'

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

    // 4bis. Ad accounts (Business Manager) — best-effort, ne bloque pas si echoue
    let adAccounts: Awaited<ReturnType<typeof fetchUserAdAccounts>> = []
    try {
      adAccounts = await fetchUserAdAccounts(userToken)
    } catch (e) {
      logger.error('meta-oauth-fetch-ad-accounts', e, { user_id: profile.id })
    }

    if (pages.length === 0 && adAccounts.length === 0) {
      return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=no_pages`)
    }

    // 5. Upsert chaque page
    const db = createServiceClient()
    const nowIso = new Date().toISOString()
    for (const p of pages) {
      await db.from('meta_lead_pages').upsert({
        page_id: p.id,
        page_name: p.name,
        access_token: p.access_token,
        user_id: profile.id,
        user_name: profile.name,
        active: true,
        connected_at: nowIso,
      }, { onConflict: 'page_id' })
    }

    // 5bis. Upsert chaque ad account (ignore si la table n'existe pas encore)
    for (const a of adAccounts) {
      try {
        await db.from('meta_ad_accounts').upsert({
          account_id: a.account_id,
          name: a.name,
          currency: a.currency || null,
          timezone_name: a.timezone_name || null,
          business_id: a.business?.id || null,
          business_name: a.business?.name || null,
          user_id: profile.id,
          user_name: profile.name,
          access_token: userToken,
          active: true,
          connected_at: nowIso,
        }, { onConflict: 'account_id' })
      } catch (e) {
        logger.error('meta-oauth-upsert-ad-account', e, { account_id: a.account_id, name: a.name })
      }
    }

    const totalConnected = pages.length + adAccounts.length
    const res = NextResponse.redirect(
      `${origin}/admin/crm/meta-ads?connected=${pages.length}&adaccounts=${adAccounts.length}&total=${totalConnected}`
    )
    res.cookies.delete('meta_oauth_state')
    return res
  } catch (e) {
    logger.error('meta-oauth-callback', e)
    await logger.flush()
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.redirect(`${origin}/admin/crm/meta-ads?error=${encodeURIComponent(msg)}`)
  }
}
