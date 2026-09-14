/** Sondage créneaux — Salon des études de médecine 2026 (19 sept.). */

import { randomUUID } from 'crypto'
import { createCrmFormForEvent } from '@/lib/events-studio/create-crm-form'
import { createEventsClient } from '@/lib/events-studio/client'
import { SALON_MEDECINE_2026_EVENT_ID } from '@/lib/events-studio/config'
import { formBaseUrl } from '@/lib/form-contact-link'
import { createServiceClient } from '@/lib/supabase'
import { invalidatePublicFormCache } from '@/lib/public-forms'
import type { EventLandingEvent } from '@/lib/event-landing/types'
import type { EventFormFieldInsert } from '@/lib/events-studio/form-template'

export { SALON_MEDECINE_2026_EVENT_ID }

export const TIMESLOT_SURVEY_SLUG = 'salon-etudes-medecine-2026-creneau'
export const TIMESLOT_FIELD_KEY = 'creneau'
export const TIMESLOT_SURVEY_SETTINGS_KEY = 'event_timeslot_surveys'

export const TIMESLOT_SLOTS = [
  { value: '10-12', label: '10h – 12h', hint: 'Matinée' },
  { value: '12-14', label: '12h – 14h', hint: 'Midi' },
  { value: '14-16', label: '14h – 16h', hint: 'Après-midi' },
  { value: '16-18', label: '16h – 18h', hint: 'Fin de journée' },
] as const

export type TimeslotValue = (typeof TIMESLOT_SLOTS)[number]['value']

export type TimeslotSurveyFeedback = {
  id: string
  event_id: string
  body: string
  status: 'open' | 'applied' | 'dismissed'
  created_at: string
  created_by?: string | null
}

type SettingsStore = {
  byEventId: Record<string, { formId: string; slug: string }>
  feedback: TimeslotSurveyFeedback[]
}

export const TIMESLOT_SURVEY_SMS_TEMPLATE =
  '{prenom}, le salon medecine du 19/09 a trop d’inscrits. Choisissez votre creneau (places limitees) : {lien1}'

export function isTimeslotSurveySlug(slug: string | null | undefined): boolean {
  return String(slug || '').trim().toLowerCase() === TIMESLOT_SURVEY_SLUG
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isSalonEtudesMedecineTimeslotEvent(ev: {
  id?: string | null
  name?: string | null
  event_date?: string | null
}): boolean {
  if (ev.id && ev.id === SALON_MEDECINE_2026_EVENT_ID) return true
  const name = norm(ev.name || '')
  if (!/salon/.test(name) || !/etude/.test(name) || !/medecine/.test(name)) return false
  if (!ev.event_date) return true
  const day = new Date(ev.event_date).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  return day === '2026-09-19'
}

export const FALLBACK_SALON_MEDECINE_EVENT: EventLandingEvent = {
  id: SALON_MEDECINE_2026_EVENT_ID,
  name: 'Salon des études de médecine 2026',
  brand: 'diploma',
  event_type: 'salon',
  event_date: '2026-09-19T08:00:00.000Z',
  event_time_end: '18:00',
  location: null,
  description: null,
  max_capacity: null,
  status: 'published',
  has_comms: false,
}

const SURVEY_FIELDS: EventFormFieldInsert[] = [
  {
    order_index: 0,
    field_type: 'text',
    field_key: 'firstname',
    label: 'Prénom',
    placeholder: 'Votre prénom',
    required: true,
    crm_field: 'firstname',
  },
  {
    order_index: 1,
    field_type: 'text',
    field_key: 'lastname',
    label: 'Nom',
    placeholder: 'Votre nom',
    required: true,
    crm_field: 'lastname',
  },
  {
    order_index: 2,
    field_type: 'email',
    field_key: 'email',
    label: 'Email',
    placeholder: 'exemple@mail.fr',
    required: true,
    crm_field: 'email',
  },
  {
    order_index: 3,
    field_type: 'phone',
    field_key: 'phone',
    label: 'Téléphone',
    placeholder: '06 12 34 56 78',
    required: false,
    crm_field: 'phone',
  },
  {
    order_index: 4,
    field_type: 'radio',
    field_key: TIMESLOT_FIELD_KEY,
    label: 'Créneau auquel vous pensez venir',
    required: true,
    crm_field: TIMESLOT_FIELD_KEY,
    options: TIMESLOT_SLOTS.map((s) => ({ value: s.value, label: s.label })),
  },
]

function emptyStore(): SettingsStore {
  return { byEventId: {}, feedback: [] }
}

async function readStore(
  db: ReturnType<typeof createServiceClient>,
): Promise<SettingsStore> {
  const { data, error } = await db
    .from('crm_settings')
    .select('value')
    .eq('key', TIMESLOT_SURVEY_SETTINGS_KEY)
    .maybeSingle()
  if (error || !data?.value || typeof data.value !== 'object') return emptyStore()
  const raw = data.value as Partial<SettingsStore>
  return {
    byEventId:
      raw.byEventId && typeof raw.byEventId === 'object' ? raw.byEventId : {},
    feedback: Array.isArray(raw.feedback) ? raw.feedback : [],
  }
}

async function writeStore(
  db: ReturnType<typeof createServiceClient>,
  store: SettingsStore,
) {
  const { error } = await db.from('crm_settings').upsert(
    {
      key: TIMESLOT_SURVEY_SETTINGS_KEY,
      value: store,
      description: 'Sondage créneaux salons + retours équipe',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) throw new Error(error.message)
}

async function ensureCreneauField(
  db: ReturnType<typeof createServiceClient>,
  formId: string,
) {
  const { data: fields } = await db
    .from('form_fields')
    .select('field_key')
    .eq('form_id', formId)
  const keys = new Set((fields || []).map((f) => String(f.field_key)))
  const missing = SURVEY_FIELDS.filter((f) => !keys.has(f.field_key))
  if (missing.length === 0) return
  await db.from('form_fields').insert(
    missing.map((f) => ({
      form_id: formId,
      order_index: f.order_index,
      field_type: f.field_type,
      field_key: f.field_key,
      label: f.label,
      placeholder: f.placeholder ?? null,
      required: !!f.required,
      crm_field: f.crm_field || null,
      options: f.options ?? null,
    })),
  )
}

export async function ensureTimeslotSurveyForm(): Promise<{ id: string; slug: string }> {
  const db = createServiceClient()
  const { data: existing } = await db
    .from('forms')
    .select('id, slug, status')
    .eq('slug', TIMESLOT_SURVEY_SLUG)
    .maybeSingle()

  if (existing?.id) {
    if (existing.status !== 'published') {
      await db.from('forms').update({ status: 'published' }).eq('id', existing.id)
    }
    await ensureCreneauField(db, existing.id)
    await invalidatePublicFormCache(existing.slug)
    return { id: existing.id, slug: existing.slug }
  }

  const created = await createCrmFormForEvent({
    name: 'Salon études de médecine 2026 — créneau',
    slug: TIMESLOT_SURVEY_SLUG,
    title: 'Choisissez votre créneau',
    subtitle:
      'Les inscriptions sont très nombreuses. Chaque créneau a un nombre de places limité.',
    description: '[timeslot_survey] Salon des études de médecine 2026 — samedi 19 septembre',
    status: 'published',
    folder: 'Diploma Santé',
    fields: SURVEY_FIELDS,
  })

  await db
    .from('forms')
    .update({
      success_message: 'Merci, votre créneau est bien enregistré. À samedi.',
      submit_label: 'Confirmer mon créneau',
      primary_color: '#C9A84C',
      text_color: '#12314d',
    })
    .eq('id', created.id)

  await invalidatePublicFormCache(created.slug)
  return { id: created.id, slug: created.slug }
}

export async function rememberTimeslotSurveyForEvent(eventId: string, form: { id: string; slug: string }) {
  const db = createServiceClient()
  const store = await readStore(db)
  store.byEventId[eventId] = { formId: form.id, slug: form.slug }
  await writeStore(db, store)
}

export async function loadSalonMedecineTimeslotEvent(): Promise<EventLandingEvent> {
  try {
    const eventsDb = createEventsClient()
    const { data } = await eventsDb
      .from('events')
      .select('id, name, brand, event_type, event_date, event_time_end, location, description, max_capacity, status')
      .eq('id', SALON_MEDECINE_2026_EVENT_ID)
      .maybeSingle()
    if (!data) return FALLBACK_SALON_MEDECINE_EVENT
    return {
      id: data.id,
      name: data.name || FALLBACK_SALON_MEDECINE_EVENT.name,
      brand: data.brand || 'diploma',
      event_type: data.event_type || 'salon',
      event_date: data.event_date || FALLBACK_SALON_MEDECINE_EVENT.event_date,
      event_time_end: data.event_time_end || '18:00',
      location: data.location || null,
      description: data.description || null,
      max_capacity: data.max_capacity != null ? Number(data.max_capacity) : null,
      status: data.status || 'published',
      has_comms: false,
    }
  } catch {
    return FALLBACK_SALON_MEDECINE_EVENT
  }
}

export type TimeslotStats = {
  total: number
  unique_contacts: number
  by_slot: Array<{ value: string; label: string; count: number }>
}

function slotLabel(value: string): string {
  return TIMESLOT_SLOTS.find((s) => s.value === value)?.label || value
}

export async function getTimeslotSurveyStats(formId: string): Promise<TimeslotStats> {
  const db = createServiceClient()
  const { data } = await db
    .from('form_submissions')
    .select('data, submitted_at')
    .eq('form_id', formId)
    .neq('status', 'spam')
    .order('submitted_at', { ascending: false })
    .limit(8000)

  const latestByContact = new Map<string, string>()
  for (const row of data || []) {
    const payload = (row.data || {}) as Record<string, unknown>
    const slot = String(payload[TIMESLOT_FIELD_KEY] || '').trim()
    if (!slot) continue
    const contactKey =
      String(payload._contact_id || payload.email || payload.phone || '').trim() ||
      `anon:${row.submitted_at}`
    if (latestByContact.has(contactKey)) continue
    latestByContact.set(contactKey, slot)
  }

  const counts = new Map<string, number>()
  for (const slot of TIMESLOT_SLOTS) counts.set(slot.value, 0)
  for (const slot of latestByContact.values()) {
    counts.set(slot, (counts.get(slot) || 0) + 1)
  }

  return {
    total: (data || []).length,
    unique_contacts: latestByContact.size,
    by_slot: TIMESLOT_SLOTS.map((s) => ({
      value: s.value,
      label: s.label,
      count: counts.get(s.value) || 0,
    })),
  }
}

export async function listTimeslotSurveyFeedback(eventId: string): Promise<TimeslotSurveyFeedback[]> {
  const db = createServiceClient()
  const store = await readStore(db)
  return store.feedback.filter((f) => f.event_id === eventId)
}

export async function addTimeslotSurveyFeedback(
  eventId: string,
  body: string,
  createdBy?: string | null,
): Promise<TimeslotSurveyFeedback> {
  const db = createServiceClient()
  const store = await readStore(db)
  const row: TimeslotSurveyFeedback = {
    id: randomUUID(),
    event_id: eventId,
    body: body.trim(),
    status: 'open',
    created_at: new Date().toISOString(),
    created_by: createdBy || null,
  }
  store.feedback.unshift(row)
  await writeStore(db, store)
  return row
}

export async function setTimeslotSurveyFeedbackStatus(
  eventId: string,
  feedbackId: string,
  status: TimeslotSurveyFeedback['status'],
): Promise<TimeslotSurveyFeedback | null> {
  const db = createServiceClient()
  const store = await readStore(db)
  const row = store.feedback.find((f) => f.id === feedbackId && f.event_id === eventId)
  if (!row) return null
  row.status = status
  await writeStore(db, store)
  return row
}

export function timeslotSurveyPublicUrl(): string {
  return `${formBaseUrl()}/forms/${TIMESLOT_SURVEY_SLUG}`
}

export { slotLabel }
