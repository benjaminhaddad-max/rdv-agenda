import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import {
  adminViewLayoutRowId,
  parseLayoutViewIds,
  snapshotCatalogIds,
  upsertAdminViewLayout,
} from '@/lib/crm-admin-view-layout'

// GET /api/crm/views/layout — onglets visibles de l'admin courant.
// Si aucun layout n'existe encore, on fige le catalogue actuel (pour ne rien
// casser au premier chargement), puis les créations/masquages deviennent perso.
export async function GET() {
  const auth = await requireApiRole(['admin'])
  if (!auth.ok) return auth.response
  const db = createServiceClient()
  const layoutId = adminViewLayoutRowId(auth.ctx.appUserId)

  const { data: row } = await db
    .from('crm_saved_views')
    .select('id, filter_groups')
    .eq('id', layoutId)
    .maybeSingle()

  if (row) {
    return NextResponse.json({ view_ids: parseLayoutViewIds(row.filter_groups) ?? [] })
  }

  const viewIds = await snapshotCatalogIds(db)
  const { error } = await upsertAdminViewLayout(db, auth.ctx.appUserId, viewIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ view_ids: viewIds })
}

// PUT /api/crm/views/layout — { view_ids: string[] }
export async function PUT(req: NextRequest) {
  const auth = await requireApiRole(['admin'])
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({}))
  const viewIds = parseLayoutViewIds(body?.view_ids)
  if (!viewIds) {
    return NextResponse.json({ error: 'view_ids required' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error } = await upsertAdminViewLayout(db, auth.ctx.appUserId, viewIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ view_ids: viewIds })
}
