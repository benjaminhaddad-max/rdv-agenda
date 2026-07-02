import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processDueProgramSends } from '@/lib/email-programs'
import { requireCronSecret } from '@/lib/api-auth'

/**
 * GET /api/cron/email-programs-process
 * Envoie les mails de programme dus (J1, J3, J5…).
 */
export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const db = createServiceClient()
  try {
    const result = await processDueProgramSends(db, 150)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'cron failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
