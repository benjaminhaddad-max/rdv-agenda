import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/workflows — liste tous les workflows
export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const status = req.nextUrl.searchParams.get('status')
  let query = db.from('crm_workflows').select('*').order('updated_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/workflows — crée un nouveau workflow (en draft)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db.from('crm_workflows').insert({
    name,
    description:        body.description || null,
    trigger_type:       body.trigger_type || 'manual',
    trigger_config:     body.trigger_config || {},
    enrollment_filters: body.enrollment_filters || {},
    re_enroll:          !!body.re_enroll,
    status:             'draft',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
