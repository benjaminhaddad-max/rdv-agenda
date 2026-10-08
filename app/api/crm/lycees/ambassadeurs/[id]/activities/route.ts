import { NextRequest, NextResponse } from 'next/server'
import { loadAmbassadeurFor, logAmbassadeurCall, parseCallInput, requireLyceeAccess } from '@/lib/lycees-server'

/**
 * POST /api/crm/lycees/ambassadeurs/:id/activities — appel à un élève ambassadeur.
 * « Obtenu » = l'élève accepte de parler de nous à son ancien lycée (statut OK).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const r = await loadAmbassadeurFor(a.access, id)
  if (!r.ok) return r.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = parseCallInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const res = await logAmbassadeurCall(a.access, r.amb, parsed.input)
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ activity: res.activity }, { status: 201 })
}
