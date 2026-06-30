import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { refreshAudienceMemberCount } from '@/lib/marketing-audiences'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const url = new URL(req.url)
  const members = url.searchParams.get('members') === '1'
  const db = createServiceClient()

  const { data: audience, error } = await db
    .from('marketing_audiences')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  if (!members) return NextResponse.json(audience)

  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const offset = Number(url.searchParams.get('offset') || 0)

  const { data: rows, error: mErr } = await db
    .from('marketing_audience_members')
    .select('id, email, first_name, last_name, phone, created_at, unsubscribed_at')
    .eq('audience_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
  return NextResponse.json({ audience, members: rows ?? [] })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.description !== undefined) patch.description = body.description
  if (body.tags !== undefined) patch.tags = body.tags
  if (body.brevo_list_id !== undefined) patch.brevo_list_id = body.brevo_list_id

  const { data, error } = await db
    .from('marketing_audiences')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('marketing_audiences').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
