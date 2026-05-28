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

loadEnvLocal()

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')

if (!HUBSPOT_TOKEN) throw new Error('HUBSPOT_ACCESS_TOKEN missing')
if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const PROPS = [
  'firstname', 'lastname', 'email', 'phone',
  'classe_actuelle', 'departement', 'zone___localite',
  'formation_souhaitee', 'diploma_sante___formation_demandee',
  'hs_lead_status', 'origine', 'source',
  'hubspot_owner_id', 'teleprospecteur',
  'createdate', 'lastmodifieddate',
  'recent_conversion_date', 'recent_conversion_event_name',
]

const args = process.argv.slice(2)
const daysArg = Number(args.find(a => a.startsWith('--days='))?.split('=')[1] || '30')
const maxPagesArg = Number(args.find(a => a.startsWith('--max-pages='))?.split('=')[1] || '250')
const DAYS = Number.isFinite(daysArg) && daysArg > 0 ? Math.min(daysArg, 365) : 30
const MAX_PAGES = Number.isFinite(maxPagesArg) && maxPagesArg > 0 ? maxPagesArg : 250

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function hubspotFetchWithRetry(url, init, maxRetries = 5) {
  let lastErr = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init)
      if ([429, 500, 502, 503, 504, 521, 522, 524].includes(res.status)) {
        const wait = Math.min(10000, 1000 * 2 ** attempt)
        await sleep(wait)
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      const wait = Math.min(10000, 1000 * 2 ** attempt)
      await sleep(wait)
    }
  }
  throw lastErr || new Error('HubSpot fetch failed')
}

function parseDateOrNull(v) {
  if (!v) return null
  const asNum = /^\d+$/.test(String(v).trim()) ? Number(v) : NaN
  const d = Number.isFinite(asNum) && asNum > 1e10 ? new Date(asNum) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function main() {
  const start = Date.now()
  const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000
  const ids = new Set()
  let after
  let pages = 0

  console.log(JSON.stringify({ mode: 'lead-catchup', days: DAYS, max_pages: MAX_PAGES }))

  while (pages < MAX_PAGES) {
    pages++
    const body = {
      filterGroups: [{
        filters: [{ propertyName: 'lastmodifieddate', operator: 'GTE', value: String(sinceMs) }],
      }],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
      properties: ['hs_object_id', 'lastmodifieddate'],
      limit: 100,
      ...(after ? { after } : {}),
    }

    const res = await hubspotFetchWithRetry('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`HubSpot search failed ${res.status}: ${txt.slice(0, 300)}`)
    }
    const data = await res.json()
    for (const c of data.results || []) ids.add(c.id)
    after = data?.paging?.next?.after
    console.log(JSON.stringify({ step: 'search', page: pages, ids: ids.size, has_next: !!after }))
    if (!after) break
    await sleep(120)
  }

  const idList = Array.from(ids)
  let touched = 0
  let inserted = 0
  let updated = 0

  for (let i = 0; i < idList.length; i += 100) {
    const chunk = idList.slice(i, i + 100)
    const res = await hubspotFetchWithRetry('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: chunk.map(id => ({ id })),
        properties: PROPS,
      }),
    })
    if (!res.ok) continue
    const data = await res.json()
    const contacts = data.results || []

    for (const c of contacts) {
      const p = c.properties || {}
      const patch = { synced_at: new Date().toISOString() }
      if ('firstname' in p) patch.firstname = p.firstname || null
      if ('lastname' in p) patch.lastname = p.lastname || null
      if ('email' in p && p.email) patch.email = p.email
      if ('phone' in p && p.phone) patch.phone = p.phone
      if ('classe_actuelle' in p) patch.classe_actuelle = p.classe_actuelle || null
      if ('departement' in p) patch.departement = p.departement || null
      if ('zone___localite' in p) patch.zone_localite = p.zone___localite || null
      if ('formation_souhaitee' in p) patch.formation_souhaitee = p.formation_souhaitee || null
      if ('diploma_sante___formation_demandee' in p) patch.formation_demandee = p.diploma_sante___formation_demandee || null
      if ('hs_lead_status' in p) patch.hs_lead_status = p.hs_lead_status || null
      if ('origine' in p) patch.origine = p.origine || null
      if ('source' in p) patch.source = p.source || null
      if ('hubspot_owner_id' in p) patch.hubspot_owner_id = p.hubspot_owner_id || null
      if ('teleprospecteur' in p) patch.telepro_user_id = p.teleprospecteur || null
      if ('createdate' in p) patch.contact_createdate = parseDateOrNull(p.createdate)
      if ('recent_conversion_date' in p) patch.recent_conversion_date = parseDateOrNull(p.recent_conversion_date)
      if ('recent_conversion_event_name' in p) patch.recent_conversion_event = p.recent_conversion_event_name || null

      const { error: updErr, count: updCount } = await db
        .from('crm_contacts')
        .update(patch, { count: 'exact' })
        .eq('hubspot_contact_id', c.id)
      if (updErr) continue
      if ((updCount || 0) > 0) {
        updated++
        touched++
        continue
      }

      if (p.email || p.phone || p.firstname || p.lastname) {
        const ins = {
          hubspot_contact_id: c.id,
          hs_lead_status: patch.hs_lead_status || 'Nouveau',
          ...patch,
        }
        const { error: insErr } = await db.from('crm_contacts').insert(ins)
        if (!insErr) {
          inserted++
          touched++
        }
      }
    }
    console.log(JSON.stringify({ step: 'upsert', processed_ids: Math.min(i + 100, idList.length), total_ids: idList.length, touched }))
    await sleep(100)
  }

  console.log(JSON.stringify({
    ok: true,
    days: DAYS,
    scanned_ids: idList.length,
    touched,
    updated,
    inserted,
    duration_ms: Date.now() - start,
  }, null, 2))
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }))
  process.exit(1)
})
