/**
 * Pont CRM ↔ Aircall : lookup contact par téléphone, push du nom dans
 * le carnet Aircall, cartes de contexte pendant l'appel, log d'activité.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isAircallEnabled,
  sendInsightCard,
  upsertAircallContact,
  type AircallContactInput,
} from '@/lib/aircall'
import { aircallPhoneVariants, phoneDigits, phoneLast9, toE164French } from '@/lib/phone-e164'
import { getAircallUserMap } from '@/lib/settings'
import { deriveSiteUrl } from '@/lib/site-url'
import { logger } from '@/lib/logger'

export type CrmContactForAircall = {
  hubspot_contact_id: string | null
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  telepro_user_id: string | null
  classe_actuelle?: string | null
  hs_lead_status?: string | null
}

export type AircallCallPayload = {
  id?: number
  direction?: 'inbound' | 'outbound' | string | null
  status?: string | null
  started_at?: number | null
  answered_at?: number | null
  ended_at?: number | null
  duration?: number | null
  raw_digits?: string | null
  missed_call_reason?: string | null
  recording?: string | null
  voicemail?: string | null
  user?: { id?: number; name?: string | null; email?: string | null } | null
  number?: { id?: number; name?: string | null; digits?: string | null } | null
}

const CONTACT_SELECT =
  'hubspot_contact_id, firstname, lastname, email, phone, telepro_user_id, classe_actuelle, hs_lead_status'

function cleanName(v: string | null | undefined): string {
  if (!v) return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

function digitsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = phoneDigits(a)
  const db = phoneDigits(b)
  if (!da || !db) return false
  return da.slice(-9) === db.slice(-9) && da.slice(-9).length >= 9
}

export async function findCrmContactByPhone(
  db: SupabaseClient,
  rawPhone: string | null | undefined,
): Promise<CrmContactForAircall | null> {
  const variants = aircallPhoneVariants(rawPhone)
  if (variants.length === 0) return null

  const { data: exact } = await db
    .from('crm_contacts')
    .select(CONTACT_SELECT)
    .in('phone', variants)
    .limit(5)

  const exactRows = (exact ?? []) as CrmContactForAircall[]
  if (exactRows.length > 0) return exactRows[0]

  const last9 = phoneDigits(toE164French(rawPhone) || rawPhone).slice(-9)
  if (last9.length < 9) return null

  const { data: fuzzy } = await db
    .from('crm_contacts')
    .select(CONTACT_SELECT)
    .ilike('phone', `%${last9}%`)
    .limit(20)

  const match = ((fuzzy ?? []) as CrmContactForAircall[]).find(row => digitsEqual(row.phone, rawPhone))
  return match ?? null
}

export async function resolveTeleproName(
  db: SupabaseClient,
  teleproUserId: string | null | undefined,
): Promise<string | null> {
  if (!teleproUserId) return null
  const { data } = await db
    .from('rdv_users')
    .select('name')
    .eq('id', teleproUserId)
    .maybeSingle()
  return (data as { name?: string | null } | null)?.name ?? null
}

export function buildAircallContactInput(
  contact: CrmContactForAircall,
  teleproName?: string | null,
): AircallContactInput | null {
  const phone = toE164French(contact.phone)
  if (!phone) return null
  const first = cleanName(contact.firstname) || 'Lead'
  const last = cleanName(contact.lastname)
  const lastWithTag = teleproName ? `${last} — Telepro: ${teleproName}`.trim() : last
  return {
    externalId: contact.hubspot_contact_id ?? undefined,
    firstName: first,
    lastName: lastWithTag,
    phone,
    email: contact.email,
    information: contact.hubspot_contact_id
      ? `HubSpot contact ID: ${contact.hubspot_contact_id}`
      : undefined,
  }
}

export async function pushCrmContactToAircall(
  contact: CrmContactForAircall,
  teleproName?: string | null,
): Promise<'created' | 'updated' | 'skipped' | 'invalid_phone' | 'disabled'> {
  if (!isAircallEnabled()) return 'disabled'
  const input = buildAircallContactInput(contact, teleproName)
  if (!input) return 'invalid_phone'
  return upsertAircallContact(input)
}

export async function attachInsightCardForCall(
  call: AircallCallPayload,
  contact: CrmContactForAircall,
  teleproName?: string | null,
): Promise<boolean> {
  if (!call.id || !contact.hubspot_contact_id) return false
  const fullName = `${cleanName(contact.firstname)} ${cleanName(contact.lastname)}`.trim() || 'Lead'
  const ficheUrl = `${deriveSiteUrl()}/admin/crm/contacts/${contact.hubspot_contact_id}`
  const contents: Array<{ type: 'title' | 'shortText'; text: string; label?: string; link?: string }> = [
    { type: 'title', text: fullName, link: ficheUrl },
    { type: 'shortText', label: 'CRM', text: 'Ouvrir la fiche', link: ficheUrl },
  ]
  if (contact.email) {
    contents.push({ type: 'shortText', label: 'Email', text: contact.email })
  }
  if (teleproName) {
    contents.push({ type: 'shortText', label: 'Télépro', text: teleproName })
  }
  if (contact.classe_actuelle) {
    contents.push({ type: 'shortText', label: 'Classe', text: contact.classe_actuelle })
  }
  if (contact.hs_lead_status) {
    contents.push({ type: 'shortText', label: 'Statut', text: contact.hs_lead_status })
  }
  return sendInsightCard(call.id, contents as Parameters<typeof sendInsightCard>[1])
}

function fmtDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m} min ${rem}s` : `${rem}s`
}

function toIso(unixSeconds: number | null | undefined): string {
  const n = Number(unixSeconds)
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString()
  return new Date().toISOString()
}

function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString()
  } catch {
    /* ignore */
  }
  return null
}

export type AircallRdvUser = {
  id: string
  hubspot_owner_id: string | null
}

export async function mapAircallAgentToRdvUser(
  db: SupabaseClient,
  agentEmail: string | null | undefined,
): Promise<AircallRdvUser | null> {
  const email = agentEmail?.trim().toLowerCase()
  if (!email) return null
  const { data: u } = await db
    .from('rdv_users')
    .select('id, hubspot_owner_id')
    .ilike('email', email)
    .maybeSingle()
  if (!u?.id) return null
  return { id: u.id, hubspot_owner_id: u.hubspot_owner_id ?? null }
}

export async function mapAircallAgentToOwnerId(
  db: SupabaseClient,
  agentEmail: string | null | undefined,
): Promise<string | null> {
  const u = await mapAircallAgentToRdvUser(db, agentEmail)
  return u?.hubspot_owner_id ?? u?.id ?? null
}

export type AircallCallStatus = 'completed' | 'no_answer' | 'voicemail' | 'missed'

export function classifyAircallCall(call: AircallCallPayload): {
  direction: 'inbound' | 'outbound'
  answered: boolean
  status: AircallCallStatus
} {
  const isInbound = String(call.direction) === 'inbound'
  // Messagerie = la boîte a pris, pas le prospect → status voicemail en premier,
  // même si Aircall pose un answered_at.
  const toVoicemail = Boolean(call.voicemail)
  const answered = !toVoicemail && Boolean(call.answered_at) && Number(call.duration) > 0
  let status: AircallCallStatus
  if (toVoicemail) status = 'voicemail'
  else if (answered) status = 'completed'
  else if (isInbound) status = 'missed'
  else status = 'no_answer'
  return {
    direction: isInbound ? 'inbound' : 'outbound',
    answered,
    status,
  }
}

export async function upsertAircallCall(
  db: SupabaseClient,
  call: AircallCallPayload,
  extras: { rdvUserId: string | null; hubspotContactId: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (!call.id) return { ok: false, error: 'missing call id' }
  const { direction, answered, status } = classifyAircallCall(call)
  const recording = safeHttpUrl(call.recording)
  const row = {
    aircall_call_id: call.id,
    started_at: toIso(call.started_at ?? call.ended_at),
    ended_at: call.ended_at ? toIso(call.ended_at) : null,
    duration_sec: Math.max(0, Math.round(Number(call.duration) || 0)),
    direction,
    answered,
    status,
    line_id: call.number?.id ?? null,
    line_name: call.number?.name ?? null,
    line_digits: call.number?.digits ?? null,
    aircall_user_id: call.user?.id ?? null,
    agent_email: call.user?.email?.trim().toLowerCase() || null,
    agent_name: call.user?.name ?? null,
    rdv_user_id: extras.rdvUserId,
    raw_digits: call.raw_digits ?? null,
    hubspot_contact_id: extras.hubspotContactId,
    recording_url: recording,
    missed_call_reason: call.missed_call_reason ?? null,
    payload: {
      aircall_status: call.status ?? null,
      answered_at: call.answered_at ?? null,
    },
    updated_at: new Date().toISOString(),
  }

  const { error } = await db
    .from('aircall_calls')
    .upsert(row, { onConflict: 'aircall_call_id' })

  if (error) {
    logger.warn('aircall-calls-upsert', error.message, { call_id: call.id })
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * Import dashboard : upsert en lot, sans lookup CRM (trop lent à l’historique).
 * L’agent est quand même lié via l’email Aircall → rdv_users.
 */
export async function persistAircallCallsBatch(
  db: SupabaseClient,
  calls: AircallCallPayload[],
): Promise<{ imported: number; failed: number }> {
  const valid = calls.filter(c => Number(c.id) > 0)
  if (valid.length === 0) return { imported: 0, failed: 0 }

  const [{ data: agents }, userMap] = await Promise.all([
    db.from('rdv_users').select('id, email'),
    getAircallUserMap(),
  ])
  const byEmail = new Map<string, string>()
  for (const u of agents ?? []) {
    const email = String((u as { email?: string | null }).email || '').trim().toLowerCase()
    if (email) byEmail.set(email, (u as { id: string }).id)
  }

  const rows = valid.map(call => {
    const classified = classifyAircallCall(call)
    const email = call.user?.email?.trim().toLowerCase() || null
    const mappedId = call.user?.id ? userMap.get(call.user.id) : undefined
    return {
      aircall_call_id: call.id,
      started_at: toIso(call.started_at ?? call.ended_at),
      ended_at: call.ended_at ? toIso(call.ended_at) : null,
      duration_sec: Math.max(0, Math.round(Number(call.duration) || 0)),
      direction: classified.direction,
      answered: classified.answered,
      status: classified.status,
      line_id: call.number?.id ?? null,
      line_name: call.number?.name ?? null,
      line_digits: call.number?.digits ?? null,
      aircall_user_id: call.user?.id ?? null,
      agent_email: email,
      agent_name: call.user?.name ?? null,
      rdv_user_id: mappedId || (email ? byEmail.get(email) ?? null : null),
      raw_digits: call.raw_digits ?? null,
      recording_url: safeHttpUrl(call.recording),
      missed_call_reason: call.missed_call_reason ?? null,
      payload: {
        aircall_status: call.status ?? null,
        answered_at: call.answered_at ?? null,
      },
      updated_at: new Date().toISOString(),
    }
  })

  const { error } = await db.from('aircall_calls').upsert(rows, { onConflict: 'aircall_call_id' })
  if (error) {
    logger.warn('aircall-calls-batch-upsert', error.message, { count: rows.length })
    return { imported: 0, failed: rows.length }
  }
  return { imported: rows.length, failed: 0 }
}

export async function handleAircallCallCreated(
  db: SupabaseClient,
  call: AircallCallPayload,
): Promise<{ matched: boolean; contact_id: string | null }> {
  const contact = await findCrmContactByPhone(db, call.raw_digits)
  if (!contact?.hubspot_contact_id) {
    return { matched: false, contact_id: null }
  }

  const teleproName = await resolveTeleproName(db, contact.telepro_user_id)

  try {
    await attachInsightCardForCall(call, contact, teleproName)
  } catch (err) {
    logger.warn('aircall-insight-card', 'échec insight card', {
      call_id: call.id ?? null,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    await pushCrmContactToAircall(contact, teleproName)
  } catch (err) {
    logger.warn('aircall-contact-push', 'échec push contact pendant l\'appel', {
      call_id: call.id ?? null,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return { matched: true, contact_id: contact.hubspot_contact_id }
}

export async function handleAircallCallEnded(
  db: SupabaseClient,
  call: AircallCallPayload,
): Promise<{ matched: boolean; contact_id: string | null; status?: string; direction?: string; persisted?: boolean }> {
  if (!call.id) return { matched: false, contact_id: null }

  const contact = await findCrmContactByPhone(db, call.raw_digits)
  const userMap = await getAircallUserMap()
  const mappedId = call.user?.id ? userMap.get(call.user.id) : undefined
  let agent = await mapAircallAgentToRdvUser(db, call.user?.email)
  if (mappedId && mappedId !== agent?.id) {
    const { data: mapped } = await db
      .from('rdv_users')
      .select('id, hubspot_owner_id')
      .eq('id', mappedId)
      .maybeSingle()
    if (mapped?.id) {
      agent = { id: mapped.id, hubspot_owner_id: mapped.hubspot_owner_id ?? null }
    }
  }
  const classified = classifyAircallCall(call)

  const persisted = await upsertAircallCall(db, call, {
    rdvUserId: agent?.id ?? null,
    hubspotContactId: contact?.hubspot_contact_id ?? null,
  })

  if (!contact?.hubspot_contact_id) {
    return {
      matched: false,
      contact_id: null,
      status: classified.status,
      direction: classified.direction,
      persisted: persisted.ok,
    }
  }

  const ownerId = agent?.hubspot_owner_id ?? agent?.id ?? null
  const activityDirection = classified.direction === 'inbound' ? 'INCOMING' : 'OUTGOING'
  const activityStatus =
    classified.status === 'voicemail'
      ? 'LEFT_VOICEMAIL'
      : classified.answered
        ? 'COMPLETED'
        : 'NO_ANSWER'

  const sens = classified.direction === 'inbound' ? 'entrant' : 'sortant'
  let subject: string
  if (activityStatus === 'COMPLETED') subject = `Appel ${sens} — ${fmtDuration(call.duration)}`
  else if (activityStatus === 'LEFT_VOICEMAIL') subject = `Appel ${sens} — messagerie vocale`
  else subject = `Appel ${sens} manqué`

  const recording = safeHttpUrl(call.recording)
  const bodyLines: string[] = []
  if (call.user?.name) bodyLines.push(`Agent : ${call.user.name}`)
  if (call.number?.name) bodyLines.push(`Ligne : ${call.number.name}`)
  if (call.raw_digits) bodyLines.push(`Numéro : ${call.raw_digits}`)
  if (call.missed_call_reason) bodyLines.push(`Raison : ${call.missed_call_reason}`)
  if (recording) {
    bodyLines.push(`<a href="${recording}" target="_blank" rel="noopener noreferrer">Écouter l'enregistrement</a>`)
  }
  const body = bodyLines.length > 0 ? bodyLines.join('\n') : null

  const row = {
    hubspot_engagement_id: `aircall_${call.id}`,
    activity_type: 'call',
    hubspot_contact_id: contact.hubspot_contact_id,
    owner_id: ownerId,
    subject,
    body,
    direction: activityDirection,
    status: activityStatus,
    occurred_at: toIso(call.started_at ?? call.ended_at),
    metadata: {
      source: 'aircall',
      aircall_call_id: call.id,
      duration: call.duration ?? null,
      recording: recording,
      voicemail: call.voicemail ?? null,
      missed_call_reason: call.missed_call_reason ?? null,
      agent_email: call.user?.email ?? null,
      agent_name: call.user?.name ?? null,
      line: call.number?.name ?? null,
      line_id: call.number?.id ?? null,
      line_digits: call.number?.digits ?? null,
    },
  }

  const { error } = await db
    .from('crm_activities')
    .upsert(row, { onConflict: 'hubspot_engagement_id' })

  if (error) {
    logger.error('aircall-activity-upsert', error, {
      call_id: call.id,
      contact_id: contact.hubspot_contact_id,
    })
    throw new Error(error.message)
  }

  return {
    matched: true,
    contact_id: contact.hubspot_contact_id,
    status: classified.status,
    direction: classified.direction,
    persisted: persisted.ok,
  }
}

/** Index last-9 → hubspot_contact_id pour rattacher les appels Aircall aux fiches. */
export async function loadCrmPhoneIndex(db: SupabaseClient): Promise<Map<string, string>> {
  const index = new Map<string, string>()
  const pageSize = 1000
  for (let from = 0; from < 500_000; from += pageSize) {
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, phone')
      .not('phone', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) {
      logger.warn('aircall-phone-index', error.message)
      break
    }
    if (!data?.length) break
    for (const row of data as { hubspot_contact_id: string | null; phone: string | null }[]) {
      if (!row.hubspot_contact_id) continue
      const key = phoneLast9(row.phone)
      if (key && !index.has(key)) index.set(key, row.hubspot_contact_id)
    }
    if (data.length < pageSize) break
  }
  return index
}

export async function rematchAircallCallsContacts(
  db: SupabaseClient,
): Promise<{ scanned: number; updated: number }> {
  const index = await loadCrmPhoneIndex(db)
  let scanned = 0
  let updated = 0
  const pageSize = 1000
  const pending = new Map<string, number[]>()
  for (let from = 0; from < 200_000; from += pageSize) {
    const { data, error } = await db
      .from('aircall_calls')
      .select('id, raw_digits')
      .is('hubspot_contact_id', null)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    scanned += data.length
    for (const row of data as { id: number; raw_digits: string | null }[]) {
      const hs = index.get(phoneLast9(row.raw_digits))
      if (!hs) continue
      const list = pending.get(hs) ?? []
      list.push(row.id)
      pending.set(hs, list)
    }
    if (data.length < pageSize) break
  }
  for (const [hs, ids] of pending) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error: upErr } = await db
        .from('aircall_calls')
        .update({ hubspot_contact_id: hs, updated_at: new Date().toISOString() })
        .in('id', chunk)
      if (upErr) logger.warn('aircall-contact-rematch', upErr.message)
      else updated += chunk.length
    }
  }
  return { scanned, updated }
}

/** Applique la liaison manuelle Aircall → CRM sur les appels déjà importés. */
export async function applyAircallUserMapToCalls(
  db: SupabaseClient,
  map: Map<number, string>,
): Promise<void> {
  for (const [aircallUserId, rdvUserId] of map) {
    const { error } = await db
      .from('aircall_calls')
      .update({ rdv_user_id: rdvUserId, updated_at: new Date().toISOString() })
      .eq('aircall_user_id', aircallUserId)
    if (error) logger.warn('aircall-user-map-apply', error.message, { aircallUserId })
  }
}
