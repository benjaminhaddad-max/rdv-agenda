import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { isAttributionSubViewId } from '@/lib/crm-attribution-buckets'

const LAYOUT_NAME = '__admin_view_layout__'

function layoutRowId(userId: string) {
  return `alayout_${userId}`
}

function isTopLevelCatalogId(id: string, parentId?: string | null, kind?: string | null) {
  if (parentId) return false
  if (kind === 'subview') return false
  if (isAttributionSubViewId(id)) return false
  return true
}

function parseViewIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
  return ids
}

async function snapshotCatalogIds(db: ReturnType<typeof createServiceClient>) {
  const { data, error } = await db
    .from('crm_saved_views')
    .select('id, parent_id, kind, position')
    .is('owner_id', null)
    .eq('scope', 'contacts')
    .order('position')

  if (!error) {
    return (data ?? [])
      .filter(row => isTopLevelCatalogId(String(row.id), row.parent_id ?? null, row.kind ?? null))
      .filter(row => !String(row.id).startsWith('alayout_'))
      .map(row => String(row.id))
  }

  const fallback = await db
    .from('crm_saved_views')
    .select('id, position')
    .is('owner_id', null)
    .eq('scope', 'contacts')
    .order('position')

  return (fallback.data ?? [])
    .filter(row => isTopLevelCatalogId(String(row.id), null, null))
    .filter(row => !String(row.id).startsWith('alayout_'))
    .map(row => String(row.id))
}

async function upsertLayout(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  viewIds: string[],
) {
  return db.from('crm_saved_views').upsert(
    {
      id: layoutRowId(userId),
      name: LAYOUT_NAME,
      filter_groups: viewIds,
      preset_flags: null,
      position: 0,
      scope: 'layout',
      owner_id: userId,
    },
    { onConflict: 'id' },
  )
}

// GET /api/crm/views/layout — onglets visibles de l'admin courant.
// Si aucun layout n'existe encore, on fige le catalogue actuel (pour ne rien
// casser au premier chargement), puis les créations/masquages deviennent perso.
export async function GET() {
  const auth = await requireApiRole(['admin'])
  if (!auth.ok) return auth.response
  const db = createServiceClient()
  const layoutId = layoutRowId(auth.ctx.appUserId)

  const { data: row } = await db
    .from('crm_saved_views')
    .select('id, filter_groups')
    .eq('id', layoutId)
    .maybeSingle()

  if (row) {
    return NextResponse.json({ view_ids: parseViewIds(row.filter_groups) ?? [] })
  }

  const viewIds = await snapshotCatalogIds(db)
  const { error } = await upsertLayout(db, auth.ctx.appUserId, viewIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ view_ids: viewIds })
}

// PUT /api/crm/views/layout — { view_ids: string[] }
export async function PUT(req: NextRequest) {
  const auth = await requireApiRole(['admin'])
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({}))
  const viewIds = parseViewIds(body?.view_ids)
  if (!viewIds) {
    return NextResponse.json({ error: 'view_ids required' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error } = await upsertLayout(db, auth.ctx.appUserId, viewIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ view_ids: viewIds })
}
