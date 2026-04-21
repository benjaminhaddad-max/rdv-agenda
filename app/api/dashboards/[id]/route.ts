import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/dashboards/[id] — dashboard + widgets
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const [dashRes, widgetsRes] = await Promise.all([
    db.from('dashboards').select('*').eq('id', id).single(),
    db.from('dashboard_widgets').select('*').eq('dashboard_id', id).order('position', { ascending: true }),
  ])
  if (dashRes.error) return NextResponse.json({ error: dashRes.error.message }, { status: 404 })

  return NextResponse.json({ ...dashRes.data, widgets: widgetsRes.data ?? [] })
}

// PATCH /api/dashboards/[id]
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const ALLOWED = ['name', 'description', 'icon', 'color', 'is_default', 'is_shared'] as const
  const patch: Record<string, unknown> = {}
  for (const k of ALLOWED) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }
  const db = createServiceClient()
  const { data, error } = await db.from('dashboards').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/dashboards/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('dashboards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
