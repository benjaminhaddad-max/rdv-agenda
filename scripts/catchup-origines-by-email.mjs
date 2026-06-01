#!/usr/bin/env node

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
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function normalizeEmail(email) {
  if (!email) return ''
  const e = String(email).trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const localNoPlus = local.split('+')[0].replace(/\./g, '')
    return `${localNoPlus}@${domain}`
  }
  return e
}

function normalizeOrigin(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

async function hubspotFetch(token, path, options = {}, retry = 0) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (res.status === 429 && retry < 5) {
    const waitMs = Math.max(1000, Number(res.headers.get('Retry-After') || '1') * 1000)
    await new Promise(r => setTimeout(r, waitMs))
    return hubspotFetch(token, path, options, retry + 1)
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status}: ${txt.slice(0, 300)}`)
  }
  return res.json()
}

async function getAllHubSpotContacts(token) {
  const ids = []
  let after
  do {
    const qs = new URLSearchParams({ limit: '100', properties: 'hs_object_id' })
    if (after) qs.set('after', after)
    const data = await hubspotFetch(token, `/crm/v3/objects/contacts?${qs.toString()}`)
    for (const c of data.results || []) ids.push(String(c.id))
    after = data?.paging?.next?.after
    process.stdout.write(`\rHubSpot ids récupérés: ${ids.length}`)
  } while (after)
  process.stdout.write('\n')

  const contacts = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const data = await hubspotFetch(token, '/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      body: JSON.stringify({
        inputs: chunk.map(id => ({ id })),
        properties: ['email', 'origine'],
      }),
    })
    for (const c of data.results || []) {
      contacts.push({
        id: String(c.id),
        email: c?.properties?.email ? String(c.properties.email) : '',
        origine: normalizeOrigin(c?.properties?.origine),
      })
    }
    process.stdout.write(`\rHubSpot batch lus: ${Math.min(i + 100, ids.length)}/${ids.length}`)
  }
  process.stdout.write('\n')
  return contacts
}

async function getAllCrmContacts(db) {
  const out = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id,email,origine,hubspot_raw')
      .range(from, to)
    if (error) throw new Error(`Supabase read failed: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...data)
    from += pageSize
    process.stdout.write(`\rCRM contacts lus: ${out.length}`)
  }
  process.stdout.write('\n')
  return out
}

function buildOriginMaps(hubspotContacts) {
  const exact = new Map()
  const canonicalBuckets = new Map()

  for (const c of hubspotContacts) {
    const email = String(c.email || '').trim().toLowerCase()
    if (!email) continue
    exact.set(email, c.origine)
    const key = normalizeEmail(email)
    if (!canonicalBuckets.has(key)) canonicalBuckets.set(key, new Set())
    canonicalBuckets.get(key).add(c.origine ?? '__NULL__')
  }

  const canonicalUnique = new Map()
  for (const [key, valuesSet] of canonicalBuckets.entries()) {
    const arr = [...valuesSet]
    if (arr.length === 1) {
      canonicalUnique.set(key, arr[0] === '__NULL__' ? null : arr[0])
    }
  }

  return { exact, canonicalUnique }
}

async function main() {
  loadEnvLocal()

  const execute = process.argv.includes('--execute')
  const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
  const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
  const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')

  if (!HUBSPOT_TOKEN) throw new Error('HUBSPOT_ACCESS_TOKEN missing')
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing')
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', scope: 'all origines by email' }))

  const hubspotContacts = await getAllHubSpotContacts(HUBSPOT_TOKEN)
  const crmContacts = await getAllCrmContacts(db)
  const { exact, canonicalUnique } = buildOriginMaps(hubspotContacts)

  const pending = []
  let missingEmail = 0
  let noHubspotMatch = 0
  let unchanged = 0

  for (const c of crmContacts) {
    const email = String(c.email || '').trim().toLowerCase()
    if (!email) {
      missingEmail++
      continue
    }

    let target = exact.get(email)
    if (target === undefined) {
      target = canonicalUnique.get(normalizeEmail(email))
    }
    if (target === undefined) {
      noHubspotMatch++
      continue
    }

    const current = normalizeOrigin(c.origine)
    if (current === target) {
      unchanged++
      continue
    }

    pending.push({
      hubspot_contact_id: String(c.hubspot_contact_id),
      to: target,
      hubspot_raw: c.hubspot_raw && typeof c.hubspot_raw === 'object' ? c.hubspot_raw : {},
    })
  }

  console.log(JSON.stringify({
    hubspot_contacts: hubspotContacts.length,
    crm_contacts: crmContacts.length,
    missing_email: missingEmail,
    no_hubspot_match: noHubspotMatch,
    unchanged,
    to_update: pending.length,
  }, null, 2))

  if (!execute) return

  let updated = 0
  const nowIso = new Date().toISOString()
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]
    const mergedRaw = { ...row.hubspot_raw, origine: row.to }
    const { error } = await db
      .from('crm_contacts')
      .update({
        origine: row.to,
        hubspot_raw: mergedRaw,
        synced_at: nowIso,
      })
      .eq('hubspot_contact_id', row.hubspot_contact_id)
    if (!error) updated++
    if ((i + 1) % 250 === 0 || i + 1 === pending.length) {
      process.stdout.write(`\rMises à jour: ${i + 1}/${pending.length} (ok=${updated})`)
    }
  }
  process.stdout.write('\n')

  console.log(JSON.stringify({
    ok: true,
    updated,
    attempted: pending.length,
  }, null, 2))
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2))
  process.exit(1)
})
