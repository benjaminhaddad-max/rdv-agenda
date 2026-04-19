import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/brevo/webhook — Endpoint pour les événements Brevo
 *
 * Brevo envoie des webhooks pour : delivered, open, click, bounce, spam, unsubscribe
 * Doc : https://developers.brevo.com/docs/transactional-webhooks
 *
 * Payload type :
 * {
 *   event: 'delivered' | 'opened' | 'click' | 'hard_bounce' | 'soft_bounce' | 'spam' | 'unsubscribed' | 'blocked',
 *   email: 'x@y.com',
 *   id: 123456,
 *   date: '2026-04-17 11:42:00',
 *   'message-id': '<abc@brevo.com>',
 *   tag: 'campaign:uuid',
 *   link?: '...'  (pour les clicks)
 *   reason?: '...' (pour bounce)
 * }
 *
 * Note: Brevo peut envoyer un seul événement ou un array. On gère les deux.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const events: Array<Record<string, unknown>> = Array.isArray(body) ? body : [body]
    const db = createServiceClient()

    for (const ev of events) {
      const rawEvent = String(ev.event || '').toLowerCase()
      const email = String(ev.email || '').toLowerCase()
      const messageId = String(ev['message-id'] || ev.messageId || '')
      const tag = String(ev.tag || '')
      const occurredAt = ev.date
        ? new Date(String(ev.date)).toISOString()
        : new Date().toISOString()

      // Normalise le type d'événement
      const eventType = normalizeEventType(rawEvent)

      // Extrait le campaign_id depuis le tag "campaign:<uuid>"
      const campaignMatch = tag.match(/^campaign:([0-9a-f-]{36})/i)
      const campaignId = campaignMatch ? campaignMatch[1] : null

      // Retrouve le destinataire
      let recipientId: string | null = null
      if (campaignId && email) {
        const { data: recipient } = await db
          .from('email_campaign_recipients')
          .select('id')
          .eq('campaign_id', campaignId)
          .eq('email', email)
          .maybeSingle()
        recipientId = recipient?.id || null
      }

      // Enregistre l'événement
      await db.from('email_events').insert({
        campaign_id: campaignId,
        recipient_id: recipientId,
        email,
        event_type: eventType,
        event_data: ev,
        occurred_at: occurredAt,
      })

      // Met à jour le recipient + les compteurs de campagne
      if (recipientId && campaignId) {
        await updateRecipientAndCampaign(db, recipientId, campaignId, eventType, occurredAt)
      }

      // Gestion désabonnement global
      if (eventType === 'unsubscribe') {
        await db.from('email_unsubscribes').upsert(
          {
            email,
            campaign_id: campaignId,
            reason: String(ev.reason || ''),
            unsubscribed_at: occurredAt,
          },
          { onConflict: 'email' }
        )
      }
    }

    return NextResponse.json({ ok: true, processed: events.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

function normalizeEventType(raw: string): string {
  const map: Record<string, string> = {
    delivered: 'delivered',
    opened: 'open',
    open: 'open',
    click: 'click',
    clicks: 'click',
    hard_bounce: 'bounce',
    soft_bounce: 'bounce',
    spam: 'spam',
    unsubscribed: 'unsubscribe',
    unsubscribe: 'unsubscribe',
    blocked: 'blocked',
    sent: 'sent',
  }
  return map[raw] || raw
}

async function updateRecipientAndCampaign(
  db: ReturnType<typeof createServiceClient>,
  recipientId: string,
  campaignId: string,
  eventType: string,
  occurredAt: string
) {
  if (eventType === 'delivered') {
    await db
      .from('email_campaign_recipients')
      .update({ status: 'delivered', delivered_at: occurredAt })
      .eq('id', recipientId)
    await incrementCampaignCounter(db, campaignId, 'total_delivered')
  } else if (eventType === 'open') {
    const { data: rec } = await db
      .from('email_campaign_recipients')
      .select('first_open_at, open_count')
      .eq('id', recipientId)
      .single()
    const isFirst = !rec?.first_open_at
    await db
      .from('email_campaign_recipients')
      .update({
        first_open_at: rec?.first_open_at || occurredAt,
        last_open_at: occurredAt,
        open_count: (rec?.open_count || 0) + 1,
      })
      .eq('id', recipientId)
    await incrementCampaignCounter(db, campaignId, 'total_opens')
    if (isFirst) await incrementCampaignCounter(db, campaignId, 'total_unique_opens')
  } else if (eventType === 'click') {
    const { data: rec } = await db
      .from('email_campaign_recipients')
      .select('first_click_at, click_count')
      .eq('id', recipientId)
      .single()
    const isFirst = !rec?.first_click_at
    await db
      .from('email_campaign_recipients')
      .update({
        first_click_at: rec?.first_click_at || occurredAt,
        last_click_at: occurredAt,
        click_count: (rec?.click_count || 0) + 1,
      })
      .eq('id', recipientId)
    await incrementCampaignCounter(db, campaignId, 'total_clicks')
    if (isFirst) await incrementCampaignCounter(db, campaignId, 'total_unique_clicks')
  } else if (eventType === 'bounce') {
    await db
      .from('email_campaign_recipients')
      .update({ status: 'bounced' })
      .eq('id', recipientId)
    await incrementCampaignCounter(db, campaignId, 'total_bounces')
  } else if (eventType === 'spam') {
    await incrementCampaignCounter(db, campaignId, 'total_spam')
  } else if (eventType === 'unsubscribe') {
    await db
      .from('email_campaign_recipients')
      .update({ status: 'unsubscribed' })
      .eq('id', recipientId)
    await incrementCampaignCounter(db, campaignId, 'total_unsubscribes')
  }
}

async function incrementCampaignCounter(
  db: ReturnType<typeof createServiceClient>,
  campaignId: string,
  column: string
) {
  const { data } = await db
    .from('email_campaigns')
    .select(column)
    .eq('id', campaignId)
    .single()
  const current = (data as Record<string, number> | null)?.[column] || 0
  await db
    .from('email_campaigns')
    .update({ [column]: current + 1 })
    .eq('id', campaignId)
}
