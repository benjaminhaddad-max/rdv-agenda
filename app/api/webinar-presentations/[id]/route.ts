import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import {
  deletePresentation,
  getPresentation,
  updatePresentation,
} from '@/lib/webinar-presentations-db'
import {
  normalizeSlides,
  parseGuideToSlides,
  type PresentationStatus,
} from '@/lib/webinar-presentations'

const STATUSES: PresentationStatus[] = ['draft', 'ready', 'presented', 'needs_revision']

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const { id } = await params
  try {
    const data = await getPresentation(id)
    if (!data) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (body.subtitle !== undefined) patch.subtitle = body.subtitle ? String(body.subtitle).trim() : null
  if (typeof body.brand === 'string') patch.brand = body.brand.trim().toLowerCase()
  if (typeof body.brief === 'string') patch.brief = body.brief
  if (typeof body.source_guide === 'string') patch.source_guide = body.source_guide
  if (body.webinar_date !== undefined) {
    patch.webinar_date = body.webinar_date ? String(body.webinar_date).slice(0, 10) : null
  }
  if (STATUSES.includes(body.status)) patch.status = body.status
  if (body.slides !== undefined) patch.slides = normalizeSlides(body.slides)

  if (body.action === 'regenerate_from_guide') {
    const current = await getPresentation(id)
    if (!current) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    const guide = typeof body.source_guide === 'string' ? body.source_guide : (current.source_guide || '')
    patch.source_guide = guide
    patch.slides = parseGuideToSlides(guide, {
      title: typeof body.title === 'string' ? body.title.trim() : current.title,
      subtitle: (typeof body.subtitle === 'string' ? body.subtitle : current.subtitle) || undefined,
    })
  }

  if (body.action === 'mark_presented') {
    patch.status = 'presented'
    patch.presented_at = new Date().toISOString()
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  try {
    const data = await updatePresentation(id, patch)
    if (!data) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const { id } = await params
  try {
    await deletePresentation(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
