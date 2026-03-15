import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/crm/views
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('crm_saved_views')
    .select('*')
    .order('position')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/crm/views — create
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const body = await req.json()
  const { id, name, filter_groups, preset_flags, position } = body

  const { data, error } = await db
    .from('crm_saved_views')
    .insert({ id, name, filter_groups: filter_groups ?? [], preset_flags: preset_flags ?? null, position: position ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
