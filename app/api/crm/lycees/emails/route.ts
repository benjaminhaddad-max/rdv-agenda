import { NextRequest, NextResponse } from 'next/server'
import {
  authorNameOf, isMissingTable, loadEventFor, loadLyceeFor, logEventCall, logLyceeCall, requireLyceeAccess,
} from '@/lib/lycees-server'
import { cleanDate, cleanStr, LYCEE_MODES, oneOf } from '@/lib/lycees'
import { parseEmails, type LyceeEmailRow } from '@/lib/lycee-mail-shared'
import { isGmailConfigured, missingMailMigration, sendLyceeMail } from '@/lib/lycee-mail'

export const maxDuration = 60

const LIST_COLUMNS = 'id, uai, event_id, mode, mailbox, direction, gmail_thread_id, from_email, from_name, to_emails, cc_emails, subject, snippet, has_attachments, author_name, status, read_at, sent_at'

/**
 * GET /api/crm/lycees/emails?filter=all|in|out|unread|unassigned&limit=
 * Boîte « Mails » de l'onglet Lycées : envoyés et reçus des deux boîtes
 * partenariat. Les télépros ne voient que les mails de leurs lycées / forums ;
 * les mails non rattachés sont réservés aux admins.
 */
export async function GET(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { db, ctx, isManager } = a.access
  const filter = req.nextUrl.searchParams.get('filter') || 'all'
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 150, 500)

  let q = db.from('lycee_emails').select(LIST_COLUMNS).order('sent_at', { ascending: false }).limit(limit)
  if (filter === 'in') q = q.eq('direction', 'in')
  if (filter === 'out') q = q.eq('direction', 'out')
  if (filter === 'unread') q = q.eq('direction', 'in').is('read_at', null)
  if (filter === 'unassigned') q = q.is('uai', null).is('event_id', null)

  if (!isManager) {
    if (filter === 'unassigned') return NextResponse.json({ emails: [], lycees: {}, unread: 0 })
    const [{ data: ls }, { data: evs }] = await Promise.all([
      db.from('lycees').select('uai').eq('assigned_to', ctx.appUserId),
      db.from('lycee_events').select('id').eq('assigned_to', ctx.appUserId),
    ])
    const uais = (ls || []).map(l => l.uai as string)
    const ids = (evs || []).map(e => e.id as string)
    if (!uais.length && !ids.length) return NextResponse.json({ emails: [], lycees: {}, unread: 0 })
    const ors = [uais.length ? `uai.in.(${uais.map(u => `"${u}"`).join(',')})` : null, ids.length ? `event_id.in.(${ids.join(',')})` : null].filter(Boolean)
    q = q.or(ors.join(','))
  }

  const { data, error } = await q
  if (isMissingTable(error)) return missingMailMigration()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const emails = (data || []) as unknown as LyceeEmailRow[]

  // Noms des lycées / forums pour l'affichage
  const uaiSet = [...new Set(emails.map(e => e.uai).filter(Boolean))] as string[]
  const { data: names } = uaiSet.length
    ? await db.from('lycees').select('uai, name, city').in('uai', uaiSet)
    : { data: [] as { uai: string; name: string; city: string | null }[] }
  const lycees: Record<string, { name: string; city: string | null }> = {}
  for (const n of names || []) lycees[n.uai as string] = { name: n.name as string, city: (n.city as string) ?? null }

  let unreadQ = db.from('lycee_emails').select('id', { count: 'exact', head: true }).eq('direction', 'in').is('read_at', null)
  if (!isManager) unreadQ = unreadQ.in('id', emails.map(e => e.id))
  const { count } = await unreadQ
  return NextResponse.json({ emails, lycees, unread: count ?? 0, is_manager: isManager })
}

/**
 * POST /api/crm/lycees/emails — envoie un mail depuis la boîte de la marque.
 * Body : { mode, uai?, event_id?, to, cc?, subject, body, attach_plaquette,
 *          template_id?, reply_to_id?, next_action_at? }
 * Le mail part de partenariat@… (Gmail), il est gardé dans lycee_emails et
 * noté au journal (« Mail envoyé », rappel de relance).
 */
export async function POST(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { db, ctx } = a.access
  if (!isGmailConfigured()) return NextResponse.json({ error: 'Gmail n’est pas configuré sur le serveur (compte de service Google absent)' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const mode = oneOf(LYCEE_MODES, body.mode)
  if (!mode) return NextResponse.json({ error: 'Choisis la marque (Diploma Santé ou AFEM)' }, { status: 400 })
  const to = parseEmails(Array.isArray(body.to) ? body.to.join(',') : String(body.to ?? ''))
  const cc = parseEmails(Array.isArray(body.cc) ? body.cc.join(',') : String(body.cc ?? ''))
  const subject = cleanStr(body.subject, 300)
  const text = cleanStr(body.body, 20_000)
  if (!to.length) return NextResponse.json({ error: 'Ajoute au moins un destinataire valide' }, { status: 400 })
  if (to.length + cc.length > 10) return NextResponse.json({ error: '10 destinataires maximum' }, { status: 400 })
  if (!subject || !text) return NextResponse.json({ error: 'Objet et message obligatoires' }, { status: 400 })

  const uai = cleanStr(body.uai, 20)
  const eventId = cleanStr(body.event_id, 60)
  const lycee = uai ? await loadLyceeFor(a.access, uai) : null
  if (lycee && !lycee.ok) return lycee.response
  const ev = eventId ? await loadEventFor(a.access, eventId) : null
  if (ev && !ev.ok) return ev.response
  if (!lycee && !ev) return NextResponse.json({ error: 'Lycée ou forum manquant' }, { status: 400 })

  // Réponse dans un fil existant
  let threadId: string | null = null
  let inReplyTo: string | null = null
  const replyToId = cleanStr(body.reply_to_id, 60)
  if (replyToId) {
    const { data: prev, error } = await db.from('lycee_emails').select('gmail_thread_id, message_id_header, mode').eq('id', replyToId).maybeSingle()
    if (isMissingTable(error)) return missingMailMigration()
    if (prev && prev.mode === mode) {
      threadId = (prev.gmail_thread_id as string) ?? null
      inReplyTo = (prev.message_id_header as string) ?? null
    }
  }

  const author = await authorNameOf(db, ctx.appUserId)
  let sent
  try {
    sent = await sendLyceeMail({
      mode, to, cc, subject, text, senderName: author, attachPlaquette: body.attach_plaquette !== false, threadId, inReplyTo,
    })
  } catch (e) {
    return NextResponse.json({ error: `Envoi impossible : ${e instanceof Error ? e.message : 'erreur Gmail'}` }, { status: 502 })
  }

  const evRow = ev?.ok ? ev.ev : null
  const lyceeUai = lycee?.ok ? lycee.lycee.uai : evRow?.uai ?? null
  const { data: row, error: insErr } = await db.from('lycee_emails').insert({
    uai: lyceeUai, event_id: evRow?.id ?? null, mode, mailbox: sent.mailbox, direction: 'out',
    gmail_id: sent.gmailId, gmail_thread_id: sent.threadId, message_id_header: sent.messageIdHeader,
    from_email: sent.mailbox, from_name: author, to_emails: to, cc_emails: cc,
    subject, body_text: sent.text, body_html: sent.html, snippet: text.slice(0, 200),
    has_attachments: sent.hasAttachment, template_id: cleanStr(body.template_id, 60),
    author_id: ctx.appUserId, author_name: author, status: 'sent', read_at: new Date().toISOString(),
  }).select('id').single()
  // Le mail est parti : on ne renvoie pas d'erreur si l'archivage échoue
  if (insErr && !isMissingTable(insErr)) console.error('[lycee-emails] archivage', insErr.message)

  // Journal + suivi (comme un appel « Mail envoyé ») ; relance dans 7 jours par défaut
  const nextAt = 'next_action_at' in body ? cleanDate(body.next_action_at) : null
  const input = {
    kind: 'email' as const, outcome: 'mail_sent' as const,
    content: `« ${subject} » → ${to.join(', ')}${sent.hasAttachment ? ' (plaquette jointe)' : ''}`,
    nextActionAt: nextAt, nextAction: nextAt ? 'Relancer suite au mail' : null,
  }
  const logged = evRow ? await logEventCall(a.access, evRow, input) : lycee?.ok ? await logLyceeCall(a.access, lycee.lycee, input) : null
  const activityId = (logged?.activity as { id?: string } | undefined)?.id
  if (activityId && row?.id) await db.from('lycee_activities').update({ email_id: row.id }).eq('id', activityId)

  return NextResponse.json({ ok: true, id: row?.id ?? null, mailbox: sent.mailbox }, { status: 201 })
}
