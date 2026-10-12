import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import {
  adminViewLayoutRowId,
  parseLayoutViewIds,
  snapshotCatalogIds,
  upsertAdminViewLayout,
} from '@/lib/crm-admin-view-layout'
import { TELEPRO_SHARED_VIEW_IDS } from '@/lib/crm-views'

// GET /api/crm/views/layout — onglets visibles de l'admin ou du télépro courant.
// Admin sans layout : on fige le catalogue actuel.
// Télépro sans layout : Recalif / Diploma (comportement historique), puis
// il ajoute d'autres vues du catalogue sans les modifier.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin', 'telepro'])
  if (!auth.ok) return auth.response
  const db = createServiceClient()

  // ?as=<id> : mode aperçu admin → onglets du télépro vu, en lecture seule
  // (sans layout enregistré : ses onglets par défaut, sans rien écrire).
  const asUser = req.nextUrl.searchParams.get('as')
  if (asUser) {
    if (auth.ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: asRow } = await db
      .from('crm_saved_views')
      .select('filter_groups')
      .eq('id', adminViewLayoutRowId(asUser))
      .maybeSingle()
    return NextResponse.json({
      view_ids: asRow ? parseLayoutViewIds(asRow.filter_groups) ?? [] : [...TELEPRO_SHARED_VIEW_IDS],
    })
  }

  const layoutId = adminViewLayoutRowId(auth.ctx.appUserId)

  const { data: row } = await db
    .from('crm_saved_views')
    .select('id, filter_groups')
    .eq('id', layoutId)
    .maybeSingle()

  if (row) {
    return NextResponse.json({ view_ids: parseLayoutViewIds(row.filter_groups) ?? [] })
  }

  const viewIds = auth.ctx.role === 'telepro'
    ? [...TELEPRO_SHARED_VIEW_IDS]
    : await snapshotCatalogIds(db)
  const { error } = await upsertAdminViewLayout(db, auth.ctx.appUserId, viewIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ view_ids: viewIds })
}

// PUT /api/crm/views/layout — { view_ids: string[] }
export async function PUT(req: NextRequest) {
  const auth = await requireApiRole(['admin', 'telepro'])
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
