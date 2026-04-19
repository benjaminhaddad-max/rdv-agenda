import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { BREVO_DEFAULT_SENDER } from '@/lib/brevo'

// GET /api/campaigns — liste toutes les campagnes (avec filtre status optionnel)
export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const db = createServiceClient()
  let query = db
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/campaigns — crée une nouvelle campagne (brouillon par défaut)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (!body.name || !body.subject) {
    return NextResponse.json(
      { error: 'Missing required fields: name, subject' },
      { status: 400 }
    )
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_campaigns')
    .insert({
      name: body.name,
      subject: body.subject,
      preheader: body.preheader || null,
      sender_email: body.sender_email || BREVO_DEFAULT_SENDER.email,
      sender_name: body.sender_name || BREVO_DEFAULT_SENDER.name,
      reply_to: body.reply_to || null,
      template_id: body.template_id || null,
      design_json: body.design_json || null,
      html_body: body.html_body || '',
      text_body: body.text_body || null,
      segment_ids: body.segment_ids || [],
      extra_filters: body.extra_filters || {},
      manual_contact_ids: body.manual_contact_ids || [],
      status: 'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
