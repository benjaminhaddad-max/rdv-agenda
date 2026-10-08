import { NextRequest, NextResponse } from 'next/server'
import { loadLyceeFor, requireLyceeAccess, type LyceeAccess } from '@/lib/lycees-server'
import { eventPatchFrom } from '@/lib/lycee-events-input'
import type { LyceeEventRow } from '@/lib/lycees'

async function loadEvent(access: LyceeAccess, id: string) {
  const { data, error } = await access.db.from('lycee_events').select('*').eq('id', id).maybeSingle()
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!data) return { ok: false as const, response: NextResponse.json({ error: 'Événement introuvable' }, { status: 404 }) }
  const ev = data as LyceeEventRow
  if (ev.uai) {
    const l = await loadLyceeFor(access, ev.uai)
    if (!l.ok) return l
  } else if (!access.isManager) {
    return { ok: false as const, response: NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 }) }
  }
  return { ok: true as const, ev }
}

/** PATCH /api/crm/lycees/events/:id — date, statut, intervenants, leads, rattachement à un lycée… */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const e = await loadEvent(a.access, id)
  if (!e.ok) return e.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { patch, error: invalid } = eventPatchFrom(body)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
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
  const e = await loadEvent(a.access, id)
  if (!e.ok) return e.response
  const { error } = await a.access.db.from('lycee_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
