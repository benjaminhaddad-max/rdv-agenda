/**
 * POST /api/admin/bulk-replanifier
 *
 * Passe tous les deals en "RDV Pris" dont la closedate est <= cutoffDate
 * vers le stage "À replanifier" sur HubSpot.
 *
 * Body: { cutoffDate: "2026-02-09" }  (inclus)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  searchPastRdvPrisDeals,
  updateDealStage,
  PIPELINE_2026_2027,
} from '@/lib/hubspot'

export async function POST(req: NextRequest) {
  const { cutoffDate } = await req.json() as { cutoffDate?: string }

  if (!cutoffDate) {
    return NextResponse.json({ error: 'cutoffDate requis (ex: "2026-02-09")' }, { status: 400 })
  }

  // Parse cutoff as end of day
  const cutoff = new Date(cutoffDate + 'T23:59:59.999Z')

  // 1. Récupérer tous les deals passés encore en "RDV Pris"
  const allDeals = await searchPastRdvPrisDeals(PIPELINE_2026_2027)

  // 2. Filtrer ceux dont la closedate <= cutoff
  const toUpdate = allDeals.filter(d => {
    if (!d.properties.closedate) return false
    return new Date(d.properties.closedate) <= cutoff
  })

  // 3. Passer chaque deal en "À replanifier"
  const results: { id: string; dealname: string; status: 'ok' | 'error'; error?: string }[] = []

  for (const deal of toUpdate) {
    try {
      await updateDealStage(deal.id, 'aReplanifier')
      results.push({ id: deal.id, dealname: deal.properties.dealname, status: 'ok' })
    } catch (e) {
      results.push({
        id: deal.id,
        dealname: deal.properties.dealname,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const ok = results.filter(r => r.status === 'ok').length
  const errors = results.filter(r => r.status === 'error').length

  return NextResponse.json({
    total: allDeals.length,
    filtered: toUpdate.length,
    updated: ok,
    errors,
    results,
  })
}
