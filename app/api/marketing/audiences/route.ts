import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('marketing_audiences')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('marketing_audiences')
    .insert({
      name: body.name.trim(),
      description: body.description || null,
      source: body.source || 'import',
      tags: body.tags || [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
