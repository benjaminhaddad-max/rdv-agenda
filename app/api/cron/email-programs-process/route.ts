import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processDueProgramSends } from '@/lib/email-programs'

/**
 * GET /api/cron/email-programs-process
 * Envoie les mails de programme dus (J1, J3, J5…).
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (cronSecret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const db = createServiceClient()
  try {
    const result = await processDueProgramSends(db, 150)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'cron failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
