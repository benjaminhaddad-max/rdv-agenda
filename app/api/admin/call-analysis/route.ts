/**
 * Analyse IA des appels ≥ 2 min sans RDV — page Équipe › Télépros › Appels.
 *
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → par télépro : appels ≥ 2 min, sans RDV,
 *   analysés, causes, note moyenne, RDV proposé ; + liste des appels analysés.
 * GET ?call=<aircall_call_id> → transcription d'un appel.
 * POST { from, to, user_id?, limit? } → analyse maintenant un lot d'appels.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { parisRangeUtcBounds } from '@/lib/date-paris'
import { buildCallReport, buildCoaching, isMissingAnalysisTable, runCallAnalysis } from '@/lib/call-analysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const db = createServiceClient()
  const sp = req.nextUrl.searchParams

  const callId = sp.get('call')
  if (callId) {
    const { data, error } = await db.from('call_analyses').select('transcript').eq('aircall_call_id', Number(callId)).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ transcript: data?.transcript ?? null })
  }

  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return NextResponse.json({ error: 'from et to requis' }, { status: 400 })
  const { start, end } = parisRangeUtcBounds(from, to)

  try {
    return NextResponse.json(await buildCallReport(db, { from, to, start, end }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const body = await req.json().catch(() => ({}))
  const from = String(body.from || '')
  const to = String(body.to || '')
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return NextResponse.json({ error: 'from et to requis' }, { status: 400 })
  const { start, end } = parisRangeUtcBounds(from, to)
  const db = createServiceClient()

  // Synthèse coaching d'un télépro sur la période
  if (body.action === 'coaching') {
    if (!body.user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
    try {
      const result = await buildCoaching(db, String(body.user_id), from, to, start, end)
      return NextResponse.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/call_coaching/i.test(msg)) return NextResponse.json({ error: 'Synthèse pas encore activée (migration BDD v64 à appliquer dans Supabase).' }, { status: 503 })
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  try {
    const result = await runCallAnalysis(db, {
      fromIso: start,
      toIso: new Date(Math.min(Date.parse(end), Date.now() - 3 * 3_600_000)).toISOString(),
      userIds: body.user_id ? [String(body.user_id)] : undefined,
      limit: Math.max(1, Math.min(8, Number(body.limit) || 8)),
    })
    return NextResponse.json(result)
  } catch (e) {
    if (isMissingAnalysisTable(e)) {
      return NextResponse.json({ error: 'Analyse pas encore activée (migration BDD v63 à appliquer dans Supabase).' }, { status: 503 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
