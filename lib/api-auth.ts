import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'
import { claimsGetter, getAuthUserIdResilient } from '@/lib/auth-resilient'
import { RESTRICTED_ROLE, normalizeAllowedPages, type RestrictedPage } from '@/lib/restricted-access'

export type ApiRole = 'admin' | 'telepro' | 'closer' | 'manager'

export type ApiUserContext = {
  authUserId: string
  appUserId: string
  role: string
  slug: string | null
  hubspotOwnerId: string | null
  crmBrand: string | null
  crmScope: string | null
  isDefaultBrandTelepro: boolean
  /** Compte de démonstration (review Apple) — voir lib/demo-mode.ts */
  isDemo: boolean
  /** Compte « restreint » : pages du CRM autorisées (voir lib/restricted-access.ts) */
  allowedPages: RestrictedPage[]
}

const roleAliases: Record<string, ApiRole> = {
  admin: 'admin',
  telepro: 'telepro',
  closer: 'closer',
  manager: 'manager',
}

type DbUserRow = {
  id: string
  role: string | null
  slug: string | null
  hubspot_owner_id: string | null
  crm_brand: string | null
  crm_scope: string | null
  is_default_brand_telepro: boolean | null
  is_demo: boolean | null
  allowed_pages: string[] | null
}

// Profil rdv_users gardé 60 s par instance : évite une requête base à chaque
// appel API (un changement de rôle met au plus 60 s à s'appliquer).
const DB_USER_TTL_MS = 60_000
const dbUserCache = new Map<string, { row: DbUserRow | null; at: number }>()

async function loadDbUser(authUserId: string): Promise<DbUserRow | null> {
  const hit = dbUserCache.get(authUserId)
  if (hit && Date.now() - hit.at < DB_USER_TTL_MS) return hit.row
  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_users')
    .select('id, role, slug, hubspot_owner_id, crm_brand, crm_scope, is_default_brand_telepro, is_demo, allowed_pages')
    .eq('auth_id', authUserId)
    .maybeSingle()
  if (error) return null
  const row = (data as DbUserRow | null) ?? null
  if (dbUserCache.size > 500) dbUserCache.clear()
  dbUserCache.set(authUserId, { row, at: Date.now() })
  return row
}

/**
 * Rôle « creatif » : compte des créatifs, limité à la page Créas Ads.
 * getApiUserContext() le refuse (→ 401 sur toutes les routes CRM) ;
 * seules les routes Créas Ads l'acceptent via getApiUserContextAnyRole().
 */
export const CREATIF_ROLE = 'creatif'

export async function getApiUserContext(): Promise<ApiUserContext | null> {
  const ctx = await getApiUserContextAnyRole()
  // Comptes créatif / restreint : refusés partout sauf routes qui les acceptent explicitement
  if (!ctx || ctx.role === CREATIF_ROLE || ctx.role === RESTRICTED_ROLE) return null
  return ctx
}

export async function getApiUserContextAnyRole(): Promise<ApiUserContext | null> {
  const auth = await createServerSupabase()
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  // Résilient aux pannes Supabase Auth : timeout court + fallback cookie JWT.
  const authUserId = await getAuthUserIdResilient(
    claimsGetter(auth),
    cookieStore
  )
  if (!authUserId) return null

  const dbUser = await loadDbUser(authUserId)

  if (!dbUser || !dbUser.role) return null

  return {
    authUserId,
    appUserId: dbUser.id,
    role: String(dbUser.role),
    slug: dbUser.slug ?? null,
    hubspotOwnerId: dbUser.hubspot_owner_id ?? null,
    crmBrand: dbUser.crm_brand ?? null,
    crmScope: dbUser.crm_scope ?? null,
    isDefaultBrandTelepro: !!dbUser.is_default_brand_telepro,
    isDemo: !!dbUser.is_demo,
    allowedPages: normalizeAllowedPages(dbUser.allowed_pages),
  }
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 })
}

export async function requireApiUser() {
  const ctx = await getApiUserContext()
  if (!ctx) return { ok: false as const, response: unauthorized() }
  return { ok: true as const, ctx }
}

export async function requireApiRole(roles: ApiRole[]) {
  const user = await requireApiUser()
  if (!user.ok) return user

  const normalized = roleAliases[user.ctx.role] ?? null
  if (!normalized || !roles.includes(normalized)) {
    return { ok: false as const, response: forbidden() }
  }
  return user
}

/**
 * Compte « restreint » ayant accès à l'une de ces pages du CRM
 * (null si non connecté, autre rôle ou page non autorisée).
 */
export async function getRestrictedPageUser(pages: RestrictedPage | RestrictedPage[]): Promise<ApiUserContext | null> {
  const ctx = await getApiUserContextAnyRole()
  if (!ctx || ctx.role !== RESTRICTED_ROLE) return null
  const wanted = Array.isArray(pages) ? pages : [pages]
  return wanted.some(p => ctx.allowedPages.includes(p)) ? ctx : null
}

/** requireApiRole(roles), ou compte restreint ayant accès à l'une des pages. */
export async function requireApiRoleOrPage(roles: ApiRole[], pages: RestrictedPage | RestrictedPage[]) {
  const restricted = await getRestrictedPageUser(pages)
  if (restricted) return { ok: true as const, ctx: restricted }
  return requireApiRole(roles)
}

/** requireApiUser(), ou compte restreint ayant accès à l'une des pages. */
export async function requireApiUserOrPage(pages: RestrictedPage | RestrictedPage[]) {
  const restricted = await getRestrictedPageUser(pages)
  if (restricted) return { ok: true as const, ctx: restricted }
  return requireApiUser()
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function verifyEventPlatformApiKey(req: NextRequest): boolean {
  const expected = process.env.EVENT_PLATFORM_API_KEY?.trim() || ''
  if (!expected) return false
  const provided =
    req.headers.get('x-api-key') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  return timingSafeEqual(provided, expected)
}

export function requireCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'CRON_SECRET is not configured' },
        { status: 500 }
      ),
    }
  }

  const auth =
    req.headers.get('authorization') ??
    req.nextUrl.searchParams.get('Authorization') ??
    ''
  const token = auth.replace('Bearer ', '')
  if (token !== secret) {
    return {
      ok: false as const,
      response: unauthorized(),
    }
  }

  return { ok: true as const }
}
