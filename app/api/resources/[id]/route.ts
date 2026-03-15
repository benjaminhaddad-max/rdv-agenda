import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// PUT /api/resources/[id] — Modifier une ressource (admin)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()
  const body = await req.json()

  const allowed = ['title', 'type', 'url', 'content', 'category', 'roles', 'sort_order', 'active']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of allowed) {
    if (field in body) update[field] = body[field]
  }

  const { data, error } = await db
    .from('rdv_resources')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/resources/[id] — Supprimer une ressource (admin)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()

  const { error } = await db
    .from('rdv_resources')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
