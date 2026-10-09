/**
 * GET /api/cron/lycee-mail-sync
 *
 * Toutes les 5 min : relève les boîtes partenariat@diploma-sante.fr et
 * partenariat@afem-edu.fr (Gmail) et range les réponses dans la fiche du
 * lycée concerné (voir lib/lycee-mail.ts).
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { syncAllMailboxes } from '@/lib/lycee-mail'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  try {
    return NextResponse.json({ results: await syncAllMailboxes(createServiceClient()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur relève mails lycées' }, { status: 500 })
  }
}
