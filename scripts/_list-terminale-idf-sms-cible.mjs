#!/usr/bin/env bun
/**
 * Liste Terminale IDF sans Benjamin Delacour telepro, hors Pré-inscrit 2026/2027.
 * Usage: bun run scripts/_list-terminale-idf-sms-cible.mjs
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

const BENJAMIN_ID = '1754457656'
const PREINSCRIT = ['Pré-inscrit 2026/2027', 'Pré-inscrit 2026-2027']

function isLinova(row) {
  const source = String(row.source ?? '').trim().toLowerCase()
  const origine = String(row.origine ?? '')
  const conv = String(row.recent_conversion_event ?? '')
  return source === 'linova' || /linova/i.test(origine) || /linova/i.test(conv)
}

function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function hasPhone(phone) {
  return String(phone ?? '').replace(/\D/g, '').length >= 9
}

async function main() {
  loadEnv()

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('crm_contacts')
      .select(
        'hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle, zone_localite, hs_lead_status, origine, source, recent_conversion_event, telepro_user_id, hubspot_owner_id, contact_createdate',
      )
      .eq('classe_actuelle', 'Terminale')
      .eq('zone_localite', 'IDF')
      .order('hs_lead_status', { ascending: true })
      .order('contact_createdate', { ascending: false, nullsFirst: false })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }

  const afterBase = rows.filter(
    (r) =>
      String(r.telepro_user_id ?? '') !== BENJAMIN_ID &&
      !PREINSCRIT.includes(r.hs_lead_status ?? ''),
  )
  const linovaExcluded = afterBase.filter(isLinova)
  const filtered = afterBase.filter((r) => !isLinova(r))

  const { data: telepros } = await db
    .from('rdv_users')
    .select('name, hubspot_user_id, hubspot_owner_id')
    .eq('role', 'telepro')

  const teleproNameById = new Map()
  for (const t of telepros ?? []) {
    const id = String(t.hubspot_user_id || t.hubspot_owner_id || '')
    if (id) teleproNameById.set(id, t.name)
  }

  for (const r of filtered) {
    const tid = String(r.telepro_user_id ?? '')
    r.telepro_name = teleproNameById.get(tid) || (tid || '(vide)')
  }

  const byStatus = filtered.reduce((acc, r) => {
    const k = r.hs_lead_status || '(vide)'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const byTelepro = filtered.reduce((acc, r) => {
    acc[r.telepro_name] = (acc[r.telepro_name] || 0) + 1
    return acc
  }, {})

  const withPhone = filtered.filter((r) => hasPhone(r.phone))
  const nouveau = filtered.filter((r) => r.hs_lead_status === 'Nouveau')
  const nouveauChaud = filtered.filter((r) => r.hs_lead_status === 'Nouveau - Chaud')
  const nrp = filtered.filter((r) => ['NRP1', 'NRP2', 'NRP3'].includes(r.hs_lead_status ?? ''))
  const nouveauEtNrp = filtered.filter((r) =>
    ['Nouveau', 'Nouveau - Chaud', 'NRP1', 'NRP2', 'NRP3'].includes(r.hs_lead_status ?? ''),
  )

  const headers = [
    'hubspot_contact_id',
    'firstname',
    'lastname',
    'email',
    'phone',
    'departement',
    'hs_lead_status',
    'telepro_name',
    'telepro_user_id',
    'origine',
  ]
  const csv = [
    headers.join(','),
    ...filtered.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
  ].join('\n')

  const outDir = join(process.cwd(), 'exports')
  mkdirSync(outDir, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  const outPath = join(outDir, `terminale-idf-sans-benjamin-hors-preinscrit-${today}.csv`)
  writeFileSync(outPath, csv, 'utf8')

  const smsHeaders = headers
  const smsCsv = [
    smsHeaders.join(','),
    ...nouveauEtNrp.map((row) => smsHeaders.map((h) => escapeCsv(row[h])).join(',')),
  ].join('\n')
  const smsOutPath = join(outDir, `terminale-idf-nouveau-nrp-sms-${today}.csv`)
  writeFileSync(smsOutPath, smsCsv, 'utf8')

  const smsWithPhone = nouveauEtNrp.filter((r) => hasPhone(r.phone))

  console.log(
    JSON.stringify(
      {
        filtres: {
          classe_actuelle: 'Terminale',
          zone_localite: 'IDF',
          telepro_not: 'Benjamin Delacour (1754457656)',
          hs_lead_status_exclu: PREINSCRIT,
          linova_exclu: 'source=linova OR origine/recent_conversion_event contient linova',
        },
        total_terminale_idf: rows.length,
        apres_filtres_base: afterBase.length,
        exclus_linova: linovaExcluded.length,
        total_cible: filtered.length,
        avec_telephone: withPhone.length,
        sans_telephone: filtered.length - withPhone.length,
        nouveau: {
          total: nouveau.length,
          avec_telephone: nouveau.filter((r) => hasPhone(r.phone)).length,
        },
        nouveau_chaud: {
          total: nouveauChaud.length,
          avec_telephone: nouveauChaud.filter((r) => hasPhone(r.phone)).length,
        },
        nrp: {
          total: nrp.length,
          nrp1: filtered.filter((r) => r.hs_lead_status === 'NRP1').length,
          nrp2: filtered.filter((r) => r.hs_lead_status === 'NRP2').length,
          nrp3: filtered.filter((r) => r.hs_lead_status === 'NRP3').length,
          avec_telephone: nrp.filter((r) => hasPhone(r.phone)).length,
        },
        nouveau_et_nrp: {
          total: nouveauEtNrp.length,
          avec_telephone: smsWithPhone.length,
          sans_telephone: nouveauEtNrp.length - smsWithPhone.length,
        },
        par_statut: byStatus,
        par_telepro: Object.fromEntries(
          Object.entries(byTelepro).sort((a, b) => b[1] - a[1]),
        ),
        fichier: outPath,
        fichier_sms_cible: smsOutPath,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }))
  process.exit(1)
})
