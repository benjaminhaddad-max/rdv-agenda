#!/usr/bin/env node
/**
 * Backfill recent_conversion_date / first_conversion_date pour les contacts
 * qui ont recent_conversion_event mais pas de date.
 *
 * Sources (par priorité) :
 *   1. form_submissions.data._contact_id → submitted_at + forms.name
 *   2. crm_form_submissions.hubspot_contact_id → submitted_at + form_title
 *   3. contact_createdate (fallback)
 *
 * Usage :
 *   node scripts/backfill-conversion-dates.mjs           # dry-run
 *   node scripts/backfill-conversion-dates.mjs --apply   # écrit en base
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(file = '.env.local') {
  const src = readFileSync(file, 'utf8')
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const APPLY = process.argv.includes('--apply')

loadEnv()
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const COLUMN_TO_RAW = {
  first_conversion_date: 'first_conversion_date',
  first_conversion_event_name: 'first_conversion_event_name',
  recent_conversion_date: 'recent_conversion_date',
  recent_conversion_event: 'recent_conversion_event_name',
  recent_conversion_event_name: 'recent_conversion_event_name',
}

function mergeSafeRaw(existing, patch) {
  const raw = (existing?.hubspot_raw && typeof existing.hubspot_raw === 'object')
    ? { ...existing.hubspot_raw }
    : {}
  for (const [col, rawKey] of Object.entries(COLUMN_TO_RAW)) {
    const v = patch[col] ?? existing?.[col]
    if (v != null && String(v).trim() !== '') raw[rawKey] = v
  }
  const ev = patch.recent_conversion_event ?? existing?.recent_conversion_event
  if (ev) raw.recent_conversion_event = ev
  return raw
}

async function paginateAffected() {
  const rows = []
  const PAGE = 1000
  let off = 0
  while (true) {
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, email, recent_conversion_event, recent_conversion_date, first_conversion_date, first_conversion_event_name, contact_createdate, hubspot_raw')
      .not('recent_conversion_event', 'is', null)
      .neq('recent_conversion_event', '')
      .is('recent_conversion_date', null)
      .order('contact_createdate', { ascending: false })
      .range(off, off + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    off += PAGE
  }
  return rows
}

async function resolveDate(contact) {
  const cid = contact.hubspot_contact_id
  const { data: nativeSubs } = await db
    .from('form_submissions')
    .select('submitted_at, form_id')
    .contains('data', { _contact_id: cid })
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (nativeSubs?.[0]) {
    const sub = nativeSubs[0]
    const { data: form } = await db.from('forms').select('name').eq('id', sub.form_id).maybeSingle()
    return {
      source: 'form_submissions',
      submittedAt: sub.submitted_at,
      eventName: form?.name || contact.recent_conversion_event,
    }
  }

  const { data: crmSubs } = await db
    .from('crm_form_submissions')
    .select('submitted_at, form_title')
    .eq('hubspot_contact_id', cid)
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (crmSubs?.[0]) {
    return {
      source: 'crm_form_submissions',
      submittedAt: crmSubs[0].submitted_at,
      eventName: crmSubs[0].form_title || contact.recent_conversion_event,
    }
  }

  if (contact.contact_createdate) {
    return {
      source: 'contact_createdate',
      submittedAt: contact.contact_createdate,
      eventName: contact.recent_conversion_event,
    }
  }
  return null
}

async function main() {
  const affected = await paginateAffected()
  console.log(`Contacts à réparer : ${affected.length}`)
  console.log(`Mode : ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN'}\n`)

  const stats = { form_submissions: 0, crm_form_submissions: 0, contact_createdate: 0, skipped: 0, errors: 0 }
  const samples = []

  for (const contact of affected) {
    const resolved = await resolveDate(contact)
    if (!resolved) {
      stats.skipped++
      continue
    }
    stats[resolved.source]++

    const patch = {
      recent_conversion_date: resolved.submittedAt,
      recent_conversion_event: resolved.eventName,
      recent_conversion_event_name: resolved.eventName,
      first_conversion_date: contact.first_conversion_date || resolved.submittedAt,
      first_conversion_event_name: contact.first_conversion_event_name || resolved.eventName,
      synced_at: new Date().toISOString(),
    }
    const hubspot_raw = mergeSafeRaw(contact, patch)
    const update = { ...patch, hubspot_raw }

    if (samples.length < 8) {
      samples.push({
        id: contact.hubspot_contact_id,
        name: contact.firstname || contact.email,
        event: contact.recent_conversion_event,
        source: resolved.source,
        date: resolved.submittedAt,
      })
    }

    if (!APPLY) continue

    const { error } = await db
      .from('crm_contacts')
      .update(update)
      .eq('hubspot_contact_id', contact.hubspot_contact_id)
    if (error) {
      stats.errors++
      console.error(`ERR ${contact.hubspot_contact_id}: ${error.message}`)
    }
  }

  console.log('Répartition des sources :', stats)
  console.log('\nExemples :')
  for (const s of samples) {
    console.log(`  ${s.id} | ${s.name} | ${s.event} ← ${s.source} @ ${s.date}`)
  }

  if (!APPLY) {
    console.log('\nRelancer avec --apply pour écrire en base.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
