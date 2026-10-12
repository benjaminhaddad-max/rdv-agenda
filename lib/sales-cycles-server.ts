import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiUserContext } from '@/lib/api-auth'

/** Nom affiché de l'utilisateur connecté (traçabilité des cycles). */
export async function cycleActorName(db: SupabaseClient, ctx: ApiUserContext): Promise<string> {
  const { data } = await db.from('rdv_users').select('name').eq('id', ctx.appUserId).maybeSingle()
  return (data as { name?: string } | null)?.name || ctx.slug || 'CRM'
}
