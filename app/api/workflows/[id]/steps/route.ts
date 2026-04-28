import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/workflows/[id]/steps — liste les steps
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db
    .from('crm_workflow_steps')
    .select('*')
    .eq('workflow_id', id)
    .order('sequence', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/**
 * PUT /api/workflows/[id]/steps — remplace les steps en bloc
 *
 * Body: { steps: [{ step_type, config, label?, sequence? }, ...] }
 *
 * Stratégie : DELETE all + INSERT — simple et sûr pour un workflow encore
 * en édition (drafts). Pour un workflow actif, modifier les steps casse
 * potentiellement les executions en cours, on peut ajouter un check plus tard.
 */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const steps: Array<{ step_type: string; config?: Record<string, unknown>; label?: string }> = body.steps || []

  const db = createServiceClient()

  // Supprime les steps existants
  await db.from('crm_workflow_steps').delete().eq('workflow_id', id)

  if (steps.length === 0) return NextResponse.json({ ok: true, count: 0, steps: [] })

  // Réinsère avec sequence calculée par position
  const rows = steps.map((s, i) => ({
    workflow_id: id,
    sequence:    i,
    step_type:   s.step_type,
    config:      s.config ?? {},
    label:       s.label ?? null,
  }))

  const { data, error } = await db.from('crm_workflow_steps').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: rows.length, steps: data })
}
