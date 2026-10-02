#!/usr/bin/env bun
/**
 * Import « Prospects Diploma Lab à rappeler » (extraction du 02/10/2026) :
 * prospects de l'essai gratuit Diploma Lab jamais envoyés au CRM.
 *
 * - Fiche existante (email, sinon téléphone) → origine = « Diploma LAB »,
 *   champs vides complétés (email, département, classe…), rien d'autre écrasé.
 * - Sinon → création d'une fiche (id DIPLOMA_LAB_…, statut Nouveau).
 * - Une note d'activité par fiche avec le détail Lab (situation, lycée, remarque…).
 * - Vue « Téléchargement Diploma Lab » = ces fiches précises (hubspot_contact_id).
 *
 * Usage :
 *   bun scripts/import-diploma-lab-prospects-xlsx.mjs            # dry-run
 *   bun scripts/import-diploma-lab-prospects-xlsx.mjs --apply
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const XLSX_PATH = '/Users/aaronsarfati/Downloads/Prospects Diploma Lab à rappeler (1).xlsx'
const SHEET = 'Prospects à rappeler'
const ORIGINE = 'Diploma LAB'
const SOURCE = 'diploma_lab_xlsx'
const VIEW_ID = 'v_telechargement_diploma_lab'
const VIEW_NAME = 'Téléchargement Diploma Lab'

function loadEnv() {
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const str = (v) => {
  const s = String(v ?? '').trim()
  return s && s !== '—' ? s : null
}

// Numéro de série Excel (heure de Paris, CEST en sept./oct.) → ISO UTC
function excelDateToIso(serial) {
  if (typeof serial !== 'number') return null
  const ms = Math.round((serial - 25569) * 86400000) - 2 * 3600000
  return new Date(ms).toISOString()
}

function normPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return '+33' + digits.slice(1)
  return str(raw)
}

function mapClasse(raw) {
  const s = str(raw)
  if (!s) return null
  if (/pass|las|lsps/i.test(s)) return 'PASS'
  if (s === 'Autre') return 'Autres'
  return s
}

loadEnv()
const apply = process.argv.includes('--apply')
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^['"]+|['"]+$/g, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/^['"]+|['"]+$/g, ''),
  { auth: { persistSession: false } },
)

const sheet = XLSX.readFile(XLSX_PATH).Sheets[SHEET]
const all = XLSX.utils.sheet_to_json(sheet, { header: 1 })
const headerIdx = all.findIndex((r) => r?.[0] === 'Priorité')
const headers = all[headerIdx]
const col = Object.fromEntries(headers.map((h, i) => [h, i]))
const prospects = all.slice(headerIdx + 1).filter((r) => str(r[col['Mail']]) || str(r[col['Téléphone']]))

const SELECT = 'hubspot_contact_id, firstname, lastname, email, phone, origine, source, classe_actuelle, departement, hubspot_raw'

async function findExisting(email, phone) {
  if (email) {
    const { data, error } = await db.from('crm_contacts').select(SELECT).ilike('email', email).limit(5)
    if (error) throw new Error(error.message)
    if (data?.length) return { row: data[0], by: 'email' }
  }
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) {
    const { data, error } = await db
      .from('crm_contacts')
      .select(SELECT)
      .or(`phone.eq.+33${digits.slice(1)},phone.eq.${digits}`)
      .limit(10)
    if (error) throw new Error(error.message)
    if (data?.length) {
      // Préférence : fiche "réelle" avec email, puis les fiches import mama (sans email)
      const sorted = [...data].sort((a, b) => {
        const score = (r) => (r.hubspot_contact_id.startsWith('IMPORT_MAMA_') ? 2 : 0) + (r.email ? 0 : 1)
        return score(a) - score(b)
      })
      return { row: sorted[0], by: 'phone' }
    }
  }
  return null
}

const nowIso = new Date().toISOString()
const plan = []
for (const r of prospects) {
  const get = (h) => str(r[col[h]])
  const email = get('Mail')?.toLowerCase() ?? null
  const phoneRaw = get('Téléphone')
  const lab = {
    priorite: r[col['Priorité']] ?? null,
    situation: get('Situation'),
    lab: get('Lab'),
    inscrit_le: excelDateToIso(r[col['Inscrit le']]),
    numero_verifie: get('Numéro vérifié'),
    compte_cree: get('Compte créé'),
    classe_raw: get('Classe'),
    departement: get('Dépt'),
    lycee: get('Lycée'),
    specialites: get('Spécialités'),
    etudes_visees: get('Études visées'),
    connu_par: get('Connu par'),
    appareil: get('Appareil'),
    derniere_activite: excelDateToIso(r[col['Dernière activité']]),
    actions_app: get("Ce qu'il a fait dans l'app"),
    remarque: get('Remarque'),
    extraction: '2026-10-02',
  }
  const existing = await findExisting(email, phoneRaw)
  plan.push({
    firstname: get('Prénom'),
    lastname: get('Nom'),
    email,
    phone: normPhone(phoneRaw),
    classe: mapClasse(lab.classe_raw),
    lab,
    existing,
  })
}

for (const p of plan) {
  const e = p.existing
  console.log(
    `${e ? `MAJ (${e.by})` : 'NOUVEAU '} · ${p.firstname} ${p.lastname} · ${p.email}` +
      (e ? ` → ${e.row.hubspot_contact_id} [origine: ${e.row.origine ?? '—'}]` : ''),
  )
}
console.log(`\n${plan.length} prospects · ${plan.filter((p) => p.existing).length} existants · ${plan.filter((p) => !p.existing).length} nouveaux`)
if (!apply) {
  console.log('DRY-RUN — relance avec --apply')
  process.exit(0)
}

const backupPath = `scripts/_backup-diploma-lab-prospects-${Date.now()}.json`
writeFileSync(backupPath, JSON.stringify(plan.filter((p) => p.existing).map((p) => p.existing.row), null, 2))
console.log(`Backup des fiches existantes : ${backupPath}`)

const ids = []
for (const p of plan) {
  let id
  if (p.existing) {
    const row = p.existing.row
    id = row.hubspot_contact_id
    const patch = {
      origine: ORIGINE,
      synced_at: nowIso,
      hubspot_raw: { ...(row.hubspot_raw || {}), diploma_lab_prospect: p.lab },
    }
    if (!row.email && p.email) patch.email = p.email
    if (!row.phone && p.phone) patch.phone = p.phone
    if (!row.firstname && p.firstname) patch.firstname = p.firstname
    if (!row.lastname && p.lastname) patch.lastname = p.lastname
    if (!row.classe_actuelle && p.classe) patch.classe_actuelle = p.classe
    if (!row.departement && p.lab.departement) patch.departement = p.lab.departement
    const { error } = await db.from('crm_contacts').update(patch).eq('hubspot_contact_id', id)
    if (error) throw new Error(`${id}: ${error.message}`)
  } else {
    id = 'DIPLOMA_LAB_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    const { error } = await db.from('crm_contacts').insert({
      hubspot_contact_id: id,
      firstname: p.firstname,
      lastname: p.lastname,
      email: p.email,
      phone: p.phone,
      classe_actuelle: p.classe,
      departement: p.lab.departement,
      origine: ORIGINE,
      source: SOURCE,
      hs_lead_status: 'Nouveau',
      contact_createdate: p.lab.inscrit_le ?? nowIso,
      synced_at: nowIso,
      hubspot_raw: { diploma_lab_prospect: p.lab },
    })
    if (error) throw new Error(`insert ${p.email}: ${error.message}`)
  }
  ids.push(id)

  const l = p.lab
  const { error: noteErr } = await db.from('crm_activities').insert({
    activity_type: 'note',
    hubspot_contact_id: id,
    subject: `Prospect Diploma Lab à rappeler — priorité ${l.priorite ?? '?'}`,
    body: [
      `Situation : ${l.situation ?? 'n/a'}`,
      `Lab : ${l.lab ?? 'n/a'}`,
      `Numéro vérifié : ${l.numero_verifie ?? 'n/a'} · Compte créé : ${l.compte_cree ?? 'n/a'}`,
      `Classe : ${l.classe_raw ?? 'n/a'} · Dépt : ${l.departement ?? 'n/a'}`,
      `Lycée : ${l.lycee ?? 'n/a'}`,
      `Spécialités : ${l.specialites ?? 'n/a'}`,
      `Études visées : ${l.etudes_visees ?? 'n/a'}`,
      `Connu par : ${l.connu_par ?? 'n/a'} · Appareil : ${l.appareil ?? 'n/a'}`,
      `Dans l'app : ${l.actions_app ?? '—'}`,
      l.remarque ? `Remarque : ${l.remarque}` : null,
    ].filter(Boolean).join('\n'),
    metadata: { source: SOURCE, lab: l },
    occurred_at: l.inscrit_le ?? nowIso,
  })
  if (noteErr) console.error(`Note ${id}: ${noteErr.message}`)
}

const { data: posRows } = await db
  .from('crm_saved_views')
  .select('position')
  .eq('scope', 'contacts')
  .order('position', { ascending: false })
  .limit(1)
const { error: viewErr } = await db.from('crm_saved_views').upsert({
  id: VIEW_ID,
  name: VIEW_NAME,
  filter_groups: [{
    id: 'grp-telechargement-diploma-lab',
    rules: [{
      id: 'r-telechargement-diploma-lab-ids',
      field: 'custom:hubspot_contact_id',
      operator: 'is_any',
      value: ids.join(','),
    }],
  }],
  preset_flags: null,
  position: Number(posRows?.[0]?.position ?? 0) + 1,
  scope: 'contacts',
  owner_id: null,
}, { onConflict: 'id' })
if (viewErr) throw new Error(`Vue: ${viewErr.message}`)

const { error: refreshErr } = await db.rpc('crm_refresh_contacts_fast_mv')
if (refreshErr) console.error('Refresh MV (non bloquant):', refreshErr.message)

console.log(JSON.stringify({ contacts: ids.length, view: VIEW_NAME, backup: backupPath }, null, 2))
