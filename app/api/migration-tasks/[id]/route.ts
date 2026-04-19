import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/migration-tasks/[id]
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db
    .from('migration_tasks')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/migration-tasks/[id]
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const ALLOWED = [
    'title', 'description', 'category', 'priority', 'status',
    'complexity', 'order_index', 'hubspot_dep', 'notes', 'assignee',
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
    .from('migration_tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/migration-tasks/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('migration_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
