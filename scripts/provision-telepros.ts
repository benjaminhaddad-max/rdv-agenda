/**
 * provision-telepros.ts
 *
 * Récupère les membres de la team "Télépros" dans HubSpot et crée/met à jour
 * leurs comptes Supabase Auth + rdv_users.
 *
 * Usage : bun run scripts/provision-telepros.ts
 *
 * Prérequis dans .env.local :
 *   HUBSPOT_ACCESS_TOKEN=...
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const TEAM_NAME = 'Télépros'

const AVATAR_COLORS = [
  '#6b87ff', '#22c55e', '#f59e0b', '#a855f7',
  '#06b6d4', '#ef4444', '#f97316', '#14b8a6',
  '#ec4899', '#8b5cf6', '#10b981', '#3b82f6',
]

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

  // Mélanger
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]]
  }
  return pwd.join('')
}

async function hubspotGet(path: string) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot ${path} → ${res.status}: ${err}`)
  }
  return res.json()
}

async function getTeleprosTeamId(): Promise<string> {
  const data = await hubspotGet('/settings/v3/users/teams')
  const teams: { id: string; name: string }[] = data.results ?? []

  const team = teams.find(t => t.name.toLowerCase() === TEAM_NAME.toLowerCase())
  if (!team) {
    console.error(`\nTeam "${TEAM_NAME}" introuvable dans HubSpot.`)
    console.error('Teams disponibles :')
    teams.forEach(t => console.error(`  - "${t.name}" (id: ${t.id})`))
    process.exit(1)
  }
  return team.id
}

interface HubSpotUser {
  id: string
  email: string
  firstName?: string
  lastName?: string
  active: boolean
  primaryTeamId?: string
}

async function getTeamMembers(teamId: string): Promise<HubSpotUser[]> {
  const data = await hubspotGet(`/settings/v3/users?teamId=${teamId}&limit=100`)
  return data.results ?? []
}

async function main() {
  if (!HUBSPOT_TOKEN) {
    console.error('HUBSPOT_ACCESS_TOKEN manquant dans .env.local')
    process.exit(1)
  }

  console.log(`\n=== Provisioning télépros depuis HubSpot (team: "${TEAM_NAME}") ===\n`)

  const teamId = await getTeleprosTeamId()
  console.log(`Team ID : ${teamId}`)

  const members = await getTeamMembers(teamId)
  console.log(`${members.length} membre(s) trouvé(s)\n`)

  const credentials: { name: string; email: string; password: string }[] = []

  for (let i = 0; i < members.length; i++) {
    const { id: hubspotUserId, email, firstName, lastName, active } = members[i]
    const name = [firstName, lastName].filter(Boolean).join(' ') || email

    if (!active) {
      console.log(`SKIP  ${email} — inactif dans HubSpot`)
      continue
    }

    // Vérifier si déjà provisionné
    const { data: existing } = await supabase
      .from('rdv_users')
      .select('id, auth_id, name')
      .eq('hubspot_user_id', String(hubspotUserId))
      .single()

    if (existing?.auth_id) {
      console.log(`SKIP  ${email} — déjà provisionné (${existing.name})`)
      continue
    }

    const password = generatePassword()
    const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
    const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length]

    // Créer le compte Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      // Cas où le compte auth existe déjà mais pas lié
      if (authError.message.includes('already registered')) {
        console.warn(`WARN  ${email} — compte auth existe déjà, liaison uniquement`)
        const { data: users } = await supabase.auth.admin.listUsers()
        const existingAuth = users?.users?.find(u => u.email === email)
        if (existingAuth) {
          await supabase.from('rdv_users').upsert({
            email, name, role: 'telepro', slug, avatar_color: avatarColor,
            auth_id: existingAuth.id, hubspot_user_id: String(hubspotUserId),
          }, { onConflict: 'email' })
          console.log(`OK    ${email} → lié (auth existant)`)
        }
        continue
      }
      console.error(`FAIL  ${email}: ${authError.message}`)
      continue
    }

    // Créer / mettre à jour dans rdv_users
    const { error: upsertError } = await supabase.from('rdv_users').upsert({
      email,
      name,
      role: 'telepro',
      slug,
      avatar_color: avatarColor,
      auth_id: authData.user.id,
      hubspot_user_id: String(hubspotUserId),
    }, { onConflict: 'email' })

    if (upsertError) {
      console.error(`FAIL  ${email} (rdv_users): ${upsertError.message}`)
      // Rollback auth
      await supabase.auth.admin.deleteUser(authData.user.id)
      continue
    }

    console.log(`OK    ${email} | ${name}`)
    credentials.push({ name, email, password })
  }

  if (credentials.length === 0) {
    console.log('\nAucun nouveau compte créé.')
    return
  }

  console.log('\n' + '═'.repeat(60))
  console.log('IDENTIFIANTS À DISTRIBUER (mot de passe unique par personne)')
  console.log('═'.repeat(60))
  credentials.forEach(c => {
    console.log(`\n  Nom    : ${c.name}`)
    console.log(`  Email  : ${c.email}`)
    console.log(`  Mot de passe : ${c.password}`)
  })
  console.log('\n' + '═'.repeat(60))
  console.log('URL de connexion : /login')
  console.log('Les mots de passe peuvent être changés via Supabase Dashboard.')
}

main().catch(err => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
