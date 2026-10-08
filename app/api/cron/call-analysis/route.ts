/**
 * GET /api/cron/call-analysis
 * Analyse IA des appels ≥ 2 min sans RDV des 7 derniers jours, par lots
 * (cf. lib/call-analysis.ts). Sans clés Deepgram / Anthropic : ne fait rien.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { isMissingAnalysisTable, runCallAnalysis } from '@/lib/call-analysis'
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
      // Laisse 3 h au télépro pour poser le RDV avant de juger l'appel
      toIso: new Date(now - 3 * 3_600_000).toISOString(),
      limit: 12,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (isMissingAnalysisTable(e)) return NextResponse.json({ ok: true, skipped: 'migration v63 non appliquée' })
    logger.error('call-analysis', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  } finally {
    await logger.flush()
  }
}
