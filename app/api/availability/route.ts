import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { weekStartISO } from '@/lib/week'

/**
 * /api/availability — disponibilites des closers PAR SEMAINE.
 *
 * Modes :
 *  - GET ?commercial_id=X&date=YYYY-MM-DD
 *      Slots dispos (tranches 30min) pour ce closer ce jour-la, en utilisant
 *      les regles de la semaine du jour donne.
 *  - GET ?mode=rules&user_id=X&week_start=YYYY-MM-DD
 *      Regles brutes du closer pour la semaine indiquee. Si pas de
 *      week_start, on prend la semaine courante.
 *  - PUT { user_id, week_start, rules }
 *      Reecrit les regles d'un closer pour une semaine.
 *  - POST ?action=copy { user_id, from_week_start, to_week_start }
 *      Copie les regles d'une semaine source vers une cible.
 *  - DELETE ?user_id=X&week_start=YYYY-MM-DD
 *      Supprime toutes les regles d'un closer pour une semaine.
 *
 * Si la migration v26 n'est pas appliquee (table manquante), on retourne
 * 503 avec missing_migration='v26'. Le front affiche alors une banniere.
 */

const TABLE_NOT_EXIST_HINT = 'Migration v26 (rdv_availability_weekly) non appliquee. Va dans Disponibilites et clique sur "Activer le mode hebdomadaire".'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMissingTable(err: any): boolean {
  if (!err) return false
  const msg = (err.message || '').toString().toLowerCase()
  return msg.includes('does not exist') || (msg.includes('relation') && msg.includes('weekly'))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode')
  const db = createServiceClient()

  if (mode === 'rules') {
    const userId = searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
    const weekStart = searchParams.get('week_start') || weekStartISO(new Date())

    const { data, error } = await db
      .from('rdv_availability_weekly')
      .select('user_id, week_start, day_of_week, start_time, end_time, is_active')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .order('day_of_week', { ascending: true })

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ error: TABLE_NOT_EXIST_HINT, missing_migration: 'v26' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ rules: data ?? [], week_start: weekStart })
  }

  const commercialId = searchParams.get('commercial_id')
  const date = searchParams.get('date')
  if (!commercialId || !date) {
    return NextResponse.json({ error: 'commercial_id et date requis' }, { status: 400 })
  }

  const targetDate = new Date(date)
  const dayOfWeek = targetDate.getDay()
  const weekStart = weekStartISO(targetDate)

  const { data: blockedCheck } = await db
    .from('rdv_blocked_dates')
    .select('id')
    .eq('user_id', commercialId)
    .eq('blocked_date', date)
    .limit(1)
  if (blockedCheck && blockedCheck.length > 0) {
    return NextResponse.json([])
  }

  const { data: rules, error: rulesErr } = await db
    .from('rdv_availability_weekly')
    .select('start_time, end_time, is_active')
    .eq('user_id', commercialId)
    .eq('week_start', weekStart)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
  if (rulesErr) {
    if (isMissingTable(rulesErr)) {
      return NextResponse.json({ error: TABLE_NOT_EXIST_HINT, missing_migration: 'v26' }, { status: 503 })
    }
    return NextResponse.json({ error: rulesErr.message }, { status: 500 })
  }
  if (!rules || rules.length === 0) {
    return NextResponse.json([])
  }

  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
  const { data: booked } = await db
    .from('rdv_appointments')
    .select('start_at, end_at')
    .eq('commercial_id', commercialId)
    .neq('status', 'annule')
    .gte('start_at', dayStart.toISOString())
    .lte('start_at', dayEnd.toISOString())

  const slots: { start: string; end: string; available: boolean }[] = []
  for (const rule of rules) {
    const [sH, sM] = (rule.start_time as string).split(':').map(Number)
    const [eH, eM] = (rule.end_time as string).split(':').map(Number)
    const slotStart = new Date(date); slotStart.setHours(sH, sM, 0, 0)
    const slotEnd = new Date(date);   slotEnd.setHours(eH, eM, 0, 0)
    const current = new Date(slotStart)
    while (current < slotEnd) {
      const slotEndTime = new Date(current); slotEndTime.setMinutes(slotEndTime.getMinutes() + 30)
      if (slotEndTime > slotEnd) break
      const bookingCount = booked?.filter(b => {
        const bStart = new Date(b.start_at as string)
        const bEnd = new Date(b.end_at as string)
        return bStart < slotEndTime && bEnd > current
      }).length || 0
      if (current > new Date()) {
        slots.push({
          start: current.toISOString(),
          end: slotEndTime.toISOString(),
          available: bookingCount < 3,
        })
      }
      current.setMinutes(current.getMinutes() + 30)
    }
  }
  return NextResponse.json(slots)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { user_id, week_start, rules } = body as {
    user_id?: string
    week_start?: string
    rules?: Array<{ day_of_week: number; start_time: string; end_time: string; is_active: boolean }>
  }
  if (!user_id || !week_start || !Array.isArray(rules)) {
    return NextResponse.json({ error: 'user_id, week_start et rules requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error: delErr } = await db
    .from('rdv_availability_weekly')
    .delete()
    .eq('user_id', user_id)
    .eq('week_start', week_start)
  if (delErr) {
    if (isMissingTable(delErr)) {
      return NextResponse.json({ error: TABLE_NOT_EXIST_HINT, missing_migration: 'v26' }, { status: 503 })
    }
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  const rows = rules.map(r => ({
    user_id, week_start,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    end_time: r.end_time,
    is_active: !!r.is_active,
  }))
  if (rows.length === 0) return NextResponse.json({ ok: true, rules: [] })
  const { data, error } = await db.from('rdv_availability_weekly').insert(rows).select()
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: TABLE_NOT_EXIST_HINT, missing_migration: 'v26' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, rules: data })
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  if (action !== 'copy') {
    return NextResponse.json({ error: 'action inconnue' }, { status: 400 })
  }
  const body = await req.json()
  const { user_id, from_week_start, to_week_start } = body as {
    user_id?: string; from_week_start?: string; to_week_start?: string
  }
  if (!user_id || !from_week_start || !to_week_start) {
    return NextResponse.json({ error: 'user_id, from_week_start et to_week_start requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: source, error: srcErr } = await db
    .from('rdv_availability_weekly')
    .select('day_of_week, start_time, end_time, is_active')
    .eq('user_id', user_id)
    .eq('week_start', from_week_start)
  if (srcErr) {
    if (isMissingTable(srcErr)) {
      return NextResponse.json({ error: TABLE_NOT_EXIST_HINT, missing_migration: 'v26' }, { status: 503 })
    }
    return NextResponse.json({ error: srcErr.message }, { status: 500 })
  }
  if (!source || source.length === 0) {
    return NextResponse.json({ ok: true, copied: 0 })
  }

  await db.from('rdv_availability_weekly').delete().eq('user_id', user_id).eq('week_start', to_week_start)
  const rows = source.map(r => ({
    user_id, week_start: to_week_start,
    day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time, is_active: r.is_active,
  }))
  const { error } = await db.from('rdv_availability_weekly').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, copied: rows.length })
}

export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  const weekStart = req.nextUrl.searchParams.get('week_start')
  if (!userId || !weekStart) {
    return NextResponse.json({ error: 'user_id et week_start requis' }, { status: 400 })
  }
  const db = createServiceClient()
  const { error } = await db
    .from('rdv_availability_weekly')
    .delete()
    .eq('user_id', userId)
    .eq('week_start', weekStart)
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: TABLE_NOT_EXIST_HINT, missing_migration: 'v26' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
