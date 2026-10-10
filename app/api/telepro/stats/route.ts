/**
 * Espace télépro › « Mes stats » : ce que l'admin voit sur lui, limité à lui.
 *
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (31 jours max)
 *   → days : appels / décrochés / ≥ 2 min / temps de parole / RDV placés par jour
 *     (lib/telepro-planning.ts) ;
 *     rdv : devenir des RDV qu'il a placés sur la période ;
 *     calls : débrief IA de ses appels ≥ 2 min sans RDV (lib/call-analysis.ts).
 * GET ?call=<aircall_call_id> → transcription d'un de SES appels.
 * POST { action: 'coaching', from, to } → synthèse coaching de ses appels.
 * Un admin peut consulter un télépro avec ?user_id= (mode aperçu).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { parisRangeUtcBounds } from '@/lib/date-paris'
import { buildPlanningReport } from '@/lib/telepro-planning'
import { buildCallReport, buildCoaching } from '@/lib/call-analysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

// Mêmes règles que l'agenda (VENU_STATUSES de components/WeekCalendar.tsx)
const VENU = new Set(['a_travailler', 'pre_positif', 'positif', 'negatif', 'va_reflechir', 'preinscription'])
const GAGNE = new Set(['positif', 'preinscription'])

function parseRange(sp: URLSearchParams): { from: string; to: string; days: number } | null {
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return null
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS) + 1
  return days > 31 ? null : { from, to, days }
}

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  const sp = req.nextUrl.searchParams
  const asked = sp.get('user_id')
  const userId = asked && authz.ctx.role === 'admin' ? asked : authz.ctx.appUserId
  const db = createServiceClient()

  const callId = sp.get('call')
  if (callId) {
    const { data, error } = await db.from('call_analyses').select('transcript, rdv_user_id')
      .eq('aircall_call_id', Number(callId)).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.rdv_user_id !== userId) return NextResponse.json({ transcript: null })
    return NextResponse.json({ transcript: data.transcript ?? null })
  }

  const range = parseRange(sp)
  if (!range) return NextResponse.json({ error: 'from et to requis (31 jours max)' }, { status: 400 })
  const { start, end } = parisRangeUtcBounds(range.from, range.to)

  try {
    const [planning, rdvRows, calls] = await Promise.all([
      buildPlanningReport(db, [userId], range.from, range.days),
      db.from('rdv_appointments').select('status, start_at')
        .eq('telepro_id', userId).gte('created_at', start).lt('created_at', end)
        .then(r => (r.data ?? []) as Array<{ status: string; start_at: string }>),
      buildCallReport(db, { from: range.from, to: range.to, start, end, userId }).catch(() => null),
    ])

    // Devenir des RDV placés sur la période
    const now = Date.now()
    const rdv = { placed: rdvRows.length, upcoming: 0, venus: 0, no_show: 0, gagnes: 0, annules: 0, a_qualifier: 0 }
    for (const r of rdvRows) {
      if (r.status === 'annule') rdv.annules++
      else if (Date.parse(r.start_at) > now) rdv.upcoming++
      else if (r.status === 'no_show') rdv.no_show++
      else if (VENU.has(r.status)) { rdv.venus++; if (GAGNE.has(r.status)) rdv.gagnes++ }
      else rdv.a_qualifier++
    }

    return NextResponse.json({
      from: range.from,
      to: range.to,
      ready: planning.ready,
      days: planning.report[userId] ?? [],
      rdv,
      calls,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  const body = await req.json().catch(() => ({}))
  if (body.action !== 'coaching') return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  const range = parseRange(new URLSearchParams({ from: String(body.from || ''), to: String(body.to || '') }))
  if (!range) return NextResponse.json({ error: 'from et to requis (31 jours max)' }, { status: 400 })
  const userId = body.user_id && authz.ctx.role === 'admin' ? String(body.user_id) : authz.ctx.appUserId
  const { start, end } = parisRangeUtcBounds(range.from, range.to)
  try {
    return NextResponse.json(await buildCoaching(createServiceClient(), userId, range.from, range.to, start, end))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/call_coaching/i.test(msg)) return NextResponse.json({ error: 'Synthèse pas encore activée.' }, { status: 503 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
