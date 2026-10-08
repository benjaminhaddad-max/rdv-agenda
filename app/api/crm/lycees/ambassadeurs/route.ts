import { NextRequest, NextResponse } from 'next/server'
import { fetchAllRows, isMissingTable, missingMigrationResponse, requireLyceeAccess } from '@/lib/lycees-server'
import { AMB_STATUSES, oneOf, type AmbassadeurRow, type LyceeRow } from '@/lib/lycees'

type LyceeLite = Pick<LyceeRow, 'uai' | 'name' | 'city' | 'department' | 'assigned_to' | 'status' | 'priority'>

/**
 * GET /api/crm/lycees/ambassadeurs?season=2026-2027
 *   Nos élèves de l'année rattachés à leur ancien lycée, avec leurs signaux
 *   Diploma Lab (table lycee_ambassadeurs, migration v61).
 *   Non-admins : élèves qui leur sont attribués + élèves de leurs lycées.
 * PATCH — modification groupée (admin) : { ids, patch: { assigned_to?, status? } }
 */
export async function GET(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { db, ctx, isManager } = a.access
  const season = req.nextUrl.searchParams.get('season') || '2026-2027'

  const ambs = await fetchAllRows<AmbassadeurRow>((from, to) =>
    db.from('lycee_ambassadeurs').select('*').eq('season', season).order('score', { ascending: false }).order('id').range(from, to))
  if (isMissingTable(ambs.error)) return missingMigrationResponse()
  if (ambs.error) return NextResponse.json({ error: ambs.error.message }, { status: 500 })

  const uais = [...new Set(ambs.data.map(x => x.uai).filter(Boolean))] as string[]
  const lycees = new Map<string, LyceeLite>()
  for (let i = 0; i < uais.length; i += 300) {
    const { data } = await db.from('lycees').select('uai, name, city, department, assigned_to, status, priority').in('uai', uais.slice(i, i + 300))
    for (const l of (data || []) as LyceeLite[]) lycees.set(l.uai, l)
  }
  const list = ambs.data
    .filter(x => isManager || x.assigned_to === ctx.appUserId || (!!x.uai && lycees.get(x.uai)?.assigned_to === ctx.appUserId))
    .map(x => ({ ...x, lycee: x.uai ? lycees.get(x.uai) ?? null : null }))
  return NextResponse.json({ ambassadeurs: list, is_manager: isManager })
}

export async function PATCH(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  if (!a.access.isManager) return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 3000) : []
  const raw = (body.patch || {}) as Record<string, unknown>
  if (!ids.length) return NextResponse.json({ error: 'Aucun élève sélectionné' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if ('assigned_to' in raw) patch.assigned_to = typeof raw.assigned_to === 'string' && raw.assigned_to ? raw.assigned_to : null
  if ('status' in raw) {
    const s = oneOf(AMB_STATUSES, raw.status)
    if (!s) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    patch.status = s
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  patch.updated_at = new Date().toISOString()
  for (let i = 0; i < ids.length; i += 300) {
    const { error } = await a.access.db.from('lycee_ambassadeurs').update(patch).in('id', ids.slice(i, i + 300))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: ids.length })
}
