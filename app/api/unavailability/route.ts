/**
 * Indisponibilités closers (plages horaires) — voir lib/unavailability.ts.
 *
 * GET    ?from=ISO&to=ISO        → { blocks, pool, can_manage_others }
 * POST   { start_at, end_at, reason?, user_ids?: string[], team?: boolean }
 *        closer : uniquement pour lui ; admin / manager : pour qui il veut
 *        (team = toute l'équipe, une seule ligne user_id NULL).
 * DELETE ?id=… | ?group_id=…     closer : ses propres plages ; admin : toutes.
 */

import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { isMissingUnavailabilityTable, loadCloserPool, loadUnavailability } from '@/lib/unavailability'

export const dynamic = 'force-dynamic'

const MIGRATION_MSG = 'Indisponibilités pas encore activées (migration BDD v56 à appliquer dans Supabase).'
const MANAGER_ROLES = new Set(['admin', 'manager'])

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'manager', 'closer', 'telepro'])
  if (!authz.ok) return authz.response

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'from et to (ISO) requis' }, { status: 400 })
  }

  const db = createServiceClient()
  try {
    const [blocks, pool] = await Promise.all([
      loadUnavailability(db, new Date(from).toISOString(), new Date(to).toISOString()),
      loadCloserPool(db),
    ])
    return NextResponse.json({
      blocks,
      pool: pool.map(p => ({ id: p.id, name: p.name, role: p.role })),
      me: authz.ctx.appUserId,
      can_manage_others: MANAGER_ROLES.has(authz.ctx.role),
      can_manage_self: MANAGER_ROLES.has(authz.ctx.role) || authz.ctx.role === 'closer',
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'manager', 'closer'])
  if (!authz.ok) return authz.response
  const { ctx } = authz

  const body = await req.json().catch(() => ({}))
  const start = new Date(String(body.start_at || ''))
  const end = new Date(String(body.end_at || ''))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: 'Plage horaire invalide' }, { status: 400 })
  }
  if (end.getTime() - start.getTime() > 62 * 24 * 3600_000) {
    return NextResponse.json({ error: 'Plage trop longue (2 mois max)' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) || null : null

  const canManageOthers = MANAGER_ROLES.has(ctx.role)
  let userIds: Array<string | null>
  if (canManageOthers && body.team === true) {
    userIds = [null]
  } else if (canManageOthers && Array.isArray(body.user_ids) && body.user_ids.length > 0) {
    userIds = [...new Set(body.user_ids.map((x: unknown) => String(x)).filter(Boolean))] as string[]
  } else {
    // Un closer ne bloque que pour lui (et un admin sans choix = pour lui)
    userIds = [ctx.appUserId]
  }

  const db = createServiceClient()
  if (userIds.some(id => id !== null && id !== ctx.appUserId)) {
    const pool = await loadCloserPool(db)
    const allowed = new Set(pool.map(p => p.id))
    allowed.add(ctx.appUserId)
    if (userIds.some(id => id !== null && !allowed.has(id))) {
      return NextResponse.json({ error: 'Closer inconnu' }, { status: 400 })
    }
  }

  const groupId = randomUUID()
  const rows = userIds.map(user_id => ({
    user_id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    reason,
    group_id: groupId,
    created_by: ctx.appUserId,
  }))
  const { data, error } = await db.from('rdv_unavailability').insert(rows).select()
  if (error) {
    if (isMissingUnavailabilityTable(error)) return NextResponse.json({ error: MIGRATION_MSG, migration_pending: true }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ blocks: data ?? [] }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'manager', 'closer'])
  if (!authz.ok) return authz.response
  const { ctx } = authz

  const id = req.nextUrl.searchParams.get('id')
  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!id && !groupId) return NextResponse.json({ error: 'id ou group_id requis' }, { status: 400 })

  const db = createServiceClient()
  let q = db.from('rdv_unavailability').delete()
  q = id ? q.eq('id', id) : q.eq('group_id', groupId as string)
  // Un closer ne supprime que ses propres plages
  if (!MANAGER_ROLES.has(ctx.role)) q = q.eq('user_id', ctx.appUserId)
  const { data, error } = await q.select('id')
  if (error) {
    if (isMissingUnavailabilityTable(error)) return NextResponse.json({ error: MIGRATION_MSG, migration_pending: true }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'Plage introuvable ou non autorisée' }, { status: 404 })
  return NextResponse.json({ deleted: data.length })
}
