import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// PATCH /api/crm/views/[id] — update name / filter_groups
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServiceClient()
  const { id } = await params
  const body = await req.json()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name        !== undefined) patch.name         = body.name
  if (body.filter_groups !== undefined) patch.filter_groups = body.filter_groups
  if (body.position    !== undefined) patch.position     = body.position

  const { data, error } = await db
    .from('crm_saved_views')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/crm/views/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServiceClient()
  const { id } = await params
  const { error } = await db.from('crm_saved_views').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
