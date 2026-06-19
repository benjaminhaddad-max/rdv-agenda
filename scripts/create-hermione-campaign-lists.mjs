#!/usr/bin/env node
/**
 * Crée 2 listes CRM (email_segments) de 2000 contacts :
 *   1. IDF + Etudes Sup. + récent (tri recent_conversion_date) — hors pré-inscrits Diploma
 *   2. PASS — hors pré-inscrits Diploma (2000 plus récents)
 *
 * Inscrit Diploma = hs_lead_status ∈ { Pré-inscrit 2025/2026, Pré-inscrit 2026/2027 }
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PREINSCRIT = ['Pré-inscrit 2025/2026', 'Pré-inscrit 2026/2027']
const LIMIT = 2000

function loadEnv() {
  for (const f of ['.env.local', '.env.production.local']) {
    try {
      for (const raw of readFileSync(f, 'utf8').split(/\r?\n/)) {
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
    } catch { /* ignore */ }
  }
}

function escapeCsv(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function fetchTopIds(db, where, limit = LIMIT) {
  const rows = []
  for (let from = 0; rows.length < limit; from += 1000) {
    let q = db
      .from('crm_contacts')
      .select(
        'hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, hs_lead_status, zone_localite, departement, origine, contact_createdate, recent_conversion_date',
      )
      .not('phone', 'is', null)
      .neq('phone', '')
      .not('hs_lead_status', 'in', `("${PREINSCRIT.join('","')}")`)

    for (const [col, val] of Object.entries(where)) q = q.eq(col, val)

    q = q
      .order('recent_conversion_date', { ascending: false, nullsFirst: false })
      .order('contact_createdate', { ascending: false, nullsFirst: false })
      .range(from, from + 999)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows.slice(0, limit)
}

function writeCsv(path, rows) {
  const header = [
    'hubspot_contact_id', 'firstname', 'lastname', 'email', 'phone',
    'classe_actuelle', 'hs_lead_status', 'zone_localite', 'departement',
    'origine', 'contact_createdate', 'recent_conversion_date',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(header.map(h => escapeCsv(r[h])).join(','))
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf8')
}

async function upsertSegment(db, { name, description, contactIds, criteria }) {
  const { data: existing } = await db
    .from('email_segments')
    .select('id, name')
    .eq('name', name)
    .maybeSingle()

  const payload = {
    name,
    description,
    filters: { contact_ids: contactIds, criteria },
    contact_count: contactIds.length,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await db.from('email_segments').update(payload).eq('id', existing.id).select().single()
    if (error) throw new Error(`update ${name}: ${error.message}`)
    return { action: 'updated', segment: data }
  }

  const { data, error } = await db.from('email_segments').insert(payload).select().single()
  if (error) throw new Error(`insert ${name}: ${error.message}`)
  return { action: 'created', segment: data }
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env manquantes')

  const db = createClient(url, key, { auth: { persistSession: false } })

  console.log('Récupération contacts IDF Etudes Sup…')
  const idfRows = await fetchTopIds(db, { zone_localite: 'IDF', classe_actuelle: 'Etudes Sup.' })
  console.log(`  → ${idfRows.length} contacts`)

  console.log('Récupération contacts PASS…')
  const passRows = await fetchTopIds(db, { classe_actuelle: 'PASS' })
  console.log(`  → ${passRows.length} contacts`)

  mkdirSync('exports', { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const idfCsv = join('exports', `liste-idf-etudes-sup-non-preinscrit-${date}.csv`)
  const passCsv = join('exports', `liste-pass-non-preinscrit-${date}.csv`)
  writeCsv(idfCsv, idfRows)
  writeCsv(passCsv, passRows)
  console.log('CSV:', idfCsv)
  console.log('CSV:', passCsv)

  const idfCriteria = {
    zone: 'IDF',
    classe: 'Etudes Sup.',
    exclude_lead_status: PREINSCRIT,
    order: 'recent_conversion_date desc',
    limit: LIMIT,
    requires_phone: true,
  }
  const passCriteria = {
    classe: 'PASS',
    exclude_lead_status: PREINSCRIT,
    order: 'recent_conversion_date desc',
    limit: LIMIT,
    requires_phone: true,
  }

  const idfIds = idfRows.map(r => r.hubspot_contact_id)
  const passIds = passRows.map(r => r.hubspot_contact_id)

  const r1 = await upsertSegment(db, {
    name: 'Hermione — IDF Études Sup récent (non pré-inscrit)',
    description: '2000 contacts IDF, classe Etudes Sup., triés par activité récente. Exclut Pré-inscrit 2025/2026 et 2026/2027. Téléphone requis.',
    contactIds: idfIds,
    criteria: idfCriteria,
  })

  const r2 = await upsertSegment(db, {
    name: 'Hermione — PASS (non pré-inscrit)',
    description: '2000 contacts PASS, triés par activité récente. Exclut Pré-inscrit 2025/2026 et 2026/2027. Téléphone requis.',
    contactIds: passIds,
    criteria: passCriteria,
  })

  console.log('\nSegments CRM :')
  console.log(`  [${r1.action}] ${r1.segment.name} — id ${r1.segment.id} — ${r1.segment.contact_count} contacts`)
  console.log(`  [${r2.action}] ${r2.segment.name} — id ${r2.segment.id} — ${r2.segment.contact_count} contacts`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
