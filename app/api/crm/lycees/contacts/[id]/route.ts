import { NextRequest, NextResponse } from 'next/server'
import { loadLyceeFor, requireLyceeAccess, type LyceeAccess } from '@/lib/lycees-server'
import { cleanStr } from '@/lib/lycees'

async function loadContact(access: LyceeAccess, id: string) {
  const { data, error } = await access.db.from('lycee_contacts').select('id, uai').eq('id', id).maybeSingle()
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!data) return { ok: false as const, response: NextResponse.json({ error: 'Contact introuvable' }, { status: 404 }) }
  const l = await loadLyceeFor(access, data.uai as string)
  if (!l.ok) return l
  return { ok: true as const }
}

/** PATCH /api/crm/lycees/contacts/:id */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const c = await loadContact(a.access, id)
  if (!c.ok) return c.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['name', 'role', 'email', 'phone', 'notes'] as const) {
    if (k in body) patch[k] = cleanStr(body[k], k === 'notes' ? 2000 : 300)
  }
  for (const k of ['is_alumni', 'is_key'] as const) {
    if (typeof body[k] === 'boolean') patch[k] = body[k]
  }
  const { data, error } = await a.access.db.from('lycee_contacts').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data })
}

/** DELETE /api/crm/lycees/contacts/:id */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const c = await loadContact(a.access, id)
  if (!c.ok) return c.response
  const { error } = await a.access.db.from('lycee_contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
