/**
 * Données d'engagement d'un contact, côté serveur : appels Aircall, contacts
 * renseignés à la main, dernier contact et score (lib/lead-score.ts).
 * Utilisé par « À traiter aujourd'hui » (lib/telepro-today.ts) et par les
 * colonnes « Dernier contact » / « Score » de Mes contacts
 * (/api/crm/contacts/engagement).
 *
 * Contact renseigné à la main : crm_activities (activity_type « call »,
 * metadata.manual_contact = true), créé via POST /api/crm/activities — pour un
 * échange hors Aircall (WhatsApp, portable, sur place…).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isHumanAnswered, talkSeconds, type CallRow } from '@/lib/suivi-commercial'
import { computeLeadScore, lastContactAt, type LeadScore } from '@/lib/lead-score'

export type ContactCall = { started_at: string; answered: boolean; talk_sec: number; outbound: boolean }

/** Appels Aircall (tous télépros) des contacts donnés, les plus récents d'abord. */
export async function loadContactCalls(db: SupabaseClient, contactIds: string[]): Promise<Map<string, ContactCall[]>> {
  const out = new Map<string, ContactCall[]>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await db.from('aircall_calls')
      .select('hubspot_contact_id, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at')
      .in('hubspot_contact_id', contactIds.slice(i, i + 200))
      .order('started_at', { ascending: false })
      .limit(5000)
    for (const c of (data ?? []) as Array<CallRow & { hubspot_contact_id: string }>) {
      const list = out.get(c.hubspot_contact_id) ?? []
      const human = isHumanAnswered(c)
      list.push({ started_at: c.started_at, answered: human, talk_sec: human ? talkSeconds(c) : 0, outbound: c.direction === 'outbound' })
      out.set(c.hubspot_contact_id, list)
    }
  }
  return out
}

/** Contacts renseignés à la main (dates ISO, plus récentes d'abord). */
export async function loadManualContacts(db: SupabaseClient, contactIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await db.from('crm_activities')
      .select('hubspot_contact_id, occurred_at')
      .eq('activity_type', 'call')
      .eq('metadata->>manual_contact', 'true')
      .in('hubspot_contact_id', contactIds.slice(i, i + 200))
      .order('occurred_at', { ascending: false })
      .limit(2000)
    for (const r of (data ?? []) as Array<{ hubspot_contact_id: string; occurred_at: string }>) {
      const list = out.get(r.hubspot_contact_id) ?? []
      list.push(r.occurred_at)
      out.set(r.hubspot_contact_id, list)
    }
  }
  return out
}

export type EngagementContact = {
  hubspot_contact_id: string
  hs_lead_status: string | null
  contact_createdate: string | null
  createdate: string | null
  recent_conversion_date: string | null
  recent_conversion_event: string | null
  num_conversion_events: number | null
}

export const ENGAGEMENT_CONTACT_COLS = 'hubspot_contact_id, hs_lead_status, contact_createdate, createdate, recent_conversion_date, recent_conversion_event, num_conversion_events'

export type Engagement = {
  last_contact_at: string | null
  last_contact_manual: boolean
  last_call_at: string | null
  calls_count: number
  score: LeadScore
}

export function engagementOf(c: EngagementContact, calls: ContactCall[], manual: string[], now = Date.now()): Engagement {
  const lastContact = lastContactAt({ hs_lead_status: c.hs_lead_status, calls, manual_contacts: manual })
  return {
    last_contact_at: lastContact,
    last_contact_manual: !!lastContact && manual.includes(lastContact),
    last_call_at: calls[0]?.started_at ?? null,
    calls_count: calls.length,
    score: computeLeadScore({
      hs_lead_status: c.hs_lead_status,
      created_at: c.contact_createdate || c.createdate,
      recent_conversion_date: c.recent_conversion_date,
      recent_conversion_event: c.recent_conversion_event,
      num_conversion_events: c.num_conversion_events,
      calls,
      manual_contacts: manual,
    }, now),
  }
}

/** Engagement de contacts donnés (≤ quelques centaines). */
export async function loadEngagement(db: SupabaseClient, contactIds: string[]): Promise<Record<string, Engagement>> {
  const ids = [...new Set(contactIds.filter(Boolean))]
  if (!ids.length) return {}
  const contacts: EngagementContact[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('crm_contacts').select(ENGAGEMENT_CONTACT_COLS).in('hubspot_contact_id', ids.slice(i, i + 200))
    contacts.push(...((data ?? []) as EngagementContact[]))
  }
  const [calls, manual] = await Promise.all([loadContactCalls(db, ids), loadManualContacts(db, ids)])
  const now = Date.now()
  return Object.fromEntries(contacts.map(c => [
    c.hubspot_contact_id,
    engagementOf(c, calls.get(c.hubspot_contact_id) ?? [], manual.get(c.hubspot_contact_id) ?? [], now),
  ]))
}
