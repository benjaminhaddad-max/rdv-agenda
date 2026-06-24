#!/usr/bin/env node
/**
 * Rattrapage : renseigne owner_id sur les activités (notes, appels, emails, réunions)
 * quand l'auteur peut être déduit (HubSpot createdBy, author_user_id, RDV closer…).
 *
 * Usage :
 *   node scripts/backfill-activity-authors.mjs              # dry-run
 *   node scripts/backfill-activity-authors.mjs --apply      # écrit en base
 *   node scripts/backfill-activity-authors.mjs --notes-only # notes uniquement
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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

function inferOwnerId(activity, ctx) {
  const meta = activity.metadata || {}
  const eng = meta.engagement && typeof meta.engagement === 'object' ? meta.engagement : null

  if (meta.author_user_id) {
    return { ownerId: String(meta.author_user_id), method: 'author_user_id' }
  }

  if (eng?.ownerId != null && String(eng.ownerId).trim()) {
    return { ownerId: String(eng.ownerId), method: 'hs_engagement_ownerId' }
  }

  if (eng?.createdBy != null && String(eng.createdBy).trim()) {
    const createdBy = String(eng.createdBy)
    const mapped = ctx.hsUserToOwner.get(createdBy) || createdBy
    return { ownerId: mapped, method: 'hs_engagement_createdBy' }
  }

  const apptId = meta.appointment_id ? String(meta.appointment_id) : null
  if (apptId && ctx.appointments.has(apptId)) {
    const appt = ctx.appointments.get(apptId)
    const closerOwner = appt.commercial_id ? ctx.commercialToOwner.get(appt.commercial_id) : null
    if (closerOwner) return { ownerId: closerOwner, method: 'appointment_closer' }
  }

  // Ancienne attribution erronée : propriétaire du contact ≠ auteur de la note native
  if (
    !activity.hubspot_engagement_id &&
    activity.owner_id &&
    activity.hubspot_contact_id
  ) {
    const contactOwner = ctx.contactOwners.get(activity.hubspot_contact_id)
    if (contactOwner && String(activity.owner_id) === String(contactOwner)) {
      return { ownerId: null, method: 'clear_wrong_contact_owner', clear: true }
    }
  }

  return null
}

async function buildContext(db) {
  const hsUserToOwner = new Map()
  const commercialToOwner = new Map()
  const contactOwners = new Map()
  const appointments = new Map()

  const { data: users } = await db
    .from('rdv_users')
    .select('id, hubspot_owner_id, hubspot_user_id')
  for (const u of users || []) {
    if (u.hubspot_owner_id) hsUserToOwner.set(String(u.hubspot_owner_id), String(u.hubspot_owner_id))
    if (u.hubspot_user_id) hsUserToOwner.set(String(u.hubspot_user_id), String(u.hubspot_owner_id || u.hubspot_user_id))
    if (u.id) hsUserToOwner.set(String(u.id), String(u.hubspot_owner_id || u.id))
    if (u.id && u.hubspot_owner_id) commercialToOwner.set(String(u.id), String(u.hubspot_owner_id))
  }

  const { data: owners } = await db.from('crm_owners').select('hubspot_owner_id, user_id')
  for (const o of owners || []) {
    if (o.user_id) hsUserToOwner.set(String(o.user_id), String(o.hubspot_owner_id))
    if (o.hubspot_owner_id) hsUserToOwner.set(String(o.hubspot_owner_id), String(o.hubspot_owner_id))
  }

  let off = 0
  while (true) {
    const { data } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, hubspot_owner_id')
      .not('hubspot_owner_id', 'is', null)
      .range(off, off + 999)
    if (!data?.length) break
    for (const c of data) {
      contactOwners.set(c.hubspot_contact_id, c.hubspot_owner_id)
    }
    if (data.length < 1000) break
    off += 1000
  }

  off = 0
  while (true) {
    const { data } = await db
      .from('rdv_appointments')
      .select('id, commercial_id')
      .not('commercial_id', 'is', null)
      .range(off, off + 999)
    if (!data?.length) break
    for (const a of data) appointments.set(a.id, a)
    if (data.length < 1000) break
    off += 1000
  }

  return { hsUserToOwner, commercialToOwner, contactOwners, appointments }
}

async function paginateActivities(db, notesOnly) {
  const rows = []
  const PAGE = 300
  let off = 0
  const types = notesOnly ? ['note'] : ['note', 'call', 'email', 'meeting']

  while (true) {
    const { data, error } = await db
      .from('crm_activities')
      .select('id, activity_type, owner_id, hubspot_contact_id, hubspot_engagement_id, metadata')
      .in('activity_type', types)
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    off += PAGE
  }
  return rows
}

const APPLY = process.argv.includes('--apply')
const NOTES_ONLY = process.argv.includes('--notes-only')
loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis')
  process.exit(1)
}

const db = createClient(url, key)
const ctx = await buildContext(db)
const activities = await paginateActivities(db, NOTES_ONLY)

const counts = {
  scanned: activities.length,
  would_set: 0,
  would_clear: 0,
  would_skip: 0,
  set: 0,
  cleared: 0,
  by_method: {},
}

for (const activity of activities) {
  const needsWork =
    !activity.owner_id ||
    (!activity.hubspot_engagement_id && activity.owner_id && activity.hubspot_contact_id)

  if (!needsWork) {
    counts.would_skip++
    continue
  }

  const inferred = inferOwnerId(activity, ctx)
  if (!inferred) {
    counts.would_skip++
    continue
  }

  counts.by_method[inferred.method] = (counts.by_method[inferred.method] || 0) + 1

  if (inferred.clear) {
    counts.would_clear++
    if (APPLY) {
      await db
        .from('crm_activities')
        .update({ owner_id: null, updated_at: new Date().toISOString() })
        .eq('id', activity.id)
      counts.cleared++
    }
    continue
  }

  if (activity.owner_id && String(activity.owner_id) === String(inferred.ownerId)) {
    counts.would_skip++
    continue
  }

  counts.would_set++
  if (APPLY) {
    await db
      .from('crm_activities')
      .update({ owner_id: inferred.ownerId, updated_at: new Date().toISOString() })
      .eq('id', activity.id)
    counts.set++
  }
}

console.log(`Mode ${APPLY ? 'APPLY' : 'dry-run'} — types: ${NOTES_ONLY ? 'note' : 'note,call,email,meeting'}`)
console.log('Résultat :', counts)
