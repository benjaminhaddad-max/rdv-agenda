import { NextRequest, NextResponse } from 'next/server'
import { loadAmbassadeurFor, requireLyceeAccess } from '@/lib/lycees-server'
import { AMB_STATUSES, oneOf, type LyceeActivityRow } from '@/lib/lycees'

/** GET /api/crm/lycees/ambassadeurs/:id — l'élève et le journal de ses appels. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const r = await loadAmbassadeurFor(a.access, id)
  if (!r.ok) return r.response
  const { data } = await a.access.db.from('lycee_activities').select('*').eq('ambassadeur_id', id).order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ ambassadeur: r.amb, activities: (data || []) as LyceeActivityRow[] })
}

/** PATCH /api/crm/lycees/ambassadeurs/:id — statut, attribution (admin). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const r = await loadAmbassadeurFor(a.access, id)
  if (!r.ok) return r.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('status' in body) {
    const s = oneOf(AMB_STATUSES, body.status)
    if (!s) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    patch.status = s
  }
  if ('assigned_to' in body) {
    if (!a.access.isManager) return NextResponse.json({ error: 'Seul un admin peut attribuer' }, { status: 403 })
    patch.assigned_to = typeof body.assigned_to === 'string' && body.assigned_to ? body.assigned_to : null
  }
  const { data, error } = await a.access.db.from('lycee_ambassadeurs').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ambassadeur: data })
}
