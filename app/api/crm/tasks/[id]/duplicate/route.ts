import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/crm/tasks/[id]/duplicate — clone une tâche.
 *
 * La copie est créée en status='pending', completed_at=null, due_at conservé
 * (ou décalé d'un jour si déjà passé). Le nom reçoit "(copie)".
 *
 * Body optionnel : { due_at?: string } pour préciser une nouvelle échéance.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const { data: src, error: srcErr } = await db
    .from('crm_tasks')
    .select('title, description, owner_id, priority, task_type, due_at, hubspot_contact_id, hubspot_deal_id')
    .eq('id', id)
    .single()
  if (srcErr || !src) {
    return NextResponse.json({ error: srcErr?.message || 'Tâche introuvable' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  let dueAt: string | null = body.due_at ?? src.due_at ?? null
  // Si l'échéance est dans le passé, décale d'un jour pour rendre la copie utilisable
  if (dueAt && new Date(dueAt) < new Date()) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    dueAt = d.toISOString()
  }

  const { data: created, error: insErr } = await db
    .from('crm_tasks')
    .insert({
      title:               `${src.title} (copie)`,
      description:         src.description,
      owner_id:            src.owner_id,
      priority:            src.priority || 'normal',
      task_type:           src.task_type || 'follow_up',
      due_at:              dueAt,
      hubspot_contact_id:  src.hubspot_contact_id,
      hubspot_deal_id:     src.hubspot_deal_id,
      status:              'pending',
    })
    .select()
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ task: created })
}
