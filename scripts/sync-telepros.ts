/**
 * sync-telepros.ts
 *
 * Synchronise les accès Supabase avec le statut HubSpot :
 *   - Télépro inactif dans HubSpot (ou retiré de la team) → banni Supabase
 *   - Télépro réactivé dans HubSpot → débanni Supabase
 *
 * Usage : bun run scripts/sync-telepros.ts
 *
 * Idéalement à lancer via un cron quotidien (ou manuellement après un changement d'équipe).
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const TEAM_NAME = 'Télépros'
const BAN_DURATION = '876000h' // ~100 ans = banni indéfiniment

async function hubspotGet(path: string) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  })
  if (!res.ok) throw new Error(`HubSpot ${path} → ${res.status}`)
  return res.json()
}

async function getTeleprosTeamId(): Promise<string> {
  const data = await hubspotGet('/settings/v3/users/teams')
  const teams: { id: string; name: string }[] = data.results ?? []
  const team = teams.find(t => t.name.toLowerCase() === TEAM_NAME.toLowerCase())
  if (!team) {
    console.error(`Team "${TEAM_NAME}" introuvable. Teams disponibles :`)
    teams.forEach(t => console.error(`  - "${t.name}"`))
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

  console.log(`\n=== Sync télépros HubSpot → Supabase ===\n`)

  const teamId = await getTeleprosTeamId()
  const members = await getTeamMembers(teamId)

  // IDs HubSpot actifs dans la team
  const activeHubSpotIds = new Set(
    members.filter(m => m.active).map(m => String(m.id))
  )

  console.log(`Team "${TEAM_NAME}" : ${members.length} membres, ${activeHubSpotIds.size} actifs\n`)

  // Récupérer tous les télépros provisionnés dans rdv_users
  const { data: telepros, error } = await supabase
    .from('rdv_users')
    .select('id, name, email, auth_id, hubspot_user_id')
    .eq('role', 'telepro')
    .not('hubspot_user_id', 'is', null)

  if (error) {
    console.error('Erreur Supabase:', error.message)
    process.exit(1)
  }

  if (!telepros?.length) {
    console.log('Aucun télépro provisionné dans rdv_users.')
    return
  }

  for (const tp of telepros) {
    if (!tp.auth_id) {
      console.log(`SKIP  ${tp.email} — pas de auth_id`)
      continue
    }

    const isActiveInHub = activeHubSpotIds.has(tp.hubspot_user_id)

    // Vérifier l'état actuel du compte Supabase
    const { data: authUser } = await supabase.auth.admin.getUserById(tp.auth_id)
    const isBanned = authUser?.user?.banned_until
      ? new Date(authUser.user.banned_until) > new Date()
      : false

    if (!isActiveInHub && !isBanned) {
      // Désactiver
      const { error: banErr } = await supabase.auth.admin.updateUserById(tp.auth_id, {
        ban_duration: BAN_DURATION,
      })
      if (banErr) {
        console.error(`FAIL  BAN  ${tp.email}: ${banErr.message}`)
      } else {
        console.log(`BANNI ${tp.email} (${tp.name}) — inactif ou retiré de la team HubSpot`)
      }
    } else if (isActiveInHub && isBanned) {
      // Réactiver
      const { error: unbanErr } = await supabase.auth.admin.updateUserById(tp.auth_id, {
        ban_duration: 'none',
      })
      if (unbanErr) {
        console.error(`FAIL  UNBAN ${tp.email}: ${unbanErr.message}`)
      } else {
        console.log(`OK    ${tp.email} (${tp.name}) — réactivé`)
      }
    } else {
      const status = isActiveInHub ? 'actif' : 'banni'
      console.log(`OK    ${tp.email} — déjà ${status}, rien à faire`)
    }
  }

  console.log('\nSync terminé.')
}

main().catch(err => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
