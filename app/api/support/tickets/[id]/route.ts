import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUser } from '@/lib/api-auth'
import { isSupportSupervisor, signMessageAttachments } from '@/lib/support-server'
import type { SupportMessage } from '@/lib/support'

/**
 * GET /api/support/tickets/[id] — ticket + fil de messages (pièces jointes signées)
 * PATCH /api/support/tickets/[id] — { status } : l'auteur peut clore (fait) ou rouvrir (nouveau), le superviseur tout.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const { ctx } = auth
  const { id } = await params

  const db = createServiceClient()
  const { data: ticket } = await db.from('support_tickets').select('*').eq('id', id).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })
  if (ticket.author_id !== ctx.appUserId && !(await isSupportSupervisor(ctx))) {
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
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const { ctx } = auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const db = createServiceClient()
  const { data: ticket } = await db.from('support_tickets').select('author_id').eq('id', id).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })

  const isSupervisor = await isSupportSupervisor(ctx)
  const isAuthor = ticket.author_id === ctx.appUserId
  const allowed = isSupervisor
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
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ticket: data })
}
