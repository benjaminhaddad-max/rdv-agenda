import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  buildAmpSurveyHtml,
  buildAmpSurveyHtmlFallback,
  buildAmpSurveyPlainText,
} from '@/lib/amp-survey-email'
import {
  resolveBrevoSmtpCredentialsAsync,
  sendAmpMultipartEmail,
} from '@/lib/brevo-smtp-send'
import { signFormContactToken } from '@/lib/form-contact-link'

/**
 * POST /api/email-survey/send-test
 * Envoi AMP multipart (formulaire dans le mail).
 * Auth : Bearer CRON_SECRET
 * Body : { "to"?: "aaron@diploma-sante.fr", "registerGoogle"?: boolean }
 */
function authorize(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${cronSecret}`
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const brevoKey = process.env.BREVO_API_KEY?.trim()
  if (!brevoKey) {
    return NextResponse.json({ error: 'BREVO_API_KEY missing' }, { status: 500 })
  }

  const smtpCreds = await resolveBrevoSmtpCredentialsAsync(brevoKey)
  if (!smtpCreds) {
    return NextResponse.json(
      {
        error: 'BREVO_SMTP_KEY missing',
        hint: 'Ajoutez BREVO_SMTP_KEY dans Vercel (clé SMTP Brevo, pas API key)',
      },
      { status: 500 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const registerGoogle = Boolean(body.registerGoogle)
  const toEmail = String(body.to || 'aaron@diploma-sante.fr').trim().toLowerCase()

  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'admissions@diploma-sante.fr').trim()
  const senderName = (process.env.BREVO_SENDER_NAME || 'Diploma Santé').trim()
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.diploma-sante.fr'
  ).replace(/\/+$/, '')

  const db = createServiceClient()
  const { data: contact } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, email')
    .eq('email', toEmail)
    .maybeSingle()

  const prenom = contact?.firstname?.trim() || 'Aaron'
  const cid = contact?.hubspot_contact_id || 'test'

  const contactToken =
    signFormContactToken({
      cid,
      email: toEmail,
      firstname: prenom,
    }) || 'demo'

  const submitUrl = `${baseUrl}/api/email-survey/amp-submit`
  const ampHtml = buildAmpSurveyHtml({ prenom, submitUrl, contactToken })
  const htmlFallback = buildAmpSurveyHtmlFallback({ prenom, senderName })
  const text = buildAmpSurveyPlainText(prenom)

  const subject = registerGoogle
    ? 'Votre orientation PASS/LAS — 2 questions rapides'
    : 'Formulaire dans votre e-mail — répondez sans quitter Gmail'

  const recipient = registerGoogle ? 'ampforemail.whitelisting@gmail.com' : toEmail

  try {
    const messageId = await sendAmpMultipartEmail(smtpCreds, {
      fromEmail: senderEmail,
      fromName: senderName,
      to: recipient,
      subject,
      text,
      html: htmlFallback,
      amp: ampHtml,
    })

    return NextResponse.json({
      ok: true,
      mode: 'amp-multipart-smtp',
      messageId,
      to: recipient,
      subject,
      smtpLogin: smtpCreds.login,
      note: registerGoogle
        ? 'Complétez https://amp.gmail.dev/register/'
        : 'Activez E-mails dynamiques dans Gmail + whitelist Google pour contact@diploma-sante.fr',
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'send failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
