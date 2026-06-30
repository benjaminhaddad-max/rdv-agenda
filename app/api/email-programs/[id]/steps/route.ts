import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { defaultBrandStepBody, getBrandCharter } from '@/lib/brand-charter'
import { buildHtmlFromContent, type ProgramStepContent } from '@/lib/marketing/step-content'

type Params = { params: Promise<{ id: string }> }

function prepareStepRow(
  programId: string,
  s: Record<string, unknown>,
  i: number,
) {
  const brandRel = s.email_brands as { slug?: string } | null | undefined
  const brandSlug = brandRel?.slug || (typeof s.brand_slug === 'string' ? s.brand_slug : null)
  const charter = brandSlug ? getBrandCharter(brandSlug) : null
  const label = String(s.label || `J${(s.step_index as number) ?? i + 1}`)
  const contentJson = s.content_json as ProgramStepContent | null | undefined

  let htmlBody = typeof s.html_body === 'string' ? s.html_body : ''
  if (contentJson?.version === 1 && charter) {
    htmlBody = buildHtmlFromContent(contentJson, charter, label)
  } else if (!htmlBody && charter) {
    htmlBody = defaultBrandStepBody(charter, label)
  } else if (!htmlBody) {
    htmlBody = `<p>Bonjour {{prenom}},</p><p>${label}</p>`
  }

  const row: Record<string, unknown> = {
    program_id: programId,
    step_index: (s.step_index as number) ?? i,
    day_offset: (s.day_offset as number) ?? i * 2,
    brand_id: s.brand_id || null,
    label,
    subject: s.subject || '',
    preheader: s.preheader || null,
    template_id: s.template_id || null,
    html_body: htmlBody,
    text_body: s.text_body || null,
  }
  if (contentJson?.version === 1) {
    row.content_json = contentJson
  }
  return row
}

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

  const rows = steps.map((s: Record<string, unknown>, i: number) =>
    prepareStepRow(programId, s, i),
  )

  let { data, error } = await db.from('email_program_steps').insert(rows).select()
  if (error?.message?.includes('content_json')) {
    const stripped = rows.map(r => {
      const { content_json, ...rest } = r as Record<string, unknown> & { content_json?: unknown }
      return rest
    })
    const retry = await db.from('email_program_steps').insert(stripped).select()
    data = retry.data
    error = retry.error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: Params) {
  const { id: programId } = await params
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()

  const row = prepareStepRow(programId, body as Record<string, unknown>, body.step_index ?? 0)

  const { data, error } = await db.from('email_program_steps').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
