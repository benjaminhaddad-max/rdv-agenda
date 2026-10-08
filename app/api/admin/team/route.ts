/**
 * GET /api/admin/team?tab=telepros|closers|admins
 *
 * Membres d'un onglet de la page Équipe, avec leurs casquettes :
 * - telepros : rôle télépro OU casquette télépro en plus ;
 * - closers  : rôle closer OU casquette closer en plus (Pascal) ;
 * - admins   : rôle admin ou manager.
 * Inclut le statut désactivé (ban Supabase Auth). Admin uniquement.
 * Création / désactivation / mot de passe : /api/admin/telepros|closers ;
 * rôle, casquettes, marque, suppression : /api/users.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { hasTeamRole, normalizeExtraRoles } from '@/lib/team-roles'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const tab = req.nextUrl.searchParams.get('tab') || 'telepros'
  const db = createServiceClient()

  // select('*') : reste valide avant la migration v56 (extra_roles absente)
  const [{ data, error }, { data: authList }] = await Promise.all([
    db.from('rdv_users').select('*').order('name'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = Date.now()
  const authMap = new Map((authList?.users ?? []).map(u => [u.id, u]))
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(u => {
    if (tab === 'closers') return hasTeamRole(u, 'closer')
    if (tab === 'admins') return u.role === 'admin' || u.role === 'manager'
    return hasTeamRole(u, 'telepro')
  })

  return NextResponse.json({
    extra_roles_ready: (data ?? []).length === 0 || 'extra_roles' in (data as Array<Record<string, unknown>>)[0],
    members: rows.map(u => {
      const authUser = u.auth_id ? authMap.get(String(u.auth_id)) : undefined
      const bannedUntil = authUser?.banned_until
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        slug: u.slug ?? null,
        avatar_color: u.avatar_color ?? null,
        auth_id: u.auth_id ?? null,
        hubspot_user_id: u.hubspot_user_id ?? null,
        hubspot_owner_id: u.hubspot_owner_id ?? null,
        role: u.role,
        extra_roles: normalizeExtraRoles(u.extra_roles),
        crm_brand: u.crm_brand ?? null,
        is_default_brand_telepro: !!u.is_default_brand_telepro,
        is_banned: bannedUntil ? new Date(bannedUntil).getTime() > now : false,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
      }
    }),
  })
}
