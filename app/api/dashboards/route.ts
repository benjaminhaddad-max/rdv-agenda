import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/dashboards — liste tous les dashboards
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('dashboards')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/dashboards — crée un dashboard
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body.name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }
  const db = createServiceClient()
  const { data, error } = await db
    .from('dashboards')
    .insert({
      name: body.name,
      description: body.description || null,
      icon: body.icon || 'LayoutDashboard',
      color: body.color || '#ccac71',
      is_shared: body.is_shared ?? true,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
