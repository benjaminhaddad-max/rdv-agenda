/**
 * /api/cron/aircall-calls-sync
 *
 * Filet de sécurité : réimporte les appels Aircall des 6 dernières heures
 * (chevauchement) pour rattraper un webhook manqué.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import { isAircallEnabled, listAircallCalls } from '@/lib/aircall'
import { handleAircallCallEnded } from '@/lib/aircall-crm'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const LOOKBACK_MS = 6 * 60 * 60 * 1000
const MAX_PAGES = 8

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  if (!isAircallEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'aircall_disabled' })
  }

  const to = Math.floor(Date.now() / 1000)
  const from = Math.floor((Date.now() - LOOKBACK_MS) / 1000)
  const db = createServiceClient()

  let imported = 0
  let failed = 0
  let pages = 0
  let page = 1

  while (page && pages < MAX_PAGES) {
    const listed = await listAircallCalls({ from, to, page, perPage: 50 })
    if (!listed.ok) {
      return NextResponse.json({ error: listed.error, imported, pages }, { status: 502 })
    }
    pages += 1
    for (const call of listed.calls) {
      if (!call.id) continue
      try {
        await handleAircallCallEnded(db, call)
        imported += 1
      } catch {
        failed += 1
      }
    }
    if (!listed.nextPage) break
    page = listed.nextPage
  }

  return NextResponse.json({ ok: true, imported, failed, pages, from, to })
}
