import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/segments/[id]
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db
    .from('email_segments')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/segments/[id]
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if ('name' in body) patch.name = body.name
  if ('description' in body) patch.description = body.description
  if ('filters' in body) patch.filters = body.filters
  if ('contact_count' in body) patch.contact_count = body.contact_count

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_segments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/segments/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('email_segments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
