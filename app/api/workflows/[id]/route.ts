import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/workflows/[id] — workflow + steps
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const { data: wf, error } = await db.from('crm_workflows').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const { data: steps } = await db
    .from('crm_workflow_steps')
    .select('*')
    .eq('workflow_id', id)
    .order('sequence', { ascending: true })

  // Stats récentes
  const { count: running } = await db
    .from('crm_workflow_executions')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', id)
    .in('status', ['running', 'waiting'])

  return NextResponse.json({ ...wf, steps: steps ?? [], running_executions: running ?? 0 })
}

// PATCH /api/workflows/[id] — modifie le workflow
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const ALLOWED = ['name', 'description', 'status', 'trigger_type', 'trigger_config', 'enrollment_filters', 're_enroll', 'active_hours', 'goal_filters'] as const
  const patch: Record<string, unknown> = {}
  for (const k of ALLOWED) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no fields' }, { status: 400 })
  const db = createServiceClient()
  const { data, error } = await db.from('crm_workflows').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/workflows/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('crm_workflows').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
