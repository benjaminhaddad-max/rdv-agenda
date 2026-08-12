/** Config Events Studio — marques, types, campuses. */

export type EventBrand = 'diploma' | 'medibox' | 'edumove'
export type EventTypeId = 'jpo' | 'salon' | 'webinaire' | 'autre'

export type BrandConfig = {
  id: EventBrand
  name: string
  folder: string
  logo: string | null
  defaultZoom?: string
}

export type EventTypeConfig = {
  id: EventTypeId
  label: string
  short: string
  article: string
  physical: boolean
  staff: boolean
  comms: boolean
  checkin: boolean
  autoCrmForm: boolean
  brands?: EventBrand[]
  desc: string
}

export const BRAND_CONFIG: Record<EventBrand, BrandConfig> = {
  diploma: {
    id: 'diploma',
    name: 'Diploma Santé',
    folder: 'Diploma Santé',
    logo: 'https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png',
  },
  medibox: {
    id: 'medibox',
    name: 'Medibox',
    folder: 'Medibox',
    logo: null,
  },
  edumove: {
    id: 'edumove',
    name: 'Edumove',
    folder: 'Edumove',
    logo: 'https://www.edumove.fr/edumove-logo.svg',
    defaultZoom: 'https://us02web.zoom.us/j/83013598154',
  },
}

export const EVENT_TYPES: Record<EventTypeId, EventTypeConfig> = {
  jpo: {
    id: 'jpo',
    label: 'Journée Portes Ouvertes',
    short: 'JPO',
    article: 'la',
    physical: true,
    staff: true,
    comms: true,
    checkin: true,
    autoCrmForm: true,
    desc: 'Accueil sur site — QR codes, emails & SMS, équipe staff',
  },
  salon: {
    id: 'salon',
    label: 'Salon',
    short: 'Salon',
    article: 'le',
    physical: true,
    staff: true,
    brands: ['diploma'],
    comms: false,
    checkin: false,
    autoCrmForm: true,
    desc: 'Collecte de leads sur stand — formulaire CRM, aucun email ni SMS',
  },
  webinaire: {
    id: 'webinaire',
    label: 'Webinaire',
    short: 'Webinaire',
    article: 'le',
    physical: false,
    staff: false,
    comms: true,
    checkin: false,
    autoCrmForm: true,
    desc: 'En ligne via Zoom — rappels email & SMS',
  },
  autre: {
    id: 'autre',
    label: 'Autre événement',
    short: 'Événement',
    article: "l'",
    physical: true,
    staff: false,
    comms: true,
    checkin: true,
    autoCrmForm: true,
    desc: 'Format libre',
  },
}

export const DIPLOMA_CAMPUSES = [
  { value: '100 quai de la Rapee, 75012 Paris', label: '100 quai de la Rapée — Paris 12e' },
  { value: '85 avenue Ledru Rollin, 75012 Paris', label: '85 avenue Ledru Rollin — Paris 12e' },
  { value: '29 rue Lauriston, 75016 Paris', label: '29 rue Lauriston — Paris 16e' },
]

export function brandEventTypes(brand: EventBrand): EventTypeId[] {
  const order: EventTypeId[] =
    brand === 'diploma'
      ? ['jpo', 'salon', 'webinaire']
      : brand === 'edumove'
        ? ['webinaire']
        : ['jpo', 'webinaire']
  return order.filter((t) => {
    const cfg = EVENT_TYPES[t]
    return !cfg.brands || cfg.brands.includes(brand)
  })
}

export function eventHasComms(evOrType: string | { event_type?: string | null; brand?: string | null; zoom_join_url?: string | null }): boolean {
  if (!evOrType) return true
  if (typeof evOrType === 'string') return !!(EVENT_TYPES[evOrType as EventTypeId] || EVENT_TYPES.autre).comms
  return !!eventTypeOf(evOrType).comms
}

export function isWebinarEvent(ev: { event_type?: string | null; brand?: string | null; zoom_join_url?: string | null }): boolean {
  if (ev.event_type) return ev.event_type === 'webinaire'
  return ev.brand === 'edumove' || !!ev.zoom_join_url
}

export function eventTypeOf(ev: { event_type?: string | null; brand?: string | null; zoom_join_url?: string | null }): EventTypeConfig {
  if (ev.event_type && EVENT_TYPES[ev.event_type as EventTypeId]) {
    return EVENT_TYPES[ev.event_type as EventTypeId]
  }
  return isWebinarEvent(ev) ? EVENT_TYPES.webinaire : EVENT_TYPES.autre
}

export function staffPublicUrl(eventId: string, origin = 'https://hub.diploma-sante.fr'): string {
  return `${origin}/events-studio/?staff=${eventId}`
}

export function planningPublicUrl(year?: number, origin = 'https://hub.diploma-sante.fr'): string {
  const y = year || new Date().getFullYear()
  return `${origin}/events-studio/?planning=diploma&year=${y}`
}

export const EVENTS_SUPABASE_URL_DEFAULT = 'https://jhopwqpbaiyjfoggvcaf.supabase.co'
