import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/availability/pool?date=2025-03-10
// Returns aggregated available 30-min slots across ALL closers for a given date.
// The télépro sees a pool of slots without knowing which closer is behind each one.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // "2025-03-10"

  if (!date) {
    return NextResponse.json({ error: 'date requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const targetDate = new Date(date)
  const dayOfWeek = targetDate.getDay() // 0=Sun, 1=Mon...

  // 1. Get ALL active closers (role=closer or admin)
  const { data: closers } = await db
    .from('rdv_users')
    .select('id')
    .in('role', ['closer', 'admin'])

  if (!closers || closers.length === 0) {
    return NextResponse.json([])
  }

  const closerIds = closers.map(c => c.id)

  // 2. Get blocked dates for this date — exclude these closers
  const { data: blocked } = await db
    .from('rdv_blocked_dates')
    .select('user_id')
    .eq('blocked_date', date)
    .in('user_id', closerIds)

  const blockedIds = new Set((blocked || []).map(b => b.user_id))
  const availableCloserIds = closerIds.filter(id => !blockedIds.has(id))

  if (availableCloserIds.length === 0) {
    return NextResponse.json([])
  }

  // 3. Get availability rules for this day of week for available closers
  const { data: rules } = await db
    .from('rdv_availability')
    .select('*')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .in('user_id', availableCloserIds)

  if (!rules || rules.length === 0) {
    return NextResponse.json([])
  }

  // 4. Get all booked appointments for this date (non-cancelled)
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const { data: booked } = await db
    .from('rdv_appointments')
    .select('commercial_id, start_at, end_at')
    .neq('status', 'annule')
    .gte('start_at', dayStart.toISOString())
    .lte('start_at', dayEnd.toISOString())
    .in('commercial_id', availableCloserIds)

  // 5. For each closer, generate their slots and track availability
  // Use a Map: slot_key (start ISO) → count of available closers
  const slotMap = new Map<string, { start: string; end: string; count: number }>()

  const now = new Date()

  for (const rule of rules) {
    const closerId = rule.user_id
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

      // Skip past slots
      if (current <= now) {
        current.setMinutes(current.getMinutes() + 30)
        continue
      }

      // Check how many bookings this closer has at this time (max 3 simultaneous)
      const bookingCount = booked?.filter(b =>
        b.commercial_id === closerId &&
        new Date(b.start_at) < slotEndTime &&
        new Date(b.end_at) > current
      ).length || 0

      if (bookingCount < 3) {
        const key = current.toISOString()
        const existing = slotMap.get(key)
        if (existing) {
          existing.count++
        } else {
          slotMap.set(key, {
            start: current.toISOString(),
            end: slotEndTime.toISOString(),
            count: 1,
          })
        }
      }

      current.setMinutes(current.getMinutes() + 30)
    }
  }

  // 6. Return sorted slots
  const slots = Array.from(slotMap.values())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map(s => ({
      start: s.start,
      end: s.end,
      available: true,
      count: s.count,
    }))

  return NextResponse.json(slots)
}
