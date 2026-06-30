import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { listEmailBrands } from '@/lib/email-brands'

export async function GET() {
  const db = createServiceClient()
  try {
    const brands = await listEmailBrands(db)
    return NextResponse.json(brands)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body.slug || !body.name || !body.sender_email || !body.sender_name) {
    return NextResponse.json({ error: 'slug, name, sender_email, sender_name requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('email_brands')
    .insert({
      slug: String(body.slug).trim().toLowerCase(),
      name: body.name,
      sender_email: body.sender_email,
      sender_name: body.sender_name,
      reply_to: body.reply_to || body.sender_email,
      website_url: body.website_url || null,
      logo_url: body.logo_url || null,
      primary_color: body.primary_color || '#12314d',
      footer_html: body.footer_html || null,
      brevo_list_id: body.brevo_list_id || null,
      active: body.active !== false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
