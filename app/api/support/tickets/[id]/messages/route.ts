import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUser } from '@/lib/api-auth'
import { isSupportSupervisor, sanitizeAttachments } from '@/lib/support-server'

/**
 * POST /api/support/tickets/[id]/messages — { body, attachments[] }
 * Une réponse du collègue remet le ticket dans la file de l'agent (status = nouveau).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const { ctx } = auth
  const { id } = await params

  const db = createServiceClient()
  const { data: ticket } = await db.from('support_tickets').select('author_id').eq('id', id).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })
  if (ticket.author_id !== ctx.appUserId && !(await isSupportSupervisor(ctx))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const text = String(body.body || '').trim().slice(0, 20000)
  const attachments = sanitizeAttachments(body.attachments, ctx.appUserId)
  if (!text && attachments.length === 0) return NextResponse.json({ error: 'Message vide' }, { status: 400 })

  const { data: me } = await db.from('rdv_users').select('name').eq('id', ctx.appUserId).maybeSingle()
  const { data: message, error } = await db
    .from('support_messages')
    .insert({
      ticket_id: id,
      author_type: 'user',
      author_id: ctx.appUserId,
      author_name: me?.name ?? null,
      body: text,
      attachments,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date().toISOString()
  await db
    .from('support_tickets')
    .update({ status: 'nouveau', claimed_at: null, resolved_at: null, last_message_at: now, updated_at: now })
    .eq('id', id)

  return NextResponse.json({ message })
}
