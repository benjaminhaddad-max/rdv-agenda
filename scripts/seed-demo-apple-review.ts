// Compte démo pour la review Apple de l'app Hub Diploma (+ données fictives).
//
//   bun run scripts/seed-demo-apple-review.ts          → crée / met à jour
//   bun run scripts/seed-demo-apple-review.ts --reset  → régénère les RDV (dates glissantes)
//
// • Utilisateur télépro `apple-review@diploma-sante.fr`, rdv_users.is_demo = true
//   (cloisonnement côté API : lib/demo-mode.ts, migration v54).
// • 15 contacts DEMO_* (e-mails @example.com, numéros de la plage ARCEP réservée
//   à la fiction 06 39 98 xx xx) et quelques RDV sans téléphone (aucun SMS cron).
// • Le mot de passe est généré et écrit dans mobile/.demo-account.local (non
//   commité) : à coller dans App Store Connect > Informations pour la vérification.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = 'apple-review@diploma-sante.fr'
const NAME = 'Camille Démo'
const SLUG = 'apple-review-demo'
const SECRET_FILE = new URL('../mobile/.demo-account.local', import.meta.url).pathname
const reset = process.argv.includes('--reset')

// ── 1. Utilisateur auth + rdv_users ─────────────────────────────────────────
let password = existsSync(SECRET_FILE)
  ? (readFileSync(SECRET_FILE, 'utf8').match(/^password=(.+)$/m)?.[1] ?? '')
  : ''
if (!password) password = `Hub-${randomBytes(9).toString('base64url')}`

const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
let authId = list?.users.find(u => u.email?.toLowerCase() === EMAIL)?.id
if (!authId) {
  const { data, error } = await db.auth.admin.createUser({ email: EMAIL, password, email_confirm: true })
  if (error || !data.user) throw new Error(`auth: ${error?.message}`)
  authId = data.user.id
} else {
  await db.auth.admin.updateUserById(authId, { password })
}
writeFileSync(SECRET_FILE, `email=${EMAIL}\npassword=${password}\n`)

const { data: existing } = await db.from('rdv_users').select('id').eq('email', EMAIL).maybeSingle()
let userId = existing?.id as string | undefined
if (!userId) {
  const { data, error } = await db.from('rdv_users').insert({
    email: EMAIL, name: NAME, role: 'telepro', slug: SLUG, avatar_color: '#4DABDB',
    auth_id: authId, is_demo: true,
  }).select('id').single()
  if (error) throw new Error(`rdv_users: ${error.message}`)
  userId = data.id
} else {
  await db.from('rdv_users').update({ auth_id: authId, is_demo: true, role: 'telepro', name: NAME }).eq('id', userId)
}

// ── 2. Contacts fictifs ─────────────────────────────────────────────────────
const PEOPLE: [string, string, string, string, string][] = [
  // prénom, nom, classe, département, formation demandée
  ['Léa', 'Martin', 'Terminale', '75', 'PASS'],
  ['Hugo', 'Bernard', 'Terminale', '92', 'LAS'],
  ['Chloé', 'Petit', 'Première', '94', 'Terminale Santé'],
  ['Nathan', 'Durand', 'Terminale', '78', 'PASS'],
  ['Inès', 'Leroy', 'Terminale', '93', 'PASS'],
  ['Lucas', 'Moreau', 'Première', '91', 'Terminale Santé'],
  ['Manon', 'Simon', 'Terminale', '95', 'LAS'],
  ['Adam', 'Laurent', 'Terminale', '77', 'PASS'],
  ['Jade', 'Lefebvre', 'Première', '75', 'Terminale Santé'],
  ['Louis', 'Michel', 'Terminale', '92', 'PASS'],
  ['Zoé', 'Garcia', 'Terminale', '94', 'LAS'],
  ['Gabriel', 'David', 'Terminale', '78', 'PASS'],
  ['Emma', 'Bertrand', 'Première', '93', 'Terminale Santé'],
  ['Raphaël', 'Roux', 'Terminale', '91', 'PASS'],
  ['Louise', 'Vincent', 'Terminale', '75', 'LAS'],
]
const now = Date.now()
const contacts = PEOPLE.map(([firstname, lastname, classe, dept, formation], i) => {
  const created = new Date(now - (i + 1) * 36 * 3600_000).toISOString()
  return {
    hubspot_contact_id: `DEMO_${String(i + 1).padStart(3, '0')}`,
    firstname,
    lastname,
    email: `${firstname}.${lastname}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@example.com',
    phone: `+33639980${String(i + 1).padStart(3, '0')}`,
    departement: dept,
    classe_actuelle: classe,
    formation_demandee: formation,
    // Repérable par l'équipe dans le CRM (les fiches DEMO_ restent visibles des admins).
    origine: 'Démo (review Apple)',
    contact_createdate: created,
    recent_conversion_date: created,
    recent_conversion_event: 'Demande de documentation',
    telepro_user_id: userId,
    synced_at: new Date().toISOString(),
  }
})
const { error: cErr } = await db.from('crm_contacts').upsert(contacts, { onConflict: 'hubspot_contact_id' })
if (cErr) throw new Error(`crm_contacts: ${cErr.message}`)

// ── 3. RDV fictifs (sans téléphone → ignorés par les crons SMS) ─────────────
const { count } = await db.from('rdv_appointments').select('id', { count: 'exact', head: true }).eq('telepro_id', userId)
if (reset || !count) {
  await db.from('rdv_appointments').delete().eq('telepro_id', userId)
  const at = (dayOffset: number, hour: number) => {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const plan: [number, number, number, string][] = [
    // contact index, jour relatif, heure, statut
    [0, -3, 10, 'positif'],
    [1, -1, 15, 'no_show'],
    [2, 1, 11, 'confirme'],
    [3, 2, 14, 'confirme'],
    [4, 3, 17, 'confirme'],
  ]
  const appts = plan.map(([ci, day, hour, status]) => {
    const c = contacts[ci]
    const start = at(day, hour)
    return {
      prospect_name: `${c.firstname} ${c.lastname}`,
      prospect_email: c.email,
      prospect_phone: null,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
      status,
      source: 'telepro',
      formation_type: c.formation_demandee,
      meeting_type: 'visio',
      hubspot_contact_id: c.hubspot_contact_id,
      classe_actuelle: c.classe_actuelle,
      departement: c.departement,
      telepro_id: userId,
      commercial_id: null,
    }
  })
  const { error: aErr } = await db.from('rdv_appointments').insert(appts)
  if (aErr) throw new Error(`rdv_appointments: ${aErr.message}`)
}

console.log(`✔ Compte démo prêt : ${EMAIL} (rdv_users ${userId})`)
console.log(`  ${contacts.length} contacts DEMO_*, RDV ${reset || !count ? 'générés' : 'conservés'}`)
console.log(`  Identifiants : ${SECRET_FILE} (ne pas commiter)`)
