import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { enrollProgramAudience } from '@/lib/email-programs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const { data: program, error } = await db
    .from('email_programs')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const { data: steps } = await db
    .from('email_program_steps')
    .select('*, email_brands(slug, name, sender_email, active)')
    .eq('program_id', id)
    .order('step_index', { ascending: true })

  const { count: enrolled } = await db
    .from('email_program_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', id)

  return NextResponse.json({ ...program, steps: steps ?? [], enrolled: enrolled ?? 0 })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()

  const allowed = [
    'name', 'description', 'interval_days', 'status', 'start_at',
    'crm_segment_ids', 'marketing_audience_ids', 'extra_filters', 'prefill_form_slug',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (body[k] !== undefined) patch[k] = body[k]
  }

  const { data, error } = await db
    .from('email_programs')
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
  const { error } = await db.from('email_programs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** POST body: { action: 'enroll' } */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (body.action === 'enroll') {
    const db = createServiceClient()
    try {
      const result = await enrollProgramAudience(db, id)
      return NextResponse.json({ ok: true, ...result })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'enroll failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'action inconnue' }, { status: 400 })
}
