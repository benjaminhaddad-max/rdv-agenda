import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { runCompetitorEventsScan } from '@/lib/competitor-events'

export const maxDuration = 300

/** POST /api/crm/competitor-events/scan — lance la veille tout de suite (bouton de l'agenda Événements). */
export async function POST() {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response
  try {
    const summary = await runCompetitorEventsScan()
    return NextResponse.json(summary)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur veille' }, { status: 500 })
  }
}
