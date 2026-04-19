import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/email-templates — liste tous les templates
export async function GET(req: Request) {
  const url = new URL(req.url)
  const category = url.searchParams.get('category')

  const db = createServiceClient()
  let query = db
    .from('email_templates')
    .select('*')
    .order('updated_at', { ascending: false })

  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/email-templates — crée un template
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (!body.name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_templates')
    .insert({
      name: body.name,
      description: body.description || null,
      subject: body.subject || '',
      design_json: body.design_json || null,
      html_body: body.html_body || '',
      text_body: body.text_body || null,
      category: body.category || 'general',
      thumbnail_url: body.thumbnail_url || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
