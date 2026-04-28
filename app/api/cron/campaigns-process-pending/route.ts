import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  sendBrevoEmail,
  renderTemplate,
  htmlToText,
  BREVO_DEFAULT_SENDER,
} from '@/lib/brevo'

/**
 * GET /api/cron/campaigns-process-pending
 *
 * Worker Vercel Cron qui traite les destinataires en status='pending' pour
 * toutes les campagnes en status='sending'. Doit être appelé toutes les
 * 1-2 minutes pour vider la file.
 *
 * Limite : 200 emails par invocation pour rester dans la limite Vercel 60s.
 */
const MAX_PER_RUN = 200

export async function GET() {
  const db = createServiceClient()

  // 1. Récupère les campagnes en cours d'envoi
  const { data: sendingCampaigns } = await db
    .from('email_campaigns')
    .select('id, subject, html_body, text_body, sender_email, sender_name, reply_to')
    .eq('status', 'sending')
    .limit(10)

  if (!sendingCampaigns || sendingCampaigns.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, campaigns: 0 })
  }

  let totalProcessed = 0
  const perCampaign: Array<{ id: string; sent: number; failed: number; remaining: number }> = []

  for (const campaign of sendingCampaigns) {
    if (totalProcessed >= MAX_PER_RUN) break

    const remainingBudget = MAX_PER_RUN - totalProcessed
    const { data: pending } = await db
      .from('email_campaign_recipients')
      .select('id, contact_id, email, first_name, last_name')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .limit(remainingBudget)

    if (!pending || pending.length === 0) {
      // Plus rien à envoyer pour cette campagne → finaliser
      const { count: sentCount } = await db
        .from('email_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'sent')

      await db.from('email_campaigns').update({
        status: (sentCount ?? 0) > 0 ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
        total_sent: sentCount ?? 0,
      }).eq('id', campaign.id)

      perCampaign.push({ id: campaign.id, sent: 0, failed: 0, remaining: 0 })
      continue
    }

    let sent = 0, failed = 0
    for (const r of pending) {
      try {
        const vars = {
          prenom: r.first_name || '',
          nom: r.last_name || '',
          email: r.email,
        }
        const html = renderTemplate(campaign.html_body, vars)
        const subject = renderTemplate(campaign.subject, vars)

        const result = await sendBrevoEmail({
          subject,
          htmlContent: html,
          textContent: campaign.text_body || htmlToText(html),
          to: [{ email: r.email, name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || undefined }],
          sender: {
            email: campaign.sender_email || BREVO_DEFAULT_SENDER.email,
            name: campaign.sender_name || BREVO_DEFAULT_SENDER.name,
          },
          replyTo: campaign.reply_to ? { email: campaign.reply_to } : undefined,
          tags: [`campaign:${campaign.id}`],
        })

        await db.from('email_campaign_recipients').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          brevo_message_id: result.messageId || null,
        }).eq('id', r.id)
        sent++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await db.from('email_campaign_recipients').update({
          status: 'failed',
          error_message: message,
        }).eq('id', r.id)
        failed++
      }
      totalProcessed++
      if (totalProcessed >= MAX_PER_RUN) break
    }

    // Stats intermédiaires
    const { count: sentTotal } = await db
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'sent')

    const { count: remaining } = await db
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')

    if ((remaining ?? 0) === 0) {
      await db.from('email_campaigns').update({
        status: (sentTotal ?? 0) > 0 ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
        total_sent: sentTotal ?? 0,
      }).eq('id', campaign.id)
    } else {
      await db.from('email_campaigns').update({
        total_sent: sentTotal ?? 0,
      }).eq('id', campaign.id)
    }

    perCampaign.push({
      id: campaign.id,
      sent,
      failed,
      remaining: remaining ?? 0,
    })
  }

  return NextResponse.json({
    ok: true,
    processed: totalProcessed,
    campaigns: perCampaign.length,
    details: perCampaign,
  })
}
