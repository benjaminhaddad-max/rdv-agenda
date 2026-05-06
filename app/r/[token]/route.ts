import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /r/[token] — redirection trackee pour les campagnes SMS.
 *
 * Look up le token dans sms_campaign_link_tokens. Si trouve :
 *  1. Insert un row dans sms_campaign_link_clicks (log brut)
 *  2. Update le compteur agrege (click_count, first/last_clicked_at)
 *  3. 302 redirect vers original_url
 *
 * Robuste face aux scrappers de previews (WhatsApp, iMessage) : on enregistre
 * quand meme le clic. On pourrait filtrer par user-agent mais on garde simple.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || !/^[A-Za-z0-9_-]{6,32}$/.test(token)) {
    return new NextResponse('Lien invalide', { status: 400 })
  }

  const db = createServiceClient()

  const { data: row, error } = await db
    .from('sms_campaign_link_tokens')
    .select('id, original_url, click_count, first_clicked_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !row || !row.original_url) {
    return new NextResponse('Lien introuvable ou expire.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const ip =
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  const userAgent = req.headers.get('user-agent') || null
  const now = new Date().toISOString()

  // Tracking : on attend les writes pour eviter qu'ils soient tronques par
  // Vercel apres la redirection. Cout ~50ms, l'utilisateur ne voit que la
  // redirection finale.
  await Promise.all([
    db
      .from('sms_campaign_link_clicks')
      .insert({ token_id: row.id, ip, user_agent: userAgent }),
    db
      .from('sms_campaign_link_tokens')
      .update({
        click_count: (row.click_count ?? 0) + 1,
        first_clicked_at: row.first_clicked_at ?? now,
        last_clicked_at: now,
      })
      .eq('id', row.id),
  ])

  // Sanity : on s'assure d'avoir un schema http(s)
  let target = row.original_url.trim()
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target

  return NextResponse.redirect(target, 302)
}
