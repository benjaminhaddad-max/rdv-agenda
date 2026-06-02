#!/usr/bin/env node

/**
 * Live strict mirror: Diploma platform -> CRM deals (2026-2027, 4 stages)
 *
 * Rules:
 * - 1 inscription -> 1 deal dpl_<inscription_id>
 * - contact match by inscription email
 * - if not found, create contact (lastname, firstname, phone, email, lead status)
 * - move deal to stage derived from platform status
 * - delete extra deals in scope not present in platform source
 *
 * Usage:
 *   DIPLOMA_API_KEY=... node scripts/sync-diploma-live-mirror.mjs --dry-run
 *   DIPLOMA_API_KEY=... node scripts/sync-diploma-live-mirror.mjs --execute
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const src = readFileSync('.env.local', 'utf8')
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function stageFor(ins) {
  if (ins.status === 'archivee') return '3165428984' // Inscription Confirmée
  if (ins.status === 'annulee') return '3165428985' // Fermé Perdu
  if (ins.status === 'en_cours') return '3165428983' // Finalisation
  if (ins.status === 'payee') return (Number(ins.finalisation_step) || 0) > 0 ? '3165428983' : '3165428982'
  return null
}

function buildDealName(ins) {
  const first = String(ins.first_name || '').trim()
  const last = String(ins.last_name || '').trim()
  const formation = String(ins.selected_formule_name || '').trim()
  if (formation && (first || last)) return `${last.toUpperCase()} ${first} - ${formation}`.trim()
  if (formation) return `Inscription ${String(ins.id).slice(0, 8)} - ${formation}`
  if (first || last) return `${last.toUpperCase()} ${first}`.trim()
  return `Inscription ${String(ins.id).slice(0, 8)}`
}

async function pullDiploma(key) {
  const out = []
  let offset = 0
  while (true) {
    const r = await fetch(`https://admission.diploma-sante.fr/api/list-inscriptions?limit=500&offset=${offset}`, {
      headers: { 'x-api-key': key },
    })
    if (!r.ok) throw new Error(`Diploma API ${r.status}: ${await r.text()}`)
    const d = await r.json()
    out.push(...(d.inscriptions || []))
    if (!d?.pagination?.has_more) break
    offset += 500
  }
  return out
}

async function fetchContactsByEmail(db, emails) {
  const out = new Map()
  const BATCH = 500
  for (let i = 0; i < emails.length; i += BATCH) {
    const chunk = emails.slice(i, i + BATCH)
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id,email,firstname,lastname,phone')
      .in('email', chunk)
    if (error) throw new Error(`fetch contacts by email: ${error.message}`)
    for (const c of data || []) {
      const e = normalizeEmail(c.email)
      if (e && !out.has(e)) out.set(e, c)
    }
  }
  return out
}

async function upsertContacts(db, rows) {
  if (!rows.length) return 0
  const BATCH = 200
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await db.from('crm_contacts').upsert(chunk, { onConflict: 'hubspot_contact_id' })
    if (error) throw new Error(`upsert contacts: ${error.message}`)
    total += chunk.length
  }
  return total
}

async function upsertDeals(db, rows) {
  if (!rows.length) return 0
  const BATCH = 200
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await db.from('crm_deals').upsert(chunk, { onConflict: 'hubspot_deal_id' })
    if (error) throw new Error(`upsert deals: ${error.message}`)
    total += chunk.length
  }
  return total
}

async function deleteDeals(db, ids) {
  if (!ids.length) return 0
  const BATCH = 200
  let total = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { data, error } = await db.from('crm_deals').delete().in('hubspot_deal_id', chunk).select('hubspot_deal_id')
    if (error) throw new Error(`delete deals: ${error.message}`)
    total += (data || []).length
  }
  return total
}

async function fetchAllDealsInScope(db) {
  const PIPELINE = '2313043166'
  const STAGES = ['3165428982', '3165428983', '3165428984', '3165428985']
  const out = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await db
      .from('crm_deals')
      .select('hubspot_deal_id,hubspot_contact_id,dealstage,pipeline')
      .eq('pipeline', PIPELINE)
      .in('dealstage', STAGES)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch deals in scope: ${error.message}`)
    const rows = data || []
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

async function main() {
  loadEnvLocal()
  const execute = process.argv.includes('--execute')
  const mode = execute ? 'execute' : 'dry-run'
  const key = process.env.DIPLOMA_API_KEY
  if (!key) throw new Error('DIPLOMA_API_KEY missing')

  const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase env')
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const TARGET_STATUS = new Set(['payee', 'en_cours', 'archivee', 'annulee'])
  const PIPELINE = '2313043166'

  const all = await pullDiploma(key)
  const source = all.filter(i => TARGET_STATUS.has(i.status) && i.id && i.email)

  const emails = [...new Set(source.map(i => normalizeEmail(i.email)).filter(Boolean))]
  const contactByEmail = await fetchContactsByEmail(db, emails)

  const toCreateContacts = []
  const assignedContact = new Map() // inscriptionId -> contactId
  let matched = 0
  let created = 0
  for (const ins of source) {
    const email = normalizeEmail(ins.email)
    const existing = contactByEmail.get(email)
    if (existing) {
      assignedContact.set(String(ins.id), String(existing.hubspot_contact_id))
      matched++
      continue
    }
    const newId = ins.hubspot_contact_id ? String(ins.hubspot_contact_id).trim() : `dpl_c_${ins.id}`
    toCreateContacts.push({
      hubspot_contact_id: newId,
      firstname: ins.first_name || null,
      lastname: ins.last_name || null,
      phone: ins.phone || null,
      email,
      hs_lead_status: 'Pré-inscrit 2026/2027',
      synced_at: new Date().toISOString(),
    })
    contactByEmail.set(email, { hubspot_contact_id: newId, email })
    assignedContact.set(String(ins.id), newId)
    created++
  }

  const desiredDeals = []
  const desiredIds = new Set()
  const stageCounts = { '3165428982': 0, '3165428983': 0, '3165428984': 0, '3165428985': 0 }
  for (const ins of source) {
    const stage = stageFor(ins)
    if (!stage) continue
    const dealId = `dpl_${ins.id}`
    desiredIds.add(dealId)
    stageCounts[stage]++
    desiredDeals.push({
      hubspot_deal_id: dealId,
      hubspot_contact_id: assignedContact.get(String(ins.id)) || null,
      dealname: buildDealName(ins),
      dealstage: stage,
      pipeline: PIPELINE,
      amount: ins.selected_formule_price ? Math.round(Number(ins.selected_formule_price) / 100) : null,
      formation: ins.selected_formule_name || null,
      createdate: ins.created_at || new Date().toISOString(),
      synced_at: new Date().toISOString(),
    })
  }

  const existingDeals = await fetchAllDealsInScope(db)
  const existingIds = new Set(existingDeals.map(d => String(d.hubspot_deal_id || '')))
  const missing = [...desiredIds].filter(id => !existingIds.has(id))
  const extra = [...existingIds].filter(id => !desiredIds.has(id))

  console.log(JSON.stringify({
    mode,
    source_total: source.length,
    desired_deals: desiredIds.size,
    existing_deals: existingDeals.length,
    source_stage_counts: stageCounts,
    contacts_email_matched: matched,
    contacts_to_create: created,
    missing_deals: missing.length,
    extra_deals: extra.length,
    sample_missing: missing.slice(0, 10),
    sample_extra: extra.slice(0, 10),
  }, null, 2))

  if (!execute) return

  const createdContacts = await upsertContacts(db, toCreateContacts)
  const upsertedDeals = await upsertDeals(db, desiredDeals)
  const deletedDeals = await deleteDeals(db, extra)

  const postDeals = await fetchAllDealsInScope(db)
  const postSet = new Set(postDeals.map(d => String(d.hubspot_deal_id || '')))
  let postMissing = 0
  for (const id of desiredIds) if (!postSet.has(id)) postMissing++
  let postExtra = 0
  for (const id of postSet) if (!desiredIds.has(id)) postExtra++

  console.log(JSON.stringify({
    ok: true,
    contacts_created: createdContacts,
    deals_upserted: upsertedDeals,
    deals_deleted: deletedDeals,
    post_total_deals: postDeals.length,
    post_missing_vs_live: postMissing,
    post_extra_vs_live: postExtra,
  }, null, 2))
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2))
  process.exit(1)
})

