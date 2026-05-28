#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const src = readFileSync('.env.local', 'utf8')
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env missing')
const db = createClient(SUPABASE_URL, SERVICE_KEY)

const args = process.argv.slice(2)
const days = Number(args.find(a => a.startsWith('--days='))?.split('=')[1] || '30')
const BATCH = 500
const sinceIso = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString()

const AUTO_MAP = {
  firstname: 'firstname',
  lastname: 'lastname',
  email: 'email',
  phone: 'phone',
  mobilephone: 'phone',
  classe_actuelle: 'classe_actuelle',
  classe: 'classe_actuelle',
  departement: 'departement',
  department: 'departement',
  zone_localite: 'zone_localite',
  zone___localite: 'zone_localite',
  zone: 'zone_localite',
  formation_souhaitee: 'formation_souhaitee',
  formation: 'formation_souhaitee',
  formation_demandee: 'formation_demandee',
  diploma_sante___formation_demandee: 'formation_demandee',
  origine: 'origine',
  source: 'origine',
}

function toClean(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
}

async function main() {
  let from = 0
  let processed = 0
  let upserted = 0
  let skipped = 0

  console.log(JSON.stringify({ mode: 'crm-form-leads-catchup', since: sinceIso }))

  while (true) {
    const { data: subs, error } = await db
      .from('form_submissions')
      .select('id, data, submitted_at')
      .gte('submitted_at', sinceIso)
      .order('submitted_at', { ascending: true })
      .range(from, from + BATCH - 1)
    if (error) throw new Error(error.message)
    if (!subs || subs.length === 0) break

    for (const s of subs) {
      processed++
      const data = s.data && typeof s.data === 'object' ? s.data : {}
      const contactData = {}
      for (const [k, v] of Object.entries(data)) {
        const key = AUTO_MAP[k]
        if (!key) continue
        const clean = toClean(v)
        if (clean) contactData[key] = clean
      }

      const email = toClean(contactData.email)?.toLowerCase()
      const phone = toClean(contactData.phone)?.replace(/\s+/g, '')
      if (!email && !phone) {
        skipped++
        continue
      }

      let existing = null
      if (email) {
        const { data: c } = await db.from('crm_contacts').select('hubspot_contact_id').eq('email', email).maybeSingle()
        existing = c
      }
      if (!existing && phone) {
        const { data: c } = await db.from('crm_contacts').select('hubspot_contact_id').eq('phone', phone).maybeSingle()
        existing = c
      }

      const payload = { ...contactData, synced_at: new Date().toISOString(), origine: contactData.origine || 'Formulaire web' }
      if (existing?.hubspot_contact_id) {
        const { error: uErr } = await db.from('crm_contacts').update(payload).eq('hubspot_contact_id', existing.hubspot_contact_id)
        if (!uErr) upserted++
      } else {
        const nativeId = `NATIVE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const ins = {
          hubspot_contact_id: nativeId,
          ...payload,
          contact_createdate: new Date().toISOString(),
          hs_lead_status: 'Nouveau',
        }
        const { error: iErr } = await db.from('crm_contacts').insert(ins)
        if (!iErr) upserted++
      }
    }

    console.log(JSON.stringify({ step: 'batch', from, count: subs.length, processed, upserted, skipped }))
    if (subs.length < BATCH) break
    from += BATCH
  }

  console.log(JSON.stringify({ ok: true, processed, upserted, skipped }, null, 2))
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }))
  process.exit(1)
})
