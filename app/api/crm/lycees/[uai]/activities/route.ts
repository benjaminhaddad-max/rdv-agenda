import { NextRequest, NextResponse } from 'next/server'
import { authorNameOf, loadLyceeFor, requireLyceeAccess } from '@/lib/lycees-server'
import { cleanStr } from '@/lib/lycees'

const KINDS = new Set(['note', 'call', 'email', 'visit'])

/**
 * POST /api/crm/lycees/:uai/activities — note, appel, mail ou visite.
 * Un appel / mail / visite met à jour « dernier contact » et fait passer un
 * lycée « À contacter » en « Contacté — en attente ».
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uai: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { uai } = await params
  const l = await loadLyceeFor(a.access, uai)
  if (!l.ok) return l.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const kind = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : 'note'
  const content = cleanStr(body.content, 4000)
  if (!content) return NextResponse.json({ error: 'Le commentaire est vide' }, { status: 400 })

  const { db, ctx } = a.access
  const author = await authorNameOf(db, ctx.appUserId)
  const { data, error } = await db
    .from('lycee_activities')
    .insert({ uai, kind, content, author_id: ctx.appUserId, author_name: author })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (kind !== 'note') {
    const patch: Record<string, unknown> = { last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (l.lycee.status === 'a_contacter') patch.status = 'en_cours'
    await db.from('lycees').update(patch).eq('uai', uai)
  }
  return NextResponse.json({ activity: data }, { status: 201 })
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
