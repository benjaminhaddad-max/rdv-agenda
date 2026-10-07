import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUser } from '@/lib/api-auth'
import { sanitizeAttachments } from '@/lib/support-server'

/**
 * GET /api/support/tickets — tickets de l'utilisateur (admin : tous, ?scope=all)
 * POST /api/support/tickets — { title, body, priority, page_url, attachments[] }
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const { ctx } = auth

  const db = createServiceClient()
  const showAll = ctx.role === 'admin' && req.nextUrl.searchParams.get('scope') === 'all'
  let q = db
    .from('support_tickets')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(200)
  if (!showAll) q = q.eq('author_id', ctx.appUserId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const tickets = data || []
  return NextResponse.json({
    tickets,
    unread: tickets.filter(t => t.author_id === ctx.appUserId && t.unread_for_author).length,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const { ctx } = auth

  const body = await req.json().catch(() => ({}))
  const title = String(body.title || '').trim().slice(0, 200)
  const text = String(body.body || '').trim().slice(0, 20000)
  const attachments = sanitizeAttachments(body.attachments, ctx.appUserId)
  if (!title) return NextResponse.json({ error: 'Titre requis' }, { status: 400 })
  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: 'Décris ta demande ou ajoute un fichier' }, { status: 400 })
  }
  const priority = ['basse', 'normale', 'urgente'].includes(body.priority) ? body.priority : 'normale'

  const db = createServiceClient()
  const { data: me } = await db.from('rdv_users').select('name').eq('id', ctx.appUserId).maybeSingle()

  const { data: ticket, error } = await db
    .from('support_tickets')
    .insert({
      title,
      author_id: ctx.appUserId,
      author_name: me?.name ?? null,
      author_role: ctx.role,
      page_url: typeof body.page_url === 'string' ? body.page_url.slice(0, 500) : null,
      priority,
    })
    .select()
    .single()
  if (error || !ticket) return NextResponse.json({ error: error?.message || 'Erreur' }, { status: 500 })

  const { error: msgErr } = await db.from('support_messages').insert({
    ticket_id: ticket.id,
    author_type: 'user',
    author_id: ctx.appUserId,
    author_name: me?.name ?? null,
    body: text,
    attachments,
  })
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  return NextResponse.json({ ticket })
}
