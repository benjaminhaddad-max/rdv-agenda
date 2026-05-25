import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'

export type ApiRole = 'admin' | 'telepro' | 'closer' | 'commercial' | 'manager'

export type ApiUserContext = {
  authUserId: string
  appUserId: string
  role: string
  slug: string | null
  hubspotOwnerId: string | null
  crmBrand: string | null
  crmScope: string | null
  isDefaultBrandTelepro: boolean
}

const roleAliases: Record<string, ApiRole> = {
  admin: 'admin',
  telepro: 'telepro',
  closer: 'closer',
  commercial: 'commercial',
  manager: 'manager',
}

export async function getApiUserContext(): Promise<ApiUserContext | null> {
  const auth = await createServerSupabase()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user) return null

  const db = createServiceClient()
  const { data: dbUser } = await db
    .from('rdv_users')
    .select('id, role, slug, hubspot_owner_id, crm_brand, crm_scope, is_default_brand_telepro')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!dbUser || !dbUser.role) return null

  return {
    authUserId: user.id,
    appUserId: dbUser.id,
    role: String(dbUser.role),
    slug: dbUser.slug ?? null,
    hubspotOwnerId: dbUser.hubspot_owner_id ?? null,
    crmBrand: dbUser.crm_brand ?? null,
    crmScope: dbUser.crm_scope ?? null,
    isDefaultBrandTelepro: !!dbUser.is_default_brand_telepro,
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
