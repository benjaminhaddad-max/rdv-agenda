import type { SupabaseClient } from '@supabase/supabase-js'
import { isAttributionSubViewId } from '@/lib/crm-attribution-buckets'

export const ADMIN_VIEW_LAYOUT_NAME = '__admin_view_layout__'

export function adminViewLayoutRowId(userId: string) {
  return `alayout_${userId}`
}

export function isTopLevelCatalogId(id: string, parentId?: string | null, kind?: string | null) {
  if (parentId) return false
  if (kind === 'subview') return false
  if (isAttributionSubViewId(id)) return false
  return true
}

export function parseLayoutViewIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export async function snapshotCatalogIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from('crm_saved_views')
    .select('id, position')
    .is('owner_id', null)
    .eq('scope', 'contacts')
    .order('position')
  if (error) return []

  return (data ?? [])
    .filter(row => isTopLevelCatalogId(String(row.id), null, null))
    .filter(row => !String(row.id).startsWith('alayout_'))
    .map(row => String(row.id))
}

export async function upsertAdminViewLayout(
  db: SupabaseClient,
  userId: string,
  viewIds: string[],
) {
  return db.from('crm_saved_views').upsert(
    {
      id: adminViewLayoutRowId(userId),
      name: ADMIN_VIEW_LAYOUT_NAME,
      filter_groups: viewIds,
      preset_flags: null,
      position: 0,
      scope: 'layout',
      owner_id: userId,
    },
    { onConflict: 'id' },
  )
}

export async function readAdminViewLayout(db: SupabaseClient, userId: string) {
  const { data: row } = await db
    .from('crm_saved_views')
    .select('id, filter_groups')
    .eq('id', adminViewLayoutRowId(userId))
    .maybeSingle()
  return parseLayoutViewIds(row?.filter_groups)
}

/** Retire une vue des onglets de l'admin, sans toucher au catalogue partagé. */
export async function unpinViewFromAdminLayout(
  db: SupabaseClient,
  userId: string,
  viewId: string,
) {
  const existing = await readAdminViewLayout(db, userId)
  const ids = existing ?? await snapshotCatalogIds(db)
  const next = ids.filter(id => id !== viewId)
  return upsertAdminViewLayout(db, userId, next)
}
