#!/usr/bin/env node
/**
 * scripts/upcoming-rdv-without-deal.mjs
 *
 * Parmi les prochains RDV prévus (start_at >= maintenant, hors annulés),
 * identifie ceux dont le contact n'a AUCUNE transaction (crm_deals).
 *
 * Rattachement contact -> transaction :
 *   1. par hubspot_contact_id (si présent sur le RDV)
 *   2. repli par email (rdv.prospect_email == crm_deals.<contact>.email)
 *
 * Usage : node scripts/upcoming-rdv-without-deal.mjs
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const fmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
})

async function fetchAll(qb, pageSize = 1000) {
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await qb.range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data || []
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return out
}

async function main() {
  loadEnv()
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')
  if (!supabaseUrl || !serviceKey) throw new Error('Variables Supabase manquantes')
  const db = createClient(supabaseUrl, serviceKey)

  const nowIso = new Date().toISOString()

  const appts = await fetchAll(
    db.from('rdv_appointments')
      .select('id, prospect_name, prospect_email, prospect_phone, start_at, status, hubspot_contact_id, hubspot_deal_id')
      .gte('start_at', nowIso)
      .neq('status', 'annule')
      .order('start_at', { ascending: true })
  )

  // Contacts ids présents sur les RDV
  const contactIds = [...new Set(appts.map(a => a.hubspot_contact_id).filter(Boolean).map(String))]
  // Emails présents sur les RDV (repli)
  const emails = [...new Set(appts.map(a => (a.prospect_email || '').trim().toLowerCase()).filter(Boolean))]

  // 1. Deals existants par hubspot_contact_id
  const dealContactIds = new Set()
  for (let i = 0; i < contactIds.length; i += 300) {
    const chunk = contactIds.slice(i, i + 300)
    if (chunk.length === 0) break
    const { data, error } = await db
      .from('crm_deals')
      .select('hubspot_contact_id')
      .in('hubspot_contact_id', chunk)
    if (error) throw new Error(`crm_deals by contact: ${error.message}`)
    for (const d of data || []) dealContactIds.add(String(d.hubspot_contact_id))
  }

  // 2. Repli email : crm_contacts ayant un email match -> leur contact_id -> deals
  //    On résout email -> hubspot_contact_id, puis on regarde si ce contact a un deal.
  const emailToContactId = new Map()
  for (let i = 0; i < emails.length; i += 300) {
    const chunk = emails.slice(i, i + 300)
    if (chunk.length === 0) break
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, email')
      .in('email', chunk)
    if (error) throw new Error(`crm_contacts by email: ${error.message}`)
    for (const c of data || []) {
      const e = (c.email || '').trim().toLowerCase()
      if (e && c.hubspot_contact_id) emailToContactId.set(e, String(c.hubspot_contact_id))
    }
  }
  const emailContactIds = [...new Set([...emailToContactId.values()])]
  const dealContactIdsViaEmail = new Set()
  for (let i = 0; i < emailContactIds.length; i += 300) {
    const chunk = emailContactIds.slice(i, i + 300)
    if (chunk.length === 0) break
    const { data, error } = await db
      .from('crm_deals')
      .select('hubspot_contact_id')
      .in('hubspot_contact_id', chunk)
    if (error) throw new Error(`crm_deals by email-contact: ${error.message}`)
    for (const d of data || []) dealContactIdsViaEmail.add(String(d.hubspot_contact_id))
  }

  function hasDeal(a) {
    // a) deal directement renseigné sur le RDV
    if (a.hubspot_deal_id) return true
    // b) contact_id du RDV a un deal
    if (a.hubspot_contact_id && dealContactIds.has(String(a.hubspot_contact_id))) return true
    // c) repli email -> contact -> deal
    const e = (a.prospect_email || '').trim().toLowerCase()
    if (e && emailToContactId.has(e) && dealContactIdsViaEmail.has(emailToContactId.get(e))) return true
    return false
  }

  const without = appts.filter(a => !hasDeal(a))
  const withDeal = appts.length - without.length

  console.log(`\n=== Prochains RDV vs transactions ===`)
  console.log(`Total prochains RDV (hors annulés) : ${appts.length}`)
  console.log(`  - avec transaction : ${withDeal}`)
  console.log(`  - SANS transaction : ${without.length}\n`)

  if (without.length) {
    console.log('RDV sans transaction :')
    for (const a of without) {
      console.log(
        `${fmt.format(new Date(a.start_at))} | ${String(a.prospect_name || '—').padEnd(30)} | ${String(a.prospect_email || '—').padEnd(30)} | contact_id=${a.hubspot_contact_id || '∅'}`
      )
    }
  }
}

main().catch((err) => {
  console.error('Erreur :', err?.message || err)
  process.exit(1)
})
