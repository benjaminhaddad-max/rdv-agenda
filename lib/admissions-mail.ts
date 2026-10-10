/**
 * Boîte mail admissions@diploma-sante.fr dans l'espace télépro (migration v70).
 *
 * Les mails de RDV (lib/email-reminders.ts) partent d'admissions@ : quand un
 * prospect répond, sa réponse arrive dans cette boîte Gmail. On la relève toutes
 * les 5 min (même compte de service Google que les mails lycées, délégation au
 * niveau du domaine diploma-sante.fr) et on ne garde que les mails échangés avec
 * un contact du CRM, rattachés à sa fiche. Chaque télépro voit les fils de SES
 * contacts (crm_contacts.telepro_user_id) et y répond en tant qu'admissions@ :
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

// ── Lecture (espace télépro) ────────────────────────────────────────────────

export type AdmissionsViewer = { id: string; isAdmin: boolean; ownerIds: string[] }

/**
 * Qui regarde : le télépro connecté, ou un télépro visé par un admin
 * (?user_id=) ; un admin sans cible voit toute la boîte.
 */
export async function resolveViewer(db: Db, ctx: { appUserId: string; role: string }, askedUserId: string | null) {
  const isAdmin = ctx.role === 'admin'
  const userId = askedUserId && isAdmin ? askedUserId : ctx.appUserId
  const { data: user } = await db.from('rdv_users').select('id, name, hubspot_owner_id, hubspot_user_id').eq('id', userId).maybeSingle()
  if (!user) return null
  const viewer: AdmissionsViewer = { id: user.id as string, isAdmin: isAdmin && !askedUserId, ownerIds: teleproOwnerIds(user) }
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

/** Un télépro ne voit que les mails de ses contacts ; un admin voit tout. */
function scoped<Q>(q: Q, viewer: AdmissionsViewer): Q {
  if (viewer.isAdmin) return q
  const ids = viewer.ownerIds.length ? viewer.ownerIds : ['0']
  return (q as unknown as { in: (col: string, v: string[]) => Q }).in('crm_contacts.telepro_user_id', ids)
}

export async function listThreads(db: Db, viewer: AdmissionsViewer): Promise<AdmissionsThread[]> {
  const since = new Date(Date.now() - 120 * 86400_000).toISOString()
  const q = db.from('admissions_emails')
    .select(`id, contact_id, gmail_thread_id, direction, subject, snippet, sent_at, read_at, ${CONTACT_EMBED}`)
    .gte('sent_at', since).order('sent_at', { ascending: false }).limit(1000)
  const { data, error } = await scoped(q, viewer)
  if (error) throw new Error(error.message)
  const threads = new Map<string, AdmissionsThread>()
  for (const r of (data || []) as unknown as EmailRow[]) {
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
  const q = db.from('admissions_emails').select(`id, ${CONTACT_EMBED}`, { count: 'exact', head: true })
    .eq('direction', 'in').is('read_at', null)
  const { count, error } = await scoped(q, viewer)
  if (error) throw new Error(error.message)
  return count || 0
}

/** Fil complet (vérifie que le contact est bien celui du télépro) et le marque comme lu. */
export async function getThread(db: Db, viewer: AdmissionsViewer, threadId: string) {
  const q = db.from('admissions_emails').select(`*, ${CONTACT_EMBED}`)
    .or(`gmail_thread_id.eq.${threadId},id.eq.${/^[0-9a-f-]{36}$/i.test(threadId) ? threadId : '00000000-0000-0000-0000-000000000000'}`)
    .order('sent_at', { ascending: true })
  const { data, error } = await scoped(q, viewer)
  if (error) throw new Error(error.message)
  const rows = data || []
  if (!rows.length) return null
  const unread = rows.filter(r => r.direction === 'in' && !r.read_at).map(r => r.id as string)
  if (unread.length) await db.from('admissions_emails').update({ read_at: new Date().toISOString() }).in('id', unread)
  return rows
}

/** Contact du télépro (pour écrire un nouveau mail). */
export async function ownedContact(db: Db, viewer: AdmissionsViewer, contactId: string) {
  const { data } = await db.from('crm_contacts').select('hubspot_contact_id, firstname, lastname, email, telepro_user_id')
    .eq('hubspot_contact_id', contactId).maybeSingle()
  if (!data) return null
  if (!viewer.isAdmin && !viewer.ownerIds.includes(String(data.telepro_user_id ?? ''))) return null
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
