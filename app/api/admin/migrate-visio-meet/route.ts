/**
 * GET /api/admin/migrate-visio-meet
 *
 * One-shot : convertit les RDV visio à venir (lien /visio/ ou vide)
 * en vrais liens Google Meet.
 *
 *   ?dryRun=1   — liste seulement (défaut)
 *   ?execute=1  — applique en base
 *
 * Auth : Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isGoogleMeetConfigured } from '@/lib/google-meet'
import { runMigrateVisioToMeet } from '@/lib/migrate-visio-meet-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const execute = req.nextUrl.searchParams.get('execute') === '1'
  if (execute && !isGoogleMeetConfigured()) {
    return NextResponse.json(
      { error: 'Google Meet non configuré sur ce déploiement' },
      { status: 500 },
    )
  }

  try {
    const db = createServiceClient()
    const result = await runMigrateVisioToMeet(db, { execute })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[migrate-visio-meet]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur migration' },
      { status: 500 },
    )
  }
}
