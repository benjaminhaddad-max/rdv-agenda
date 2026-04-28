import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  sendBrevoEmail,
  renderTemplate,
  htmlToText,
  BREVO_DEFAULT_SENDER,
} from '@/lib/brevo'
import { resolveCampaignRecipients } from '@/lib/campaign-recipients'

type Params = { params: Promise<{ id: string }> }

// Limite de destinataires traités INLINE dans cette requête. Au-delà, le reste
// reste en status='pending' et sera traité par le cron /api/cron/campaigns-process-pending.
const MAX_INLINE_PROCESS = 200

/**
 * POST /api/campaigns/[id]/send — Envoie une campagne
 *
 * Body (optionnel) :
 *  - testEmail: string  → envoie uniquement à cet email (mode test)
 *  - recipientOverride: Array<{ email, first_name?, last_name?, contact_id? }>
 *       → envoie uniquement à cette liste (ignore segments/filtres). Réservé aux tests.
 *
 * Sans body : la campagne est envoyée à l'audience résolue depuis ses segments,
 * extra_filters, manual_contact_ids. Les destinataires sont insérés en
 * email_campaign_recipients avec status='pending', puis on traite jusqu'à
 * MAX_INLINE_PROCESS dans cette requête. Le reste est traité par le cron.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()

  // 1. Récupère la campagne
  const { data: campaign, error: fetchErr } = await db
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 })
  if (!campaign.html_body || !campaign.subject) {
    return NextResponse.json(
      { error: 'La campagne doit avoir un sujet et un contenu HTML' },
      { status: 400 }
    )
  }

  // 2. Mode test : envoi rapide à un seul email
  if (body.testEmail) {
    try {
      const rendered = renderTemplate(campaign.html_body, {
        prenom: 'Test',
        nom: 'Destinataire',
        email: body.testEmail,
      })
      const renderedSubject = renderTemplate(campaign.subject, { prenom: 'Test' })

      const result = await sendBrevoEmail({
        subject: `[TEST] ${renderedSubject}`,
        htmlContent: rendered,
        textContent: campaign.text_body || htmlToText(rendered),
        to: [{ email: body.testEmail }],
        sender: {
          email: campaign.sender_email || BREVO_DEFAULT_SENDER.email,
          name: campaign.sender_name || BREVO_DEFAULT_SENDER.name,
        },
        replyTo: campaign.reply_to ? { email: campaign.reply_to } : undefined,
        tags: [`campaign:${id}`, 'test'],
      })
      return NextResponse.json({ ok: true, mode: 'test', result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
  }

  // 3. Refuse de re-envoyer une campagne déjà envoyée/en cours
  if (campaign.status === 'sending') {
    // L'envoi est déjà en cours via un autre appel ou via le cron — on continue
    // simplement à processer ce qui reste en pending.
  } else if (campaign.status === 'sent') {
    return NextResponse.json({ error: 'Campagne déjà envoyée' }, { status: 400 })
  }

  // 4. Résoudre les destinataires (ou utiliser override pour tests)
  let recipients: Array<{ contact_id: string; email: string; first_name: string | null; last_name: string | null }>
  if (Array.isArray(body.recipientOverride) && body.recipientOverride.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recipients = body.recipientOverride.map((r: any) => ({
      contact_id: String(r.contact_id || r.email),
      email: String(r.email),
      first_name: r.first_name || null,
      last_name: r.last_name || null,
    }))
  } else if (campaign.status === 'sending') {
    // Reprise d'un envoi en cours : pas besoin de re-résoudre, on prend
    // directement les pending depuis email_campaign_recipients.
    recipients = []
  } else {
    try {
      recipients = await resolveCampaignRecipients(db, {
        segment_ids: campaign.segment_ids,
        extra_filters: campaign.extra_filters,
        manual_contact_ids: campaign.manual_contact_ids,
      })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'Aucun destinataire trouvé. Vérifiez les segments/filtres.' },
        { status: 400 }
      )
    }
  }

  // 5. Insertion des destinataires en pending (idempotent via upsert)
  if (recipients.length > 0) {
    const rows = recipients.map(r => ({
      campaign_id: id,
      contact_id: r.contact_id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      status: 'pending' as const,
    }))

    // Upsert par chunks de 500
    for (let i = 0; i < rows.length; i += 500) {
      await db.from('email_campaign_recipients').upsert(rows.slice(i, i + 500), {
        onConflict: 'campaign_id,contact_id',
        ignoreDuplicates: false,  // permet de remettre status='pending' si on reprend
      })
    }

    await db.from('email_campaigns').update({
      status: 'sending',
      total_recipients: recipients.length,
    }).eq('id', id)
  }

  // 6. Traitement des pending (jusqu'à MAX_INLINE_PROCESS)
  const { data: pending } = await db
    .from('email_campaign_recipients')
    .select('id, contact_id, email, first_name, last_name')
    .eq('campaign_id', id)
    .eq('status', 'pending')
    .limit(MAX_INLINE_PROCESS)

  let sent = 0
  let failed = 0
  const errors: Array<{ email: string; error: string }> = []

  for (const r of (pending ?? [])) {
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
        tags: [`campaign:${id}`],
      })

      await db.from('email_campaign_recipients').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        brevo_message_id: result.messageId || null,
      }).eq('id', r.id)
      sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      errors.push({ email: r.email, error: message })
      await db.from('email_campaign_recipients').update({
        status: 'failed',
        error_message: message,
      }).eq('id', r.id)
      failed++
    }
  }

  // 7. Compter ce qui reste en pending pour savoir si la campagne est finie
  const { count: remainingPending } = await db
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .eq('status', 'pending')

  // Stats + finalisation si plus rien en pending
  const { count: totalSent } = await db
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .eq('status', 'sent')

  const { count: totalFailed } = await db
    .from('email_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .eq('status', 'failed')

  if ((remainingPending ?? 0) === 0) {
    await db.from('email_campaigns').update({
      status: (totalSent ?? 0) > 0 ? 'sent' : 'failed',
      sent_at: campaign.sent_at || new Date().toISOString(),
      total_sent: totalSent ?? 0,
    }).eq('id', id)
  } else {
    // Mise à jour intermédiaire des stats
    await db.from('email_campaigns').update({
      total_sent: totalSent ?? 0,
    }).eq('id', id)
  }

  return NextResponse.json({
    ok: true,
    processed_in_request: sent + failed,
    sent_total: totalSent ?? 0,
    failed_total: totalFailed ?? 0,
    pending_total: remainingPending ?? 0,
    errors: errors.slice(0, 10),
  })
}
