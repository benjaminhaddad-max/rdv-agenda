#!/usr/bin/env node

/**
 * Fix integrity for Diploma-managed downstream transactions (2026 pipeline):
 * - Ensure one transaction = one unique contact for target stages.
 * - Reuse existing contacts first (name/email/phone match).
 * - Create a new contact only when no reliable match exists.
 *
 * Usage:
 *   node scripts/fix-diploma-transactions-integrity.mjs --dry-run
 *   node scripts/fix-diploma-transactions-integrity.mjs --execute
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

loadEnvLocal()

const args = new Set(process.argv.slice(2))
const execute = args.has('--execute')
const dryRun = !execute

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase env')

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const PIPELINE = '2313043166'
const STAGES = new Set(['3165428982', '3165428983', '3165428984', '3165428985'])
const LEAD_STATUS = 'Pré-inscrit 2026/2027'

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeEmail(email) {
  return normalize(email)
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim()
}

function nameKey(firstname, lastname) {
  const f = normalize(firstname)
  const l = normalize(lastname)
  if (!f && !l) return ''
  return `${l}|${f}`
}

function parseDealNamePrefix(dealname) {
  const raw = String(dealname || '')
  if (!raw) return { firstname: '', lastname: '' }
  const prefix = raw.split(' - ')[0]?.trim() || ''
  if (!prefix) return { firstname: '', lastname: '' }
  const parts = prefix.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { firstname: '', lastname: parts[0] || '' }
  return { lastname: parts[0], firstname: parts.slice(1).join(' ') }
}

async function fetchDeals() {
  const { data, error } = await db
    .from('crm_deals')
    .select('hubspot_deal_id,hubspot_contact_id,dealname,dealstage,pipeline,createdate,closedate,synced_at,nom_etudiant,prenom_etudiant,email,telephone')
    .eq('pipeline', PIPELINE)
    .in('dealstage', [...STAGES])
  if (error) throw new Error(`fetch deals: ${error.message}`)
  return data || []
}

async function fetchContactsByIds(contactIds) {
  const out = new Map()
  if (!contactIds.length) return out
  const BATCH = 500
  for (let i = 0; i < contactIds.length; i += BATCH) {
    const chunk = contactIds.slice(i, i + BATCH)
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id,firstname,lastname,email,phone,hs_lead_status')
      .in('hubspot_contact_id', chunk)
    if (error) throw new Error(`fetch contacts: ${error.message}`)
    for (const row of data || []) out.set(String(row.hubspot_contact_id), row)
  }
  return out
}

async function fetchContactsByField(field, values) {
  const out = []
  if (!values.length) return out
  const BATCH = 200
  for (let i = 0; i < values.length; i += BATCH) {
    const chunk = values.slice(i, i + BATCH)
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id,firstname,lastname,email,phone,hs_lead_status')
      .in(field, chunk)
    if (error) throw new Error(`fetch contacts by ${field}: ${error.message}`)
    out.push(...(data || []))
  }
  return out
}

async function fetchContactsByLastnames(lastnames) {
  const out = []
  if (!lastnames.length) return out
  const BATCH = 80
  for (let i = 0; i < lastnames.length; i += BATCH) {
    const chunk = lastnames.slice(i, i + BATCH)
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id,firstname,lastname,email,phone,hs_lead_status')
      .in('lastname', chunk)
    if (error) throw new Error(`fetch contacts by lastname: ${error.message}`)
    out.push(...(data || []))
  }
  return out
}

function addIdx(index, key, value) {
  if (!key) return
  if (!index.has(key)) index.set(key, [])
  index.get(key).push(value)
}

function buildIdentityFromDeal(deal) {
  const dealFirst = String(deal.prenom_etudiant || '').trim()
  const dealLast = String(deal.nom_etudiant || '').trim()
  const parsed = parseDealNamePrefix(deal.dealname)
  const firstname = dealFirst || parsed.firstname
  const lastname = dealLast || parsed.lastname
  return {
    firstname,
    lastname,
    email: String(deal.email || '').trim(),
    phone: String(deal.telephone || '').trim(),
    name_key: nameKey(firstname, lastname),
    email_key: normalizeEmail(deal.email),
    phone_key: normalizePhone(deal.telephone),
  }
}

function scoreContactMatch(identity, contact) {
  if (!contact) return 0
  let score = 0
  const cName = nameKey(contact.firstname, contact.lastname)
  const cEmail = normalizeEmail(contact.email)
  const cPhone = normalizePhone(contact.phone)
  if (identity.name_key && cName && identity.name_key === cName) score += 3
  if (identity.email_key && cEmail && identity.email_key === cEmail) score += 4
  if (identity.phone_key && cPhone && identity.phone_key === cPhone) score += 4
  return score
}

async function updateDealContact(dealId, contactId) {
  const { error } = await db
    .from('crm_deals')
    .update({ hubspot_contact_id: contactId, synced_at: new Date().toISOString() })
    .eq('hubspot_deal_id', dealId)
  if (error) throw new Error(`update deal contact ${dealId}: ${error.message}`)
}

async function createContacts(rows) {
  if (!rows.length) return 0
  const BATCH = 100
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await db
      .from('crm_contacts')
      .upsert(chunk, { onConflict: 'hubspot_contact_id' })
    if (error) throw new Error(`create contacts: ${error.message}`)
    done += chunk.length
  }
  return done
}

async function main() {
  const deals = await fetchDeals()

  const dealsWithIdentity = deals.map(d => ({ ...d, identity: buildIdentityFromDeal(d) }))
  const linkedIds = [...new Set(
    dealsWithIdentity
      .map(d => String(d.hubspot_contact_id || '').trim())
      .filter(Boolean)
  )]
  const linkedMap = await fetchContactsByIds(linkedIds)

  const emailValues = [...new Set(
    dealsWithIdentity
      .map(d => String(d.identity.email || '').trim())
      .filter(Boolean)
  )]
  const phoneValues = [...new Set(
    dealsWithIdentity
      .map(d => String(d.identity.phone || '').trim())
      .filter(Boolean)
  )]
  const lastnameValues = [...new Set(
    dealsWithIdentity
      .map(d => String(d.identity.lastname || '').trim())
      .filter(Boolean)
  )]

  const extraContacts = [
    ...(await fetchContactsByField('email', emailValues)),
    ...(await fetchContactsByField('phone', phoneValues)),
    ...(await fetchContactsByLastnames(lastnameValues)),
  ]

  const allContacts = new Map()
  for (const c of [...linkedMap.values(), ...extraContacts]) {
    allContacts.set(String(c.hubspot_contact_id), c)
  }

  const byEmail = new Map()
  const byPhone = new Map()
  const byName = new Map()
  for (const c of allContacts.values()) {
    addIdx(byEmail, normalizeEmail(c.email), c)
    addIdx(byPhone, normalizePhone(c.phone), c)
    addIdx(byName, nameKey(c.firstname, c.lastname), c)
  }

  const groups = new Map()
  for (const d of dealsWithIdentity) {
    const cid = String(d.hubspot_contact_id || '').trim()
    if (!cid) continue
    if (!groups.has(cid)) groups.set(cid, [])
    groups.get(cid).push(d)
  }

  const needsReassign = new Set()
  for (const arr of groups.values()) {
    if (arr.length <= 1) continue
    // Keep the deal that best matches currently linked contact; reassign others.
    let best = arr[0]
    let bestScore = scoreContactMatch(best.identity, linkedMap.get(String(best.hubspot_contact_id)))
    for (const d of arr.slice(1)) {
      const s = scoreContactMatch(d.identity, linkedMap.get(String(d.hubspot_contact_id)))
      if (s > bestScore) {
        best = d
        bestScore = s
      }
    }
    for (const d of arr) {
      if (d.hubspot_deal_id !== best.hubspot_deal_id) needsReassign.add(String(d.hubspot_deal_id))
    }
  }

  const usedContactIds = new Set(
    dealsWithIdentity
      .filter(d => !needsReassign.has(String(d.hubspot_deal_id)))
      .map(d => String(d.hubspot_contact_id || '').trim())
      .filter(Boolean)
  )

  const updates = []
  const toCreate = []
  const reusedStats = { email: 0, phone: 0, name: 0, current_when_unique: 0, created: 0, no_identity: 0 }

  function pickCandidate(list, identity) {
    const sorted = (list || [])
      .filter(Boolean)
      .sort((a, b) => scoreContactMatch(identity, b) - scoreContactMatch(identity, a))
    for (const c of sorted) {
      const cid = String(c.hubspot_contact_id || '').trim()
      if (!cid) continue
      if (usedContactIds.has(cid)) continue
      return c
    }
    return null
  }

  for (const d of dealsWithIdentity) {
    const dealId = String(d.hubspot_deal_id || '')
    if (!needsReassign.has(dealId)) continue

    const identity = d.identity
    const currentId = String(d.hubspot_contact_id || '').trim()
    const currentContact = linkedMap.get(currentId)

    // If currently linked contact is already unique and has a solid identity match, keep it.
    const currentScore = scoreContactMatch(identity, currentContact)
    if (currentId && !usedContactIds.has(currentId) && currentScore >= 4) {
      usedContactIds.add(currentId)
      reusedStats.current_when_unique++
      continue
    }

    let candidate = null
    if (identity.email_key) {
      candidate = pickCandidate(byEmail.get(identity.email_key), identity)
      if (candidate) reusedStats.email++
    }
    if (!candidate && identity.phone_key) {
      candidate = pickCandidate(byPhone.get(identity.phone_key), identity)
      if (candidate) reusedStats.phone++
    }
    if (!candidate && identity.name_key) {
      candidate = pickCandidate(byName.get(identity.name_key), identity)
      if (candidate) reusedStats.name++
    }

    if (candidate) {
      const nextId = String(candidate.hubspot_contact_id)
      updates.push({ dealId, fromContactId: currentId, toContactId: nextId, strategy: 'reuse_existing' })
      usedContactIds.add(nextId)
      continue
    }

    const hasIdentity = Boolean(identity.name_key || identity.email_key || identity.phone_key)
    if (!hasIdentity) {
      reusedStats.no_identity++
      continue
    }

    const newId = `dpl_fix_${String(dealId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
    toCreate.push({
      hubspot_contact_id: newId,
      firstname: identity.firstname || null,
      lastname: identity.lastname || null,
      email: identity.email || null,
      phone: identity.phone || null,
      hs_lead_status: LEAD_STATUS,
      origine: 'Plateforme pre-inscription',
      synced_at: new Date().toISOString(),
    })
    updates.push({ dealId, fromContactId: currentId, toContactId: newId, strategy: 'create_new' })
    usedContactIds.add(newId)
    reusedStats.created++
  }

  const report = {
    mode: dryRun ? 'dry-run' : 'execute',
    pipeline: PIPELINE,
    target_stages: [...STAGES],
    total_deals_in_scope: deals.length,
    unique_contacts_in_scope: new Set(deals.map(d => String(d.hubspot_contact_id || '').trim()).filter(Boolean)).size,
    deals_sharing_contact: [...groups.values()].reduce((acc, arr) => acc + (arr.length > 1 ? arr.length : 0), 0),
    deals_to_reassign: updates.length,
    contacts_to_create: toCreate.length,
    reuse_stats: reusedStats,
    sample_updates: updates.slice(0, 20),
  }
  console.log(JSON.stringify(report, null, 2))

  if (dryRun) return

  const created = await createContacts(toCreate)
  for (const u of updates) {
    await updateDealContact(u.dealId, u.toContactId)
  }

  console.log(JSON.stringify({
    ok: true,
    deals_reassigned: updates.length,
    contacts_created: created,
  }, null, 2))
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2))
  process.exit(1)
})
