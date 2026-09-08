import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { updateFeedbackStatus } from '@/lib/webinar-presentations-db'

const STATUSES = ['open', 'applied', 'dismissed'] as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; fid: string }> },
) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const { id, fid } = await params
  const body = await req.json().catch(() => ({}))
  const status = body.status
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'status invalide' }, { status: 400 })
  }
  try {
    const data = await updateFeedbackStatus(id, fid, status)
    if (!data) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
