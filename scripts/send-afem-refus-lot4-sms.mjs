#!/usr/bin/env bun
/**
 * SMS AFEM refus PASS/LAS — lot 4 — 3000 IDF Etudes Sup. puis PASS, hors inscrits.
 * Exclut tous les numéros déjà touchés par les 4 campagnes AFEM précédentes.
 *
 *   bun scripts/send-afem-refus-lot4-sms.mjs --send
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const CAMPAIGN_NAME = 'AFEM refuse PASS/LAS 2026 — lot 4 — 3000 IDF hors inscrits — 2026-10-09'
const LIMIT = 3000
const SENDER = 'MEDECINE'
const BATCH_SIZE = 800
const SMS_TEXT = `Refusé en PASS/LAS ?
Un expert AFEM t'explique comment rebondir et intégrer des études de santé.
Remplis ce form, on te rappelle gratuitement : https://www.afem-edu.fr/refuse-pass-las-2026
STOP 36035`

function loadEnv() {
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
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

loadEnv()
const send = process.argv.includes('--send')
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^['"]+|['"]+$/g, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/^['"]+|['"]+$/g, ''),
  { auth: { persistSession: false } },
)
const { formatPhoneForSms, sendSmsCampaignBulk } = await import('../lib/smsfactor.ts')

const PREV_CAMPAIGNS = [
  '93370a8c-6d23-426d-a93a-378e908cdd31',
  '88af96dc-3ff8-4d58-9254-e72e05c6f05e',
  'f2c464d9-7888-4aa7-b8d0-20675f09e2c8',
  '49684893-267e-47e0-85bd-7b5bd5700dd6',
]
const EXCLUDED_STATUS = /inscri|finalis|annul|mauvais|doublon|disqualif|perdu|raccroche/i

// Numéros / contacts déjà touchés par le SMS AFEM
const sentIds = new Set()
const sentPhones = new Set()
const { data: prev } = await db.from('sms_campaigns').select('manual_contact_ids, manual_phones').in('id', PREV_CAMPAIGNS)
for (const c of prev || []) {
  for (const id of c.manual_contact_ids || []) sentIds.add(String(id))
  for (const p of c.manual_phones || []) { const f = formatPhoneForSms(String(p)); if (f) sentPhones.add(f) }
}
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('sms_campaign_recipients').select('phone, hubspot_contact_id')
    .in('campaign_id', PREV_CAMPAIGNS).range(from, from + 999)
  if (error) throw new Error(error.message)
  if (!data?.length) break
  for (const r of data) {
    if (r.hubspot_contact_id) sentIds.add(r.hubspot_contact_id)
    const f = formatPhoneForSms(String(r.phone || '')); if (f) sentPhones.add(f)
  }
  if (data.length < 1000) break
}

const contacts = []
for (const classe of ['Etudes Sup.', 'PASS']) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, phone, firstname, hs_lead_status')
      .eq('zone_localite', 'IDF')
      .eq('classe_actuelle', classe)
      .order('contact_createdate', { ascending: false })
      .order('hubspot_contact_id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    contacts.push(...data)
    if (data.length < 1000) break
  }
}

const byPhone = new Map()
let invalid = 0
let dupes = 0
let alreadySent = 0
let excludedStatus = 0
for (const row of contacts) {
  if (byPhone.size >= LIMIT) break
  if (EXCLUDED_STATUS.test(row.hs_lead_status || '')) { excludedStatus++; continue }
  const formatted = formatPhoneForSms(String(row.phone || ''))
  if (!formatted) { invalid++; continue }
  if (sentIds.has(row.hubspot_contact_id) || sentPhones.has(formatted)) { alreadySent++; continue }
  if (byPhone.has(formatted)) { dupes++; continue }
  byPhone.set(formatted, row)
}
const statusBreakdown = {}
for (const r of byPhone.values()) statusBreakdown[r.hs_lead_status || '—'] = (statusBreakdown[r.hs_lead_status || '—'] || 0) + 1
console.log(JSON.stringify(statusBreakdown))
const recipients = [...byPhone.entries()].map(([formatted, row]) => ({
  phone: row.phone,
  formatted,
  hubspot_contact_id: row.hubspot_contact_id,
  firstname: row.firstname,
}))

console.log(JSON.stringify({
  contacts: contacts.length,
  unique_phones: recipients.length,
  invalid,
  duplicate_phones: dupes,
  already_sent: alreadySent,
  excluded_status: excludedStatus,
  sender: SENDER,
  pushtype: 'alert',
  mode: send ? 'SEND' : 'DRY-RUN',
}, null, 2))

if (!send) {
  console.log('Rien envoyé. Relance avec --send.')
  process.exit(0)
}

const { data: existing } = await db
  .from('sms_campaigns')
  .select('id, status, sent_count')
  .eq('name', CAMPAIGN_NAME)
  .maybeSingle()
if (existing?.status === 'sent') {
  throw new Error(`Campagne déjà envoyée (${existing.id}, ${existing.sent_count} envois)`)
}

let campaignId = existing?.id
if (campaignId) {
  await db.from('sms_campaigns').update({
    message: SMS_TEXT,
    sender: SENDER,
    campaign_type: 'alert',
    shorten_links: true,
    status: 'sending',
    total_recipients: recipients.length,
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId)
  await db.from('sms_campaign_recipients').delete().eq('campaign_id', campaignId)
} else {
  const { data: created, error } = await db.from('sms_campaigns').insert({
    name: CAMPAIGN_NAME,
    message: SMS_TEXT,
    sender: SENDER,
    campaign_type: 'alert',
    shorten_links: true,
    status: 'sending',
    total_recipients: recipients.length,
    manual_contact_ids: recipients.map((r) => r.hubspot_contact_id),
    manual_phones: recipients.map((r) => r.formatted),
  }).select('id').single()
  if (error) throw new Error(error.message)
  campaignId = created.id
}

for (let i = 0; i < recipients.length; i += 500) {
  const chunk = recipients.slice(i, i + 500).map((r) => ({
    campaign_id: campaignId,
    phone: r.formatted,
    hubspot_contact_id: r.hubspot_contact_id,
    firstname: r.firstname,
    rendered_message: SMS_TEXT,
    status: 'pending',
  }))
  const { error } = await db.from('sms_campaign_recipients').insert(chunk)
  if (error) throw new Error(error.message)
}

let sentTotal = 0
let failedTotal = 0
const tickets = []

for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
  const batch = recipients.slice(i, i + BATCH_SIZE)
  const lot = Math.floor(i / BATCH_SIZE) + 1
  console.log(`Lot ${lot} : ${batch.length} nums`)
  const result = await sendSmsCampaignBulk(
    batch.map((r) => ({ phone: r.phone, gsmsmsid: r.hubspot_contact_id })),
    SMS_TEXT,
    { sender: SENDER, pushtype: 'alert', autoShorten: true },
  )
  const now = new Date().toISOString()
  const phones = batch.map((r) => r.formatted)
  if (!result.ok) {
    failedTotal += batch.length
    console.error(`Erreur lot ${lot} : ${result.error}`)
    await db.from('sms_campaign_recipients').update({
      status: 'failed',
      error_message: String(result.error || 'erreur').slice(0, 500),
    }).eq('campaign_id', campaignId).in('phone', phones).eq('status', 'pending')
    continue
  }
  sentTotal += result.sent ?? batch.length
  if (result.invalid) failedTotal += result.invalid
  if (result.ticket) tickets.push(result.ticket)
  await db.from('sms_campaign_recipients').update({
    status: 'sent',
    sms_factor_ticket: result.ticket || null,
    sent_at: now,
  }).eq('campaign_id', campaignId).in('phone', phones).eq('status', 'pending')
}

const segments = Math.ceil([...SMS_TEXT].length / 67) || 1
await db.from('sms_campaigns').update({
  status: sentTotal > 0 ? 'sent' : 'failed',
  sent_at: new Date().toISOString(),
  sent_count: sentTotal,
  failed_count: failedTotal,
  total_recipients: recipients.length,
  segments_used: sentTotal * segments,
  updated_at: new Date().toISOString(),
}).eq('id', campaignId)

console.log(JSON.stringify({
  ok: sentTotal > 0,
  campaign_id: campaignId,
  unique_phones: recipients.length,
  sent: sentTotal,
  failed: failedTotal,
  tickets,
}, null, 2))
process.exit(sentTotal > 0 ? 0 : 1)
