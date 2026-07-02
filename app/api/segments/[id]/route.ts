import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { refreshSegmentContactCount } from '@/lib/segment-recipients'
import { deriveSiteUrl } from '@/lib/site-url'
import { filterGroupsToLegacyFilters, hasActiveFilterGroups } from '@/lib/crm-constants'

type Params = { params: Promise<{ id: string }> }

function isMissingColumnError(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('column') || m.includes('segment_type') || m.includes('filter_groups')
}

// GET /api/segments/[id]
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const fullSelect = 'id, name, description, segment_type, filters, filter_groups, preset_flags, manual_contact_ids, contact_count, created_at, updated_at'
  let { data, error } = await db.from('email_segments').select(fullSelect).eq('id', id).single()

  if (error && isMissingColumnError(error.message)) {
    const fallback = await db.from('email_segments').select('id, name, description, filters, contact_count, created_at, updated_at').eq('id', id).single()
    if (fallback.data) {
      data = { ...fallback.data, segment_type: 'dynamic', filter_groups: [], preset_flags: null, manual_contact_ids: [] }
    }
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/segments/[id]
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if ('name' in body) patch.name = body.name
  if ('description' in body) patch.description = body.description
  if ('segment_type' in body) patch.segment_type = body.segment_type === 'static' ? 'static' : 'dynamic'
  if ('filter_groups' in body) {
    patch.filter_groups = body.filter_groups
    if (Array.isArray(body.filter_groups) && hasActiveFilterGroups(body.filter_groups)) {
      patch.filters = filterGroupsToLegacyFilters(body.filter_groups)
    }
  }
  if ('filters' in body && !('filter_groups' in body)) patch.filters = body.filters
  if ('preset_flags' in body) patch.preset_flags = body.preset_flags
  if ('manual_contact_ids' in body) patch.manual_contact_ids = body.manual_contact_ids
  if ('contact_count' in body) patch.contact_count = body.contact_count

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  const fullSelect = 'id, name, description, segment_type, filters, filter_groups, preset_flags, manual_contact_ids, contact_count, created_at, updated_at'
  let { data, error } = await db.from('email_segments').update(patch).eq('id', id).select(fullSelect).single()

  if (error && isMissingColumnError(error.message)) {
    const needsAdvanced = 'filter_groups' in patch || 'segment_type' in patch || 'manual_contact_ids' in patch || 'preset_flags' in patch
    if (needsAdvanced) {
      return NextResponse.json({
        error: 'Colonnes segments avancées manquantes — exécutez supabase-migration-crm-v41-crm-segments.sql',
      }, { status: 503 })
    }
    const legacyPatch: Record<string, unknown> = {}
    if ('name' in patch) legacyPatch.name = patch.name
    if ('description' in patch) legacyPatch.description = patch.description
    if ('filters' in patch) legacyPatch.filters = patch.filters
    if ('contact_count' in patch) legacyPatch.contact_count = patch.contact_count
    const legacy = await db.from('email_segments').update(legacyPatch).eq('id', id).select('id, name, description, filters, contact_count, created_at, updated_at').single()
    data = legacy.data ? { ...legacy.data, segment_type: 'dynamic', filter_groups: [], preset_flags: null, manual_contact_ids: [] } : null
    error = legacy.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data && ('filters' in patch || 'filter_groups' in patch || 'manual_contact_ids' in patch || 'segment_type' in patch)) {
    const cookies = req.headers.get('cookie') ?? ''
    const baseUrl = deriveSiteUrl(req)
    refreshSegmentContactCount(db, id, { baseUrl, cookies }).catch(() => {})
  }

  return NextResponse.json(data)
}

// DELETE /api/segments/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('email_segments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
