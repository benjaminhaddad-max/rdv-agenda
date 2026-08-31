/**
 * Dès qu’un lead Meta/CRM tombe sur un formulaire lié à un événement publié,
 * synchronise Events.registrations et envoie les confirmations manquantes.
 */

import { createServiceClient } from '@/lib/supabase'
import { createEventsClient, eventsEdgeUrl, getEventsSupabaseKey } from '@/lib/events-studio/client'
import { eventHasComms } from '@/lib/events-studio/config'
import { syncEventRegistrationsFromSources } from '@/lib/events-studio/sync-attendees'
import { logger } from '@/lib/logger'

async function sendPendingConfirmations(eventId: string): Promise<unknown> {
  const res = await fetch(eventsEdgeUrl('send-pending-confirmations'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getEventsSupabaseKey()}`,
    },
    body: JSON.stringify({ event_id: eventId }),
  })
  return res.json().catch(() => ({ status: res.status }))
}

async function processPublishedEvent(eventId: string): Promise<{
  event_id: string
  sync?: unknown
  send?: unknown
  error?: string
}> {
  const db = createEventsClient()
  const { data: ev } = await db
    .from('events')
    .select('id, status, event_type, brand, zoom_join_url, sms_factor_enabled')
    .eq('id', eventId)
    .maybeSingle()

  if (!ev || ev.status !== 'published') {
    return { event_id: eventId, error: 'not_published' }
  }
  if (!eventHasComms(ev)) {
    return { event_id: eventId, error: 'no_comms' }
  }

  // Garantit l’envoi SMS (confirmations + rappels)
  if (!ev.sms_factor_enabled) {
    await db.from('events').update({ sms_factor_enabled: true }).eq('id', eventId)
  }

  try {
    const sync = await syncEventRegistrationsFromSources(eventId)
    const send = await sendPendingConfirmations(eventId)
    return { event_id: eventId, sync, send }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error('notify-event-comms', e, { event_id: eventId })
    return { event_id: eventId, error: msg }
  }
}

/** Événements liés à un formulaire Meta (par nom / clé meta:…). */
export async function notifyLinkedEventsAfterMetaLead(input: {
  metaFormId?: string | null
  formName?: string | null
}): Promise<{ eventIds: string[]; results: Array<{ event_id: string; sync?: unknown; send?: unknown; error?: string }> }> {
  const crmDb = createServiceClient()
  const eventsDb = createEventsClient()

  const names = new Set<string>()
  if (input.formName?.trim()) names.add(input.formName.trim())

  if (input.metaFormId) {
    const { data: mf } = await crmDb
      .from('meta_lead_forms')
      .select('name')
      .eq('form_id', input.metaFormId)
      .maybeSingle()
    if (mf?.name) names.add(String(mf.name).trim())
  }

  if (names.size === 0) return { eventIds: [], results: [] }

  const nameList = [...names]
  const hubspotKeys = nameList.flatMap((n) => (n.startsWith('meta:') ? [n] : [n, `meta:${n}`]))

  const [{ data: byName }, { data: byKey }] = await Promise.all([
    eventsDb.from('event_forms').select('event_id').in('form_name', nameList),
    eventsDb.from('event_forms').select('event_id').in('hubspot_form_id', hubspotKeys),
  ])

  const eventIds = [
    ...new Set(
      [...(byName || []), ...(byKey || [])]
        .map((r) => r.event_id as string)
        .filter(Boolean),
    ),
  ]

  const results = []
  for (const eventId of eventIds) {
    results.push(await processPublishedEvent(eventId))
  }
  return { eventIds, results }
}

/** Événements liés à un formulaire CRM hub. */
export async function notifyLinkedEventsAfterCrmForm(
  formId: string,
): Promise<{ eventIds: string[]; results: Array<{ event_id: string; sync?: unknown; send?: unknown; error?: string }> }> {
  if (!formId) return { eventIds: [], results: [] }
  const eventsDb = createEventsClient()
  const { data: links } = await eventsDb
    .from('event_forms')
    .select('event_id')
    .eq('hubspot_form_id', formId)

  const eventIds = [...new Set((links || []).map((r) => r.event_id as string).filter(Boolean))]
  const results = []
  for (const eventId of eventIds) {
    results.push(await processPublishedEvent(eventId))
  }
  return { eventIds, results }
}
