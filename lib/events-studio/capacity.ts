import { createServiceClient } from '@/lib/supabase'
import { createEventsClient } from '@/lib/events-studio/client'

export type EventCapacityInfo = {
  event_id: string
  max_capacity: number | null
  registered_count: number
  remaining: number | null
  is_full: boolean
}

/** Compte les inscriptions salon via soumissions du formulaire CRM lié. */
export async function getEventCapacityByFormId(
  formId: string,
): Promise<EventCapacityInfo | null> {
  const eventsDb = createEventsClient()
  const crmDb = createServiceClient()

  const { data: link } = await eventsDb
    .from('event_forms')
    .select('event_id')
    .eq('hubspot_form_id', formId)
    .eq('form_type', 'crm')
    .limit(1)
    .maybeSingle()

  if (!link?.event_id) return null

  const { data: event } = await eventsDb
    .from('events')
    .select('id, max_capacity, event_type, status')
    .eq('id', link.event_id)
    .single()

  if (!event) return null

  const { count } = await crmDb
    .from('form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', formId)

  const registered = count || 0
  const max = event.max_capacity != null ? Number(event.max_capacity) : null
  const remaining = max != null ? Math.max(0, max - registered) : null
  const is_full = max != null && registered >= max

  return {
    event_id: event.id,
    max_capacity: max,
    registered_count: registered,
    remaining,
    is_full,
  }
}

export async function getSalonCapacitySnapshot(eventId: string): Promise<{
  registered_count: number
  max_capacity: number | null
  remaining: number | null
  is_full: boolean
  form_id: string | null
  form_slug: string | null
  public_url: string | null
}> {
  const eventsDb = createEventsClient()
  const crmDb = createServiceClient()

  const { data: event } = await eventsDb
    .from('events')
    .select('id, max_capacity')
    .eq('id', eventId)
    .single()

  const { data: link } = await eventsDb
    .from('event_forms')
    .select('hubspot_form_id')
    .eq('event_id', eventId)
    .eq('form_type', 'crm')
    .limit(1)
    .maybeSingle()

  let registered = 0
  let slug: string | null = null
  if (link?.hubspot_form_id) {
    const { count } = await crmDb
      .from('form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', link.hubspot_form_id)
    registered = count || 0
    const { data: form } = await crmDb
      .from('forms')
      .select('slug')
      .eq('id', link.hubspot_form_id)
      .maybeSingle()
    slug = form?.slug || null
  }

  const max = event?.max_capacity != null ? Number(event.max_capacity) : null
  const remaining = max != null ? Math.max(0, max - registered) : null

  return {
    registered_count: registered,
    max_capacity: max,
    remaining,
    is_full: max != null && registered >= max,
    form_id: link?.hubspot_form_id || null,
    form_slug: slug,
    public_url: slug ? `https://hub.diploma-sante.fr/forms/${slug}` : null,
  }
}
