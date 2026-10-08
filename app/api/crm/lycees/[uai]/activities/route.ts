import { NextRequest, NextResponse } from 'next/server'
import { loadLyceeFor, logLyceeCall, parseCallInput, requireLyceeAccess } from '@/lib/lycees-server'

/**
 * POST /api/crm/lycees/:uai/activities — appel, mail, visite ou note.
 * Body : { kind, outcome?, content?, next_action_at?, next_action? }
 * Un appel met à jour la ligne du lycée comme un lead : dernier appel,
 * résultat, remarque, prochain rappel et statut (Obtenu / Refus / À relancer…).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uai: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { uai } = await params
  const l = await loadLyceeFor(a.access, uai)
  if (!l.ok) return l.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = parseCallInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const r = await logLyceeCall(a.access, l.lycee, parsed.input)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ activity: r.activity }, { status: 201 })
}

/** DELETE /api/crm/lycees/:uai/activities?id=… — l'auteur (ou un admin) retire une note. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uai: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { uai } = await params
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })
  const { db, ctx, isManager } = a.access
  let q = db.from('lycee_activities').delete().eq('id', id).eq('uai', uai).in('kind', ['note', 'call', 'email', 'visit'])
  if (!isManager) q = q.eq('author_id', ctx.appUserId)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
