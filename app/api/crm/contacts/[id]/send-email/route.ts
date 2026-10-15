import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendBrevoEmail, renderTemplate, htmlToText } from '@/lib/brevo'
import { requireApiRole } from '@/lib/api-auth'
import { memoryRateLimit } from '@/lib/rate-limit'
import { wrapCrmEmail } from '@/lib/crm-email-layout'
import { markPostRdvEmailSent } from '@/lib/post-rdv-email'
import { ADMISSIONS_MAILBOX, closerReplyAddress, recordAdmissionsOutgoing, sendAdmissionsHtmlMail } from '@/lib/admissions-mail'
import { isGmailConfigured } from '@/lib/lycee-mail'

/**
 * POST /api/crm/contacts/[id]/send-email
 *
 * Envoie un email unitaire à un contact depuis la boîte Gmail admissions@
 * (repli Brevo) et log l'activité dans crm_activities. Utilisé par le
 * QuickActionModal sur la fiche contact. Le mail est rangé dans
 * admissions_emails : l'auteur le retrouve, avec les réponses, dans « Mes mails ».
 *
 * Body :
 *   subject       : objet (requis si pas de templateId)
 *   html          : contenu HTML (requis si pas de templateId)
 *   templateId    : id d'email_templates (optionnel — alternative à subject+html)
 *   replyTo       : adresse de réponse en plus d'admissions@ (optionnel)
 *   ownerId       : owner du contact qui envoie (pour logguer)
 *   appointmentId : RDV dont c'est le mail post-RDV (pastille de l'agenda)
 *
 * Réponses à admissions@ (+ le closer du RDV pour un mail post-RDV, ou
 * l'adresse saisie) : Gmail accepte plusieurs adresses de réponse, Brevo une
 * seule. Repli sur Brevo si Gmail est indisponible.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireApiRole(['admin', 'closer', 'telepro'])
  if (!authz.ok) return authz.response

  const limiterKey = `crm-send-email:${authz.ctx.appUserId}`
  const limiter = memoryRateLimit(limiterKey, { windowMs: 60_000, limit: 20 })
  if (!limiter.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded for send-email' },
      { status: 429 }
    )
  }

  const db = createServiceClient()
  const { id: contactId } = await params
  const body = await req.json().catch(() => ({}))

  // 1. Récupérer le contact
  const { data: contact, error: cErr } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle')
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()
  if (cErr || !contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }
  if (!contact.email) {
    return NextResponse.json({ error: 'Le contact n\'a pas d\'e-mail' }, { status: 400 })
  }

  // 2. Préparer le contenu : soit via template, soit via body direct
  let subject = body.subject as string | undefined
  let html    = body.html as string | undefined
  let text    = body.text as string | undefined

  if (body.templateId) {
    const { data: tpl, error: tErr } = await db
      .from('email_templates')
      .select('subject, html_body, text_body')
      .eq('id', body.templateId)
      .maybeSingle()
    if (tErr || !tpl) {
      return NextResponse.json({ error: 'Template introuvable' }, { status: 404 })
    }
    subject = subject || tpl.subject
    html    = html    || tpl.html_body
    text    = text    || tpl.text_body
  }

  if (!subject || !html) {
    return NextResponse.json({ error: 'subject + html requis (ou templateId)' }, { status: 400 })
  }

  // 3. Variables disponibles pour personnalisation
  const vars = {
    prenom:           contact.firstname ?? '',
    firstname:        contact.firstname ?? '',
    nom:              contact.lastname ?? '',
    lastname:         contact.lastname ?? '',
    email:            contact.email ?? '',
    classe:           contact.classe_actuelle ?? '',
    classe_actuelle:  contact.classe_actuelle ?? '',
    phone:            contact.phone ?? '',
  }
  const renderedSubject = renderTemplate(subject, vars)
  const renderedHtml    = renderTemplate(html, vars)
  const renderedText    = text ? renderTemplate(text, vars) : htmlToText(renderedHtml)

  // 4. Envoyer : Gmail (mail post-RDV, réponses à admissions@ + closer) ou Brevo
  let messageId: string | undefined
  let gmailId: string | undefined
  let replyToUsed: string[] = body.replyTo ? [String(body.replyTo)] : []
  let sendError: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachments = Array.isArray(body.attachments) && body.attachments.length > 0
    ? body.attachments.map((a: any) => ({ name: String(a.name), content: String(a.content) }))
    : undefined
  const toName = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || undefined
  // Papier à en-tête Diploma Santé autour du texte (le log garde le texte seul)
  const htmlContent = wrapCrmEmail(renderedHtml)

  const appointmentId = typeof body.appointmentId === 'string' && body.appointmentId ? body.appointmentId : null
  // Réponses toujours à admissions@ (relevée → « Mes mails » de l'auteur), plus
  // le closer du RDV pour un mail post-RDV, ou l'adresse de réponse saisie.
  const gmailReplyTo: { email: string; name: string | null }[] = [{ email: ADMISSIONS_MAILBOX, name: 'Diploma Santé — Admissions' }]
  let postRdvReplyTo: { email: string; name: string | null }[] | null = null
  if (appointmentId) {
    const { data: appt } = await db.from('rdv_appointments').select('commercial_id').eq('id', appointmentId).maybeSingle()
    const { data: closer } = appt?.commercial_id
      ? await db.from('rdv_users').select('name, email').eq('id', appt.commercial_id).maybeSingle()
      : { data: null }
    const closerAddress = closerReplyAddress(closer)
    if (closerAddress) gmailReplyTo.push(closerAddress)
    postRdvReplyTo = gmailReplyTo
  } else if (body.replyTo) {
    const extra = String(body.replyTo).trim().toLowerCase()
    if (/^[^\s@,<>]+@[^\s@,<>]+$/.test(extra) && extra !== ADMISSIONS_MAILBOX) gmailReplyTo.push({ email: extra, name: null })
  }

  const { data: me } = await db.from('rdv_users').select('id, name').eq('id', authz.ctx.appUserId).maybeSingle()
  const author = { id: authz.ctx.appUserId, name: (me?.name as string | null) ?? null }

  // Tout mail unitaire part de la boîte Gmail admissions@ : il est rangé dans le
  // fil du contact (« Mes mails ») et les réponses du prospect s'y ajoutent.
  if (isGmailConfigured()) {
    try {
      const r = await sendAdmissionsHtmlMail(db, {
        contactId,
        to: { email: contact.email, name: toName },
        subject: renderedSubject,
        html: htmlContent,
        text: renderedText,
        replyTo: gmailReplyTo,
        attachments,
        author,
      })
      gmailId = r.gmailId
      replyToUsed = gmailReplyTo.map(r2 => r2.email)
    } catch (e) {
      console.error('[crm/contacts/send-email] Gmail error, repli Brevo :', e)
    }
  }

  if (!gmailId) {
    try {
      const r = await sendBrevoEmail({
        subject: renderedSubject,
        htmlContent,
        textContent: renderedText,
        to: [{ email: contact.email, name: toName }],
        // Brevo : une seule adresse de réponse (admissions@ pour un mail post-RDV)
        replyTo: postRdvReplyTo ? { email: ADMISSIONS_MAILBOX } : body.replyTo ? { email: body.replyTo } : undefined,
        tags: [`contact:${contactId}`, 'unitaire'],
        attachment: attachments,
      })
      messageId = r.messageId
      if (postRdvReplyTo) replyToUsed = [ADMISSIONS_MAILBOX]
      // Visible quand même dans « Mes mails » (hors boîte Gmail, fil à part)
      await recordAdmissionsOutgoing(db, {
        contactId, to: contact.email, subject: renderedSubject, html: htmlContent, text: renderedText,
        messageIdHeader: messageId ?? null, hasAttachments: !!attachments, author,
      })
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e)
      console.error('[crm/contacts/send-email] Brevo error:', sendError)
    }
  }

  // 5. Logger l'activité (même si erreur d'envoi → trace pour debug)
  await db.from('crm_activities').insert({
    activity_type:     'email',
    hubspot_contact_id: contactId,
    subject:           renderedSubject,
    body:              renderedHtml,
    direction:         'OUTGOING',
    status:            sendError ? 'FAILED' : 'SENT',
    owner_id:          authz.ctx.hubspotOwnerId ?? authz.ctx.appUserId,
    metadata: {
      brevo_message_id: messageId ?? null,
      gmail_id:         gmailId ?? null,
      sent_via:         gmailId ? 'gmail-admissions' : 'brevo',
      reply_to:         replyToUsed,
      template_id:      body.templateId ?? null,
      appointment_id:   body.appointmentId ?? null,
      error:            sendError,
    },
    occurred_at:       new Date().toISOString(),
  })

  if (sendError) {
    return NextResponse.json({ error: sendError }, { status: 500 })
  }
  const postRdvEmailSentAt = appointmentId ? await markPostRdvEmailSent(db, appointmentId) : null
  return NextResponse.json({ ok: true, messageId: messageId ?? gmailId, replyTo: replyToUsed, postRdvEmailSentAt })
}
