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
import { aircallPhoneVariants, phoneDigits, toE164French } from '@/lib/phone-e164'
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

export async function mapAircallAgentToOwnerId(
  db: SupabaseClient,
  agentEmail: string | null | undefined,
): Promise<string | null> {
  const email = agentEmail?.trim().toLowerCase()
  if (!email) return null
  const { data: u } = await db
    .from('rdv_users')
    .select('id, hubspot_owner_id')
    .ilike('email', email)
    .maybeSingle()
  return u?.hubspot_owner_id ?? u?.id ?? null
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
): Promise<{ matched: boolean; contact_id: string | null; status?: string; direction?: string }> {
  if (!call.id) return { matched: false, contact_id: null }

  const contact = await findCrmContactByPhone(db, call.raw_digits)
  if (!contact?.hubspot_contact_id) {
    return { matched: false, contact_id: null }
  }

  const ownerId = await mapAircallAgentToOwnerId(db, call.user?.email)

  const isInbound = String(call.direction) === 'inbound'
  const direction = isInbound ? 'INCOMING' : 'OUTGOING'
  const answered = Boolean(call.answered_at) && Number(call.duration) > 0

  let status: string
  if (call.voicemail) status = 'LEFT_VOICEMAIL'
  else if (answered) status = 'COMPLETED'
  else status = 'NO_ANSWER'

  const sens = isInbound ? 'entrant' : 'sortant'
  let subject: string
  if (status === 'COMPLETED') subject = `Appel ${sens} — ${fmtDuration(call.duration)}`
  else if (status === 'LEFT_VOICEMAIL') subject = `Appel ${sens} — messagerie vocale`
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
    direction,
    status,
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
    status,
    direction,
  }
}
