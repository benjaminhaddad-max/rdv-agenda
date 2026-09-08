import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { addFeedback, listFeedback } from '@/lib/webinar-presentations-db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const { id } = await params
  try {
    return NextResponse.json(await listFeedback(id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const text = String(body.body || '').trim()
  if (!text) return NextResponse.json({ error: 'body requis' }, { status: 400 })
  try {
    const data = await addFeedback(id, text, authz.ctx.appUserId)
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    const status = (e as { status?: number }).status === 404 ? 404 : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status })
  }
}
