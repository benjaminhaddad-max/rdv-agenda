import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * PATCH /api/crm/tasks/[id]
 * Body : champs à modifier (title, description, status, priority, due_at, owner_id…)
 * Si status passe à 'completed', set completed_at = now()
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id } = await params
  const body = await req.json()

  const update: Record<string, unknown> = {}
  const allowed = ['title','description','status','priority','task_type','due_at','owner_id','hubspot_contact_id','hubspot_deal_id']
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (body.status === 'completed') {
    update.completed_at = new Date().toISOString()
  }
  if (body.status === 'pending') {
    update.completed_at = null
  }

  const { data, error } = await db
    .from('crm_tasks')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id } = await params
  const { error } = await db.from('crm_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
