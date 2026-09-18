import { getPublicFormBySlug, type PublicForm } from '@/lib/public-forms'
import { getEventCapacityByFormId } from '@/lib/events-studio/capacity'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventHasComms, eventOffersPublicInscriptionPage } from '@/lib/events-studio/config'
import { humanDescription } from '@/lib/events-studio/event-meta'
import type { EventLandingData, EventLandingEvent } from './types'
import {
  ensureTimeslotSurveyForm,
  getTimeslotSurveyCopy,
  isTimeslotSurveySlug,
  loadSalonMedecineTimeslotEvent,
  type TimeslotSurveyCopy,
} from '@/lib/event-timeslot-survey'

export type PublicFormPage =
  | { kind: 'missing' }
  | { kind: 'form'; form: PublicForm }
  | { kind: 'landing'; data: EventLandingData }
  | { kind: 'timeslot_survey'; form: PublicForm; event: EventLandingEvent; copy: TimeslotSurveyCopy }
  /** Formulaire lié à un salon externe : pas d’inscription publique. */
  | { kind: 'no_public_inscription'; form: PublicForm; eventName: string }

export async function loadPublicFormPage(slug: string): Promise<PublicFormPage> {
  if (isTimeslotSurveySlug(slug)) {
    try {
      await ensureTimeslotSurveyForm()
    } catch {
      /* le formulaire sera 404 si la création échoue */
    }
  }

  const form = await getPublicFormBySlug(slug)
  if (!form) return { kind: 'missing' }

  if (isTimeslotSurveySlug(form.slug)) {
    const [event, copy] = await Promise.all([loadSalonMedecineTimeslotEvent(), getTimeslotSurveyCopy()])
    return { kind: 'timeslot_survey', form, event, copy }
  }

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
  // Salons externes : pas de page d’inscription publique (on n’organise pas le salon).
  if (!eventOffersPublicInscriptionPage(event)) {
    return { kind: 'no_public_inscription', form, eventName: event.name || form.title || 'Salon' }
  }

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
