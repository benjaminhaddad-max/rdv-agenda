import { getPublicFormBySlug, type PublicForm } from '@/lib/public-forms'
import { getEventCapacityByFormId } from '@/lib/events-studio/capacity'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventHasComms } from '@/lib/events-studio/config'
import { humanDescription } from '@/lib/events-studio/event-meta'
import type { EventLandingData, EventLandingEvent } from './types'

export type PublicFormPage =
  | { kind: 'missing' }
  | { kind: 'form'; form: PublicForm }
  | { kind: 'landing'; data: EventLandingData }

export async function loadPublicFormPage(slug: string): Promise<PublicFormPage> {
  const form = await getPublicFormBySlug(slug)
  if (!form) return { kind: 'missing' }

  const eventsDb = createEventsClient()
  const { data: link } = await eventsDb
    .from('event_forms')
    .select('event_id')
    .eq('hubspot_form_id', form.id)
    .limit(1)
    .maybeSingle()

  if (!link?.event_id) return { kind: 'form', form }

  const { data: event } = await eventsDb
    .from('events')
    .select(
      'id, name, brand, event_type, event_date, event_time_end, location, description, max_capacity, status',
    )
    .eq('id', link.event_id)
    .maybeSingle()

  if (!event) return { kind: 'form', form }
  if ((event.brand || 'diploma') !== 'diploma') return { kind: 'form', form }

  const cap = await getEventCapacityByFormId(form.id)
  const landingEvent: EventLandingEvent = {
    id: event.id,
    name: event.name,
    brand: event.brand,
    event_type: event.event_type,
    event_date: event.event_date,
    event_time_end: event.event_time_end,
    location: event.location,
    description: humanDescription(event.description) || null,
    max_capacity: event.max_capacity != null ? Number(event.max_capacity) : null,
    status: event.status,
    has_comms: eventHasComms(event),
  }

  return {
    kind: 'landing',
    data: {
      form,
      event: landingEvent,
      capacity: {
        is_full: cap?.is_full ?? false,
        remaining: cap?.remaining ?? null,
        max_capacity: cap?.max_capacity ?? landingEvent.max_capacity,
        registered_count: cap?.registered_count ?? 0,
      },
    },
  }
}
