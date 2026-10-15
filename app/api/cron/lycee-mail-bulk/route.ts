/**
 * POST /api/cron/lycee-mail-bulk
 *
 * Envoi groupé de mails partenariat (ex. AFEM → organisateurs de forums) piloté
 * par un script : un appel = un mail, le script gère le rythme (montée en
 * charge progressive d'une boîte neuve). Le mail part de la boîte de la marque
 * (lib/lycee-mail.ts), avec la plaquette, une signature sans image et une ligne
 * de désinscription ; il est archivé et journalisé sur chaque forum concerné
 * comme un envoi fait depuis « Écrire un mail » (relance dans 7 jours).
 *
 * Body : { mode, event_id | uai, also_event_ids?, to, cc?, subject, body, author_id?, test? }
 * Avec uai (sans event_id) : mail à un lycée sans forum connu, journalisé sur la fiche du lycée.
 * test = true : envoie seulement (aperçu à soi-même), rien n'est archivé ni journalisé.
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { cleanStr, LYCEE_MODES, oneOf, type LyceeEventRow, type LyceeRow } from '@/lib/lycees'
import { parseEmails } from '@/lib/lycee-mail-shared'
import { isGmailConfigured, sendLyceeMail } from '@/lib/lycee-mail'

export const maxDuration = 60

const OPT_OUT = 'Si vous n’êtes pas la bonne personne ou ne souhaitez plus recevoir nos messages, une simple réponse suffit.'

export async function POST(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  if (!isGmailConfigured()) return NextResponse.json({ error: 'Gmail non configuré' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const mode = oneOf(LYCEE_MODES, body.mode)
  const to = parseEmails(Array.isArray(body.to) ? body.to.join(',') : String(body.to ?? ''))
  const cc = parseEmails(Array.isArray(body.cc) ? body.cc.join(',') : String(body.cc ?? ''))
  const subject = cleanStr(body.subject, 300)
  const text = cleanStr(body.body, 20_000)
  const eventId = cleanStr(body.event_id, 60)
  const also = (Array.isArray(body.also_event_ids) ? body.also_event_ids : []).map(x => cleanStr(x, 60)).filter(Boolean) as string[]
  const uaiIn = cleanStr(body.uai, 20)
  if (!mode || !to.length || !subject || !text || (!eventId && !uaiIn)) return NextResponse.json({ error: 'mode, event_id ou uai, to, subject et body obligatoires' }, { status: 400 })
  if (to.length + cc.length > 10) return NextResponse.json({ error: '10 destinataires maximum' }, { status: 400 })

  const db = createServiceClient()
  const test = body.test === true
  let events: LyceeEventRow[] = []
  let main: LyceeEventRow | null = null
  let lycee: LyceeRow | null = null
  if (eventId) {
    const { data: evs, error: evErr } = await db.from('lycee_events').select('*').in('id', [eventId, ...also])
    if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })
    events = (evs || []) as LyceeEventRow[]
    main = events.find(e => e.id === eventId) ?? null
    if (!main) return NextResponse.json({ error: 'Forum introuvable' }, { status: 404 })
    if (main.last_mail_mode && !test) return NextResponse.json({ error: 'Forum déjà contacté par mail', skipped: true }, { status: 409 })
  } else {
    const { data: l, error: lErr } = await db.from('lycees').select('*').eq('uai', uaiIn).maybeSingle()
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
    lycee = (l as LyceeRow | null) ?? null
    if (!lycee) return NextResponse.json({ error: 'Lycée introuvable' }, { status: 404 })
    if (lycee.last_mail_mode && !test) return NextResponse.json({ error: 'Lycée déjà contacté par mail', skipped: true }, { status: 409 })
  }

  const authorId = cleanStr(body.author_id, 60)
  const { data: author } = authorId ? await db.from('rdv_users').select('name').eq('id', authorId).maybeSingle() : { data: null }
  const authorName = (author?.name as string | undefined) ?? null

  let sent
  try {
    sent = await sendLyceeMail({ mode, to, cc, subject, text, senderName: null, attachPlaquette: true, noLogo: true, footerNote: OPT_OUT })
  } catch (e) {
    return NextResponse.json({ error: `Envoi impossible : ${e instanceof Error ? e.message : 'erreur Gmail'}` }, { status: 502 })
  }

  if (test) return NextResponse.json({ ok: true, test: true, gmail_id: sent.gmailId })

  // Le mail est parti : les erreurs d'archivage sont remontées mais ne font pas échouer l'appel
  const warnings: string[] = []
  const now = new Date().toISOString()
  const { data: row, error: insErr } = await db.from('lycee_emails').insert({
    uai: main?.uai ?? lycee?.uai ?? null, event_id: main?.id ?? null, mode, mailbox: sent.mailbox, direction: 'out',
    gmail_id: sent.gmailId, gmail_thread_id: sent.threadId, message_id_header: sent.messageIdHeader,
    from_email: sent.mailbox, from_name: authorName, to_emails: to, cc_emails: cc,
    subject, body_text: sent.text, body_html: sent.html, snippet: text.slice(0, 200),
    has_attachments: sent.hasAttachment, author_id: authorId, author_name: authorName, status: 'sent', read_at: now,
  }).select('id').single()
  if (insErr) warnings.push(`archivage : ${insErr.message}`)

  const next = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const summary = `« ${subject} » → ${[...to, ...cc].join(', ')}${sent.hasAttachment ? ' (plaquette jointe)' : ''} · envoi groupé`
  for (const ev of events) {
    const { error: actErr } = await db.from('lycee_activities').insert({
      uai: ev.uai, event_id: ev.id, kind: 'email', outcome: 'mail_sent', email_id: row?.id ?? null,
      content: `Forum${ev.date ? ` du ${ev.date.split('-').reverse().join('/')}` : ''} : Mail envoyé (demandé) — ${summary}`,
      author_id: authorId, author_name: authorName,
    })
    if (actErr) warnings.push(`journal ${ev.id} : ${actErr.message}`)
    const { error: upErr } = await db.from('lycee_events').update({
      last_contact_at: now, last_outcome: 'mail_sent', last_note: summary, calls_count: (ev.calls_count || 0) + 1,
      next_action_at: next, status: ev.status === 'detecte' ? 'a_confirmer' : ev.status, last_mail_mode: mode, updated_at: now,
    }).eq('id', ev.id)
    if (upErr) warnings.push(`forum ${ev.id} : ${upErr.message}`)
  }

  if (lycee) {
    const { error: actErr } = await db.from('lycee_activities').insert({
      uai: lycee.uai, kind: 'email', outcome: 'mail_sent', email_id: row?.id ?? null,
      content: `Mail envoyé (demandé) — ${summary}`, author_id: authorId, author_name: authorName,
    })
    if (actErr) warnings.push(`journal : ${actErr.message}`)
    const keep = ['obtenu', 'refus', 'non_cible'].includes(lycee.status)
    const { error: upErr } = await db.from('lycees').update({
      last_contact_at: now, last_outcome: 'mail_sent', last_note: summary, calls_count: (lycee.calls_count || 0) + 1,
      next_action_at: next, next_action: 'Relancer suite au mail', status: keep ? lycee.status : 'a_relancer',
      last_mail_mode: mode, updated_at: now,
    }).eq('uai', lycee.uai)
    if (upErr) warnings.push(`lycée : ${upErr.message}`)
  }

  return NextResponse.json({ ok: true, id: row?.id ?? null, gmail_id: sent.gmailId, warnings })
}
