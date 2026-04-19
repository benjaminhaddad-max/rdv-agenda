import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  sendBrevoEmail,
  renderTemplate,
  htmlToText,
  BREVO_DEFAULT_SENDER,
} from '@/lib/brevo'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/campaigns/[id]/send — Envoie une campagne
 *
 * Body (optionnel) :
 *  - testEmail: string  → envoie uniquement à cet email (mode test)
 *  - recipientOverride: Array<{ email, first_name?, last_name?, contact_id? }>
 *       → envoie uniquement à cette liste (ignore segments/filtres)
 *
 * Note: Cette version envoie en mode batch simple (une requête Brevo par
 * destinataire). La Phase 7 ajoutera queueing + retry + scheduling.
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
      const renderedSubject = renderTemplate(campaign.subject, {
        prenom: 'Test',
      })

      const result = await sendBrevoEmail({
        subject: `[TEST] ${renderedSubject}`,
        htmlContent: rendered,
        textContent: campaign.text_body || htmlToText(rendered),
        to: [{ email: body.testEmail }],
        sender: {
          email: campaign.sender_email || BREVO_DEFAULT_SENDER.email,
          name: campaign.sender_name || BREVO_DEFAULT_SENDER.name,
        },
        replyTo: campaign.reply_to
          ? { email: campaign.reply_to }
          : undefined,
        tags: [`campaign:${id}`, 'test'],
      })
      return NextResponse.json({ ok: true, mode: 'test', result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
  }

  // 3. Mode normal : récupère les destinataires et envoie
  //    (Pour l'instant on utilise uniquement recipientOverride ; la construction
  //    de la liste depuis segments + filtres viendra en Phase 5/7)
  const recipients: Array<{
    email: string
    contact_id: string
    first_name?: string
    last_name?: string
  }> = body.recipientOverride || []

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun destinataire. Fournissez 'recipientOverride' ou définissez des segments (Phase 5).",
      },
      { status: 400 }
    )
  }

  // Marque la campagne en cours d'envoi
  await db
    .from('email_campaigns')
    .update({
      status: 'sending',
      total_recipients: recipients.length,
    })
    .eq('id', id)

  let sent = 0
  let failed = 0
  const errors: Array<{ email: string; error: string }> = []

  for (const r of recipients) {
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

      await db.from('email_campaign_recipients').upsert(
        {
          campaign_id: id,
          contact_id: r.contact_id,
          email: r.email,
          first_name: r.first_name || null,
          last_name: r.last_name || null,
          status: 'sent',
          sent_at: new Date().toISOString(),
          brevo_message_id: result.messageId || null,
        },
        { onConflict: 'campaign_id,contact_id' }
      )
      sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      errors.push({ email: r.email, error: message })
      await db.from('email_campaign_recipients').upsert(
        {
          campaign_id: id,
          contact_id: r.contact_id,
          email: r.email,
          first_name: r.first_name || null,
          last_name: r.last_name || null,
          status: 'failed',
          error_message: message,
        },
        { onConflict: 'campaign_id,contact_id' }
      )
      failed++
    }
  }

  // Finalise la campagne
  await db
    .from('email_campaigns')
    .update({
      status: failed === recipients.length ? 'failed' : 'sent',
      sent_at: new Date().toISOString(),
      total_sent: sent,
    })
    .eq('id', id)

  return NextResponse.json({
    ok: true,
    total: recipients.length,
    sent,
    failed,
    errors: errors.slice(0, 10), // retourne les 10 premières erreurs
  })
}
