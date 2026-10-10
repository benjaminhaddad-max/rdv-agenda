/**
 * Mails partenariat des lycées (migration v65) — envoi et relève via Gmail.
 *
 * Deux boîtes Google Workspace : partenariat@diploma-sante.fr (mode « diploma »)
 * et partenariat@afem-edu.fr (mode « afem »). Le compte de service Google déjà
 * utilisé pour Meet (lib/google-meet.ts) agit au nom de ces boîtes par
 * délégation au niveau du domaine : aucun mot de passe n'est stocké.
 *
 * Mise en route (une fois, dans chaque console d'administration Google qui
 * héberge une de ces boîtes) : Sécurité → Contrôle des API → Délégation au
 * niveau du domaine → ajouter l'ID client du compte de service avec les
 * scopes GMAIL_SCOPES (garder calendar.events s'il y est déjà, pour Meet).
 * L'onglet Lycées → Mails → « Boîtes & modèles » affiche l'ID client et l'état.
 *
 * ENV : GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY (comme Meet),
 *       ou un compte de service dédié aux mails : LYCEE_MAIL_SA_CLIENT_EMAIL,
 *       LYCEE_MAIL_SA_PRIVATE_KEY, LYCEE_MAIL_SA_PROJECT_NUMBER (prioritaires) ;
 *       LYCEE_MAIL_DIPLOMA / LYCEE_MAIL_AFEM (facultatif, adresses des boîtes).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { google, type gmail_v1 } from 'googleapis'
import { createServiceClient } from '@/lib/supabase'
import { htmlToText } from '@/lib/brevo'
import { LYCEE_MODES, type LyceeMode } from '@/lib/lycees'
import { DEFAULT_MAILBOXES, MAIL_BRANDS, parseEmails } from '@/lib/lycee-mail-shared'

type Db = ReturnType<typeof createServiceClient>

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
]

/** Compte de service dédié aux mails (si défini), sinon celui de Meet. */
const DEDICATED_SA = Boolean(process.env.LYCEE_MAIL_SA_CLIENT_EMAIL && process.env.LYCEE_MAIL_SA_PRIVATE_KEY)

function saEmail(): string | undefined {
  return DEDICATED_SA ? process.env.LYCEE_MAIL_SA_CLIENT_EMAIL : process.env.GOOGLE_SA_CLIENT_EMAIL
}

/** Numéro du projet Google Cloud du compte de service (activation de l'API Gmail). */
export function saProjectNumber(): string | null {
  return DEDICATED_SA
    ? process.env.LYCEE_MAIL_SA_PROJECT_NUMBER || null
    : process.env.GOOGLE_SA_PROJECT_NUMBER || '77694306982'
}

export function serviceAccountEmail(): string | null {
  return saEmail() ?? null
}

/** Scopes à coller dans la délégation (Meet compris si on partage son compte de service). */
export const DELEGATION_SCOPES = DEDICATED_SA ? GMAIL_SCOPES : ['https://www.googleapis.com/auth/calendar.events', ...GMAIL_SCOPES]

export function missingMailMigration() {
  return NextResponse.json(
    { error: 'Migration v65 (mails lycées) pas encore appliquée dans Supabase', missing_migration: true },
    { status: 503 },
  )
}

export function mailboxFor(mode: LyceeMode): string {
  const env = mode === 'diploma' ? process.env.LYCEE_MAIL_DIPLOMA : process.env.LYCEE_MAIL_AFEM
  return (env || DEFAULT_MAILBOXES[mode]).trim().toLowerCase()
}

export function allMailboxes(): { mode: LyceeMode; mailbox: string }[] {
  return LYCEE_MODES.map(m => ({ mode: m.id, mailbox: mailboxFor(m.id) }))
}

export function isGmailConfigured(): boolean {
  return Boolean(saEmail() && privateKey())
}

function privateKey(): string {
  return ((DEDICATED_SA ? process.env.LYCEE_MAIL_SA_PRIVATE_KEY : process.env.GOOGLE_SA_PRIVATE_KEY) || '').replace(/\\n/g, '\n')
}

export function gmailFor(mailbox: string): gmail_v1.Gmail {
  const auth = new google.auth.JWT({
    email: saEmail(),
    key: privateKey(),
    scopes: GMAIL_SCOPES,
    subject: mailbox,
  })
  return google.gmail({ version: 'v1', auth })
}

/** Message d'erreur Google lisible (délégation absente, boîte inconnue…). */
export function explainGoogleError(e: unknown): string {
  const err = e as { message?: string; response?: { data?: { error?: string | { message?: string }; error_description?: string } } }
  const apiErr = err.response?.data?.error
  const raw = [typeof apiErr === 'string' ? apiErr : apiErr?.message, err.response?.data?.error_description, err.message]
    .filter(Boolean).join(' — ')
  if (isGmailApiDisabled(raw)) {
    return 'API Gmail désactivée dans le projet Google Cloud du compte de service : cliquer sur « Activer l’API Gmail » ci-dessous (propriétaire du projet), puis attendre quelques minutes.'
  }
  if (/unauthorized_client/i.test(raw)) {
    return 'Délégation Google pas encore autorisée pour Gmail (ajouter les scopes dans la console d’administration Google).'
  }
  if (/invalid_grant|Invalid email or User ID|not found/i.test(raw)) {
    return 'Boîte introuvable dans le Workspace (adresse ou délégation à vérifier).'
  }
  if (/Precondition check failed|failedPrecondition/i.test(raw)) {
    return 'Gmail refuse l’accès à cette boîte (Gmail désactivé pour ce compte, ou délégation sur un autre Workspace).'
  }
  return raw || 'Erreur Google inconnue'
}

function isGmailApiDisabled(raw: string): boolean {
  return /has not been used in project|SERVICE_DISABLED|accessNotConfigured/i.test(raw)
}

let gmailApiEnableTried = false

/**
 * Active l'API Gmail sur le projet GCP du compte de service (best-effort, une
 * fois par instance) — comme lib/google-sheets.ts pour Sheets.
 */
async function ensureGmailApiEnabled(): Promise<void> {
  if (gmailApiEnableTried) return
  gmailApiEnableTried = true
  try {
    const auth = new google.auth.JWT({
      email: saEmail(),
      key: privateKey(),
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const projectNumber = saProjectNumber()
    if (!projectNumber) return
    await google.serviceusage({ version: 'v1', auth }).services.enable({ name: `projects/${projectNumber}/services/gmail.googleapis.com` })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!/already enabled|ALREADY_EXISTS/i.test(message)) console.warn('[lycee-mail] activation API Gmail :', message)
  }
}

function rawGoogleError(e: unknown): string {
  const err = e as { message?: string; response?: { data?: { error?: string | { message?: string } } } }
  const apiErr = err.response?.data?.error
  return [typeof apiErr === 'string' ? apiErr : apiErr?.message, err.message].filter(Boolean).join(' ')
}

/** ID client (numérique) du compte de service, à saisir dans la délégation. */
export async function serviceAccountClientId(): Promise<string | null> {
  if (!isGmailConfigured()) return null
  try {
    const auth = new google.auth.JWT({
      email: saEmail(),
      key: privateKey(),
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const { access_token } = await auth.authorize()
    if (!access_token) return null
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access_token)}`)
    const j = (await r.json().catch(() => ({}))) as { azp?: string; aud?: string }
    return j.azp || j.aud || null
  } catch {
    return null
  }
}

export async function mailboxStatus(mailbox: string): Promise<{ ok: boolean; error?: string; messagesTotal?: number }> {
  if (!isGmailConfigured()) return { ok: false, error: 'Compte de service Google absent (GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY).' }
  try {
    const { data } = await gmailFor(mailbox).users.getProfile({ userId: 'me' })
    return { ok: true, messagesTotal: data.messagesTotal ?? undefined }
  } catch (e) {
    if (isGmailApiDisabled(rawGoogleError(e))) await ensureGmailApiEnabled()
    return { ok: false, error: explainGoogleError(e) }
  }
}

// ── Construction du mail ────────────────────────────────────────────────────

export function encodeHeader(s: string): string {
  return /[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=` : s
}

export function address(name: string | null, email: string): string {
  return name ? `${encodeHeader(name.replace(/["\r\n]/g, ''))} <${email}>` : email
}

export function b64(buf: Buffer): string {
  return buf.toString('base64').replace(/.{76}/g, '$&\r\n')
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texte saisi → HTML sobre (paragraphes, listes « - », liens), comme un mail écrit à la main. */
export function textToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  const linkify = (s: string) => escapeHtml(s)
    .replace(/\bhttps?:\/\/[^\s<]+/g, u => `<a href="${u}" style="color:inherit">${u}</a>`)
  return blocks.map(block => {
    const lines = block.split('\n')
    const bullets = lines.filter(l => /^\s*[-•]\s+/.test(l))
    if (bullets.length && bullets.length === lines.length - (/[:：]\s*$/.test(lines[0]) ? 1 : 0)) {
      const intro = bullets.length < lines.length ? `<p style="margin:0 0 6px">${linkify(lines[0])}</p>` : ''
      const items = bullets.map(l => `<li style="margin:0 0 4px">${linkify(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')
      return `${intro}<ul style="margin:0 0 14px;padding-left:22px">${items}</ul>`
    }
    return `<p style="margin:0 0 14px">${lines.map(linkify).join('<br>')}</p>`
  }).join('\n')
}

function signature(mode: LyceeMode, mailbox: string, senderName: string | null) {
  const b = MAIL_BRANDS[mode]
  const html = `
<table cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:2px solid ${b.color};padding-top:12px">
  <tr>
    <td style="padding-right:14px;vertical-align:middle"><img src="${b.logoUrl}" alt="${escapeHtml(b.senderName)}" height="38" style="display:block;height:38px;width:auto"></td>
    <td style="vertical-align:middle;font-size:13px;line-height:1.5;color:#3d4a5c">
      ${senderName ? `<b style="color:#1a2438">${escapeHtml(senderName)}</b><br>` : ''}
      <span style="color:${b.color};font-weight:600">${escapeHtml(b.team)}</span><br>
      <a href="mailto:${mailbox}" style="color:#3d4a5c;text-decoration:none">${mailbox}</a> · <a href="${b.website}" style="color:#3d4a5c;text-decoration:none">${b.websiteLabel}</a>
    </td>
  </tr>
</table>`
  const text = `\n\n--\n${senderName ? `${senderName}\n` : ''}${b.team}\n${mailbox} · ${b.websiteLabel}`
  return { html, text }
}

async function loadPlaquette(mode: LyceeMode): Promise<{ filename: string; data: Buffer } | null> {
  const p = MAIL_BRANDS[mode].plaquette
  try {
    return { filename: p.filename, data: await readFile(path.join(process.cwd(), 'public', 'plaquettes', p.file)) }
  } catch {
    return null
  }
}

export type SendLyceeMailInput = {
  mode: LyceeMode
  to: string[]
  cc?: string[]
  subject: string
  text: string
  senderName: string | null
  attachPlaquette: boolean
  /** Réponse dans un fil existant */
  threadId?: string | null
  inReplyTo?: string | null
}

export type SentLyceeMail = {
  mailbox: string
  gmailId: string
  threadId: string | null
  messageIdHeader: string | null
  html: string
  text: string
  hasAttachment: boolean
}

export async function sendLyceeMail(input: SendLyceeMailInput): Promise<SentLyceeMail> {
  const mailbox = mailboxFor(input.mode)
  const brand = MAIL_BRANDS[input.mode]
  const sig = signature(input.mode, mailbox, input.senderName)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2a37;max-width:640px">\n${textToHtml(input.text)}\n${sig.html}\n</div>`
  const text = input.text.trim() + sig.text
  const plaquette = input.attachPlaquette ? await loadPlaquette(input.mode) : null
  if (input.attachPlaquette && !plaquette) throw new Error('Plaquette introuvable sur le serveur (public/plaquettes)')

  const mixed = `mixed_${crypto.randomUUID()}`
  const alt = `alt_${crypto.randomUUID()}`
  const headers = [
    `From: ${address(brand.senderName, mailbox)}`,
    `To: ${input.to.join(', ')}`,
    input.cc?.length ? `Cc: ${input.cc.join(', ')}` : null,
    `Subject: ${encodeHeader(input.subject)}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.inReplyTo ? `References: ${input.inReplyTo}` : null,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ].filter(Boolean)
  const parts = [
    `--${mixed}`,
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
  ]
  if (plaquette) {
    parts.push(
      `--${mixed}`,
      `Content-Type: application/pdf; name="${plaquette.filename}"`,
      `Content-Disposition: attachment; filename="${plaquette.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      b64(plaquette.data),
    )
  }
  parts.push(`--${mixed}--`, '')
  const raw = Buffer.from([...headers, '', ...parts].join('\r\n'), 'utf8').toString('base64url')

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
  return { mailbox, gmailId: sent.id!, threadId: sent.threadId ?? null, messageIdHeader, html, text, hasAttachment: !!plaquette }
}

// ── Relève des boîtes ───────────────────────────────────────────────────────

export function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string | null {
  const h = payload?.headers?.find(x => x.name?.toLowerCase() === name.toLowerCase())
  return h?.value ?? null
}

function decodeB64url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8')
}

export function bodies(part: gmail_v1.Schema$MessagePart | undefined, acc: { text: string; html: string; attachments: boolean }) {
  if (!part) return acc
  if (part.filename && part.body?.attachmentId) acc.attachments = true
  else if (part.mimeType === 'text/plain' && part.body?.data && !acc.text) acc.text = decodeB64url(part.body.data)
  else if (part.mimeType === 'text/html' && part.body?.data && !acc.html) acc.html = decodeB64url(part.body.data)
  for (const p of part.parts || []) bodies(p, acc)
  return acc
}

export function parseFrom(v: string | null): { name: string | null; email: string | null } {
  if (!v) return { name: null, email: null }
  const email = parseEmails(v)[0] ?? null
  const name = v.replace(/<[^>]*>/, '').replace(/"/g, '').trim()
  return { name: name && !name.includes('@') ? name : null, email }
}

export function isAutomated(msg: gmail_v1.Schema$Message, from: string | null): { skip: boolean; autoReply: boolean } {
  const p = msg.payload
  const auto = (header(p, 'Auto-Submitted') || 'no').toLowerCase() !== 'no'
  const subject = header(p, 'Subject') || ''
  const autoReply = auto || /^(r[ée]ponse automatique|absence|out of office|automatic reply|auto(matic)?[- ]reply)/i.test(subject)
  const bulk = !!header(p, 'List-Unsubscribe') || /bulk|list/i.test(header(p, 'Precedence') || '')
  const robot = /no-?reply|mailer-daemon|postmaster|notifications?@/i.test(from || '')
  return { skip: !autoReply && (bulk || robot), autoReply }
}

type Match = { uai: string | null; event_id: string | null }

async function matchByAddress(db: Db, emails: string[]): Promise<Match | null> {
  for (const e of emails) {
    const like = `%${e.replace(/[%_]/g, '')}%`
    const { data: c } = await db.from('lycee_contacts').select('uai').ilike('email', like).limit(1)
    if (c?.[0]?.uai) return { uai: c[0].uai as string, event_id: null }
    const { data: l } = await db.from('lycees').select('uai').ilike('email', like).limit(1)
    if (l?.[0]?.uai) return { uai: l[0].uai as string, event_id: null }
  }
  return null
}

function parisTodayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

export type SyncResult = { mailbox: string; fetched: number; stored: number; matched: number; error?: string }

/**
 * Relève une boîte : nouveaux mails reçus (rattachés au lycée par le fil Gmail
 * ou l'adresse de l'expéditeur) et mails envoyés directement depuis Gmail à un
 * contact connu. Les réponses créent une entrée au journal du lycée et un
 * rappel « Répondre au mail » pour aujourd'hui.
 */
export async function syncMailbox(db: Db, mode: LyceeMode): Promise<SyncResult> {
  const mailbox = mailboxFor(mode)
  const res: SyncResult = { mailbox, fetched: 0, stored: 0, matched: 0 }
  const { data: state } = await db.from('lycee_mail_sync').select('last_synced_at').eq('mailbox', mailbox).maybeSingle()
  const startedAt = new Date()
  const since = state?.last_synced_at
    ? new Date(new Date(state.last_synced_at as string).getTime() - 15 * 60_000)
    : new Date(Date.now() - 14 * 86400_000)
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
      } while (pageToken && ids.length < 300)
      res.fetched += ids.length
      if (!ids.length) continue

      const { data: known } = await db.from('lycee_emails').select('gmail_id').in('gmail_id', ids)
      const knownSet = new Set((known || []).map(k => k.gmail_id as string))
      for (const id of ids.filter(i => !knownSet.has(i))) {
        const { data: msg } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
        const stored = await storeMessage(db, mode, mailbox, msg, box === 'inbox' ? 'in' : 'out')
        if (stored.stored) res.stored++
        if (stored.matched) res.matched++
      }
    }
    await db.from('lycee_mail_sync').upsert({ mailbox, last_synced_at: startedAt.toISOString(), last_error: null, updated_at: new Date().toISOString() })
  } catch (e) {
    if (isGmailApiDisabled(rawGoogleError(e))) await ensureGmailApiEnabled()
    res.error = explainGoogleError(e)
    await db.from('lycee_mail_sync').upsert({ mailbox, last_error: res.error, updated_at: new Date().toISOString() })
  }
  return res
}

async function storeMessage(
  db: Db, mode: LyceeMode, mailbox: string, msg: gmail_v1.Schema$Message, direction: 'in' | 'out',
): Promise<{ stored: boolean; matched: boolean }> {
  const p = msg.payload
  const from = parseFrom(header(p, 'From'))
  if (direction === 'in' && from.email === mailbox) return { stored: false, matched: false }
  const to = parseEmails(header(p, 'To'))
  const cc = parseEmails(header(p, 'Cc'))
  const { skip, autoReply } = direction === 'in' ? isAutomated(msg, from.email) : { skip: false, autoReply: false }
  if (skip) return { stored: false, matched: false }

  // Rattachement : fil d'un mail déjà connu, sinon adresse d'un contact / du lycée
  let match: Match | null = null
  if (msg.threadId) {
    const { data } = await db.from('lycee_emails').select('uai, event_id')
      .eq('gmail_thread_id', msg.threadId).or('uai.not.is.null,event_id.not.is.null').order('sent_at', { ascending: false }).limit(1)
    if (data?.[0]) match = { uai: data[0].uai as string | null, event_id: data[0].event_id as string | null }
  }
  if (!match) match = await matchByAddress(db, direction === 'in' ? (from.email ? [from.email] : []) : [...to, ...cc])
  // Un mail envoyé depuis Gmail à quelqu'un d'inconnu ne concerne pas les lycées
  if (direction === 'out' && !match) return { stored: false, matched: false }

  const b = bodies(p, { text: '', html: '', attachments: false })
  const bodyText = (b.text || (b.html ? htmlToText(b.html) : '')).slice(0, 60_000)
  const sentAt = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString()
  const subject = header(p, 'Subject')
  const { data: row, error } = await db.from('lycee_emails').insert({
    uai: match?.uai ?? null,
    event_id: match?.event_id ?? null,
    mode, mailbox, direction,
    gmail_id: msg.id, gmail_thread_id: msg.threadId ?? null,
    message_id_header: header(p, 'Message-ID'),
    from_email: from.email, from_name: from.name,
    to_emails: to, cc_emails: cc,
    subject, body_text: bodyText, body_html: b.html ? b.html.slice(0, 200_000) : null,
    snippet: msg.snippet ?? null,
    has_attachments: b.attachments,
    author_name: direction === 'out' ? 'Envoyé depuis Gmail' : null,
    status: direction === 'in' ? 'received' : 'sent',
    read_at: direction === 'out' || autoReply ? new Date().toISOString() : null,
    sent_at: sentAt,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') return { stored: false, matched: false } // déjà enregistré (relève concurrente)
    throw new Error(error.message)
  }
  if (!match) return { stored: true, matched: false }

  const who = from.name || from.email || 'contact'
  const content = direction === 'in'
    ? `${autoReply ? 'Réponse automatique' : 'Réponse reçue'} de ${who}${subject ? ` — « ${subject} »` : ''}${msg.snippet ? `\n${decodeEntities(msg.snippet)}` : ''}`
    : `Mail envoyé depuis Gmail à ${to.join(', ')}${subject ? ` — « ${subject} »` : ''}`
  await db.from('lycee_activities').insert({
    uai: match.uai, event_id: match.event_id, kind: 'email', content: content.slice(0, 4000),
    author_name: direction === 'in' ? who : 'Gmail', email_id: row.id,
  })
  if (direction === 'in' && !autoReply) {
    const today = parisTodayKey()
    if (match.uai) {
      await db.from('lycees').update({
        last_email_in_at: sentAt, next_action_at: today, next_action: `Répondre au mail de ${who}`, updated_at: new Date().toISOString(),
      }).eq('uai', match.uai)
    }
    if (match.event_id) {
      await db.from('lycee_events').update({ next_action_at: today, updated_at: new Date().toISOString() }).eq('id', match.event_id)
    }
  }
  return { stored: true, matched: true }
}

export function decodeEntities(s: string): string {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export async function syncAllMailboxes(db: Db): Promise<SyncResult[]> {
  if (!isGmailConfigured()) return []
  return Promise.all(LYCEE_MODES.map(m => syncMailbox(db, m.id)))
}
