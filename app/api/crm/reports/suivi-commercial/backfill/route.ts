/**
 * POST /api/crm/reports/suivi-commercial/backfill
 *
 * Importe une page d'appels Aircall (historique) dans aircall_calls.
 * Rate-limit Aircall = 60 req/min → une page (50 appels) par requête.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { isAircallEnabled, listAircallCalls } from '@/lib/aircall'
import { handleAircallCallEnded } from '@/lib/aircall-crm'
import { parisDateKey, parisMidnightUtc, addParisDays } from '@/lib/date-paris'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  if (!isAircallEnabled()) {
    return NextResponse.json({ error: 'Aircall non configuré' }, { status: 400 })
  }

  let body: { from?: string; to?: string; page?: number } = {}
  try {
    body = (await req.json()) as { from?: string; to?: string; page?: number }
  } catch {
    body = {}
  }

  const today = parisDateKey(new Date())
  const fromKey = /^\d{4}-\d{2}-\d{2}$/.test(body.from || '')
    ? body.from as string
    : addParisDays(today, -30)
  const toKey = /^\d{4}-\d{2}-\d{2}$/.test(body.to || '')
    ? body.to as string
    : today
  const page = Math.max(1, Number(body.page) || 1)

  const fromUnix = Math.floor(parisMidnightUtc(fromKey).getTime() / 1000)
  const toUnix = Math.floor(parisMidnightUtc(addParisDays(toKey, 1)).getTime() / 1000)

  const listed = await listAircallCalls({ from: fromUnix, to: toUnix, page, perPage: 50 })
  if (!listed.ok) {
    return NextResponse.json({ error: listed.error }, { status: 502 })
  }

  const db = createServiceClient()
  let imported = 0
  let failed = 0
  for (const call of listed.calls) {
    if (!call.id) continue
    try {
      await handleAircallCallEnded(db, call)
      imported += 1
    } catch {
      failed += 1
    }
  }

  return NextResponse.json({
    ok: true,
    from: fromKey,
    to: toKey,
    page: listed.page,
    next_page: listed.nextPage,
    done: listed.nextPage == null,
    total: listed.total,
    imported,
    failed,
    batch: listed.calls.length,
  })
}
