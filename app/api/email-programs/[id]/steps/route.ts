import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { defaultBrandStepBody, getBrandCharter } from '@/lib/brand-charter'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db
    .from('email_program_steps')
    .select('*, email_brands(slug, name, sender_email, active)')
    .eq('program_id', id)
    .order('step_index', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/** PUT — remplace toutes les étapes (batch) */
export async function PUT(req: Request, { params }: Params) {
  const { id: programId } = await params
  const body = await req.json().catch(() => ({}))
  const steps = Array.isArray(body.steps) ? body.steps : null
  if (!steps) return NextResponse.json({ error: 'steps[] requis' }, { status: 400 })

  const db = createServiceClient()

  await db.from('email_program_steps').delete().eq('program_id', programId)

  const rows = steps.map((s: Record<string, unknown>, i: number) => ({
    program_id: programId,
    step_index: s.step_index ?? i,
    day_offset: s.day_offset ?? i * 2,
    brand_id: s.brand_id || null,
    label: s.label || `J${(s.step_index as number ?? i) + 1}`,
    subject: s.subject || '',
    preheader: s.preheader || null,
    template_id: s.template_id || null,
    html_body:
      s.html_body ||
      (typeof s.brand_slug === 'string' && getBrandCharter(s.brand_slug)
        ? defaultBrandStepBody(getBrandCharter(s.brand_slug)!, String(s.label || `J${i + 1}`))
        : `<p>Bonjour {{prenom}},</p><p>${String(s.label || `J${i + 1}`)}</p>`),
    text_body: s.text_body || null,
  }))

  const { data, error } = await db.from('email_program_steps').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: Params) {
  const { id: programId } = await params
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()

  const { data, error } = await db
    .from('email_program_steps')
    .insert({
      program_id: programId,
      step_index: body.step_index ?? 0,
      day_offset: body.day_offset ?? 0,
      brand_id: body.brand_id || null,
      label: body.label || 'J1',
      subject: body.subject || '',
      preheader: body.preheader || null,
      template_id: body.template_id || null,
      html_body: body.html_body || (body.brand_slug && getBrandCharter(body.brand_slug)
        ? defaultBrandStepBody(getBrandCharter(body.brand_slug)!, body.label || 'J1')
        : `<p>Bonjour {{prenom}},</p>`),
      text_body: body.text_body || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
