import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/email-templates/[id]
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/email-templates/[id]
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const ALLOWED = ['name', 'description', 'subject', 'design_json', 'html_body', 'text_body', 'category', 'thumbnail_url'] as const
  const patch: Record<string, unknown> = {}
  for (const k of ALLOWED) {
    if (k in body) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_templates')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/email-templates/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('email_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
