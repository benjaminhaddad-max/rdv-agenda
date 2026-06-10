#!/usr/bin/env node
/**
 * scripts/export-aircall-contacts.mjs
 *
 * Génère un CSV à uploader UNE SEULE FOIS dans le carnet d'adresses partagé
 * Aircall (Dashboard Aircall → Contacts → Import). Sert au seed initial,
 * pour ne pas devoir attendre que le cron pousse 100k contacts un par un.
 *
 * Ensuite, le cron /api/cron/aircall-sync prend le relais pour les nouveaux
 * leads et les modifications.
 *
 * Format CSV attendu par Aircall :
 *   first_name, last_name, phone_number, email, company, description
 *
 * Usage :
 *   bun run scripts/export-aircall-contacts.mjs
 *
 * Le fichier sort dans exports/aircall-contacts-YYYY-MM-DD.csv
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const src = readFileSync('.env.local', 'utf8')
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toE164French(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/[\s\-\.()]/g, '')
  if (!cleaned) return null
  if (cleaned.startsWith('+33') && cleaned.length === 12) return cleaned
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('0033') && cleaned.length === 13) return '+33' + cleaned.slice(4)
  if (cleaned.startsWith('33') && cleaned.length === 11) return '+' + cleaned
  if (cleaned.startsWith('0') && cleaned.length === 10) return '+33' + cleaned.slice(1)
  return null
}

function cleanName(v) {
  if (!v) return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

function toIsoDatePart(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

async function main() {
  loadEnv()

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Variables Supabase manquantes (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }

  const db = createClient(supabaseUrl, serviceKey)

  // 1. Charger la table télépro → nom (pour le suffixe "— Telepro: X")
  const { data: telepros, error: tpErr } = await db
    .from('rdv_users')
    .select('id, name')
    .eq('role', 'telepro')

  if (tpErr) throw new Error(`rdv_users: ${tpErr.message}`)
  const teleproById = new Map((telepros ?? []).map(t => [t.id, t.name]))

  // 2. Paginer sur crm_contacts (peut être > 100k)
  const batchSize = 1000
  const seenPhones = new Set() // dedup par numéro (Aircall ne dedup pas en import)
  const rows = []
  let totalFetched = 0
  let skippedInvalidPhone = 0
  let skippedDuplicate = 0
  let skippedNoName = 0

  for (let from = 0; ; from += batchSize) {
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, telepro_user_id')
      .not('phone', 'is', null)
      .order('hubspot_contact_id', { ascending: true })
      .range(from, from + batchSize - 1)

    if (error) throw new Error(`crm_contacts page ${from}: ${error.message}`)
    if (!data || data.length === 0) break

    totalFetched += data.length

    for (const c of data) {
      const phone = toE164French(c.phone)
      if (!phone) {
        skippedInvalidPhone++
        continue
      }
      if (seenPhones.has(phone)) {
        skippedDuplicate++
        continue
      }

      const first = cleanName(c.firstname)
      const last = cleanName(c.lastname)
      if (!first && !last) {
        skippedNoName++
        continue
      }

      const teleproName = c.telepro_user_id ? teleproById.get(c.telepro_user_id) : null
      const lastWithTag = teleproName
        ? `${last || ''} — Telepro: ${teleproName}`.trim()
        : last

      seenPhones.add(phone)
      rows.push({
        first_name: first || 'Lead',
        last_name: lastWithTag,
        phone_number: phone,
        email: c.email ?? '',
        company: '',
        description: c.hubspot_contact_id ? `HubSpot ID ${c.hubspot_contact_id}` : '',
      })
    }

    process.stdout.write(`\rFetched ${totalFetched} / kept ${rows.length}`)
    if (data.length < batchSize) break
  }

  process.stdout.write('\n')

  // 3. Écrire le CSV
  mkdirSync('exports', { recursive: true })
  const file = join('exports', `aircall-contacts-${toIsoDatePart()}.csv`)
  const header = ['first_name', 'last_name', 'phone_number', 'email', 'company', 'description']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(header.map(h => escapeCsv(r[h])).join(','))
  }
  writeFileSync(file, lines.join('\n'), 'utf8')

  console.log(`\n✓ Export OK : ${file}`)
  console.log(`  contacts dans CRM       : ${totalFetched}`)
  console.log(`  contacts dans le CSV    : ${rows.length}`)
  console.log(`  ignorés (tel invalide)  : ${skippedInvalidPhone}`)
  console.log(`  ignorés (doublon tel)   : ${skippedDuplicate}`)
  console.log(`  ignorés (sans nom)      : ${skippedNoName}`)
  console.log('')
  console.log('Étape suivante :')
  console.log('  1. Ouvre https://dashboard.aircall.io → Contacts → Shared')
  console.log('  2. Clique "Import contacts" → upload le fichier CSV')
  console.log('  3. À partir de maintenant, le cron /api/cron/aircall-sync')
  console.log('     pousse automatiquement les nouveaux leads et les modifs.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
