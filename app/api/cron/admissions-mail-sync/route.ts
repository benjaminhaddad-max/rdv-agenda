/**
 * GET /api/cron/admissions-mail-sync
 *
 * Toutes les 5 min : relève la boîte admissions@diploma-sante.fr (Gmail) et
 * range les mails échangés avec un contact du CRM (voir lib/admissions-mail.ts).
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { syncAdmissionsMailbox } from '@/lib/admissions-mail'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  try {
    return NextResponse.json(await syncAdmissionsMailbox(createServiceClient()))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur relève admissions@' }, { status: 500 })
  }
}
