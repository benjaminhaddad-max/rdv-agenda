/**
 * GET /api/cron/lycee-forums-scan
 *
 * Planifié chaque jour à 5h30 UTC : le bot cherche sur le web (Claude +
 * recherche web) les forums d'orientation 2026-2027 des lycées d'Île-de-France,
 * 3 départements par jour en rotation (tous les départements en 3 jours).
 * ?departments=77,93 pour forcer une liste.
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { departmentsDueToday, runLyceeForumsScan } from '@/lib/lycee-forums-scan'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  const forced = req.nextUrl.searchParams.get('departments')
  const deps = forced ? forced.split(',').map(s => s.trim()) : departmentsDueToday()
  try {
    return NextResponse.json(await runLyceeForumsScan(deps))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur veille forums' }, { status: 500 })
  }
}
