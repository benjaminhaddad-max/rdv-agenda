import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/segments — liste tous les segments sauvegardés
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('email_segments')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/segments — crée un segment
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (!body.name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_segments')
    .insert({
      name: body.name,
      description: body.description || null,
      filters: body.filters || {},
      contact_count: body.contact_count || 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
