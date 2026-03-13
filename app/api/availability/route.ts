import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/availability?commercial_id=xxx&date=2025-03-10
// GET /api/availability?mode=rules&user_id=xxx  (returns raw rules for closer page)
// Returns available 30-min slots for a given commercial on a given date
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode')

  const db = createServiceClient()

  // ── Mode "rules" : retourne les règles brutes (pour la page closer) ──
  if (mode === 'rules') {
    const userId = searchParams.get('user_id')
    if (!userId) {
      return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
    }
    const { data, error } = await db
      .from('rdv_availability')
      .select('*')
      .eq('user_id', userId)
      .order('day_of_week', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Mode par défaut : slots disponibles pour une date ─────────────────
  const commercialId = searchParams.get('commercial_id')
  const date = searchParams.get('date') // "2025-03-10"

  if (!commercialId || !date) {
    return NextResponse.json({ error: 'commercial_id et date requis' }, { status: 400 })
  }

  const targetDate = new Date(date)
  const dayOfWeek = targetDate.getDay()

  // Check if this date is blocked for this closer
  const { data: blockedCheck } = await db
    .from('rdv_blocked_dates')
    .select('id')
    .eq('user_id', commercialId)
    .eq('blocked_date', date)
    .limit(1)

  if (blockedCheck && blockedCheck.length > 0) {
    return NextResponse.json([]) // Day is blocked → no slots
  }

  // Get availability rules for this day
  const { data: rules } = await db
    .from('rdv_availability')
    .select('*')
    .eq('user_id', commercialId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)

  if (!rules || rules.length === 0) {
    return NextResponse.json([])
  }

  // Get already booked appointments for this day
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const { data: booked } = await db
    .from('rdv_appointments')
    .select('start_at, end_at')
    .eq('commercial_id', commercialId)
    .neq('status', 'annule')
    .gte('start_at', dayStart.toISOString())
    .lte('start_at', dayEnd.toISOString())

  // Generate 30-min slots
  const slots: { start: string; end: string; available: boolean }[] = []

  for (const rule of rules) {
    const [startH, startM] = rule.start_time.split(':').map(Number)
    const [endH, endM] = rule.end_time.split(':').map(Number)

    const slotStart = new Date(date)
    slotStart.setHours(startH, startM, 0, 0)
    const slotEnd = new Date(date)
    slotEnd.setHours(endH, endM, 0, 0)

    const current = new Date(slotStart)
    while (current < slotEnd) {
      const slotEndTime = new Date(current)
      slotEndTime.setMinutes(slotEndTime.getMinutes() + 30)

      if (slotEndTime > slotEnd) break

      const bookingCount = booked?.filter(b => {
        const bStart = new Date(b.start_at)
        const bEnd = new Date(b.end_at)
        return bStart < slotEndTime && bEnd > current
      }).length || 0

      // Don't show past slots
      const now = new Date()
      const isInFuture = current > now

      if (isInFuture) {
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

// PUT /api/availability — Save availability rules for a commercial
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { user_id, rules } = body // rules: [{day_of_week, start_time, end_time, is_active}]

  if (!user_id || !rules) {
    return NextResponse.json({ error: 'user_id et rules requis' }, { status: 400 })
  }

  const db = createServiceClient()

  // Delete existing rules
  await db.from('rdv_availability').delete().eq('user_id', user_id)

  // Insert new rules
  const { data, error } = await db
    .from('rdv_availability')
    .insert(rules.map((r: { day_of_week: number; start_time: string; end_time: string; is_active: boolean }) => ({
      user_id,
      ...r,
    })))
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
