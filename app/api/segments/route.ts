import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { refreshSegmentContactCount } from '@/lib/segment-recipients'

function isMissingColumnError(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('column') || m.includes('segment_type') || m.includes('filter_groups')
}

// GET /api/segments — liste tous les segments sauvegardés
export async function GET() {
  const db = createServiceClient()
  const fullSelect = 'id, name, description, segment_type, filters, filter_groups, preset_flags, manual_contact_ids, contact_count, created_at, updated_at'
  let { data, error } = await db.from('email_segments').select(fullSelect).order('updated_at', { ascending: false })

  if (error && isMissingColumnError(error.message)) {
    const fallback = await db.from('email_segments').select('id, name, description, filters, contact_count, created_at, updated_at').order('updated_at', { ascending: false })
    data = (fallback.data ?? []).map(r => ({ ...r, segment_type: 'dynamic', filter_groups: [], preset_flags: null, manual_contact_ids: [] }))
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/segments — crée un segment ou une liste
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (!body.name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  const segmentType = body.segment_type === 'static' ? 'static' : 'dynamic'
  const insertPayload: Record<string, unknown> = {
    name: body.name,
    description: body.description || null,
    segment_type: segmentType,
    filters: body.filters || {},
    filter_groups: body.filter_groups ?? [],
    preset_flags: body.preset_flags ?? null,
    manual_contact_ids: body.manual_contact_ids ?? [],
    contact_count: 0,
  }

  const db = createServiceClient()
  let { data, error } = await db.from('email_segments').insert(insertPayload).select().single()

  if (error && isMissingColumnError(error.message)) {
    const legacy = await db.from('email_segments').insert({
      name: body.name,
      description: body.description || null,
      filters: body.filters || {},
      contact_count: 0,
    }).select().single()
    data = legacy.data
    error = legacy.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcule le contact_count en arrière-plan (best-effort)
  if (data?.id) {
    const cookies = req.headers.get('cookie') ?? ''
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    refreshSegmentContactCount(db, data.id, { baseUrl, cookies }).catch(() => {})
  }

  return NextResponse.json(data, { status: 201 })
}
