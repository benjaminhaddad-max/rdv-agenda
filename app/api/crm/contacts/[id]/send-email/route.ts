import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendBrevoEmail, renderTemplate, htmlToText } from '@/lib/brevo'

/**
 * POST /api/crm/contacts/[id]/send-email
 *
 * Envoie un email unitaire à un contact via Brevo et log l'activité dans
 * crm_activities. Utilisé par le QuickActionModal sur la fiche contact.
 *
 * Body :
 *   subject       : objet (requis si pas de templateId)
 *   html          : contenu HTML (requis si pas de templateId)
 *   templateId    : id d'email_templates (optionnel — alternative à subject+html)
 *   replyTo       : email de réponse (optionnel)
 *   ownerId       : owner du contact qui envoie (pour logguer)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // 4. Envoyer via Brevo
  let messageId: string | undefined
  let sendError: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachments = Array.isArray(body.attachments) && body.attachments.length > 0
    ? body.attachments.map((a: any) => ({ name: String(a.name), content: String(a.content) }))
    : undefined
  try {
    const r = await sendBrevoEmail({
      subject: renderedSubject,
      htmlContent: renderedHtml,
      textContent: renderedText,
      to: [{
        email: contact.email,
        name: [contact.firstname, contact.lastname].filter(Boolean).join(' ') || undefined,
      }],
      replyTo: body.replyTo ? { email: body.replyTo } : undefined,
      tags: [`contact:${contactId}`, 'unitaire'],
      attachment: attachments,
    })
    messageId = r.messageId
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e)
    console.error('[crm/contacts/send-email] Brevo error:', sendError)
  }

  // 5. Logger l'activité (même si erreur d'envoi → trace pour debug)
  await db.from('crm_activities').insert({
    activity_type:     'email',
    hubspot_contact_id: contactId,
    subject:           renderedSubject,
    body:              renderedHtml,
    direction:         'OUTGOING',
    status:            sendError ? 'FAILED' : 'SENT',
    owner_id:          body.ownerId ?? null,
    metadata: {
      brevo_message_id: messageId ?? null,
      template_id:      body.templateId ?? null,
      error:            sendError,
    },
    occurred_at:       new Date().toISOString(),
  })

  if (sendError) {
    return NextResponse.json({ error: sendError }, { status: 500 })
  }
  return NextResponse.json({ ok: true, messageId })
}
