#!/usr/bin/env node

/**
 * One-shot HubSpot -> Supabase sync for deals in pipeline 2026-2027.
 *
 * Rules:
 * - Only deals in the target pipeline are synced.
 * - For locked stages (4 columns managed by pre-inscription platform),
 *   only associations are updated (hubspot_contact_id + supabase_appt_id + synced_at).
 * - HubSpot is source of truth for unlocked stages.
 *
 * Usage:
 *   node scripts/sync-deals-2026-one-shot.mjs --dry-run
 *   node scripts/sync-deals-2026-one-shot.mjs --execute
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const argv = new Set(process.argv.slice(2))
const shouldExecute = argv.has('--execute')
const dryRun = !shouldExecute

function loadDotEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const src = readFileSync(envPath, 'utf8')
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    if (!key || process.env[key] !== undefined) continue
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadDotEnvLocal()

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PIPELINE_ID = process.env.HUBSPOT_PIPELINE_2026_2027 || '2313043166'

// 4 columns user asked to protect from HubSpot overwrite.
const LOCKED_STAGE_IDS = new Set([
  process.env.HUBSPOT_STAGE_PREINSCRIPTION || '3165428982',
  process.env.HUBSPOT_STAGE_FINALISATION || '3165428983',
  process.env.HUBSPOT_STAGE_INSCRIPTION_CONFIRMEE || '3165428984',
  process.env.HUBSPOT_STAGE_FERME_PERDU || '3165428985',
])

if (!HUBSPOT_TOKEN) throw new Error('Missing HUBSPOT_ACCESS_TOKEN')
if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function withRetry(label, fn, attempts = 5) {
  let lastErr = null
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const retryable =
        /fetch failed|timeout|timed out|522|429|5\d\d|ECONNRESET|ENOTFOUND/i.test(msg)
      if (!retryable || i === attempts - 1) break
      const waitMs = (i + 1) * 2000
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
  throw new Error(`${label}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

async function hubspotFetch(path, options = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status} ${res.statusText}: ${body}`)
  }
  if (res.status === 204) return null
  return res.json()
}

function parseIso(raw) {
  if (!raw) return null
  const s = String(raw)
  const asNum = /^\d+$/.test(s) ? Number(s) : NaN
  const d = Number.isFinite(asNum) && asNum > 1e10 ? new Date(asNum) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function getAllDealPropertyNames() {
  const data = await hubspotFetch('/crm/v3/properties/deals?archived=false&limit=1000')
  return (data.results || []).map((p) => p.name)
}

async function getDealsForPipeline(propertyNames) {
  const deals = []
  let after = undefined
  do {
    const body = {
      filterGroups: [{
        filters: [{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID }],
      }],
      properties: propertyNames,
      limit: 100,
      ...(after ? { after } : {}),
    }
    const data = await hubspotFetch('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    deals.push(...(data.results || []))
    after = data?.paging?.next?.after
  } while (after)
  return deals
}

async function getDealContactMap(dealIds) {
  const out = {}
  const BATCH = 100
  for (let i = 0; i < dealIds.length; i += BATCH) {
    const inputs = dealIds.slice(i, i + BATCH).map((id) => ({ id }))
    const data = await hubspotFetch('/crm/v4/associations/deals/contacts/batch/read', {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    })
    for (const item of data.results || []) {
      const fromId = String(item?.from?.id || '')
      const contactId = item?.to?.[0]?.toObjectId
      if (fromId && contactId !== undefined && contactId !== null) {
        out[fromId] = String(contactId)
      }
    }
  }
  return out
}

async function getApptMap(dealIds) {
  const out = {}
  const BATCH = 100
  try {
    for (let i = 0; i < dealIds.length; i += BATCH) {
      const ids = dealIds.slice(i, i + BATCH)
      const { data, error } = await withRetry('rdv_appointments read', () =>
        supabase
          .from('rdv_appointments')
          .select('id, hubspot_deal_id')
          .in('hubspot_deal_id', ids)
      )
      if (error) throw new Error(`Supabase rdv_appointments read failed: ${error.message}`)
      for (const row of data || []) {
        if (row.hubspot_deal_id) out[row.hubspot_deal_id] = row.id
      }
    }
  } catch (err) {
    console.warn('[warn] skip rdv_appointments linking:', err instanceof Error ? err.message : String(err))
  }
  return out
}

async function getExistingDealsMap(dealIds) {
  const map = new Map()
  const BATCH = 100
  for (let i = 0; i < dealIds.length; i += BATCH) {
    const ids = dealIds.slice(i, i + BATCH)
    const { data, error } = await withRetry('crm_deals read', () =>
      supabase
        .from('crm_deals')
        .select('hubspot_deal_id, hubspot_contact_id, dealname, dealstage, pipeline, hubspot_owner_id, teleprospecteur, formation, closedate, createdate, description, supabase_appt_id, synced_at, hubspot_raw')
        .in('hubspot_deal_id', ids)
    )
    if (error) throw new Error(`Supabase crm_deals read failed: ${error.message}`)
    for (const row of data || []) {
      map.set(row.hubspot_deal_id, row)
    }
  }
  return map
}

async function getExistingContactIdSet(contactIds) {
  const set = new Set()
  const BATCH = 100
  for (let i = 0; i < contactIds.length; i += BATCH) {
    const ids = contactIds.slice(i, i + BATCH)
    const { data, error } = await withRetry('crm_contacts read', () =>
      supabase
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .in('hubspot_contact_id', ids)
    )
    if (error) throw new Error(`Supabase crm_contacts read failed: ${error.message}`)
    for (const row of data || []) {
      if (row.hubspot_contact_id) set.add(row.hubspot_contact_id)
    }
  }
  return set
}

function buildHubspotRow(deal, contactId, apptId, now) {
  const p = deal.properties || {}
  return {
    hubspot_deal_id: deal.id,
    hubspot_contact_id: contactId || null,
    dealname: p.dealname ?? null,
    dealstage: p.dealstage ?? null,
    pipeline: p.pipeline ?? null,
    hubspot_owner_id: p.hubspot_owner_id ?? null,
    teleprospecteur: p.teleprospecteur ?? null,
    formation: p.diploma_sante___formation ?? null,
    closedate: parseIso(p.closedate),
    createdate: parseIso(p.createdate),
    description: p.description ?? null,
    supabase_appt_id: apptId || null,
    synced_at: now,
    hubspot_raw: p,
  }
}

function buildLockedRow(existing, hubspotFallbackRow, contactId, apptId, now) {
  if (!existing) {
    // If row does not exist locally, we still insert it from HubSpot.
    return hubspotFallbackRow
  }
  return {
    ...existing,
    hubspot_contact_id: contactId || null,
    supabase_appt_id: apptId || null,
    synced_at: now,
  }
}

async function upsertDeals(rows) {
  const BATCH = 25
  let upserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await withRetry('crm_deals upsert', () =>
      supabase
        .from('crm_deals')
        .upsert(chunk, { onConflict: 'hubspot_deal_id' })
    )
    if (error) throw new Error(`Supabase crm_deals upsert failed: ${error.message}`)
    upserted += chunk.length
  }
  return upserted
}

async function main() {
  const startedAt = Date.now()
  const now = new Date().toISOString()

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : 'execute',
    pipeline: PIPELINE_ID,
    locked_stages: [...LOCKED_STAGE_IDS],
    started_at: now,
  }, null, 2))

  const allDealProps = await getAllDealPropertyNames()
  const propNames = allDealProps.length > 0
    ? allDealProps
    : [
        'dealname',
        'dealstage',
        'pipeline',
        'hubspot_owner_id',
        'teleprospecteur',
        'diploma_sante___formation',
        'closedate',
        'createdate',
        'description',
      ]

  const deals = await getDealsForPipeline(propNames)
  const dealIds = deals.map((d) => d.id)
  const dealToContact = await getDealContactMap(dealIds)
  const dealToAppt = await getApptMap(dealIds)
  const existing = await getExistingDealsMap(dealIds)
  const existingContactIds = await getExistingContactIdSet(Object.values(dealToContact))

  const rows = []
  let lockedCount = 0
  let unlockedCount = 0
  let missingContactRefs = 0

  for (const deal of deals) {
    const id = deal.id
    const rawContactId = dealToContact[id] || null
    const contactId = rawContactId && existingContactIds.has(rawContactId) ? rawContactId : null
    if (rawContactId && !contactId) missingContactRefs++
    const apptId = dealToAppt[id] || null
    const hsRow = buildHubspotRow(deal, contactId, apptId, now)
    const stage = String(deal?.properties?.dealstage || '')

    if (LOCKED_STAGE_IDS.has(stage)) {
      lockedCount++
      rows.push(buildLockedRow(existing.get(id), hsRow, contactId, apptId, now))
      continue
    }

    unlockedCount++
    rows.push(hsRow)
  }

  let upserted = 0
  if (!dryRun && rows.length > 0) {
    upserted = await upsertDeals(rows)
  }

  console.log(JSON.stringify({
    ok: true,
    mode: dryRun ? 'dry-run' : 'execute',
    pipeline: PIPELINE_ID,
    total_deals_from_hubspot: deals.length,
    unlocked_updated_full: unlockedCount,
    locked_updated_associations_only: lockedCount,
    missing_contact_refs_set_to_null: missingContactRefs,
    rows_prepared: rows.length,
    rows_upserted: upserted,
    duration_ms: Date.now() - startedAt,
    finished_at: new Date().toISOString(),
  }, null, 2))
}

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  }, null, 2))
  process.exit(1)
})
