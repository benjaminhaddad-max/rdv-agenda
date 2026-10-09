import { NextRequest, NextResponse } from 'next/server'
import { isMissingTable, loadEventFor, loadLyceeFor, requireLyceeAccess, type LyceeAccess } from '@/lib/lycees-server'
import { cleanStr } from '@/lib/lycees'
import { missingMailMigration } from '@/lib/lycee-mail'

type EmailAccessRow = { id: string; uai: string | null; event_id: string | null; gmail_thread_id: string | null; direction: string; from_name: string | null; from_email: string | null; subject: string | null; snippet: string | null }

/** Le mail est-il visible par cet utilisateur ? (lycée / forum attribué, ou admin) */
async function loadEmailFor(access: LyceeAccess, id: string, columns = '*') {
  const { data, error } = await access.db.from('lycee_emails').select(columns).eq('id', id).maybeSingle()
  if (isMissingTable(error)) return { ok: false as const, response: missingMailMigration() }
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!data) return { ok: false as const, response: NextResponse.json({ error: 'Mail introuvable' }, { status: 404 }) }
  const row = data as unknown as EmailAccessRow & Record<string, unknown>
  if (!access.isManager) {
    if (row.uai) {
      const l = await loadLyceeFor(access, row.uai)
      if (!l.ok) return l
    } else if (row.event_id) {
      const e = await loadEventFor(access, row.event_id)
      if (!e.ok) return e
    } else {
      return { ok: false as const, response: NextResponse.json({ error: 'Mail non rattaché (réservé aux admins)' }, { status: 403 }) }
    }
  }
  return { ok: true as const, row }
}

/** GET /api/crm/lycees/emails/:id — mail complet + le fil Gmail auquel il appartient. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const r = await loadEmailFor(a.access, id)
  if (!r.ok) return r.response
  const { data: thread } = r.row.gmail_thread_id
    ? await a.access.db.from('lycee_emails')
      .select('id, direction, from_email, from_name, to_emails, cc_emails, subject, body_text, has_attachments, author_name, sent_at, mode')
      .eq('gmail_thread_id', r.row.gmail_thread_id).order('sent_at')
    : { data: null }
  return NextResponse.json({ email: r.row, thread: thread ?? [r.row] })
}

/**
 * PATCH /api/crm/lycees/emails/:id
 *   { read: true }                 → marque la réponse (et son fil) comme lue
 *   { uai?: string, event_id?: string } → rattache un mail reçu (et son fil) à un lycée / forum
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const r = await loadEmailFor(a.access, id)
  if (!r.ok) return r.response
  const { db } = a.access
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const threadId = r.row.gmail_thread_id

  if (body.read === true) {
    const q = db.from('lycee_emails').update({ read_at: new Date().toISOString() }).is('read_at', null)
    await (threadId ? q.eq('gmail_thread_id', threadId) : q.eq('id', id))
  }

  if ('uai' in body || 'event_id' in body) {
    const uai = cleanStr(body.uai, 20)
    const eventId = cleanStr(body.event_id, 60)
    if (uai) {
      const l = await loadLyceeFor(a.access, uai)
      if (!l.ok) return l.response
    }
    if (eventId) {
      const e = await loadEventFor(a.access, eventId)
      if (!e.ok) return e.response
    }
    const wasUnassigned = !r.row.uai && !r.row.event_id
    const q = db.from('lycee_emails').update({ uai, event_id: eventId })
    const { error } = await (threadId ? q.eq('gmail_thread_id', threadId) : q.eq('id', id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Rattachement d'une réponse orpheline : elle apparaît au journal du lycée
    if (wasUnassigned && (uai || eventId)) {
      const who = r.row.from_name || r.row.from_email || 'contact'
      await db.from('lycee_activities').insert({
        uai, event_id: eventId, kind: 'email', email_id: id, author_name: who,
        content: `${r.row.direction === 'in' ? 'Réponse reçue' : 'Mail envoyé'} de ${who}${r.row.subject ? ` — « ${r.row.subject} »` : ''}${r.row.snippet ? `\n${r.row.snippet}` : ''}`.slice(0, 4000),
      })
      if (uai && r.row.direction === 'in') {
        await db.from('lycees').update({ last_email_in_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('uai', uai)
      }
    }
  }
  return NextResponse.json({ ok: true })
}
