/**
 * Boîte mail admissions@diploma-sante.fr dans l'espace télépro (migration v70).
 *
 * Les mails de RDV (lib/email-reminders.ts) partent d'admissions@ : quand un
 * prospect répond, sa réponse arrive dans cette boîte Gmail. On la relève toutes
 * les 5 min (même compte de service Google que les mails lycées, délégation au
 * niveau du domaine diploma-sante.fr) et on ne garde que les mails échangés avec
 * un contact du CRM, rattachés à sa fiche. Chaque télépro voit les fils de SES
 * contacts (crm_contacts.telepro_user_id) et des contacts à qui il a écrit
 * depuis le CRM (admissions_emails.author_id), et y répond en tant qu'admissions@ :
 * la réponse part de Gmail, donc Pascal la voit aussi dans la boîte.
 *
 * ENV : ADMISSIONS_MAILBOX (facultatif, défaut admissions@diploma-sante.fr).
 */

import type { gmail_v1 } from 'googleapis'
import { createServiceClient } from '@/lib/supabase'
import { htmlToText } from '@/lib/brevo'
import { parseEmails } from '@/lib/lycee-mail-shared'
import {
  address, b64, bodies, decodeEntities, encodeHeader, escapeHtml, explainGoogleError, gmailFor, header,
  isAutomated, isGmailConfigured, parseFrom, textToHtml,
} from '@/lib/lycee-mail'

type Db = ReturnType<typeof createServiceClient>

export const ADMISSIONS_MAILBOX = (process.env.ADMISSIONS_MAILBOX || 'admissions@diploma-sante.fr').trim().toLowerCase()
const TEAM = 'Équipe admissions Diploma Santé'
const PHONE = '01 76 41 01 73'

export function missingAdmissionsMigration(message?: string | null): boolean {
  return /admissions_emails|admissions_mail_sync|schema cache|does not exist/i.test(message || '')
}

/** Identifiants HubSpot du télépro (crm_contacts.telepro_user_id). */
export function teleproOwnerIds(u: { hubspot_owner_id?: string | null; hubspot_user_id?: string | null }): string[] {
  return [...new Set([u.hubspot_owner_id, u.hubspot_user_id].map(v => String(v ?? '').trim()).filter(v => /^\d+$/.test(v)))]
}

// ── Rattachement au contact ─────────────────────────────────────────────────

async function contactForAddress(db: Db, email: string): Promise<string | null> {
  const e = email.trim().toLowerCase()
  if (!e || e === ADMISSIONS_MAILBOX) return null
  const { data: c } = await db.from('crm_contacts').select('hubspot_contact_id').eq('email', e).limit(1)
  if (c?.[0]?.hubspot_contact_id) return String(c[0].hubspot_contact_id)
  // Parent noté sur un RDV, ou élève dont l'email du RDV diffère de la fiche
  const { data: a } = await db.from('rdv_appointments').select('hubspot_contact_id')
    .or(`prospect_email.eq.${e},email_parent.eq.${e}`).not('hubspot_contact_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1)
  if (a?.[0]?.hubspot_contact_id) return String(a[0].hubspot_contact_id)
  return null
}

async function matchContact(db: Db, emails: string[]): Promise<{ contactId: string; email: string } | null> {
  for (const e of emails) {
    if (!/^[^\s@,()]+@[^\s@,()]+$/.test(e)) continue
    const contactId = await contactForAddress(db, e)
    if (contactId) return { contactId, email: e.toLowerCase() }
  }
  return null
}

// ── Relève ──────────────────────────────────────────────────────────────────

export type AdmissionsSyncResult = { mailbox: string; fetched: number; stored: number; error?: string }

export async function syncAdmissionsMailbox(db: Db): Promise<AdmissionsSyncResult> {
  const mailbox = ADMISSIONS_MAILBOX
  const res: AdmissionsSyncResult = { mailbox, fetched: 0, stored: 0 }
  if (!isGmailConfigured()) return { ...res, error: 'Compte de service Google absent' }
  const { data: state, error: stateErr } = await db.from('admissions_mail_sync').select('last_synced_at').eq('mailbox', mailbox).maybeSingle()
  if (stateErr) return { ...res, error: stateErr.message }
  const startedAt = new Date()
  const since = state?.last_synced_at
    ? new Date(new Date(state.last_synced_at as string).getTime() - 15 * 60_000)
    : new Date(Date.now() - 30 * 86400_000)
  const gmail = gmailFor(mailbox)

  try {
    for (const box of ['inbox', 'sent'] as const) {
      const ids: string[] = []
      let pageToken: string | undefined
      do {
        const { data } = await gmail.users.messages.list({
          userId: 'me', q: `in:${box} after:${Math.floor(since.getTime() / 1000)}`, maxResults: 100, pageToken,
        })
        for (const m of data.messages || []) if (m.id) ids.push(m.id)
        pageToken = data.nextPageToken || undefined
      } while (pageToken && ids.length < 500)
      res.fetched += ids.length
      if (!ids.length) continue

      const { data: known } = await db.from('admissions_emails').select('gmail_id').in('gmail_id', ids)
      const knownSet = new Set((known || []).map(k => k.gmail_id as string))
      for (const id of ids.filter(i => !knownSet.has(i))) {
        const { data: msg } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
        if (await storeMessage(db, mailbox, msg, box === 'inbox' ? 'in' : 'out')) res.stored++
      }
    }
    await db.from('admissions_mail_sync').upsert({ mailbox, last_synced_at: startedAt.toISOString(), last_error: null, updated_at: new Date().toISOString() })
  } catch (e) {
    res.error = explainGoogleError(e)
    await db.from('admissions_mail_sync').upsert({ mailbox, last_error: res.error, updated_at: new Date().toISOString() })
  }
  return res
}

async function storeMessage(db: Db, mailbox: string, msg: gmail_v1.Schema$Message, direction: 'in' | 'out'): Promise<boolean> {
  const p = msg.payload
  const from = parseFrom(header(p, 'From'))
  if (direction === 'in' && from.email === mailbox) return false
  const to = parseEmails(header(p, 'To'))
  const cc = parseEmails(header(p, 'Cc'))
  if (direction === 'in' && isAutomated(msg, from.email).skip) return false

  // Rattachement : fil déjà connu, sinon adresse du contact
  let match: { contactId: string; email: string } | null = null
  if (msg.threadId) {
    const { data } = await db.from('admissions_emails').select('contact_id, contact_email')
      .eq('gmail_thread_id', msg.threadId).not('contact_id', 'is', null).order('sent_at', { ascending: false }).limit(1)
    if (data?.[0]?.contact_id) match = { contactId: data[0].contact_id as string, email: (data[0].contact_email as string) || '' }
  }
  if (!match) match = await matchContact(db, direction === 'in' ? (from.email ? [from.email] : []) : [...to, ...cc])
  // On ne garde que les échanges avec un contact du CRM
  if (!match) return false

  const b = bodies(p, { text: '', html: '', attachments: false })
  const bodyText = (b.text || (b.html ? htmlToText(b.html) : '')).slice(0, 60_000)
  const { error } = await db.from('admissions_emails').insert({
    contact_id: match.contactId,
    contact_email: match.email || (direction === 'in' ? from.email : to[0]) || null,
    mailbox, direction,
    gmail_id: msg.id, gmail_thread_id: msg.threadId ?? null,
    message_id_header: header(p, 'Message-ID'),
    from_email: from.email, from_name: from.name,
    to_emails: to, cc_emails: cc,
    subject: header(p, 'Subject'),
    body_text: bodyText, body_html: b.html ? b.html.slice(0, 200_000) : null,
    snippet: msg.snippet ? decodeEntities(msg.snippet) : null,
    has_attachments: b.attachments,
    author_name: direction === 'out' ? 'Admissions (Gmail)' : null,
    read_at: direction === 'out' ? new Date().toISOString() : null,
    sent_at: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
  })
  if (error) {
    if (error.code === '23505') return false // déjà enregistré (relève concurrente)
    throw new Error(error.message)
  }
  return true
}

// ── Envoi ───────────────────────────────────────────────────────────────────

function signature(senderName: string | null) {
  const html = `
<table cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:2px solid #c6aa7c;padding-top:12px">
  <tr><td style="font-size:13px;line-height:1.5;color:#3d4a5c">
    ${senderName ? `<b style="color:#12314d">${escapeHtml(senderName)}</b><br>` : ''}
    <span style="color:#12314d;font-weight:600">${TEAM}</span><br>
    <a href="mailto:${ADMISSIONS_MAILBOX}" style="color:#3d4a5c;text-decoration:none">${ADMISSIONS_MAILBOX}</a> · ${PHONE} · <a href="https://diploma-sante.fr" style="color:#3d4a5c;text-decoration:none">diploma-sante.fr</a>
  </td></tr>
</table>`
  const text = `\n\n--\n${senderName ? `${senderName}\n` : ''}${TEAM}\n${ADMISSIONS_MAILBOX} · ${PHONE}`
  return { html, text }
}

export type SendAdmissionsMailInput = {
  contactId: string
  to: string
  subject: string
  text: string
  author: { id: string; name: string | null }
  threadId?: string | null
  inReplyTo?: string | null
}

export async function sendAdmissionsMail(db: Db, input: SendAdmissionsMailInput) {
  const mailbox = ADMISSIONS_MAILBOX
  const sig = signature(input.author.name)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2a37;max-width:640px">\n${textToHtml(input.text)}\n${sig.html}\n</div>`
  const text = input.text.trim() + sig.text
  const alt = `alt_${crypto.randomUUID()}`
  const raw = Buffer.from([
    `From: ${address('Diploma Santé — Admissions', mailbox)}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.inReplyTo ? `References: ${input.inReplyTo}` : null,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(Buffer.from(text, 'utf8')),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(Buffer.from(html, 'utf8')),
    `--${alt}--`,
    '',
  ].filter(l => l !== null).join('\r\n'), 'utf8').toString('base64url')

  const gmail = gmailFor(mailbox)
  let sent: gmail_v1.Schema$Message
  try {
    const r = await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: input.threadId || undefined } })
    sent = r.data
  } catch (e) {
    throw new Error(explainGoogleError(e))
  }
  let messageIdHeader: string | null = null
  try {
    const meta = await gmail.users.messages.get({ userId: 'me', id: sent.id!, format: 'metadata', metadataHeaders: ['Message-ID'] })
    messageIdHeader = header(meta.data.payload, 'Message-ID')
  } catch { /* lecture facultative */ }

  const now = new Date().toISOString()
  const { data: row, error } = await db.from('admissions_emails').insert({
    contact_id: input.contactId, contact_email: input.to.toLowerCase(), mailbox, direction: 'out',
    gmail_id: sent.id, gmail_thread_id: sent.threadId ?? null, message_id_header: messageIdHeader,
    from_email: mailbox, from_name: input.author.name,
    to_emails: [input.to.toLowerCase()], subject: input.subject,
    body_text: text, body_html: html, snippet: input.text.slice(0, 180),
    author_id: input.author.id, author_name: input.author.name,
    read_at: now, sent_at: now,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return row
}

/**
 * Adresse pro d'un closer pour les réponses aux mails post-RDV. Certains comptes
 * CRM se connectent avec une adresse perso : on la remplace par l'adresse
 * @diploma-sante.fr, et on n'utilise jamais une adresse hors domaine.
 */
const CLOSER_PRO_EMAILS: Record<string, { email: string; name: string }> = {
  // Pascal Tawfik (connexion : adresse Gmail perso)
  pascaltawfikpro: { email: 'pascal@diploma-sante.fr', name: 'Pascal Tawfik' },
  // Paola Kai, closeuse et télépro (compte CRM « Sofia Kai », connexion Gmail perso)
  klaisofia330: { email: 'paola.kai@diploma-sante.fr', name: 'Paola Kai' },
}

export function closerReplyAddress(user: { email?: string | null; name?: string | null } | null): { email: string; name: string | null } | null {
  const email = String(user?.email || '').trim().toLowerCase()
  if (!email) return null
  const mapped = CLOSER_PRO_EMAILS[email.split('@')[0]]
  if (mapped) return mapped
  if (email.endsWith('@diploma-sante.fr') && email !== ADMISSIONS_MAILBOX) return { email, name: user?.name || null }
  return null
}

/**
 * Mail déjà mis en page (ex. mail post-RDV habillé par wrapCrmEmail) envoyé
 * depuis admissions@ via Gmail. Contrairement à Brevo, Gmail accepte plusieurs
 * adresses de réponse : le prospect qui répond écrit à la fois à admissions@
 * et au closer. Le mail est rangé dans le fil du contact (« Mes mails »).
 */
export async function sendAdmissionsHtmlMail(db: Db, input: {
  contactId: string
  to: { email: string; name?: string | null }
  subject: string
  html: string
  text: string
  replyTo: { email: string; name?: string | null }[]
  attachments?: { name: string; content: string }[]
  author: { id: string; name: string | null }
}): Promise<{ gmailId: string; threadId: string | null }> {
  const mailbox = ADMISSIONS_MAILBOX
  const mixed = `mixed_${crypto.randomUUID()}`
  const alt = `alt_${crypto.randomUUID()}`
  const replyTo = input.replyTo.map(r => address(r.name || null, r.email)).join(', ')
  const lines: string[] = [
    `From: ${address('Diploma Santé — Admissions', mailbox)}`,
    `To: ${address(input.to.name || null, input.to.email)}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(Buffer.from(input.text, 'utf8')),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(Buffer.from(input.html, 'utf8')),
    `--${alt}--`,
  ]
  for (const a of input.attachments || []) {
    const name = a.name.replace(/["\r\n]/g, '')
    lines.push(
      `--${mixed}`,
      `Content-Type: application/octet-stream; name="${encodeHeader(name)}"`,
      `Content-Disposition: attachment; filename="${encodeHeader(name)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      b64(Buffer.from(a.content, 'base64')),
    )
  }
  lines.push(`--${mixed}--`, '')
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')

  const gmail = gmailFor(mailbox)
  let sent: gmail_v1.Schema$Message
  try {
    sent = (await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })).data
  } catch (e) {
    throw new Error(explainGoogleError(e))
  }
  let messageIdHeader: string | null = null
  try {
    const meta = await gmail.users.messages.get({ userId: 'me', id: sent.id!, format: 'metadata', metadataHeaders: ['Message-ID'] })
    messageIdHeader = header(meta.data.payload, 'Message-ID')
  } catch { /* lecture facultative */ }

  // Rangé dans le fil du contact ; sans effet bloquant si la table manque
  const now = new Date().toISOString()
  const { error } = await db.from('admissions_emails').insert({
    contact_id: input.contactId, contact_email: input.to.email.toLowerCase(), mailbox, direction: 'out',
    gmail_id: sent.id, gmail_thread_id: sent.threadId ?? null, message_id_header: messageIdHeader,
    from_email: mailbox, from_name: input.author.name,
    to_emails: [input.to.email.toLowerCase()], subject: input.subject,
    body_text: input.text.slice(0, 60_000), body_html: input.html.slice(0, 200_000), snippet: input.text.slice(0, 180),
    has_attachments: !!input.attachments?.length,
    author_id: input.author.id, author_name: input.author.name,
    read_at: now, sent_at: now,
  })
  if (error) console.error('[admissions-mail] mail envoyé mais non rangé :', error.message)
  return { gmailId: sent.id!, threadId: sent.threadId ?? null }
}

/**
 * Mail parti d'admissions@ hors Gmail (repli Brevo) : rangé quand même dans le
 * fil du contact pour que l'auteur le voie dans « Mes mails ». Pas de fil Gmail :
 * la réponse du prospect arrive dans un fil à part, sur le même contact.
 */
export async function recordAdmissionsOutgoing(db: Db, input: {
  contactId: string
  to: string
  subject: string
  html: string
  text: string
  messageIdHeader: string | null
  hasAttachments?: boolean
  author: { id: string; name: string | null }
  sentAt?: string
}) {
  const sentAt = input.sentAt || new Date().toISOString()
  const { error } = await db.from('admissions_emails').insert({
    contact_id: input.contactId, contact_email: input.to.toLowerCase(), mailbox: ADMISSIONS_MAILBOX, direction: 'out',
    gmail_id: null, gmail_thread_id: null, message_id_header: input.messageIdHeader,
    from_email: ADMISSIONS_MAILBOX, from_name: input.author.name,
    to_emails: [input.to.toLowerCase()], subject: input.subject,
    body_text: input.text.slice(0, 60_000), body_html: input.html.slice(0, 200_000), snippet: input.text.slice(0, 180),
    has_attachments: !!input.hasAttachments,
    author_id: input.author.id, author_name: input.author.name,
    read_at: sentAt, sent_at: sentAt,
  })
  if (error) console.error('[admissions-mail] mail Brevo non rangé :', error.message)
}

// ── Lecture (espace télépro) ────────────────────────────────────────────────

/**
 * ownerIds : ses contacts attribués ; writtenContactIds : les contacts à qui il
 * a écrit depuis le CRM, même attribués à un autre télépro ou à personne.
 */
export type AdmissionsViewer = { id: string; isAdmin: boolean; ownerIds: string[]; writtenContactIds: string[] }

const WINDOW_DAYS = 120

/** Contacts à qui ce compte a écrit (fiche contact ou « Mes mails »), les plus récents d'abord. */
async function writtenContacts(db: Db, userId: string): Promise<string[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString()
  const { data } = await db.from('admissions_emails').select('contact_id')
    .eq('author_id', userId).gte('sent_at', since).not('contact_id', 'is', null)
    .order('sent_at', { ascending: false }).limit(2000)
  return [...new Set((data || []).map(r => String(r.contact_id)))].slice(0, 400)
}

/**
 * Qui regarde : le télépro connecté, ou un télépro visé par un admin
 * (?user_id=) ; un admin sans cible voit toute la boîte.
 */
export async function resolveViewer(db: Db, ctx: { appUserId: string; role: string }, askedUserId: string | null) {
  const isAdmin = ctx.role === 'admin'
  const userId = askedUserId && isAdmin ? askedUserId : ctx.appUserId
  const { data: user } = await db.from('rdv_users').select('id, name, hubspot_owner_id, hubspot_user_id').eq('id', userId).maybeSingle()
  if (!user) return null
  const seesAll = isAdmin && !askedUserId
  const viewer: AdmissionsViewer = {
    id: user.id as string, isAdmin: seesAll, ownerIds: teleproOwnerIds(user),
    writtenContactIds: seesAll ? [] : await writtenContacts(db, user.id as string),
  }
  return { viewer, user: { id: user.id as string, name: (user.name as string | null) ?? null } }
}

const CONTACT_EMBED = 'crm_contacts!inner(hubspot_contact_id, firstname, lastname, email, telepro_user_id)'

export type AdmissionsThread = {
  thread_id: string
  contact: { id: string; name: string; email: string | null }
  subject: string | null
  snippet: string | null
  last_at: string
  last_direction: 'in' | 'out'
  count: number
  unread: number
}

type EmailRow = {
  id: string; contact_id: string; gmail_thread_id: string | null; direction: 'in' | 'out'
  subject: string | null; snippet: string | null; sent_at: string; read_at: string | null
  crm_contacts: { hubspot_contact_id: string; firstname: string | null; lastname: string | null; email: string | null; telepro_user_id: string | null }
}

type Filterable = { in: (col: string, v: string[]) => unknown }
type Result<R> = PromiseLike<{ data: R[] | null; error: { message: string } | null }>

/**
 * Un télépro voit les mails de ses contacts et de ceux à qui il a écrit ; un
 * admin voit tout. `build` crée la requête (appelée une fois par périmètre).
 */
async function scopedSelect<R extends { id: string }>(viewer: AdmissionsViewer, build: () => unknown): Promise<R[]> {
  const run = async (q: unknown) => {
    const { data, error } = await (q as Result<R>)
    if (error) throw new Error(error.message)
    return data || []
  }
  if (viewer.isAdmin) return run(build())
  const parts = [run((build() as Filterable).in('crm_contacts.telepro_user_id', viewer.ownerIds.length ? viewer.ownerIds : ['0']))]
  if (viewer.writtenContactIds.length) parts.push(run((build() as Filterable).in('contact_id', viewer.writtenContactIds)))
  const seen = new Set<string>()
  const out: R[] = []
  for (const rows of await Promise.all(parts)) {
    for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); out.push(r) }
  }
  return out
}

export async function listThreads(db: Db, viewer: AdmissionsViewer): Promise<AdmissionsThread[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString()
  const rows = await scopedSelect<EmailRow>(viewer, () => db.from('admissions_emails')
    .select(`id, contact_id, gmail_thread_id, direction, subject, snippet, sent_at, read_at, ${CONTACT_EMBED}`)
    .gte('sent_at', since).order('sent_at', { ascending: false }).limit(1000))
  rows.sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  const threads = new Map<string, AdmissionsThread>()
  for (const r of rows) {
    const key = r.gmail_thread_id || r.id
    const c = r.crm_contacts
    let t = threads.get(key)
    if (!t) {
      t = {
        thread_id: key,
        contact: { id: c.hubspot_contact_id, name: [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email || 'Contact', email: c.email },
        subject: r.subject, snippet: r.snippet, last_at: r.sent_at, last_direction: r.direction, count: 0, unread: 0,
      }
      threads.set(key, t)
    }
    t.count++
    if (r.direction === 'in' && !r.read_at) t.unread++
  }
  return [...threads.values()]
}

export async function unreadCount(db: Db, viewer: AdmissionsViewer): Promise<number> {
  if (viewer.isAdmin) {
    const { count, error } = await db.from('admissions_emails').select('id', { count: 'exact', head: true })
      .eq('direction', 'in').is('read_at', null)
    if (error) throw new Error(error.message)
    return count || 0
  }
  const rows = await scopedSelect<{ id: string }>(viewer, () => db.from('admissions_emails')
    .select(`id, ${CONTACT_EMBED}`).eq('direction', 'in').is('read_at', null).limit(1000))
  return rows.length
}

/** Fil complet (vérifie que le contact est bien visible par le télépro) et le marque comme lu. */
export async function getThread(db: Db, viewer: AdmissionsViewer, threadId: string) {
  const rows = await scopedSelect<{ id: string; direction: string; read_at: string | null; sent_at: string }>(viewer, () => db.from('admissions_emails')
    .select(`*, ${CONTACT_EMBED}`)
    .or(`gmail_thread_id.eq.${threadId},id.eq.${/^[0-9a-f-]{36}$/i.test(threadId) ? threadId : '00000000-0000-0000-0000-000000000000'}`)
    .order('sent_at', { ascending: true }))
  rows.sort((a, b) => a.sent_at.localeCompare(b.sent_at))
  if (!rows.length) return null
  const unread = rows.filter(r => r.direction === 'in' && !r.read_at).map(r => r.id as string)
  if (unread.length) await db.from('admissions_emails').update({ read_at: new Date().toISOString() }).in('id', unread)
  return rows
}

/** Contact du télépro, ou à qui il a déjà écrit (pour écrire / répondre). */
export async function ownedContact(db: Db, viewer: AdmissionsViewer, contactId: string) {
  const { data } = await db.from('crm_contacts').select('hubspot_contact_id, firstname, lastname, email, telepro_user_id')
    .eq('hubspot_contact_id', contactId).maybeSingle()
  if (!data) return null
  if (!viewer.isAdmin && !viewer.ownerIds.includes(String(data.telepro_user_id ?? '')) && !viewer.writtenContactIds.includes(contactId)) return null
  return data
}

/** Recherche parmi les contacts du télépro (nouveau mail). */
export async function searchOwnedContacts(db: Db, viewer: AdmissionsViewer, q: string) {
  const term = q.replace(/[%_,()*]/g, ' ').trim()
  if (term.length < 2) return []
  let query = db.from('crm_contacts').select('hubspot_contact_id, firstname, lastname, email')
    .not('email', 'is', null)
    .or(`firstname.ilike.%${term}%,lastname.ilike.%${term}%,email.ilike.%${term}%`)
    .limit(8)
  if (!viewer.isAdmin) query = query.in('telepro_user_id', viewer.ownerIds.length ? viewer.ownerIds : ['0'])
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data || []).map(c => ({
    id: String(c.hubspot_contact_id),
    name: [c.firstname, c.lastname].filter(Boolean).join(' ') || String(c.email),
    email: String(c.email),
  }))
}
