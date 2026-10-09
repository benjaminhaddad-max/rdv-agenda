import { NextRequest, NextResponse } from 'next/server'
import {
  authorNameOf, buildListItems, loadLyceeFor, logLyceeActivity, parisToday, requireLyceeAccess,
} from '@/lib/lycees-server'
import {
  cleanDate, cleanStr, LYCEE_MODES, LYCEE_PRIORITIES, LYCEE_STATUSES, lookup, oneOf,
  type AmbassadeurRow, type LyceeActivityRow, type LyceeContactRow, type LyceeEventRow,
} from '@/lib/lycees'

/**
 * GET /api/crm/lycees/:uai — fiche complète : lycée + score, contacts,
 * événements (toutes saisons), journal.
 * PATCH /api/crm/lycees/:uai — statut, priorité, mode, prochaine action, notes…
 *   (l'attribution est réservée aux admins / managers).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ uai: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { uai } = await params
  const l = await loadLyceeFor(a.access, uai)
  if (!l.ok) return l.response
  const { db } = a.access

  const [contacts, events, activities] = await Promise.all([
    db.from('lycee_contacts').select('*').eq('uai', uai).order('is_key', { ascending: false }).order('created_at'),
    db.from('lycee_events').select('*').eq('uai', uai).eq('hidden', false).order('date', { ascending: false, nullsFirst: false }),
    db.from('lycee_activities').select('*').eq('uai', uai).order('created_at', { ascending: false }).limit(200),
  ])
  const err = contacts.error || events.error || activities.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const [{ data: ambs }, { data: emails }] = await Promise.all([
    db.from('lycee_ambassadeurs').select('*').eq('uai', uai).order('score', { ascending: false }),
    // Mails partenariat (v65) : absents tant que la migration n'est pas passée
    db.from('lycee_emails')
      .select('id, event_id, mode, mailbox, direction, gmail_thread_id, from_email, from_name, to_emails, subject, snippet, has_attachments, author_name, read_at, sent_at')
      .eq('uai', uai).order('sent_at', { ascending: false }).limit(100),
  ])
  const cts = (contacts.data || []) as LyceeContactRow[]
  const evs = (events.data || []) as LyceeEventRow[]
  const [item] = buildListItems([l.lycee], cts, evs, parisToday())
  return NextResponse.json({
    lycee: item,
    contacts: cts,
    events: evs,
    activities: (activities.data || []) as LyceeActivityRow[],
    ambassadeurs: (ambs || []) as AmbassadeurRow[],
    emails: emails || [],
    is_manager: a.access.isManager,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uai: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const access = a.access
  const { uai } = await params
  const l = await loadLyceeFor(access, uai)
  if (!l.ok) return l.response
  const prev = l.lycee

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const logs: { kind: 'status' | 'assign'; text: string }[] = []

  if ('status' in body) {
    const s = oneOf(LYCEE_STATUSES, body.status)
    if (!s) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    if (s !== prev.status) {
      patch.status = s
      logs.push({ kind: 'status', text: `Statut : ${lookup(LYCEE_STATUSES, prev.status)?.label} → ${lookup(LYCEE_STATUSES, s)?.label}` })
    }
  }
  if ('priority' in body) patch.priority = oneOf(LYCEE_PRIORITIES, body.priority)
  if ('mode' in body) {
    const m = oneOf(LYCEE_MODES, body.mode)
    if (m !== prev.mode) {
      patch.mode = m
      logs.push({ kind: 'status', text: `Mode : ${lookup(LYCEE_MODES, m)?.label ?? 'à définir'}` })
    }
  }
  if ('assigned_to' in body) {
    if (!access.isManager) return NextResponse.json({ error: 'Seul un admin peut attribuer un lycée' }, { status: 403 })
    const to = typeof body.assigned_to === 'string' && body.assigned_to ? body.assigned_to : null
    if (to !== prev.assigned_to) {
      patch.assigned_to = to
      const name = to ? await authorNameOf(access.db, to) : null
      if (to && !name) return NextResponse.json({ error: 'Utilisateur inconnu' }, { status: 400 })
      logs.push({ kind: 'assign', text: to ? `Attribué à ${name}` : 'Attribution retirée' })
    }
  }
  if ('next_action' in body) patch.next_action = cleanStr(body.next_action, 300)
  if ('next_action_at' in body) patch.next_action_at = cleanDate(body.next_action_at)
  for (const k of ['notes', 'competition', 'phone', 'email', 'website'] as const) {
    if (k in body) patch[k] = cleanStr(body[k], k === 'notes' ? 8000 : 500)
  }
  if ('alumni_help' in body) patch.alumni_help = typeof body.alumni_help === 'boolean' ? body.alumni_help : null

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, unchanged: true })
  patch.updated_at = new Date().toISOString()
  const { data, error } = await access.db.from('lycees').update(patch).eq('uai', uai).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const author = logs.length ? await authorNameOf(access.db, access.ctx.appUserId) : null
  for (const log of logs) await logLyceeActivity(access, uai, log.kind, log.text, author)
  return NextResponse.json({ lycee: data })
}
