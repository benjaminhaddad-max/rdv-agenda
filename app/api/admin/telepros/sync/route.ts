import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const TEAM_NAME = 'Télépros'

const AVATAR_COLORS = [
  '#ccac71', '#22c55e', '#ccac71', '#a855f7',
  '#06b6d4', '#ef4444', '#f97316', '#14b8a6',
  '#ec4899', '#8b5cf6', '#10b981', '#3b82f6',
]

async function hubspotGet(path: string) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  })
  if (!res.ok) throw new Error(`HubSpot ${path} → ${res.status}`)
  return res.json()
}

function generatePassword(): string {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '!@#$'
  const all = upper + lower + digits + special
  const pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array.from({ length: 12 }, () => all[Math.floor(Math.random() * all.length)]),
  ]
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]]
  }
  return pwd.join('')
}

// GET /api/admin/telepros/sync — debug
export async function GET() {
  try {
    if (!HUBSPOT_TOKEN) {
      return NextResponse.json({ error: 'HUBSPOT_ACCESS_TOKEN manquant dans les variables Vercel' })
    }
    const teamsData = await hubspotGet('/settings/v3/users/teams')
    const team = (teamsData.results ?? []).find(
      (t: { id: string; name: string }) => t.name.toLowerCase() === TEAM_NAME.toLowerCase()
    )
    const usersData = await hubspotGet('/settings/v3/users?limit=100')
    return NextResponse.json({
      token_present: true,
      teams: teamsData.results?.map((t: { id: string; name: string; userIds?: string[]; secondaryUserIds?: string[] }) => ({
        id: t.id, name: t.name, userIds: t.userIds, secondaryUserIds: t.secondaryUserIds
      })),
      team_found: team ?? null,
      all_users_count: (usersData.results ?? []).length,
      all_users: (usersData.results ?? []).map((u: { id: string; email: string; active: boolean; primaryTeamId?: string }) => ({
        id: u.id, email: u.email, active: u.active, primaryTeamId: u.primaryTeamId
      })),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) })
  }
}

// POST /api/admin/telepros/sync
// Importe tous les membres actifs de la team HubSpot "Télépros"
// Crée les comptes manquants, ignore ceux déjà provisionnés
export async function POST() {
  const db = createServiceClient()

  // 1. Récupérer la team "Télépros" (qui contient directement les userIds)
  const teamsData = await hubspotGet('/settings/v3/users/teams')
  const team = (teamsData.results ?? []).find(
    (t: { id: string; name: string }) => t.name.toLowerCase() === TEAM_NAME.toLowerCase()
  )
  if (!team) {
    const teamNames = (teamsData.results ?? []).map((t: { name: string }) => t.name).join(', ')
    return NextResponse.json({
      error: `Team "${TEAM_NAME}" introuvable. Teams disponibles : ${teamNames}`
    }, { status: 404 })
  }

  // 2. Récupérer chaque membre de la team directement par son ID
  const teamUserIds: string[] = [
    ...(team.userIds ?? []),
    ...(team.secondaryUserIds ?? []),
  ].map(String)

  type HubSpotUser = { id: string; email: string; firstName?: string; lastName?: string; active: boolean }
  const members: HubSpotUser[] = []
  for (const uid of teamUserIds) {
    try {
      const u = await hubspotGet(`/settings/v3/users/${uid}`)
      members.push(u)
    } catch {
      // user introuvable, on ignore
    }
  }

  const created: { name: string; email: string; password: string }[] = []
  const skipped: string[] = []
  const banned: string[] = []
  const unbanned: string[] = []
  const failed: string[] = []

  // 3. Désactiver les télépros qui ne sont plus dans la team HubSpot
  const { data: allTelepros } = await db
    .from('rdv_users')
    .select('id, name, email, auth_id, hubspot_user_id')
    .eq('role', 'telepro')
    .not('hubspot_user_id', 'is', null)

  for (const tp of allTelepros ?? []) {
    if (!tp.auth_id) continue
    const stillInTeam = teamUserIds.includes(String(tp.hubspot_user_id))
    const { data: authUser } = await db.auth.admin.getUserById(tp.auth_id)
    const isBanned = authUser?.user?.banned_until
      ? new Date(authUser.user.banned_until) > new Date()
      : false

    if (!stillInTeam && !isBanned) {
      await db.auth.admin.updateUserById(tp.auth_id, { ban_duration: '876000h' })
      banned.push(tp.email)
    } else if (stillInTeam && isBanned) {
      await db.auth.admin.updateUserById(tp.auth_id, { ban_duration: 'none' })
      unbanned.push(tp.email)
    }
  }

  // 4. Créer les nouveaux membres
  for (let i = 0; i < members.length; i++) {
    const { id: hubspotUserId, email, firstName, lastName } = members[i]
    const name = [firstName, lastName].filter(Boolean).join(' ') || email

    // Déjà provisionné ?
    const { data: existing } = await db
      .from('rdv_users')
      .select('id, auth_id')
      .eq('hubspot_user_id', String(hubspotUserId))
      .single()

    if (existing?.auth_id) { skipped.push(`${name} (déjà provisionné)`); continue }

    // Créer le compte Supabase Auth
    const password = generatePassword()
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      // Compte auth déjà existant → juste lier
      if (authError.message.toLowerCase().includes('already')) {
        const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 })
        const existingAuth = (authList?.users ?? []).find(u => u.email === email)
        if (existingAuth) {
          await db.from('rdv_users').upsert({
            email, name, role: 'telepro',
            slug: email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-'),
            avatar_color: AVATAR_COLORS[i % AVATAR_COLORS.length],
            auth_id: existingAuth.id,
            hubspot_user_id: String(hubspotUserId),
          }, { onConflict: 'email' })
          skipped.push(`${name} (lié au compte existant)`)
          continue
        }
      }
      failed.push(email)
      continue
    }

    // Créer rdv_users
    const { error: upsertError } = await db.from('rdv_users').upsert({
      email, name, role: 'telepro',
      slug: email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-'),
      avatar_color: AVATAR_COLORS[i % AVATAR_COLORS.length],
      auth_id: authData.user.id,
      hubspot_user_id: String(hubspotUserId),
    }, { onConflict: 'email' })

    if (upsertError) {
      await db.auth.admin.deleteUser(authData.user.id)
      failed.push(email)
      continue
    }

    created.push({ name, email, password })
  }

  return NextResponse.json({ created, skipped, banned, unbanned, failed })
}
