import type { EventCapacityView, EventDateFormat, EventLandingEvent, LandingKind } from './types'
import { prettyLocation } from './format'

export function buildEventJsonLd(opts: {
  event: EventLandingEvent
  fmt: EventDateFormat
  kind: LandingKind
  capacity: EventCapacityView
  url: string
}): Record<string, unknown> {
  const { event, fmt, kind, capacity, url } = opts
  const isOnline = kind === 'webinaire'
  const location = isOnline
    ? { '@type': 'VirtualLocation', url }
    : {
        '@type': 'Place',
        name: prettyLocation(event.location) || 'Diploma Santé',
        address: prettyLocation(event.location) || 'Paris, France',
      }

  let availability = 'https://schema.org/InStock'
  if (event.status === 'cancelled') availability = 'https://schema.org/SoldOut'
  else if (capacity.is_full) availability = 'https://schema.org/SoldOut'

  return {
    '@context': 'https://schema.org',
    '@type': 'EducationEvent',
    name: event.name,
    description: event.description || undefined,
    startDate: event.event_date,
    endDate: fmt.endIso,
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus:
      event.status === 'cancelled'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    location,
    image: 'https://hub.diploma-sante.fr/event-landing/logo-diploma-bleu.svg',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability,
      url,
    },
    organizer: {
      '@type': 'EducationalOrganization',
      name: 'Diploma Santé',
      url: 'https://diploma-sante.fr',
    },
  }
}
