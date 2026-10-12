/**
 * GET /api/cron/call-analysis
 * Analyse IA de tous les appels ≥ 2 min (avec ou sans RDV) des 7 derniers jours, par lots
 * (cf. lib/call-analysis.ts), puis synthèse coaching de la semaine en cours
 * (lundi → dimanche, comme la page Équipe) pour chaque télépro, tenue à jour.
 * Sans clés Deepgram / Anthropic : ne fait rien.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { isMissingAnalysisTable, refreshCoachings, runCallAnalysis } from '@/lib/call-analysis'
import { addParisDays, parisRangeUtcBounds, parisWeekStartKey } from '@/lib/date-paris'
import { logger } from '@/lib/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  if (!process.env.DEEPGRAM_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: true, skipped: 'clés Deepgram / Anthropic absentes' })
  }
  const db = createServiceClient()
  try {
    const now = Date.now()
    const result = await runCallAnalysis(db, {
      fromIso: new Date(now - 7 * 86_400_000).toISOString(),
      // L'IA lit l'issue dans l'appel ; 20 min laissent l'enregistrement et le RDV arriver
      toIso: new Date(now - 20 * 60_000).toISOString(),
      limit: 12,
    })
    // Synthèses coaching automatiques (semaine en cours, puis la précédente)
    const coaching: Record<string, unknown> = {}
    let budget = 3
    for (const weekStart of [parisWeekStartKey(new Date(now)), addParisDays(parisWeekStartKey(new Date(now)), -7)]) {
      if (budget <= 0) break
      const weekEnd = addParisDays(weekStart, 6)
      const { start, end } = parisRangeUtcBounds(weekStart, weekEnd)
      const r = await refreshCoachings(db, { fromDate: weekStart, toDate: weekEnd, fromIso: start, toIso: end, max: budget })
        .catch(e => ({ updated: 0, stale: 0, error: e instanceof Error ? e.message : String(e) }))
      coaching[weekStart] = r
      budget -= r.updated
    }
    return NextResponse.json({ ok: true, ...result, coaching })
  } catch (e) {
    if (isMissingAnalysisTable(e)) return NextResponse.json({ ok: true, skipped: 'migration v63 non appliquée' })
    logger.error('call-analysis', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  } finally {
    await logger.flush()
  }
}
