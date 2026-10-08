import { NextRequest, NextResponse } from 'next/server'
import { loadLyceeFor, requireLyceeAccess } from '@/lib/lycees-server'
import { cleanStr } from '@/lib/lycees'

/** POST /api/crm/lycees/:uai/contacts — ajoute un contact (proviseur, CPE, prof, ancien élève…). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uai: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { uai } = await params
  const l = await loadLyceeFor(a.access, uai)
  if (!l.ok) return l.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const row = {
    uai,
    name: cleanStr(body.name, 200),
    role: cleanStr(body.role, 200),
    email: cleanStr(body.email, 300),
    phone: cleanStr(body.phone, 100),
    notes: cleanStr(body.notes, 2000),
    is_alumni: body.is_alumni === true,
    is_key: body.is_key === true,
    source: 'manual',
    created_by: a.access.ctx.appUserId,
  }
  if (!row.name && !row.email && !row.phone) {
    return NextResponse.json({ error: 'Nom, mail ou téléphone obligatoire' }, { status: 400 })
  }
  const { data, error } = await a.access.db.from('lycee_contacts').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data }, { status: 201 })
}
