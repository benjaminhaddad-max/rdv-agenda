import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parisMidnightUtc, addParisDays } from '@/lib/date-paris'
import { isUserUnavailable, isTeamBlocked, loadCloserPool, loadUnavailability, openSlotsForDay } from '@/lib/unavailability'

// GET /api/availability/pool?date=2025-03-10[&closerId=…]
//
// Créneaux de 30 min proposés à la prise de RDV (télépros, replanification
// prospect, CRM). Tous les créneaux de 9h à 21h (Paris) sont ouverts : plus
// de règles de disponibilité hebdomadaires. Un créneau n'est fermé que si
// toute l'équipe closers est indisponible (rdv_unavailability, cf.
// lib/unavailability.ts). `count` = nombre de closers disponibles.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // "2025-03-10"
  const closerId = searchParams.get('closerId')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date requis' }, { status: 400 })
  }

  const slots = openSlotsForDay(date)
  if (slots.length === 0) return NextResponse.json([])

  const db = createServiceClient()
  let blocks: Awaited<ReturnType<typeof loadUnavailability>> = []
  try {
    blocks = await loadUnavailability(
      db,
      parisMidnightUtc(date).toISOString(),
      parisMidnightUtc(addParisDays(date, 1)).toISOString(),
    )
  } catch {
    blocks = [] // en cas de souci, on garde les créneaux ouverts
  }

  // Sans aucune indisponibilité ce jour-là, pas besoin de charger l'équipe.
  let poolIds: string[] | null = null
  if (blocks.some(b => b.user_id !== null) || closerId) {
    const pool = await loadCloserPool(db)
    poolIds = closerId ? pool.filter(p => p.id === closerId).map(p => p.id) : pool.map(p => p.id)
    if (closerId && poolIds.length === 0) poolIds = [closerId]
    if (poolIds.length === 0) poolIds = null // aucune équipe connue : on reste ouvert
  }

  const out: Array<{ start: string; end: string; available: boolean; count: number }> = []
  for (const s of slots) {
    if (isTeamBlocked(blocks, s.start, s.end)) continue
    let count = 1
    if (poolIds) {
      count = poolIds.filter(id => !isUserUnavailable(blocks, id, s.start, s.end)).length
      if (count === 0) continue
    }
    out.push({ start: s.start.toISOString(), end: s.end.toISOString(), available: true, count })
  }

  return NextResponse.json(out)
}
