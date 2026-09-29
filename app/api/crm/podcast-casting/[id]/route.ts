import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { isPodcastProfileType, isPodcastStatus } from '@/lib/podcast-casting'

const TEXT_FIELDS = ['full_name', 'phone', 'email', 'story', 'notes', 'episode_label'] as const

/** PATCH /api/crm/podcast-casting/[id] — statut, angle, notes de pré-interview… */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f] == null ? null : String(body[f]).trim() || null
      if (f === 'full_name' && !v) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
      patch[f] = v
    }
  }
  if ('status' in body) {
    if (!isPodcastStatus(body.status)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    patch.status = body.status
  }
  if ('profile_type' in body) {
    if (!isPodcastProfileType(body.profile_type)) return NextResponse.json({ error: 'Type invalide' }, { status: 400 })
    patch.profile_type = body.profile_type
  }
  if ('pre_interview_at' in body) {
    const d = body.pre_interview_at ? new Date(body.pre_interview_at) : null
    if (d && Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
    patch.pre_interview_at = d ? d.toISOString() : null
  }

  const db = createServiceClient()
  const { data, error } = await db.from('podcast_casting').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ casting: data })
}

/** DELETE /api/crm/podcast-casting/[id] — retire le profil de la shortlist. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response
  const { id } = await params

  const db = createServiceClient()
  const { error } = await db.from('podcast_casting').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
