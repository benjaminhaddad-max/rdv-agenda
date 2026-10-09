/**
 * GET /api/cron/inscriptions-sync
 * Plateforme d'inscription (Diploma + Medibox) → CRM : contacts, inscriptions
 * par marque / saison / étape, statut du lead (lib/inscriptions-sync.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { inscriptionDbConfigured, runInscriptionsSync } from '@/lib/inscriptions-sync'
import { logger } from '@/lib/logger'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  if (!inscriptionDbConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'INSCRIPTION_SUPABASE_URL / INSCRIPTION_SUPABASE_SERVICE_ROLE_KEY absentes' })
  }
  const startMs = Date.now()
  try {
    const result = await runInscriptionsSync(createServiceClient())
    return NextResponse.json({ ok: true, durationMs: Date.now() - startMs, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/migration v66/.test(msg)) return NextResponse.json({ ok: true, skipped: msg })
    logger.error('inscriptions-sync', e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    await logger.flush()
  }
}
