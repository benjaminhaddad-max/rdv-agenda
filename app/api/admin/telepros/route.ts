import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const TEAM_NAME = 'Télépros'

const AVATAR_COLORS = [
  '#6b87ff', '#22c55e', '#f59e0b', '#a855f7',
  '#06b6d4', '#ef4444', '#f97316', '#14b8a6',
  '#ec4899', '#8b5cf6', '#10b981', '#3b82f6',
]

async function hubspotFetch(path: string, options: RequestInit = {}) {
  return fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}

async function getTeleprosTeamId(): Promise<string | null> {
  const res = await hubspotFetch('/settings/v3/users/teams')
  if (!res.ok) return null
  const data = await res.json()
  const team = (data.results ?? []).find(
    (t: { id: string; name: string }) => t.name.toLowerCase() === TEAM_NAME.toLowerCase()
  )
  return team?.id ?? null
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

// ── GET /api/admin/telepros — Liste des télépros avec statut ──────────────────
export async function GET() {
  const db = createServiceClient()

  const { data: telepros, error } = await db
    .from('rdv_users')
    .select('id, name, email, slug, avatar_color, auth_id, hubspot_user_id')
    .eq('role', 'telepro')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Récupérer tous les users auth en une seule requête pour les statuts ban
  const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 })
  const authMap = new Map(
    (authList?.users ?? []).map(u => [u.id, u])
  )

  const result = (telepros ?? []).map(tp => {
    const authUser = tp.auth_id ? authMap.get(tp.auth_id) : undefined
    const bannedUntil = authUser?.banned_until
    const is_banned = bannedUntil ? new Date(bannedUntil) > new Date() : false
    return { ...tp, is_banned }
  })

  return NextResponse.json(result)
}

// ── POST /api/admin/telepros — Ajouter un nouveau télépro ─────────────────────
export async function POST(req: NextRequest) {
  const { email, firstName, lastName } = await req.json()

  if (!email?.trim() || !firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: 'email, firstName, lastName requis' }, { status: 400 })
  }

  const db = createServiceClient()

  // 1. Récupérer la team HubSpot "Télépros"
  const teamId = await getTeleprosTeamId()
  if (!teamId) {
    return NextResponse.json(
      { error: `Team "${TEAM_NAME}" introuvable dans HubSpot` },
      { status: 500 }
    )
  }

  // 2. Créer l'utilisateur HubSpot (envoie une invitation)
  let hubspotUserId: string | null = null
  const hsRes = await hubspotFetch('/settings/v3/users', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim(),
      primaryTeamId: teamId,
    }),
  })

  if (hsRes.ok) {
    const hsData = await hsRes.json()
    hubspotUserId = String(hsData.id)
  } else {
    // L'utilisateur existe peut-être déjà dans HubSpot
    const findRes = await hubspotFetch(
      `/settings/v3/users?limit=100`
    )
    if (findRes.ok) {
      const findData = await findRes.json()
      const found = (findData.results ?? []).find(
        (u: { email: string; id: string }) => u.email?.toLowerCase() === email.trim().toLowerCase()
      )
      if (found) {
        hubspotUserId = String(found.id)
        // Ajouter à la team Télépros
        await hubspotFetch(`/settings/v3/users/${hubspotUserId}`, {
          method: 'PUT',
          body: JSON.stringify({ primaryTeamId: teamId }),
        })
      }
    }
  }

  // 3. Créer le compte Supabase Auth
  const password = generatePassword()
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  })

  if (authError) {
    return NextResponse.json({ error: `Supabase: ${authError.message}` }, { status: 500 })
  }

  // 4. Créer l'entrée rdv_users
  const name = `${firstName.trim()} ${lastName.trim()}`
  const slug = email.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]

  const { data: newUser, error: upsertError } = await db
    .from('rdv_users')
    .upsert({
      email: email.trim(),
      name,
      role: 'telepro',
      slug,
      avatar_color: avatarColor,
      auth_id: authData.user.id,
      hubspot_user_id: hubspotUserId,
    }, { onConflict: 'email' })
    .select('id, name, email, avatar_color, hubspot_user_id')
    .single()

  if (upsertError) {
    await db.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ user: { ...newUser, is_banned: false }, password }, { status: 201 })
}

// ── PATCH /api/admin/telepros — Activer / désactiver un télépro ───────────────
export async function PATCH(req: NextRequest) {
  const { userId, action } = await req.json()

  if (!userId || !['ban', 'unban', 'reset-password', 'impersonate'].includes(action)) {
    return NextResponse.json({ error: 'userId et action requis' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: tp, error: findErr } = await db
    .from('rdv_users')
    .select('id, name, email, auth_id, hubspot_user_id')
    .eq('id', userId)
    .single()

  if (findErr || !tp?.auth_id) {
    return NextResponse.json({ error: 'Télépro introuvable ou sans compte' }, { status: 404 })
  }

  if (action === 'ban') {
    // Bloquer Supabase
    const { error: banErr } = await db.auth.admin.updateUserById(tp.auth_id, {
      ban_duration: '876000h',
    })
    if (banErr) return NextResponse.json({ error: banErr.message }, { status: 500 })

    // Supprimer l'accès HubSpot (retire du portail)
    if (tp.hubspot_user_id) {
      await hubspotFetch(`/settings/v3/users/${tp.hubspot_user_id}`, { method: 'DELETE' })
    }

    return NextResponse.json({ success: true, action: 'banned' })
  }

  if (action === 'reset-password') {
    const newPassword = generatePassword()
    const { error } = await db.auth.admin.updateUserById(tp.auth_id, { password: newPassword })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, password: newPassword, email: tp.email })
  }

  if (action === 'impersonate') {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://rdv-agenda.vercel.app'
    const { data, error } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email: tp.email,
      options: { redirectTo: `${siteUrl}/telepro` },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const fixedUrl = data.properties.action_link.replace(/^https?:\/\/localhost(:\d+)?/, siteUrl)
    return NextResponse.json({ success: true, url: fixedUrl })
  }

  // unban — Réactiver Supabase + réinviter dans HubSpot
  const { error: unbanErr } = await db.auth.admin.updateUserById(tp.auth_id, {
    ban_duration: 'none',
  })
  if (unbanErr) return NextResponse.json({ error: unbanErr.message }, { status: 500 })

  // Réinviter dans HubSpot si nécessaire
  const teamId = await getTeleprosTeamId()
  if (teamId) {
    const hsRes = await hubspotFetch('/settings/v3/users', {
      method: 'POST',
      body: JSON.stringify({ email: tp.email, primaryTeamId: teamId }),
    })
    if (hsRes.ok) {
      const hsData = await hsRes.json()
      await db
        .from('rdv_users')
        .update({ hubspot_user_id: String(hsData.id) })
        .eq('id', userId)
    }
  }

  return NextResponse.json({ success: true, action: 'unbanned' })
}
