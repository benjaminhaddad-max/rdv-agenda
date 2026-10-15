/**
 * GET /api/cron/edumove-sync
 * Plateforme candidature.edumove.fr → CRM : contacts + dossiers de candidature
 * (crm_edumove_candidatures), voir lib/edumove-sync.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { edumoveDbConfigured, runEdumoveSync } from '@/lib/edumove-sync'
import { logger } from '@/lib/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  if (!edumoveDbConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'EDUMOVE_SUPABASE_URL / EDUMOVE_SUPABASE_SERVICE_ROLE_KEY absentes' })
  }
  const startMs = Date.now()
  try {
    const result = await runEdumoveSync(createServiceClient())
    return NextResponse.json({ ok: true, durationMs: Date.now() - startMs, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/migration v90/.test(msg)) return NextResponse.json({ ok: true, skipped: msg })
    logger.error('edumove-sync', e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    await logger.flush()
  }
}
