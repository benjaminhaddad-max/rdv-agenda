/**
 * Stats de performance pour la fiche événement :
 * - répartition par zone_localite
 * - répartition par classe_actuelle
 * - % nouveaux contacts CRM vs contacts déjà existants
 */

import { createServiceClient } from '@/lib/supabase'
import { listEventAttendees } from '@/lib/events-studio/sync-attendees'

export type PerfBucket = { key: string; label: string; count: number; pct: number }

export type EventPerfStats = {
  total: number
  matched_contacts: number
  by_zone: PerfBucket[]
  by_classe: PerfBucket[]
  novelty: {
    new_count: number
    existing_count: number
    unknown_count: number
    new_pct: number
    existing_pct: number
  }
}

/** Si le contact CRM a été créé plus de 5 min avant l’inscription → déjà existant. */
const EXISTING_GAP_MS = 5 * 60 * 1000

function labelOrUnknown(raw: string | null | undefined): string {
  const v = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!v) return 'Non renseigné'
  const lower = v.toLowerCase()
  if (lower === 'non renseignee' || lower === 'non renseignée' || lower === 'non renseigne') {
    return 'Non renseigné'
  }
  return v
}

function toBuckets(counts: Map<string, number>, total: number): PerfBucket[] {
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
}

export async function getEventPerfStats(
  eventId: string,
  preloadedAttendees?: Awaited<ReturnType<typeof listEventAttendees>>['attendees'],
): Promise<EventPerfStats> {
  const attendees =
    preloadedAttendees || (await listEventAttendees(eventId)).attendees
  const total = attendees.length

  const empty: EventPerfStats = {
    total: 0,
    matched_contacts: 0,
    by_zone: [],
    by_classe: [],
    novelty: {
      new_count: 0,
      existing_count: 0,
      unknown_count: 0,
      new_pct: 0,
      existing_pct: 0,
    },
  }
  if (total === 0) return empty

  const crmDb = createServiceClient()
  const emails = [
    ...new Set(attendees.map((a) => a.email.trim().toLowerCase()).filter(Boolean)),
  ]
  const contactIds = [
    ...new Set(attendees.map((a) => a.contact_id).filter(Boolean) as string[]),
  ]

  type ContactRow = {
    hubspot_contact_id: string
    email: string | null
    zone_localite: string | null
    classe_actuelle: string | null
    contact_createdate: string | null
  }

  const byEmail = new Map<string, ContactRow>()
  const byId = new Map<string, ContactRow>()

  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200)
    const { data } = await crmDb
      .from('crm_contacts')
      .select('hubspot_contact_id, email, zone_localite, classe_actuelle, contact_createdate')
      .in('email', chunk)
    for (const c of (data || []) as ContactRow[]) {
      const em = String(c.email || '')
        .trim()
        .toLowerCase()
      if (em) byEmail.set(em, c)
      if (c.hubspot_contact_id) byId.set(c.hubspot_contact_id, c)
    }
  }

  for (let i = 0; i < contactIds.length; i += 200) {
    const chunk = contactIds.slice(i, i + 200)
    const missing = chunk.filter((id) => !byId.has(id))
    if (missing.length === 0) continue
    const { data } = await crmDb
      .from('crm_contacts')
      .select('hubspot_contact_id, email, zone_localite, classe_actuelle, contact_createdate')
      .in('hubspot_contact_id', missing)
    for (const c of (data || []) as ContactRow[]) {
      if (c.hubspot_contact_id) byId.set(c.hubspot_contact_id, c)
      const em = String(c.email || '')
        .trim()
        .toLowerCase()
      if (em && !byEmail.has(em)) byEmail.set(em, c)
    }
  }

  const zoneCounts = new Map<string, number>()
  const classeCounts = new Map<string, number>()
  let newCount = 0
  let existingCount = 0
  let unknownCount = 0
  let matched = 0

  for (const a of attendees) {
    const contact =
      (a.contact_id ? byId.get(a.contact_id) : undefined) ||
      byEmail.get(a.email.trim().toLowerCase())

    if (!contact) {
      unknownCount++
      zoneCounts.set('Non renseigné', (zoneCounts.get('Non renseigné') || 0) + 1)
      classeCounts.set('Non renseigné', (classeCounts.get('Non renseigné') || 0) + 1)
      continue
    }

    matched++
    const zone = labelOrUnknown(contact.zone_localite)
    const classe = labelOrUnknown(contact.classe_actuelle)
    zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + 1)
    classeCounts.set(classe, (classeCounts.get(classe) || 0) + 1)

    const createdMs = contact.contact_createdate
      ? new Date(contact.contact_createdate).getTime()
      : NaN
    const leadMs = a.created_at ? new Date(a.created_at).getTime() : NaN

    if (!Number.isFinite(createdMs) || !Number.isFinite(leadMs)) {
      unknownCount++
      continue
    }

    // Déjà dans le CRM avant cette inscription
    if (createdMs < leadMs - EXISTING_GAP_MS) existingCount++
    else newCount++
  }

  const classified = newCount + existingCount
  return {
    total,
    matched_contacts: matched,
    by_zone: toBuckets(zoneCounts, total),
    by_classe: toBuckets(classeCounts, total),
    novelty: {
      new_count: newCount,
      existing_count: existingCount,
      unknown_count: unknownCount,
      new_pct: classified > 0 ? Math.round((newCount / classified) * 1000) / 10 : 0,
      existing_pct: classified > 0 ? Math.round((existingCount / classified) * 1000) / 10 : 0,
    },
  }
}
