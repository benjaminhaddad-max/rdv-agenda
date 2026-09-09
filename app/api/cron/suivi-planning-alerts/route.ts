/**
 * GET /api/cron/suivi-planning-alerts
 * Après la fin d’un créneau planning : si 0 appel sortant → mail au directeur.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { runPlanningAbsenceAlerts } from '@/lib/suivi-planning'
import { logger } from '@/lib/logger'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const db = createServiceClient()
  try {
    const result = await runPlanningAbsenceAlerts(db)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    await logger.flush()
  }
}
