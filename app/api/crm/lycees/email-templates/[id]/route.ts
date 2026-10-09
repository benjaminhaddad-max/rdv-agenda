import { NextRequest, NextResponse } from 'next/server'
import { requireLyceeAccess } from '@/lib/lycees-server'
import { cleanStr, LYCEE_MODES, oneOf } from '@/lib/lycees'
import { MAIL_PURPOSES } from '@/lib/lycee-mail-shared'

/** PATCH /api/crm/lycees/email-templates/:id — modifie un modèle (admin). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  if (!a.access.isManager) return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: a.access.ctx.appUserId }
  if ('name' in body) patch.name = cleanStr(body.name, 120)
  if ('subject' in body) patch.subject = cleanStr(body.subject, 300)
  if ('body' in body) patch.body = cleanStr(body.body, 20_000)
  if ('mode' in body) patch.mode = oneOf(LYCEE_MODES, body.mode)
  if ('purpose' in body) patch.purpose = oneOf(MAIL_PURPOSES, body.purpose) ?? 'autre'
  if ('attach_plaquette' in body) patch.attach_plaquette = body.attach_plaquette !== false
  if ('archived' in body) patch.archived = body.archived === true
  for (const k of ['name', 'subject', 'body', 'mode'] as const) {
    if (k in patch && !patch[k]) return NextResponse.json({ error: 'Champ obligatoire vide' }, { status: 400 })
  }
  const { data, error } = await a.access.db.from('lycee_email_templates').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

/** DELETE /api/crm/lycees/email-templates/:id — archive le modèle (admin). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  if (!a.access.isManager) return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const { id } = await params
  const { error } = await a.access.db.from('lycee_email_templates').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
