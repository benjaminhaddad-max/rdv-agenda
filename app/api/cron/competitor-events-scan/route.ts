/**
 * GET /api/cron/competitor-events-scan
 *
 * Planifié chaque jour à 5h UTC : le bot de veille cherche sur le web (Claude +
 * recherche web) les événements des prépas concurrentes (Antémed Epsilon, Médisup,
 * CPCM) et met à jour la table competitor_events.
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { runCompetitorEventsScan } from '@/lib/competitor-events'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  try {
    const summary = await runCompetitorEventsScan()
    return NextResponse.json(summary)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur veille' }, { status: 500 })
  }
}
