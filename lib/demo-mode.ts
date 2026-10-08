import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiUserContext } from '@/lib/api-auth'

/**
 * Mode démo — comptes `rdv_users.is_demo = true` (migration v54).
 *
 * Sert au compte de review Apple de l'app Hub Diploma : il doit pouvoir
 * utiliser le CRM normalement SANS jamais voir de vrais prospects (RGPD).
 *   • contacts : uniquement les fiches dont l'id commence par DEMO_
 *   • RDV : uniquement les siens ; ses RDV sont masqués des agendas réels
 *   • prise de RDV : insertion locale, aucun effet externe
 *     (SMS, e-mail, HubSpot, attribution closer, file d'attente)
 *
 * Données de démo : scripts/seed-demo-apple-review.ts.
 */

export const DEMO_CONTACT_PREFIX = 'DEMO_'

export function isDemoContactId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(DEMO_CONTACT_PREFIX)
}

export function isDemoUser(ctx: Pick<ApiUserContext, 'isDemo'> | null | undefined): boolean {
  return !!ctx?.isDemo
}

let demoIdsCache: { ids: string[]; at: number } | null = null

/** Ids rdv_users des comptes démo (cache mémoire 60 s). */
export async function getDemoUserIds(db: SupabaseClient): Promise<string[]> {
  if (demoIdsCache && Date.now() - demoIdsCache.at < 60_000) return demoIdsCache.ids
  const { data } = await db.from('rdv_users').select('id').eq('is_demo', true)
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  demoIdsCache = { ids, at: Date.now() }
  return ids
}

/** Filtre PostgREST `or` qui exclut les RDV posés par un compte démo (garde les telepro_id NULL). */
export function excludeDemoTeleproFilter(demoIds: string[]): string | null {
  if (demoIds.length === 0) return null
  return `telepro_id.is.null,telepro_id.not.in.(${demoIds.join(',')})`
}

const DEMO_CONTACT_SELECT =
  'hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle, zone_localite, ' +
  'formation_demandee, formation_souhaitee, contact_createdate, hubspot_owner_id, closer_du_contact_owner_id, ' +
  'telepro_user_id, recent_conversion_date, recent_conversion_event, hs_lead_status, origine'

/**
 * Réponse de GET /api/crm/contacts pour un compte démo : mêmes clés que la
 * réponse normale, restreinte aux fiches DEMO_ (liste, vues et recherche ⌘K).
 */
export async function demoContactsPayload(
  db: SupabaseClient,
  ctx: ApiUserContext,
  searchParams: URLSearchParams,
) {
  const page = Math.max(parseInt(searchParams.get('page') ?? '0', 10) || 0, 0)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 200)
  const search = (searchParams.get('search') ?? '').replace(/[%,()*]/g, ' ').trim()

  let query = db
    .from('crm_contacts')
    .select(DEMO_CONTACT_SELECT, { count: 'exact' })
    .like('hubspot_contact_id', `${DEMO_CONTACT_PREFIX}%`)
  if (search) {
    query = query.or(
      ['firstname', 'lastname', 'email', 'phone'].map(c => `${c}.ilike.%${search}%`).join(','),
    )
  }
  const { data, count, error } = await query
    .order('recent_conversion_date', { ascending: false, nullsFirst: false })
    .range(page * limit, page * limit + limit - 1)
  if (error) return { error: error.message, data: [], total: 0, page, limit }

  const { data: self } = await db
    .from('rdv_users')
    .select('id, name, role, slug, avatar_color, hubspot_owner_id, hubspot_user_id')
    .eq('id', ctx.appUserId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map(c => ({
    ...c,
    parcoursup_verdict: null,
    contact_owner: null,
    telepro: self ?? null,
    deal: null,
  }))
  return { data: rows, total: count ?? rows.length, total_estimated: false, page, limit }
}
