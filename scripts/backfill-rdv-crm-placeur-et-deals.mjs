/**
 * Rattrapage des RDV places depuis le CRM avant la tracabilite du placeur.
 *
 * Cible : rdv_appointments.source = 'admin' ET telepro_id IS NULL.
 *
 * 1) Attribution — on associe le RDV au telepro dont l'appel Aircall sortant
 *    precede immediatement la creation du creneau (fenetre <= 30 min). Au-dela,
 *    la correlation n'est pas assez fiable : on laisse le RDV sans placeur.
 * 2) Transactions — on cree la transaction "RDV pris" que le flux admin ne
 *    creait pas (hubspot_deal_id = "rdv_<id>", comme /api/appointments).
 *
 * La propriete des fiches contact n'est JAMAIS modifiee : un rattrapage ne doit
 * pas redistribuer les leads entre telepros.
 *
 * Usage :
 *   bun run scripts/backfill-rdv-crm-placeur-et-deals.mjs          # dry-run
 *   bun run scripts/backfill-rdv-crm-placeur-et-deals.mjs --go     # execution
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const GO = process.argv.includes('--go')
const DAYS = Number(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || 60)
const CALL_WINDOW_MIN = 30

for (const line of readFileSync(new URL('../.env.production.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\\n$/, '')
}

const { STAGES, PIPELINE_2026_2027, formatDealName } = await import('../lib/hubspot.ts')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const since = new Date(Date.now() - DAYS * 86400000).toISOString()

// ── Cibles ────────────────────────────────────────────────────────────────
const { data: appts, error: apptErr } = await db
  .from('rdv_appointments')
  .select('id, prospect_name, hubspot_contact_id, hubspot_deal_id, commercial_id, formation_type, classe_actuelle, meeting_type, status, start_at, created_at')
  .eq('source', 'admin')
  .is('telepro_id', null)
  .gte('created_at', since)
  .order('created_at', { ascending: true })
if (apptErr) throw new Error(apptErr.message)

console.log(`RDV cibles (source=admin, sans telepro_id, ${DAYS} derniers jours) : ${appts.length}`)

// ── Referentiels ──────────────────────────────────────────────────────────
const { data: users } = await db.from('rdv_users').select('id, name, role, hubspot_user_id, hubspot_owner_id')
const userById = new Map(users.map(u => [u.id, u]))

const contactIds = [...new Set(appts.map(a => a.hubspot_contact_id).filter(Boolean))]

const contactById = new Map()
for (let i = 0; i < contactIds.length; i += 200) {
  const { data } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, telepro_user_id')
    .in('hubspot_contact_id', contactIds.slice(i, i + 200))
  for (const c of data ?? []) contactById.set(c.hubspot_contact_id, c)
}

// Transactions deja presentes sur ces contacts (detection de doublons)
const dealsByContact = new Map()
for (let i = 0; i < contactIds.length; i += 200) {
  const { data } = await db
    .from('crm_deals')
    .select('hubspot_deal_id, hubspot_contact_id, dealstage, supabase_appt_id')
    .in('hubspot_contact_id', contactIds.slice(i, i + 200))
  for (const d of data ?? []) {
    const arr = dealsByContact.get(d.hubspot_contact_id) ?? []
    arr.push(d)
    dealsByContact.set(d.hubspot_contact_id, arr)
  }
}

// Appels Aircall sur ces contacts
const callsByContact = new Map()
for (let i = 0; i < contactIds.length; i += 200) {
  const { data } = await db
    .from('crm_activities')
    .select('hubspot_contact_id, owner_id, occurred_at')
    .in('hubspot_contact_id', contactIds.slice(i, i + 200))
    .eq('activity_type', 'call')
    .gte('occurred_at', since)
  for (const c of data ?? []) {
    const arr = callsByContact.get(c.hubspot_contact_id) ?? []
    arr.push(c)
    callsByContact.set(c.hubspot_contact_id, arr)
  }
}

/** Telepro dont l'appel precede immediatement la creation du RDV. */
function resolvePlacer(appt) {
  const calls = (callsByContact.get(appt.hubspot_contact_id) ?? [])
    .filter(c => new Date(c.occurred_at) <= new Date(appt.created_at))
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
  if (!calls.length) return null
  const gapMin = (new Date(appt.created_at) - new Date(calls[0].occurred_at)) / 60000
  if (gapMin > CALL_WINDOW_MIN) return null
  const user = userById.get(calls[0].owner_id)
  return user?.role === 'telepro' ? { user, gapMin } : null
}

// ── Plan ──────────────────────────────────────────────────────────────────
const plan = { attributions: [], deals: [], skipped: { pasDeContact: [], dejaUneTransaction: [], pasDAppelFiable: [] } }

for (const appt of appts) {
  const placer = resolvePlacer(appt)
  if (placer) {
    plan.attributions.push({
      appointment_id: appt.id,
      prospect: appt.prospect_name,
      telepro_id: placer.user.id,
      telepro: placer.user.name,
      ecart_appel_min: Math.round(placer.gapMin),
    })
  } else {
    plan.skipped.pasDAppelFiable.push({ appointment_id: appt.id, prospect: appt.prospect_name })
  }

  if (!appt.hubspot_contact_id) {
    plan.skipped.pasDeContact.push({ appointment_id: appt.id, prospect: appt.prospect_name })
    continue
  }
  const existing = (dealsByContact.get(appt.hubspot_contact_id) ?? []).filter(d => d.supabase_appt_id !== appt.id)
  if (existing.length) {
    plan.skipped.dejaUneTransaction.push({
      appointment_id: appt.id,
      prospect: appt.prospect_name,
      deals: existing.map(d => d.hubspot_deal_id),
    })
    continue
  }

  const closer = appt.commercial_id ? userById.get(appt.commercial_id) : null
  const teleproHs = placer?.user.hubspot_user_id || contactById.get(appt.hubspot_contact_id)?.telepro_user_id || null
  plan.deals.push({
    hubspot_deal_id: `rdv_${appt.id}`,
    hubspot_contact_id: appt.hubspot_contact_id,
    dealname: formatDealName({
      prospectName: appt.prospect_name || '',
      classeActuelle: appt.classe_actuelle,
      formationType: appt.formation_type,
    }) || appt.prospect_name,
    dealstage: STAGES.rdvPris,
    pipeline: PIPELINE_2026_2027,
    hubspot_owner_id: closer?.hubspot_owner_id || null,
    teleprospecteur: teleproHs ? String(teleproHs) : null,
    formation: appt.formation_type || null,
    closedate: appt.start_at,
    createdate: appt.created_at,
    description: `RDV ${appt.meeting_type || ''} placé depuis le CRM`.trim(),
    supabase_appt_id: appt.id,
    synced_at: new Date().toISOString(),
  })
}

const parTelepro = {}
for (const a of plan.attributions) parTelepro[a.telepro] = (parTelepro[a.telepro] || 0) + 1

console.log('\n── Attribution du placeur (appel Aircall <= 30 min avant) ──')
console.log(`à attribuer : ${plan.attributions.length}`)
for (const [name, n] of Object.entries(parTelepro).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${name}`)
}
console.log(`sans appel fiable, laissés tels quels : ${plan.skipped.pasDAppelFiable.length}`)

console.log('\n── Transactions "RDV pris" ──')
console.log(`à créer                          : ${plan.deals.length}`)
console.log(`ignorés (contact a déjà un deal) : ${plan.skipped.dejaUneTransaction.length}`)
console.log(`ignorés (RDV sans fiche contact) : ${plan.skipped.pasDeContact.length}`)

if (!GO) {
  console.log('\nDry-run — rien n\'a été écrit. Relancer avec --go pour appliquer.')
  process.exit(0)
}

// ── Execution ─────────────────────────────────────────────────────────────
const stamp = Date.now()
const backupPath = new URL(`./_backup-rdv-crm-placeur-${stamp}.json`, import.meta.url)
writeFileSync(backupPath, JSON.stringify(plan, null, 2))
console.log(`\nSauvegarde du plan : ${backupPath.pathname}`)

let okAttr = 0
for (const a of plan.attributions) {
  const { error } = await db
    .from('rdv_appointments')
    .update({ telepro_id: a.telepro_id })
    .eq('id', a.appointment_id)
    .is('telepro_id', null)
  if (error) console.error(`  attribution KO ${a.appointment_id}: ${error.message}`)
  else okAttr += 1
}
console.log(`Attributions appliquées : ${okAttr}/${plan.attributions.length}`)

let okDeals = 0
for (const deal of plan.deals) {
  const { error } = await db.from('crm_deals').upsert(deal, { onConflict: 'hubspot_deal_id' })
  if (error) { console.error(`  deal KO ${deal.hubspot_deal_id}: ${error.message}`); continue }
  const { error: linkErr } = await db
    .from('rdv_appointments')
    .update({ hubspot_deal_id: deal.hubspot_deal_id })
    .eq('id', deal.supabase_appt_id)
  if (linkErr) console.error(`  lien RDV→deal KO ${deal.supabase_appt_id}: ${linkErr.message}`)
  else okDeals += 1
}
console.log(`Transactions créées et liées : ${okDeals}/${plan.deals.length}`)
