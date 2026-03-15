import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// PUT /api/rdv-types/[key] — admin only
export async function PUT(req: NextRequest, { params }: { params: { key: string } }) {
  const db = createServiceClient()
  const body = await req.json()

  const allowed = ['title', 'subtitle', 'description', 'icon', 'btn_label', 'formation', 'tag', 'sort_order', 'active']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of allowed) {
    if (field in body) update[field] = body[field]
  }

  const { data, error } = await db
    .from('rdv_types')
    .update(update)
    .eq('key', params.key)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
