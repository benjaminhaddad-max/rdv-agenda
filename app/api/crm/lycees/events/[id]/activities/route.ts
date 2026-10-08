import { NextRequest, NextResponse } from 'next/server'
import { loadEventFor, logEventCall, parseCallInput, requireLyceeAccess } from '@/lib/lycees-server'

/**
 * POST /api/crm/lycees/events/:id/activities — appel à l'organisateur d'un forum.
 * Body : { kind, outcome?, content?, next_action_at? }
 * « Obtenu » confirme le forum (et passe le lycée en « obtenu »), « Refus » le
 * marque refusé ; un forum détecté par la veille passe « à confirmer ».
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const e = await loadEventFor(a.access, id)
  if (!e.ok) return e.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = parseCallInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const r = await logEventCall(a.access, e.ev, parsed.input)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ activity: r.activity }, { status: 201 })
}
