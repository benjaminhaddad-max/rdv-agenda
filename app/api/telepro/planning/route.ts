/**
 * Planning d'appel — espace télépro (« Mon planning »).
 *
 * GET ?week=YYYY-MM-DD → ses créneaux de la semaine + bilan de chaque jour
 *   (+ RDV où il est closer).
 * PUT { date, slots: [{ start, end }], apply_to?: string[] } → remplace ses
 *   créneaux non imposés du jour (jour passé ou imposé par la direction :
 *   refusé). apply_to = récurrence : recopie sur d'autres jours (les jours
 *   passés ou imposés sont ignorés et comptés dans `skipped`).
 * PUT { days: [{ date, slots }] } → plusieurs jours d'un coup (créneau glissé
 *   d'un jour à l'autre sur la grille).
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
  const userId = authz.ctx.appUserId
  const toSlots = (raw: unknown) => (Array.isArray(raw) ? raw as SlotInput[] : []).map(s => ({ start: s.start, end: s.end }))
  const db = createServiceClient()
  try {
    // Plusieurs jours d'un coup (déplacement sur la grille) : tout ou rien côté contrôles
    if (Array.isArray(body.days)) {
      const days = (body.days as Array<{ date?: unknown; slots?: unknown }>).slice(0, 14)
      for (const d of days) {
        await replaceDaySlots(db, { userId, date: String(d.date || ''), slots: toSlots(d.slots), actorId: userId, asAdmin: false })
      }
      return NextResponse.json({ ok: true, dates: days.map(d => String(d.date || '')) })
    }

    const date = String(body.date || '')
    const slots = toSlots(body.slots)
    const rows = await replaceDaySlots(db, { userId, date, slots, actorId: userId, asAdmin: false })

    // Récurrence : mêmes horaires sur d'autres jours (passés / imposés ignorés)
    const applyTo = (Array.isArray(body.apply_to) ? (body.apply_to as unknown[]).map(String) : [])
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== date)
    const repeat = [...new Set(applyTo)].slice(0, 200)
    let skipped = 0
    for (let i = 0; i < repeat.length; i += 10) {
      await Promise.all(repeat.slice(i, i + 10).map(d =>
        replaceDaySlots(db, { userId, date: d, slots, actorId: userId, asAdmin: false }).catch(e => {
          if (e instanceof PlanningError && e.status !== 503) { skipped++; return }
          throw e
        })))
    }
    return NextResponse.json({ ok: true, slots: rows, repeated: repeat.length - skipped, skipped })
  } catch (e) {
    if (e instanceof PlanningError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
