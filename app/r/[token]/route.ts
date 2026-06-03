import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /r/[token] — redirection trackée pour les liens SMS.
 *
 * Deux sources de tokens :
 *  1. sms_campaign_link_tokens : liens des campagnes SMS (1 par destinataire).
 *  2. sms_link_tokens          : liens « hors campagne » (workflow auto, etc.).
 *
 * Dans les deux cas on :
 *  - incrémente le compteur agrégé (click_count, first/last_clicked_at)
 *  - log le clic brut (campagne uniquement → sms_campaign_link_clicks)
 *  - inscrit une activité « Lien cliqué » dans la timeline du contact
 *    (au premier clic seulement, pour éviter le spam)
 *  - 302 redirect vers original_url
 *
 * Robuste face aux scrappers de previews (WhatsApp, iMessage) : on enregistre
 * quand même le clic. On pourrait filtrer par user-agent mais on garde simple.
 */

async function logClickActivity(
  db: SupabaseClient,
  contactId: string | null,
  url: string,
  context: { source: string; sourceId?: string | null },
) {
  if (!contactId) return
  await db.from('crm_activities').insert({
    activity_type:      'note',
    hubspot_contact_id: contactId,
    subject:            'Lien SMS cliqué',
    body:               url,
    direction:          'INCOMING',
    status:             'COMPLETED',
    metadata:           { channel: 'sms', event: 'link_click', ...context },
    occurred_at:        new Date().toISOString(),
  })
}

function clientMeta(req: NextRequest) {
  const ip =
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  const userAgent = req.headers.get('user-agent') || null
  return { ip, userAgent }
}

function redirectTo(rawUrl: string) {
  let target = rawUrl.trim()
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target
  return NextResponse.redirect(target, 302)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || !/^[A-Za-z0-9_-]{6,32}$/.test(token)) {
    return new NextResponse('Lien invalide', { status: 400 })
  }

  const db = createServiceClient()
  const now = new Date().toISOString()

  // ── 1. Token de campagne ──────────────────────────────────────────────────
  const { data: campRow } = await db
    .from('sms_campaign_link_tokens')
    .select('id, original_url, click_count, first_clicked_at, recipient_id, campaign_id')
    .eq('token', token)
    .maybeSingle()

  if (campRow && campRow.original_url) {
    const { ip, userAgent } = clientMeta(req)
    const firstClick = !campRow.first_clicked_at

    let contactId: string | null = null
    if (firstClick && campRow.recipient_id) {
      const { data: rec } = await db
        .from('sms_campaign_recipients')
        .select('hubspot_contact_id')
        .eq('id', campRow.recipient_id)
        .maybeSingle()
      contactId = (rec?.hubspot_contact_id as string | undefined) ?? null
    }

    await Promise.all([
      db.from('sms_campaign_link_clicks').insert({ token_id: campRow.id, ip, user_agent: userAgent }),
      db.from('sms_campaign_link_tokens').update({
        click_count: (campRow.click_count ?? 0) + 1,
        first_clicked_at: campRow.first_clicked_at ?? now,
        last_clicked_at: now,
      }).eq('id', campRow.id),
      firstClick
        ? logClickActivity(db, contactId, campRow.original_url, { source: 'campaign', sourceId: campRow.campaign_id })
        : Promise.resolve(),
    ])

    return redirectTo(campRow.original_url)
  }

  // ── 2. Token générique (workflow, relances, …) ────────────────────────────
  const { data: genRow } = await db
    .from('sms_link_tokens')
    .select('id, original_url, click_count, first_clicked_at, hubspot_contact_id, source, source_id')
    .eq('token', token)
    .maybeSingle()

  if (genRow && genRow.original_url) {
    const firstClick = !genRow.first_clicked_at
    await Promise.all([
      db.from('sms_link_tokens').update({
        click_count: (genRow.click_count ?? 0) + 1,
        first_clicked_at: genRow.first_clicked_at ?? now,
        last_clicked_at: now,
      }).eq('id', genRow.id),
      firstClick
        ? logClickActivity(db, genRow.hubspot_contact_id, genRow.original_url, {
            source: genRow.source ?? 'sms',
            sourceId: genRow.source_id,
          })
        : Promise.resolve(),
    ])

    return redirectTo(genRow.original_url)
  }

  return new NextResponse('Lien introuvable ou expiré.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
