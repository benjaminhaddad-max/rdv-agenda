import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { createPresentation, listPresentations } from '@/lib/webinar-presentations-db'
import {
  normalizeSlides,
  parseGuideToSlides,
  type PresentationStatus,
} from '@/lib/webinar-presentations'

const STATUSES: PresentationStatus[] = ['draft', 'ready', 'presented', 'needs_revision']

export async function GET() {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  try {
    const rows = await listPresentations()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const body = await req.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 })

  const subtitle = body.subtitle ? String(body.subtitle).trim() : null
  const brand = String(body.brand || 'diploma').trim().toLowerCase() || 'diploma'
  const brief = body.brief ? String(body.brief).trim() : null
  const sourceGuide = body.source_guide ? String(body.source_guide).trim() : null
  const webinarDate = body.webinar_date ? String(body.webinar_date).slice(0, 10) : null
  const slides = Array.isArray(body.slides)
    ? normalizeSlides(body.slides)
    : parseGuideToSlides(sourceGuide || '', { title, subtitle: subtitle || undefined })
  const status: PresentationStatus = STATUSES.includes(body.status) ? body.status : 'draft'

  try {
    const data = await createPresentation({
      title,
      subtitle,
      brand,
      status,
      brief,
      source_guide: sourceGuide,
      slides,
      webinar_date: webinarDate,
      created_by: authz.ctx.appUserId,
    })
    return NextResponse.json({ ...data, open_feedback: 0 }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
