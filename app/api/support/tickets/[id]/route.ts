import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUserOrPage } from '@/lib/api-auth'
import { signMessageAttachments } from '@/lib/support-server'
import type { SupportMessage } from '@/lib/support'
import { RESTRICTED_ROLE } from '@/lib/restricted-access'

/**
 * GET /api/support/tickets/[id] — ticket + fil de messages (pièces jointes signées)
 * PATCH /api/support/tickets/[id] — { status } : l'auteur peut clore (fait) ou rouvrir (nouveau), l'admin tout.
 *   Admin : { approval: 'approuve' | 'refuse', reason? } — demandes des comptes restreints (v84).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUserOrPage('service-technique')
  if (!auth.ok) return auth.response
  const { ctx } = auth
  const { id } = await params

  const db = createServiceClient()
  const { data: ticket } = await db.from('support_tickets').select('*').eq('id', id).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })
  if (ticket.author_id !== ctx.appUserId && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: messages } = await db
    .from('support_messages')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  if (ticket.author_id === ctx.appUserId && ticket.unread_for_author) {
    await db.from('support_tickets').update({ unread_for_author: false }).eq('id', id)
    ticket.unread_for_author = false
  }

  return NextResponse.json({
    ticket,
    messages: await signMessageAttachments((messages || []) as SupportMessage[]),
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUserOrPage('service-technique')
  if (!auth.ok) return auth.response
  const { ctx } = auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const db = createServiceClient()
  const { data: ticket } = await db.from('support_tickets').select('author_id, approval_status').eq('id', id).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })

  const isAdmin = ctx.role === 'admin'
  const isAuthor = ticket.author_id === ctx.appUserId

  // Approbation d'Aaron : approuvé → l'agent prend la demande ; refusé → pas fait (+ raison dans le fil)
  if (body.approval === 'approuve' || body.approval === 'refuse') {
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!ticket.approval_status) return NextResponse.json({ error: 'Cette demande ne demande pas d’approbation' }, { status: 400 })
    const now = new Date().toISOString()
    const approved = body.approval === 'approuve'
    if (!approved) {
      const reason = String(body.reason || '').trim().slice(0, 2000)
      const { data: me } = await db.from('rdv_users').select('name').eq('id', ctx.appUserId).maybeSingle()
      await db.from('support_messages').insert({
        ticket_id: id,
        author_type: 'user',
        author_id: ctx.appUserId,
        author_name: me?.name ?? null,
        body: `❌ Demande non approuvée.${reason ? `\n${reason}` : ''}`,
        attachments: [],
      })
    }
    const { data, error } = await db
      .from('support_tickets')
      .update({
        approval_status: body.approval,
        approval_decided_at: now,
        approval_decided_by: ctx.appUserId,
        status: approved ? 'nouveau' : 'pas_fait',
        resolved_at: approved ? null : now,
        claimed_at: null,
        updated_at: now,
        ...(approved ? {} : { last_message_at: now, unread_for_author: true }),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ticket: data })
  }
  const allowed = isAdmin
    ? ['nouveau', 'en_cours', 'besoin_infos', 'validation', 'fait', 'pas_fait']
    : isAuthor ? ['nouveau', 'fait'] : []
  if (!allowed.includes(body.status)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const done = body.status === 'fait' || body.status === 'pas_fait'
  const { data, error } = await db
    .from('support_tickets')
    .update({
      status: body.status,
      resolved_at: done ? new Date().toISOString() : null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
      // Compte restreint qui rouvre sa demande : nouvelle approbation d'Aaron
      ...(body.status === 'nouveau' && isAuthor && !isAdmin && ctx.role === RESTRICTED_ROLE
        ? { approval_status: 'en_attente', approval_decided_at: null, approval_decided_by: null }
        : {}),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ticket: data })
}
