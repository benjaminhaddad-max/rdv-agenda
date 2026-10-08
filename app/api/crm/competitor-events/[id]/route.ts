import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { normalizeTime } from '@/lib/competitor-events'

/**
 * PATCH /api/crm/competitor-events/:id — masquer / réafficher, corriger les horaires…
 * Toute correction manuelle passe l'événement en found_by='manual' : le bot n'y touche plus.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.hidden === 'boolean') patch.hidden = body.hidden
  let edited = false
  for (const k of ['name', 'location', 'notes', 'source_url'] as const) {
    if (typeof body[k] === 'string') {
      patch[k] = body[k].trim() || (k === 'name' ? undefined : null)
      edited = true
    }
  }
  for (const k of ['time_start', 'time_end'] as const) {
    if (k in body) {
      patch[k] = normalizeTime(body[k])
      edited = true
    }
  }
  if (edited) patch.found_by = 'manual'
  if (patch.name === undefined) delete patch.name

  const db = createServiceClient()
  const { data, error } = await db.from('competitor_events').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}
