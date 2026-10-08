/**
 * Planning d'appel des télépros — vue admin (page Équipe › Télépros › Planning).
 *
 * GET ?week=YYYY-MM-DD (ou ?from=&to=, 31 jours max) → semaine (lundi → dimanche) de tous les télépros actifs :
 *   créneaux (imposés ou non) + bilan Aircall de chaque jour (lib/telepro-planning.ts).
 * PUT { user_id, date, slots: [{ start, end, locked }], apply_to?: string[] }
 *   remplace les créneaux du jour ; apply_to recopie la même chose sur d'autres
 *   jours (ex. imposer 10h-13h du lundi au vendredi).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import {
  buildPlanningReport, loadTeleproTeam, PlanningError, replaceDaySlots, weekStartOf, type SlotInput,
} from '@/lib/telepro-planning'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  // ?from=&to= (vue Performance, jour / semaine / mois) sinon ?week= (vue Planning)
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const ranged = !!from && !!to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to
  const weekStart = ranged ? from! : weekStartOf(req.nextUrl.searchParams.get('week'))
  const days = ranged
    ? Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1
    : 7
  const db = createServiceClient()
  try {
    const telepros = await loadTeleproTeam(db)
    const { ready, dates, report } = await buildPlanningReport(db, telepros.map(t => t.id), weekStart, days)
    return NextResponse.json({ week_start: weekStart, ready, dates, telepros, report })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const body = await req.json().catch(() => ({}))
  const userId = String(body.user_id || '')
  const date = String(body.date || '')
  const slots = Array.isArray(body.slots) ? body.slots as SlotInput[] : []
  const applyTo = Array.isArray(body.apply_to) ? (body.apply_to as unknown[]).map(String) : []
  if (!userId || !date) return NextResponse.json({ error: 'user_id et date requis' }, { status: 400 })

  const db = createServiceClient()
  try {
    // apply_to : autres jours de la semaine + répétition sur plusieurs semaines
    const dates = [...new Set([date, ...applyTo])].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 200)
    for (let i = 0; i < dates.length; i += 10) {
      await Promise.all(dates.slice(i, i + 10).map(d =>
        replaceDaySlots(db, { userId, date: d, slots, actorId: authz.ctx.appUserId, asAdmin: true })))
    }
    return NextResponse.json({ ok: true, dates })
  } catch (e) {
    if (e instanceof PlanningError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
