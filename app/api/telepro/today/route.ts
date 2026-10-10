/**
 * Espace télépro › « À traiter aujourd'hui » (lib/telepro-today.ts).
 *
 * GET → objectifs + progression du jour, RDV d'aujourd'hui / demain, relances,
 *   leads à appeler classés par score. Un admin peut viser un télépro avec ?user_id=.
 * PUT { user_id?: string | null, goals: { calls, talk2, rdv } | null } (admin) →
 *   objectifs du jour d'un télépro (user_id) ou de l'équipe par défaut (sans user_id) ;
 *   goals null = revenir aux objectifs de l'équipe.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { buildToday, getGoals, setGoals } from '@/lib/telepro-today'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  const asked = req.nextUrl.searchParams.get('user_id')
  const userId = asked && authz.ctx.role === 'admin' ? asked : authz.ctx.appUserId
  const db = createServiceClient()
  const { data: user, error } = await db.from('rdv_users').select('id, hubspot_owner_id, hubspot_user_id').eq('id', userId).maybeSingle()
  if (error || !user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  try {
    const data = await buildToday(db, user)
    const { defaults } = await getGoals(userId)
    return NextResponse.json({ ...data, goals_default: defaults, can_edit_goals: authz.ctx.role === 'admin' })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const body = await req.json().catch(() => ({}))
  const userId = body.user_id ? String(body.user_id) : null
  const goals = body.goals && typeof body.goals === 'object' ? body.goals : null
  if (!userId && !goals) return NextResponse.json({ error: 'goals requis' }, { status: 400 })
  try {
    await setGoals(userId, goals)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
