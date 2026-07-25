#!/usr/bin/env node
/**
 * Réattribue tous les RDV non annulés du 25/07/2026 au 17/08/2026 (inclus,
 * fuseau Europe/Paris) au closer Judith Diploma.
 *
 * Met à jour :
 *   - rdv_appointments.commercial_id (+ status confirme si non_assigne)
 *   - crm_contacts.closer_du_contact_owner_id
 *   - crm_deals.hubspot_owner_id (deal lié)
 *   - Typesense contacts (si configuré)
 *
 * Usage :
 *   bun scripts/assign-rdv-to-judith-until-aug17.mjs           # dry-run
 *   bun scripts/assign-rdv-to-judith-until-aug17.mjs --apply   # applique
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(p) {
  const s = readFileSync(p, 'utf8')
  for (const raw of s.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    const k = l.slice(0, i).trim()
    let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}
loadEnv('.env.local')
try { loadEnv('.vercel/.env.production.local') } catch {}

const db = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, ''),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, ''),
  { auth: { persistSession: false } },
)

const JUDITH_OWNER_ID = '798051044'
const RANGE_START = '2026-07-25T00:00:00+02:00'
const RANGE_END = '2026-08-17T23:59:59.999+02:00'
const apply = process.argv.includes('--apply')

async function main() {
  console.log(`[judith-rdv] Mode : ${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`[judith-rdv] Plage : ${RANGE_START} → ${RANGE_END}`)

  const { data: judith, error: judithErr } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id')
    .eq('hubspot_owner_id', JUDITH_OWNER_ID)
    .maybeSingle()
  if (judithErr) throw new Error(judithErr.message)
  if (!judith) throw new Error('Judith Diploma introuvable dans rdv_users')
  console.log(`[judith-rdv] Closer : ${judith.name} (${judith.id})`)

  const { data: appts, error } = await db
    .from('rdv_appointments')
    .select('id, start_at, status, commercial_id, hubspot_contact_id, hubspot_deal_id, prospect_email, prospect_name')
    .neq('status', 'annule')
    .gte('start_at', RANGE_START)
    .lte('start_at', RANGE_END)
    .order('start_at', { ascending: true })
  if (error) throw new Error(error.message)

  const alreadyOk = (appts || []).filter((a) => a.commercial_id === judith.id)
  const toUpdate = (appts || []).filter((a) => a.commercial_id !== judith.id)

  // Enrichir avec le nom du closer actuel
  const closerIds = [...new Set(toUpdate.map((a) => a.commercial_id).filter(Boolean))]
  const closerById = new Map()
  if (closerIds.length) {
    const { data: closers } = await db.from('rdv_users').select('id, name').in('id', closerIds)
    for (const c of closers || []) closerById.set(c.id, c.name)
  }

  console.log(`[judith-rdv] Total non annulés : ${(appts || []).length}`)
  console.log(`[judith-rdv] Déjà Judith       : ${alreadyOk.length}`)
  console.log(`[judith-rdv] À réattribuer     : ${toUpdate.length}`)
  console.log('--- détail ---')
  for (const a of toUpdate) {
    const who = a.commercial_id ? (closerById.get(a.commercial_id) || a.commercial_id) : 'non assigné'
    console.log(
      `   ${a.start_at} | ${a.prospect_name || '—'} <${a.prospect_email || '—'}> | ${who} → Judith`,
    )
  }

  const backup = (appts || []).map((a) => ({
    id: a.id,
    start_at: a.start_at,
    status: a.status,
    old_commercial_id: a.commercial_id,
    hubspot_contact_id: a.hubspot_contact_id,
    hubspot_deal_id: a.hubspot_deal_id,
  }))
  writeFileSync('scripts/assign-rdv-to-judith-until-aug17-backup.json', JSON.stringify(backup, null, 2))
  console.log('[judith-rdv] Backup : scripts/assign-rdv-to-judith-until-aug17-backup.json')

  if (!apply) {
    console.log('[judith-rdv] DRY-RUN : aucune écriture. Relance avec --apply.')
    return
  }
  if (!toUpdate.length) {
    console.log('[judith-rdv] Rien à faire.')
    return
  }

  let apptUpdated = 0
  let contactUpdated = 0
  let dealUpdated = 0
  const contactIdsForTs = new Set()

  for (const a of toUpdate) {
    const newStatus = a.status === 'non_assigne' ? 'confirme' : a.status
    const { error: e1 } = await db
      .from('rdv_appointments')
      .update({ commercial_id: judith.id, status: newStatus })
      .eq('id', a.id)
    if (e1) {
      console.error(`  appt ${a.id} err:`, e1.message)
      continue
    }
    apptUpdated++

    let contactId = a.hubspot_contact_id || null
    if (!contactId && a.prospect_email) {
      const { data: byEmail } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .ilike('email', a.prospect_email.trim())
        .maybeSingle()
      contactId = byEmail?.hubspot_contact_id || null
    }

    if (contactId) {
      const { error: e2 } = await db
        .from('crm_contacts')
        .update({
          closer_du_contact_owner_id: JUDITH_OWNER_ID,
          synced_at: new Date().toISOString(),
        })
        .eq('hubspot_contact_id', contactId)
      if (!e2) {
        contactUpdated++
        contactIdsForTs.add(contactId)
      } else {
        console.error(`  contact ${contactId} err:`, e2.message)
      }
      if (!a.hubspot_contact_id) {
        await db.from('rdv_appointments').update({ hubspot_contact_id: contactId }).eq('id', a.id)
      }
    }

    if (a.hubspot_deal_id) {
      const { error: e3 } = await db
        .from('crm_deals')
        .update({ hubspot_owner_id: JUDITH_OWNER_ID, synced_at: new Date().toISOString() })
        .eq('hubspot_deal_id', a.hubspot_deal_id)
      if (!e3) dealUpdated++
      else console.error(`  deal ${a.hubspot_deal_id} err:`, e3.message)
    }
  }

  console.log(`[judith-rdv] RDV mis à jour      : ${apptUpdated}`)
  console.log(`[judith-rdv] Contacts mis à jour : ${contactUpdated}`)
  console.log(`[judith-rdv] Deals mis à jour    : ${dealUpdated}`)

  const TS_HOST = (process.env.TYPESENSE_HOST || '').replace(/\/+$/, '')
  const TS_KEY = process.env.TYPESENSE_API_KEY || ''
  const COLL = process.env.TYPESENSE_COLLECTION_CRM_CONTACTS || 'crm_contacts'
  const ids = [...contactIdsForTs]
  if (TS_HOST && TS_KEY && ids.length) {
    const lines = ids.map((id) => JSON.stringify({ id, closer_du_contact_owner_id: JUDITH_OWNER_ID }))
    const res = await fetch(`${TS_HOST}/collections/${COLL}/documents/import?action=update`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-TYPESENSE-API-KEY': TS_KEY },
      body: lines.join('\n'),
    })
    const txt = await res.text()
    const ok = (txt.match(/"success":true/g) || []).length
    console.log(`[judith-rdv] Typesense : ${ok}/${ids.length} (http ${res.status})`)
  } else {
    console.log('[judith-rdv] Typesense sauté.')
  }

  console.log('[judith-rdv] Terminé.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
