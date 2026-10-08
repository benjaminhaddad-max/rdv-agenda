/**
 * Planning d'appel — espace télépro (« Mon planning »).
 *
 * GET ?week=YYYY-MM-DD → ses créneaux de la semaine + bilan de chaque jour.
 * PUT { date, slots: [{ start, end }] } → remplace ses créneaux non imposés du
 *   jour (jour passé ou jour imposé par la direction : refusé).
 * Un admin peut consulter le planning d'un télépro avec ?user_id=.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { buildPlanningReport, PlanningError, replaceDaySlots, weekStartOf, type SlotInput } from '@/lib/telepro-planning'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response

  const asked = req.nextUrl.searchParams.get('user_id')
  const userId = asked && authz.ctx.role === 'admin' ? asked : authz.ctx.appUserId
  const weekStart = weekStartOf(req.nextUrl.searchParams.get('week'))
  const db = createServiceClient()
  try {
    const { ready, dates, report } = await buildPlanningReport(db, [userId], weekStart)
    return NextResponse.json({ week_start: weekStart, ready, dates, days: report[userId] ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response

  const body = await req.json().catch(() => ({}))
  const date = String(body.date || '')
  const slots = (Array.isArray(body.slots) ? body.slots as SlotInput[] : []).map(s => ({ start: s.start, end: s.end }))
  const db = createServiceClient()
  try {
    const rows = await replaceDaySlots(db, {
      userId: authz.ctx.appUserId, date, slots, actorId: authz.ctx.appUserId, asAdmin: false,
    })
    return NextResponse.json({ ok: true, slots: rows })
  } catch (e) {
    if (e instanceof PlanningError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
