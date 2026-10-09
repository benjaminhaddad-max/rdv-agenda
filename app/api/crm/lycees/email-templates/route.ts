import { NextRequest, NextResponse } from 'next/server'
import { isMissingTable, requireLyceeAccess } from '@/lib/lycees-server'
import { cleanStr, LYCEE_MODES, oneOf } from '@/lib/lycees'
import { DEFAULT_TEMPLATES, MAIL_PURPOSES } from '@/lib/lycee-mail-shared'
import { missingMailMigration } from '@/lib/lycee-mail'

/**
 * GET /api/crm/lycees/email-templates — modèles de mail (les modèles fournis
 * sont insérés au premier appel, puis restent modifiables).
 * POST — nouveau modèle (admin).
 */
export async function GET(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { db } = a.access
  const load = () => db.from('lycee_email_templates').select('*').order('mode').order('sort').order('created_at')
  let { data, error } = await load()
  if (isMissingTable(error)) return missingMailMigration()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const slugs = new Set((data || []).map(t => t.slug))
  const missing = DEFAULT_TEMPLATES.filter(t => !slugs.has(t.slug))
  if (missing.length) {
    await db.from('lycee_email_templates').upsert(missing, { onConflict: 'slug', ignoreDuplicates: true })
    ;({ data, error } = await load())
  }
  const all = req.nextUrl.searchParams.get('archived') === '1'
  return NextResponse.json({ templates: (data || []).filter(t => all || !t.archived), is_manager: a.access.isManager })
}

export async function POST(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  if (!a.access.isManager) return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const mode = oneOf(LYCEE_MODES, body.mode)
  const name = cleanStr(body.name, 120)
  const subject = cleanStr(body.subject, 300)
  const text = cleanStr(body.body, 20_000)
  if (!mode || !name || !subject || !text) return NextResponse.json({ error: 'Marque, nom, objet et message obligatoires' }, { status: 400 })
  const { data, error } = await a.access.db.from('lycee_email_templates').insert({
    mode, name, subject, body: text,
    purpose: oneOf(MAIL_PURPOSES, body.purpose) ?? 'autre',
    attach_plaquette: body.attach_plaquette !== false,
    sort: 100,
    updated_by: a.access.ctx.appUserId,
  }).select().single()
  if (isMissingTable(error)) return missingMailMigration()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}
