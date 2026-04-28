import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/workflows/[id]/duplicate — clone un workflow + tous ses steps.
 *
 * Le nouveau workflow est créé en status='draft' avec name = "<original> (copie)".
 * Les compteurs (total_enrolled / completed / failed) sont remis à zéro.
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const { data: source, error: srcErr } = await db
    .from('crm_workflows')
    .select('name, description, trigger_type, trigger_config, enrollment_filters, re_enroll, active_hours, goal_filters')
    .eq('id', id)
    .single()
  if (srcErr || !source) {
    return NextResponse.json({ error: srcErr?.message || 'Workflow introuvable' }, { status: 404 })
  }

  const { data: created, error: insErr } = await db
    .from('crm_workflows')
    .insert({
      name:               `${source.name} (copie)`,
      description:        source.description,
      status:             'draft',
      trigger_type:       source.trigger_type,
      trigger_config:     source.trigger_config ?? {},
      enrollment_filters: source.enrollment_filters ?? {},
      re_enroll:          !!source.re_enroll,
      active_hours:       source.active_hours ?? {},
      goal_filters:       source.goal_filters ?? {},
    })
    .select()
    .single()
  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message || 'Échec création' }, { status: 500 })
  }

  // Cloner les steps
  const { data: steps } = await db
    .from('crm_workflow_steps')
    .select('sequence, step_type, config, label, skip_if_filters')
    .eq('workflow_id', id)
    .order('sequence', { ascending: true })

  if (steps && steps.length > 0) {
    const rows = steps.map(s => ({
      workflow_id:     created.id,
      sequence:        s.sequence,
      step_type:       s.step_type,
      config:          s.config ?? {},
      label:           s.label,
      skip_if_filters: s.skip_if_filters ?? {},
    }))
    await db.from('crm_workflow_steps').insert(rows)
  }

  return NextResponse.json({ ok: true, workflow: created })
}
