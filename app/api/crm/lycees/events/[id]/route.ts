import { NextRequest, NextResponse } from 'next/server'
import { loadEventFor, loadLyceeFor, requireLyceeAccess } from '@/lib/lycees-server'
import { eventPatchFrom } from '@/lib/lycee-events-input'
import type { LyceeActivityRow, LyceeEventRow } from '@/lib/lycees'

/** GET /api/crm/lycees/events/:id — le forum, son lycée et le journal de ses appels. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const e = await loadEventFor(a.access, id)
  if (!e.ok) return e.response
  const { db } = a.access
  const [{ data: activities }, lycee] = await Promise.all([
    db.from('lycee_activities').select('*').eq('event_id', id).order('created_at', { ascending: false }).limit(100),
    e.ev.uai
      ? db.from('lycees').select('uai, name, city, department, phone, email, assigned_to').eq('uai', e.ev.uai).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
  ])
  return NextResponse.json({ event: e.ev, lycee, activities: (activities || []) as LyceeActivityRow[], is_manager: a.access.isManager })
}

/** PATCH /api/crm/lycees/events/:id — date, statut, intervenants, leads, rattachement, attribution (admin)… */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const e = await loadEventFor(a.access, id)
  if (!e.ok) return e.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { patch, error: invalid } = eventPatchFrom(body)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  if ('assigned_to' in body) {
    if (!a.access.isManager) return NextResponse.json({ error: 'Seul un admin peut attribuer un forum' }, { status: 403 })
    patch.assigned_to = typeof body.assigned_to === 'string' && body.assigned_to ? body.assigned_to : null
  }
  if (patch.uai && patch.uai !== e.ev.uai) {
    const l = await loadLyceeFor(a.access, patch.uai as string)
    if (!l.ok) return l.response
  }
  patch.updated_at = new Date().toISOString()
  const { data, error } = await a.access.db.from('lycee_events').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ev = data as LyceeEventRow
  if (ev.uai && ev.status === 'confirme' && ev.kind !== 'flying' && e.ev.status !== 'confirme') {
    await a.access.db.from('lycees').update({ status: 'obtenu', updated_at: new Date().toISOString() })
      .eq('uai', ev.uai).neq('status', 'obtenu')
  }
  return NextResponse.json({ event: ev })
}

/** DELETE /api/crm/lycees/events/:id */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const e = await loadEventFor(a.access, id)
  if (!e.ok) return e.response
  const { error } = await a.access.db.from('lycee_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
