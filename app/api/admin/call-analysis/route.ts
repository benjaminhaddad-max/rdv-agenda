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
import { CALL_CAUSES, CALL_CRITERIA, buildCoaching, findCandidates, isMissingAnalysisTable, runCallAnalysis } from '@/lib/call-analysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type AnalysisRow = {
  aircall_call_id: number
  rdv_user_id: string | null
  hubspot_contact_id: string | null
  started_at: string
  talk_sec: number | null
  status: string
  cause: string | null
  summary: string | null
  missing: string | null
  advice: string | null
  rdv_proposed: boolean | null
  score: number | null
  error: string | null
  criteria?: Record<string, number> | null
}

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
    const { candidates, talk2Total, directSales } = await findCandidates(db, { fromIso: start, toIso: end })
    const COLS = 'aircall_call_id, rdv_user_id, hubspot_contact_id, started_at, talk_sec, status, cause, summary, missing, advice, rdv_proposed, score, error'
    const query = (cols: string) => db.from('call_analyses').select(cols)
      .gte('started_at', start).lt('started_at', end)
      .order('started_at', { ascending: false })
      .limit(2000)
    // criteria (v64) : on retombe sans la colonne tant que la migration n'est pas passée
    let { data, error } = await query(`${COLS}, criteria`)
    if (error && /criteria/i.test(error.message)) ({ data, error } = await query(COLS))
    if (error) {
      if (isMissingAnalysisTable(error)) {
        return NextResponse.json({ ready: false, causes: CALL_CAUSES, team: {}, calls: [], ai_ready: aiReady() })
      }
      throw new Error(error.message)
    }
    const rows = (data ?? []) as unknown as AnalysisRow[]

    // Noms des contacts
    const contactIds = [...new Set(rows.map(r => r.hubspot_contact_id).filter((x): x is string => !!x))]
    const names = new Map<string, string>()
    for (let i = 0; i < contactIds.length; i += 200) {
      const { data: cs } = await db.from('crm_contacts').select('hubspot_contact_id, firstname, lastname')
        .in('hubspot_contact_id', contactIds.slice(i, i + 200))
      for (const c of cs ?? []) names.set(String(c.hubspot_contact_id), [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Contact')
    }

    // Agrégats par télépro
    const team: Record<string, {
      talk2: number; no_rdv: number; recorded: number; analyzed: number; pending: number; direct_sales: number
      causes: Record<string, number>; score_sum: number; proposed: number
      criteria_sum: Record<string, number>; criteria_n: number
    }> = {}
    const get = (id: string) => (team[id] ??= { talk2: 0, no_rdv: 0, recorded: 0, analyzed: 0, pending: 0, direct_sales: 0, causes: {}, score_sum: 0, proposed: 0, criteria_sum: {}, criteria_n: 0 })
    // Lignes Aircall sans enregistrement (appels sans RDV non analysables)
    const unrecordedLines: Record<string, number> = {}
    for (const [id, n] of talk2Total) get(id).talk2 = n
    for (const [id, n] of directSales) get(id).direct_sales = n
    const treated = new Set(rows.map(r => Number(r.aircall_call_id)))
    for (const c of candidates) {
      const t = get(c.rdv_user_id)
      t.no_rdv++
      if (!c.has_recording) {
        const k = c.line_name || 'Ligne inconnue'
        unrecordedLines[k] = (unrecordedLines[k] ?? 0) + 1
        continue
      }
      t.recorded++
      if (!treated.has(c.aircall_call_id)) t.pending++
    }
    for (const r of rows) {
      if (!r.rdv_user_id || r.status !== 'done') continue
      const t = get(r.rdv_user_id)
      t.analyzed++
      if (r.cause) t.causes[r.cause] = (t.causes[r.cause] ?? 0) + 1
      t.score_sum += r.score ?? 0
      if (r.rdv_proposed) t.proposed++
      if (r.criteria) {
        t.criteria_n++
        for (const c of CALL_CRITERIA) t.criteria_sum[c.id] = (t.criteria_sum[c.id] ?? 0) + (Number(r.criteria[c.id]) || 0)
      }
    }

    return NextResponse.json({
      ready: true,
      ai_ready: aiReady(),
      causes: CALL_CAUSES,
      criteria: CALL_CRITERIA,
      coaching: await loadCoaching(db, from, to),
      team,
      unrecorded_lines: unrecordedLines,
      calls: rows.map(r => ({ ...r, contact_name: r.hubspot_contact_id ? names.get(r.hubspot_contact_id) ?? null : null })),
    })
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

function aiReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && !!process.env.DEEPGRAM_API_KEY
}

/** Synthèses coaching déjà générées pour cette période, par télépro. */
async function loadCoaching(db: ReturnType<typeof createServiceClient>, from: string, to: string) {
  const { data, error } = await db.from('call_coaching')
    .select('rdv_user_id, calls_count, content, created_at')
    .eq('period_from', from).eq('period_to', to)
  if (error) return {}
  return Object.fromEntries((data ?? []).map(r => [r.rdv_user_id, { content: r.content, calls_count: r.calls_count, created_at: r.created_at }]))
}
