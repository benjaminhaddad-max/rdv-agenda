#!/usr/bin/env node
/**
 * scripts/create-deals-for-upcoming-rdv.mjs
 *
 * Crée une transaction (crm_deals) pour chaque prochain RDV prévu
 * (start_at >= maintenant, hors annulés) qui n'a PAS encore de transaction.
 *
 * Convention (identique au flux télépro de l'app) :
 *   - hubspot_deal_id = rdv_<appointment.id>   (idempotent, upsert)
 *   - dealstage       = RDV pris (3165428980)
 *   - pipeline        = 2026-2027 (2313043166)
 *   - dealname        = "<prospect> - <classe> - <formation>"
 *   - hubspot_owner_id= owner du closer assigné (rdv_users.hubspot_owner_id)
 *   - teleprospecteur = hubspot_user_id du télépro
 *   - closedate       = start_at, supabase_appt_id = appointment.id
 *   - hubspot_contact_id = résolu via RDV, sinon crm_contacts (email puis tél.)
 * On met aussi à jour rdv_appointments.hubspot_deal_id (lien inverse).
 *
 * Usage :
 *   node scripts/create-deals-for-upcoming-rdv.mjs                       # DRY-RUN, RDV à venir (>= maintenant)
 *   node scripts/create-deals-for-upcoming-rdv.mjs --execute             # applique (RDV à venir)
 *   node scripts/create-deals-for-upcoming-rdv.mjs --day=2026-06-04      # DRY-RUN, journée précise (heure de Paris)
 *   node scripts/create-deals-for-upcoming-rdv.mjs --day=2026-06-04 --execute
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const EXECUTE = process.argv.includes('--execute')
const DAY_ARG = (process.argv.find(a => a.startsWith('--day=')) || '').split('=')[1] || null
const STAGE_RDV_PRIS = '3165428980'
const PIPELINE_2026_2027 = '2313043166'

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
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
})

function phoneKey(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 9) return null
  return digits.slice(-9) // 9 derniers chiffres = clé robuste (FR/intl)
}

function formatDealName(name, classe, formation) {
  return [name?.trim(), classe?.trim() || null, formation?.trim() || null].filter(Boolean).join(' - ') || name?.trim() || 'RDV'
}

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

  // 1. RDV ciblés (hors annulés) — soit la journée --day, soit >= maintenant
  let baseQuery = db.from('rdv_appointments')
    .select('id, prospect_name, prospect_email, prospect_phone, start_at, status, formation_type, classe_actuelle, commercial_id, telepro_id, hubspot_contact_id, hubspot_deal_id')
    .neq('status', 'annule')
    .order('start_at', { ascending: true })

  if (DAY_ARG) {
    // Journée pleine en heure de Paris. Juin = CEST (+02:00).
    const gte = `${DAY_ARG}T00:00:00+02:00`
    const [y, m, d] = DAY_ARG.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    const nextDay = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
    const lt = `${nextDay}T00:00:00+02:00`
    console.log(`Périmètre : journée ${DAY_ARG} (Paris) — ${gte} → ${lt}`)
    baseQuery = baseQuery.gte('start_at', gte).lt('start_at', lt)
  } else {
    baseQuery = baseQuery.gte('start_at', nowIso)
  }

  const appts = await fetchAll(baseQuery)

  // 2. Deals existants (par contact_id présents sur RDV + via email)
  const contactIdsOnAppt = [...new Set(appts.map(a => a.hubspot_contact_id).filter(Boolean).map(String))]
  const emails = [...new Set(appts.map(a => (a.prospect_email || '').trim().toLowerCase()).filter(Boolean))]

  // crm_contacts par email -> id
  const emailToContact = new Map()
  const phoneToContact = new Map()
  for (let i = 0; i < emails.length; i += 300) {
    const chunk = emails.slice(i, i + 300)
    if (!chunk.length) break
    const { data, error } = await db.from('crm_contacts')
      .select('hubspot_contact_id, email, phone').in('email', chunk)
    if (error) throw new Error(`crm_contacts email: ${error.message}`)
    for (const c of data || []) {
      const e = (c.email || '').trim().toLowerCase()
      if (e && c.hubspot_contact_id) emailToContact.set(e, String(c.hubspot_contact_id))
      const pk = phoneKey(c.phone)
      if (pk && c.hubspot_contact_id) phoneToContact.set(pk, String(c.hubspot_contact_id))
    }
  }

  // crm_contacts par téléphone (repli)
  const phoneKeys = [...new Set(appts.map(a => phoneKey(a.prospect_phone)).filter(Boolean))]
  // On ne peut pas filtrer SQL sur les 9 derniers chiffres simplement ;
  // on charge par variantes E164/0X et on indexe via phoneKey.
  const phoneVariants = new Set()
  for (const a of appts) {
    const d = String(a.prospect_phone || '').replace(/\D/g, '')
    if (d.length >= 9) {
      const last9 = d.slice(-9)
      phoneVariants.add('+33' + last9)
      phoneVariants.add('0' + last9)
      phoneVariants.add(d)
      phoneVariants.add('+' + d)
    }
  }
  const variantArr = [...phoneVariants]
  for (let i = 0; i < variantArr.length; i += 300) {
    const chunk = variantArr.slice(i, i + 300)
    if (!chunk.length) break
    const { data, error } = await db.from('crm_contacts')
      .select('hubspot_contact_id, phone').in('phone', chunk)
    if (error) throw new Error(`crm_contacts phone: ${error.message}`)
    for (const c of data || []) {
      const pk = phoneKey(c.phone)
      if (pk && c.hubspot_contact_id && !phoneToContact.has(pk)) phoneToContact.set(pk, String(c.hubspot_contact_id))
    }
  }

  // Ensemble des contacts ayant déjà au moins un deal
  const resolvedContactIds = new Set([
    ...contactIdsOnAppt,
    ...emailToContact.values(),
    ...phoneToContact.values(),
  ])
  const dealContactIds = new Set()
  const allCidArr = [...resolvedContactIds]
  for (let i = 0; i < allCidArr.length; i += 300) {
    const chunk = allCidArr.slice(i, i + 300)
    if (!chunk.length) break
    const { data, error } = await db.from('crm_deals')
      .select('hubspot_contact_id').in('hubspot_contact_id', chunk)
    if (error) throw new Error(`crm_deals: ${error.message}`)
    for (const d of data || []) dealContactIds.add(String(d.hubspot_contact_id))
  }

  function resolveContactId(a) {
    if (a.hubspot_contact_id) return String(a.hubspot_contact_id)
    const e = (a.prospect_email || '').trim().toLowerCase()
    if (e && emailToContact.has(e)) return emailToContact.get(e)
    const pk = phoneKey(a.prospect_phone)
    if (pk && phoneToContact.has(pk)) return phoneToContact.get(pk)
    return null
  }

  function hasDeal(a) {
    if (a.hubspot_deal_id) return true
    const cid = resolveContactId(a)
    if (cid && dealContactIds.has(cid)) return true
    return false
  }

  const targets = appts.filter(a => !hasDeal(a))

  // Owners (closer) + télépros
  const commercialIds = [...new Set(targets.map(a => a.commercial_id).filter(Boolean))]
  const teleproIds = [...new Set(targets.map(a => a.telepro_id).filter(Boolean))]
  const ownerById = new Map()
  const teleproHsById = new Map()
  if (commercialIds.length || teleproIds.length) {
    const { data, error } = await db.from('rdv_users')
      .select('id, name, hubspot_owner_id, hubspot_user_id')
      .in('id', [...new Set([...commercialIds, ...teleproIds])])
    if (error) throw new Error(`rdv_users: ${error.message}`)
    for (const u of data || []) {
      ownerById.set(u.id, { owner: u.hubspot_owner_id || null, name: u.name })
      teleproHsById.set(u.id, u.hubspot_user_id || null)
    }
  }

  // Plan
  const plan = targets.map(a => {
    const cid = resolveContactId(a)
    return {
      appt_id: a.id,
      deal_id: `rdv_${a.id}`,
      contact_id: cid,
      contact_resolved: !!cid,
      dealname: formatDealName(a.prospect_name, a.classe_actuelle, a.formation_type),
      owner: a.commercial_id ? (ownerById.get(a.commercial_id)?.owner || null) : null,
      telepro_hs: a.telepro_id ? (teleproHsById.get(a.telepro_id) || null) : null,
      start_at: a.start_at,
      formation: a.formation_type || null,
      email: a.prospect_email || null,
      phone: a.prospect_phone || null,
    }
  })

  const withContact = plan.filter(p => p.contact_resolved)
  const noContact = plan.filter(p => !p.contact_resolved)

  console.log(`\n=== ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'} : création transactions pour prochains RDV sans deal ===`)
  console.log(`RDV ciblés (sans transaction) : ${plan.length}`)
  console.log(`  - contact CRM résolu (deal lié à une fiche) : ${withContact.length}`)
  console.log(`  - SANS contact CRM (deal orphelin si créé)   : ${noContact.length}\n`)

  for (const p of plan) {
    console.log(`${fmt.format(new Date(p.start_at))} | ${p.contact_resolved ? 'contact=' + p.contact_id : 'NO CONTACT'.padEnd(20)} | ${p.dealname}`)
  }

  if (!EXECUTE) {
    console.log(`\n(DRY-RUN) Rien créé. Relance avec --execute pour appliquer.`)
    console.log(`Note : les RDV "SANS contact CRM" ne seront PAS rattachés à une fiche.`)
    return
  }

  // EXECUTE
  let created = 0
  const errors = []
  for (const p of plan) {
    const nowIso2 = new Date().toISOString()
    const row = {
      hubspot_deal_id: p.deal_id,
      hubspot_contact_id: p.contact_id, // peut être null
      dealname: p.dealname,
      dealstage: STAGE_RDV_PRIS,
      pipeline: PIPELINE_2026_2027,
      hubspot_owner_id: p.owner,
      teleprospecteur: p.telepro_hs,
      formation: p.formation,
      closedate: p.start_at,
      createdate: nowIso2,
      description: 'Transaction créée pour RDV à venir (rattrapage agenda)',
      supabase_appt_id: p.appt_id,
      synced_at: nowIso2,
    }
    const { error: upErr } = await db.from('crm_deals').upsert(row, { onConflict: 'hubspot_deal_id' })
    if (upErr) { errors.push(`${p.deal_id}: ${upErr.message}`); continue }
    await db.from('rdv_appointments').update({ hubspot_deal_id: p.deal_id }).eq('id', p.appt_id)
    created++
  }

  console.log(`\nTransactions créées/upsertées : ${created}/${plan.length}`)
  if (errors.length) {
    console.log(`Erreurs (${errors.length}) :`)
    for (const e of errors) console.log('  - ' + e)
  }
}

main().catch((err) => {
  console.error('Erreur :', err?.message || err)
  process.exit(1)
})
