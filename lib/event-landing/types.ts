import type { PublicForm } from '@/lib/public-forms'

export type LandingKind = 'immersion' | 'jpo' | 'salon' | 'webinaire'

export type EventLandingEvent = {
  id: string
  name: string
  brand: string | null
  event_type: string | null
  event_date: string
  event_time_end: string | null
  location: string | null
  description: string | null
  max_capacity: number | null
  status: string
  has_comms: boolean
}

export type EventCapacityView = {
  is_full: boolean
  remaining: number | null
  max_capacity: number | null
  registered_count: number
}

export type EventDateFormat = {
  jour: string
  mois: string
  weekday: string
  dateLongue: string
  horaires: string
  timeStart: string
  timeEnd: string | null
  startIso: string
  endIso: string
}

export type LandingCopy = {
  kind: LandingKind
  breadcrumb: string
  heroTitle: string
  heroAccent: string | null
  chapeaux: string[]
  badges: string[]
  whyTitle: string
  whyAccent: string
  whyLead: string
  avantages: Array<{ title: string; text: string }>
  derouleTitle: string
  derouleAccent: string
  derouleLead: string
  deroule: Array<{ time: string; title: string; text: string }>
  aPrevoir: string[]
  temoinsTitle: string
  temoinsAccent: string
  temoinsLead: string
  temoins: Array<{ name: string; role: string; photo: string; quote: string }>
  tarif: string
  acces: string
  faq: Array<{ q: string; a: string }>
  ctaKicker: string
  ctaTitle: string
  ctaAccent: string
  ctaLead: string
  ctaLabel: string
  formKicker: string
  formTitle: string
  formSuccessTitle: string
  formSuccessText: string
}

export type EventLandingData = {
  form: PublicForm
  event: EventLandingEvent
  capacity: EventCapacityView
}