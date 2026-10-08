import { NextRequest, NextResponse } from 'next/server'
import {
  authorNameOf, fetchAllRows, isMissingTable, loadLyceeFor, logLyceeActivity, missingMigrationResponse, requireLyceeAccess,
} from '@/lib/lycees-server'
import { defaultSeason, eventPatchFrom } from '@/lib/lycee-events-input'
import { EVENT_KINDS, lookup, type LyceeEventRow, type LyceeRow } from '@/lib/lycees'

type LyceeLite = Pick<LyceeRow, 'uai' | 'name' | 'city' | 'department' | 'assigned_to' | 'mode' | 'priority' | 'status'>

/**
 * GET /api/crm/lycees/events?season=2026-2027&hidden=1
 *   Agenda des forums / interventions / flying (avec le lycée) + dernier passage du bot.
 *   Non-admins : événements de leurs lycées + événements hors lycée.
 * POST /api/crm/lycees/events — ajout manuel.
 */
export async function GET(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { db, ctx, isManager } = a.access
  const season = req.nextUrl.searchParams.get('season')
  const withHidden = req.nextUrl.searchParams.get('hidden') === '1'

  const evs = await fetchAllRows<LyceeEventRow>((from, to) => {
    let q = db.from('lycee_events').select('*').order('date', { ascending: true, nullsFirst: false }).range(from, to)
    if (season) q = q.eq('season', season)
    if (!withHidden) q = q.eq('hidden', false)
    return q
  })
  if (isMissingTable(evs.error)) return missingMigrationResponse()
  if (evs.error) return NextResponse.json({ error: evs.error.message }, { status: 500 })

  const uais = [...new Set(evs.data.map(e => e.uai).filter(Boolean))] as string[]
  const lycees = new Map<string, LyceeLite>()
  for (let i = 0; i < uais.length; i += 300) {
    const { data } = await db
      .from('lycees')
      .select('uai, name, city, department, assigned_to, mode, priority, status')
      .in('uai', uais.slice(i, i + 300))
    for (const l of (data || []) as LyceeLite[]) lycees.set(l.uai, l)
  }

  const events = evs.data
    .filter(e => isManager || !e.uai || lycees.get(e.uai)?.assigned_to === ctx.appUserId)
    .map(e => ({ ...e, lycee: e.uai ? lycees.get(e.uai) ?? null : null }))

  const { data: lastScan } = await db
    .from('lycee_forum_scans')
    .select('started_at, finished_at, found, inserted, updated, errors')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ events, last_scan: lastScan ?? null, is_manager: isManager })
}

export async function POST(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const access = a.access
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { patch, error: invalid } = eventPatchFrom(body)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const uai = (patch.uai as string | null) ?? null
  let lycee: LyceeRow | null = null
  if (uai) {
    const l = await loadLyceeFor(access, uai)
    if (!l.ok) return l.response
    lycee = l.lycee
  } else if (!patch.title) {
    return NextResponse.json({ error: 'Choisis un lycée ou donne un nom à l’événement' }, { status: 400 })
  }

  const row = {
    ...patch,
    uai,
    season: defaultSeason(patch),
    kind: patch.kind ?? 'forum',
    status: patch.status ?? (patch.date ? 'confirme' : 'a_confirmer'),
    source: 'manual',
    created_by: access.ctx.appUserId,
  }
  const { data, error } = await access.db.from('lycee_events').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (lycee) {
    const author = await authorNameOf(access.db, access.ctx.appUserId)
    const kind = lookup(EVENT_KINDS, row.kind as string)?.label ?? 'Événement'
    const date = patch.date as string | null | undefined
    const when = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : 'date à caler'
    await logLyceeActivity(access, lycee.uai, 'status', `${kind} ajouté : ${when}`, author)
    // Un forum / une inter confirmé(e) fait passer le lycée en « obtenu »
    if (row.status === 'confirme' && row.kind !== 'flying' && lycee.status !== 'obtenu') {
      await access.db.from('lycees').update({ status: 'obtenu', updated_at: new Date().toISOString() }).eq('uai', lycee.uai)
    }
  }
  return NextResponse.json({ event: data }, { status: 201 })
}
