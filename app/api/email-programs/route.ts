import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('email_programs')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name requis' }, { status: 400 })
  }

  const slug =
    body.slug?.trim() ||
    body.name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_programs')
    .insert({
      slug,
      name: body.name.trim(),
      description: body.description || null,
      interval_days: body.interval_days ?? 2,
      status: 'draft',
      crm_segment_ids: body.crm_segment_ids || [],
      marketing_audience_ids: body.marketing_audience_ids || [],
      extra_filters: body.extra_filters || {},
      prefill_form_slug: body.prefill_form_slug || null,
      start_at: body.start_at || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
