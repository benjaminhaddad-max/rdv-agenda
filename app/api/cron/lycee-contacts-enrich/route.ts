/**
 * GET /api/cron/lycee-contacts-enrich
 *
 * Toutes les 10 min : cherche le contact de l'organisateur de 6 forums sans
 * mail connu (les plus proches d'abord) — voir lib/lycee-contacts-enrich.ts.
 * ?limit=10 pour en traiter plus.
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { runContactEnrichment } from '@/lib/lycee-contacts-enrich'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 6, 12)
  try {
    return NextResponse.json(await runContactEnrichment(createServiceClient(), limit))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur recherche contacts' }, { status: 500 })
  }
}
