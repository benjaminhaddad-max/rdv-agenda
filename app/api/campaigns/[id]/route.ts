import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/campaigns/[id] — récupère une campagne
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/campaigns/[id] — met à jour une campagne
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Champs autorisés à la mise à jour
  const ALLOWED = [
    'name', 'subject', 'preheader',
    'sender_email', 'sender_name', 'reply_to',
    'template_id', 'design_json', 'html_body', 'text_body',
    'segment_ids', 'extra_filters', 'manual_contact_ids',
    'status', 'scheduled_at',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const k of ALLOWED) {
    if (k in body) patch[k] = body[k]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_campaigns')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/campaigns/[id] — supprime (uniquement les drafts)
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  // Vérifier d'abord le statut : on ne supprime pas les campagnes envoyées
  const { data: existing, error: fetchErr } = await db
    .from('email_campaigns')
    .select('status')
    .eq('id', id)
    .single()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 })

  if (existing.status === 'sent' || existing.status === 'sending') {
    return NextResponse.json(
      { error: "Impossible de supprimer une campagne déjà envoyée. Archivez-la à la place." },
      { status: 400 }
    )
  }

  const { error } = await db.from('email_campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
