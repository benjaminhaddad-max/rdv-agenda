#!/usr/bin/env node
/**
 * Rattrapage : crée les activités « Rapport RDV » sur les fiches contact
 * pour tous les RDV qui ont déjà un report_summary en base.
 *
 * Usage :
 *   node scripts/backfill-appointment-recap-activities.mjs           # dry-run
 *   node scripts/backfill-appointment-recap-activities.mjs --apply   # écrit en base
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APPOINTMENT_RECAP_SOURCE = 'appointment_recap'

function loadEnv(file = '.env.local') {
  try {
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
  } catch {
    /* .env.local optionnel */
  }
}

function buildRecapBody(reportSummary, reportTeleproAdvice) {
  const summary = (reportSummary || '').trim()
  const telepro = (reportTeleproAdvice || '').trim()
  if (!summary && !telepro) return null
  const parts = []
  if (summary) parts.push(summary)
  if (telepro) parts.push(`Conseil pour le télépro :\n${telepro}`)
  return parts.join('\n\n')
}

function recapSubject(startAt) {
  if (!startAt) return 'Rapport RDV'
  try {
    const date = new Date(startAt)
    return `Rapport RDV — ${date.toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })}`
  } catch {
    return 'Rapport RDV'
  }
}

async function resolveContactId(db, appointment) {
  if (appointment.hubspot_contact_id) return appointment.hubspot_contact_id

  const email = (appointment.prospect_email || '').trim().toLowerCase()
  if (email) {
    const { data } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id')
      .ilike('email', email)
      .maybeSingle()
    if (data?.hubspot_contact_id) return data.hubspot_contact_id
  }

  if (appointment.prospect_phone) {
    const digits = String(appointment.prospect_phone).replace(/\D/g, '')
    if (digits.length >= 9) {
      const last9 = digits.slice(-9)
      const variants = [`+33${last9}`, `0${last9}`, digits, `+${digits}`]
      const { data } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .in('phone', variants)
        .maybeSingle()
      if (data?.hubspot_contact_id) return data.hubspot_contact_id
    }
  }

  return null
}

async function resolveCloserOwnerId(db, commercialId) {
  if (!commercialId) return null
  const { data } = await db
    .from('rdv_users')
    .select('hubspot_owner_id')
    .eq('id', commercialId)
    .maybeSingle()
  return data?.hubspot_owner_id || null
}

async function syncRecap(db, appointment, apply) {
  const body = buildRecapBody(appointment.report_summary, appointment.report_telepro_advice)
  if (!body) return { action: 'skip_empty' }

  const contactId = await resolveContactId(db, appointment)
  if (!contactId) return { action: 'skip_no_contact' }

  const metadata = { source: APPOINTMENT_RECAP_SOURCE, appointment_id: appointment.id }
  const { data: existing } = await db
    .from('crm_activities')
    .select('id')
    .eq('hubspot_contact_id', contactId)
    .is('hubspot_engagement_id', null)
    .contains('metadata', metadata)
    .maybeSingle()

  const payload = {
    subject: recapSubject(appointment.start_at),
    body,
    owner_id: await resolveCloserOwnerId(db, appointment.commercial_id),
    occurred_at: appointment.start_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    if (!apply) return { action: 'would_update', contactId }
    await db.from('crm_activities').update(payload).eq('id', existing.id)
    return { action: 'updated', contactId }
  }

  if (!apply) return { action: 'would_create', contactId }
  await db.from('crm_activities').insert({
    activity_type: 'note',
    hubspot_contact_id: contactId,
    hubspot_deal_id: appointment.hubspot_deal_id || null,
    metadata,
    ...payload,
  })
  return { action: 'created', contactId }
}

async function paginateRecapAppointments(db) {
  const rows = []
  const PAGE = 200
  let off = 0
  while (true) {
    const { data, error } = await db
      .from('rdv_appointments')
      .select('id, hubspot_contact_id, hubspot_deal_id, prospect_email, prospect_phone, commercial_id, start_at, report_summary, report_telepro_advice')
      .not('report_summary', 'is', null)
      .order('start_at', { ascending: false })
      .range(off, off + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data.filter(a => (a.report_summary || '').trim()))
    if (data.length < PAGE) break
    off += PAGE
  }
  return rows
}

const APPLY = process.argv.includes('--apply')
loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis')
  process.exit(1)
}

const db = createClient(url, key)

const counts = {
  would_create: 0,
  would_update: 0,
  created: 0,
  updated: 0,
  skip_no_contact: 0,
  skip_empty: 0,
}

const appointments = await paginateRecapAppointments(db)
console.log(`RDV avec recap trouvés : ${appointments.length}`)
console.log(APPLY ? 'Mode APPLY — écriture en base' : 'Mode dry-run — aucune écriture')

for (const appt of appointments) {
  const result = await syncRecap(db, appt, APPLY)
  counts[result.action] = (counts[result.action] || 0) + 1
  if (result.action === 'skip_no_contact') {
    console.log(`  ⚠ ${appt.id} — contact introuvable (${appt.prospect_email || appt.prospect_phone || '—'})`)
  }
}

console.log('Résultat :', counts)
