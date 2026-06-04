#!/usr/bin/env node
/**
 * scripts/list-upcoming-appointments.mjs
 *
 * Liste tous les prochains RDV prévus (start_at >= maintenant) depuis
 * la table rdv_appointments, regroupés par statut.
 *
 * Usage :
 *   bun run scripts/list-upcoming-appointments.mjs
 */

import { readFileSync } from 'node:fs'
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

const fmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
})

async function main() {
  loadEnv()

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Variables Supabase manquantes (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }

  const db = createClient(supabaseUrl, serviceKey)
  const nowIso = new Date().toISOString()

  const rows = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await db
      .from('rdv_appointments')
      .select('id, prospect_name, prospect_phone, start_at, end_at, status, formation_type, commercial_id, telepro_id, rdv_users:commercial_id (name)')
      .gte('start_at', nowIso)
      .neq('status', 'annule')
      .order('start_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  console.log(`\n=== Prochains RDV prévus (à partir de ${fmt.format(new Date(nowIso))}) ===`)
  console.log(`Total : ${rows.length} RDV (hors annulés)\n`)

  const byStatus = {}
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
  }
  console.log('Répartition par statut :')
  for (const [s, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${s.padEnd(16)} : ${n}`)
  }
  console.log('')

  for (const r of rows) {
    const closer = r.rdv_users?.name || (r.commercial_id ? r.commercial_id : 'NON ASSIGNÉ')
    console.log(
      `${fmt.format(new Date(r.start_at))}  | ${String(r.status).padEnd(14)} | ${String(r.prospect_name || '—').padEnd(28)} | ${String(r.prospect_phone || '').padEnd(14)} | ${closer}`
    )
  }
}

main().catch((err) => {
  console.error('Erreur :', err?.message || err)
  process.exit(1)
})
