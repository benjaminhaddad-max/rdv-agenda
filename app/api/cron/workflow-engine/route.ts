import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processExecution } from '@/lib/workflow-engine'

/**
 * GET /api/cron/workflow-engine
 *
 * Worker Vercel Cron : traite les executions de workflow dont next_run_at <= now()
 * et status in ('running', 'waiting'). Avance chaque execution d'1 step à la fois,
 * en chaînant les steps non-wait pour qu'un workflow rapide se complete dans
 * une seule invocation.
 *
 * Limite : 200 steps total par invocation pour rester < 60s Vercel.
 */
const MAX_STEPS_PER_RUN = 200

export async function GET() {
  const db = createServiceClient()
  const t0 = Date.now()

  // 1. Récupère les executions à traiter
  const { data: executions } = await db
    .from('crm_workflow_executions')
    .select('id, workflow_id, hubspot_contact_id, current_step_seq, status, trigger_context')
    .in('status', ['running', 'waiting'])
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true })
    .limit(100)

  if (!executions || executions.length === 0) {
    return NextResponse.json({ ok: true, processed_steps: 0, executions: 0 })
  }

  let totalSteps = 0
  let totalAdvanced = 0
  const errors: Array<{ execution_id: string; error: string }> = []

  for (const execution of executions) {
    if (totalSteps >= MAX_STEPS_PER_RUN) break
    if (Date.now() - t0 > 50_000) break  // ne dépasse pas 50s

    let keepGoing = true
    let chained = 0
    while (keepGoing && totalSteps < MAX_STEPS_PER_RUN && chained < 20) {
      try {
        keepGoing = await processExecution(db, execution as Parameters<typeof processExecution>[1])
        if (keepGoing) {
          // L'engine a avancé current_step_seq côté DB, on rafraîchit en local
          execution.current_step_seq += 1
          chained++
        }
        totalSteps++
      } catch (e) {
        errors.push({ execution_id: execution.id, error: e instanceof Error ? e.message : 'Unknown' })
        keepGoing = false
      }
    }
    totalAdvanced++
  }

  return NextResponse.json({
    ok: true,
    processed_steps: totalSteps,
    executions: totalAdvanced,
    elapsed_ms: Date.now() - t0,
    errors: errors.slice(0, 10),
  })
}
