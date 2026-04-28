import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { enrollContact, processExecution } from '@/lib/workflow-engine'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/workflows/[id]/test
 *
 * Body : { contact_id: string, run_now?: boolean }
 *
 * Enroll un contact spécifique dans le workflow (même si re_enroll=false :
 * on supprime d'abord toute execution de test précédente). Si run_now=true,
 * on traite immédiatement plusieurs steps inline pour voir le résultat
 * sans attendre le cron.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const contactId = String(body.contact_id || '')
  const runNow = body.run_now !== false

  if (!contactId) return NextResponse.json({ error: 'contact_id requis' }, { status: 400 })

  const db = createServiceClient()

  // Vérifie que le workflow existe (peu importe son status pour un test)
  const { data: wf, error: wfErr } = await db
    .from('crm_workflows')
    .select('id, status')
    .eq('id', id)
    .single()
  if (wfErr) return NextResponse.json({ error: wfErr.message }, { status: 404 })

  // Force un status temporaire 'active' si draft pour permettre l'enroll, puis restaure
  const wasDraft = wf.status === 'draft'
  if (wasDraft) {
    await db.from('crm_workflows').update({ status: 'active' }).eq('id', id)
  }

  // Supprime toute execution précédente pour ce couple (workflow, contact)
  await db.from('crm_workflow_executions').delete().eq('workflow_id', id).eq('hubspot_contact_id', contactId)

  // Enroll
  const enroll = await enrollContact(db, id, contactId, { source: 'test_run' })

  // Restaure le status
  if (wasDraft) {
    await db.from('crm_workflows').update({ status: 'draft' }).eq('id', id)
  }

  if (!enroll.enrolled) {
    return NextResponse.json({ ok: false, error: enroll.reason || 'enroll échoué' }, { status: 400 })
  }

  if (!runNow || !enroll.execution_id) {
    return NextResponse.json({ ok: true, execution_id: enroll.execution_id, processed: 0, status: 'queued' })
  }

  // Process inline jusqu'à 20 steps (limite anti-boucle)
  const { data: exec } = await db
    .from('crm_workflow_executions')
    .select('id, workflow_id, hubspot_contact_id, current_step_seq, status, trigger_context')
    .eq('id', enroll.execution_id)
    .single()
  if (!exec) return NextResponse.json({ ok: true, execution_id: enroll.execution_id, processed: 0 })

  let processed = 0
  let keepGoing = true
  while (keepGoing && processed < 20) {
    keepGoing = await processExecution(db, exec as Parameters<typeof processExecution>[1])
    if (keepGoing) {
      exec.current_step_seq += 1
      processed++
    } else {
      processed++
      break
    }
  }

  // Récupère le status final + logs
  const { data: finalExec } = await db
    .from('crm_workflow_executions')
    .select('id, status, current_step_seq, next_run_at, completed_at, error_message')
    .eq('id', enroll.execution_id)
    .single()
  const { data: logs } = await db
    .from('crm_workflow_logs')
    .select('step_type, status, output, error_message, executed_at')
    .eq('execution_id', enroll.execution_id)
    .order('executed_at', { ascending: true })

  return NextResponse.json({
    ok: true,
    execution: finalExec,
    processed_steps: processed,
    logs: logs ?? [],
  })
}
