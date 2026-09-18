/** Sondage créneaux — Salon des études de médecine 2026 (19 sept.). */

import { randomUUID } from 'crypto'
import { createCrmFormForEvent } from '@/lib/events-studio/create-crm-form'
import { createEventsClient } from '@/lib/events-studio/client'
import { SALON_MEDECINE_2026_EVENT_ID } from '@/lib/events-studio/config'
import { formBaseUrl } from '@/lib/form-contact-link'
import { formatPhoneForSms } from '@/lib/smsfactor'
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
  byEventId: Record<string, { formId: string; slug: string; campaignId?: string }>
  feedback: TimeslotSurveyFeedback[]
  copy?: TimeslotSurveyCopy
  capacities?: TimeslotCapacities
  campaignId?: string
  relance?: TimeslotRelance
  drip?: TimeslotDrip
  jourJ?: TimeslotJourJ
}

/**
 * Phrases injectées dans les rappels du jour J (SMS et email de 8h) via
 * {creneau_phrase}. Deux cas : la personne a choisi son créneau, ou pas.
 */
export type TimeslotJourJ = {
  smsAvecCreneau: string
  smsSansCreneau: string
  emailAvecCreneau: string
  emailSansCreneau: string
}

/**
 * Envoi automatique aux nouveaux inscrits, quelques minutes après leur
 * inscription. Le texte bascule tout seul de « demain » à « aujourd'hui » le
 * jour du salon.
 */
export type TimeslotDrip = {
  enabled: boolean
  /** Seules les inscriptions postérieures à cette date sont concernées. */
  cutoffAt: string
  delayMinutes: number
  smsDemain: string
  smsAujourdhui: string
  /** Au-delà de ce délai sans fiche CRM, on envoie le lien non pré-rempli. */
  fallbackAfterMinutes: number
  campaignId?: string
}

/**
 * Relance des non-répondants. L'audience n'est PAS figée ici : elle est
 * recalculée à chaque passage du cron, pour ne jamais relancer quelqu'un qui a
 * répondu entre la programmation et l'envoi.
 */
export type TimeslotRelance = {
  /** ISO. Aucun envoi avant cette date. */
  scheduledAt: string
  sms: string
  /** Campagne SMS créée au premier lot, pour le suivi et les stats. */
  campaignId?: string
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled'
  startedAt?: string
  finishedAt?: string
}

/**
 * Avec accents : le SMS passe en UCS-2 (70 car. / SMS, puis 67).
 * Accepte volontairement plusieurs segments pour rester lisible.
 */
export const TIMESLOT_SURVEY_SMS_TEMPLATE =
  "{prenom}, confirmez votre participation au salon de demain en choisissant votre créneau ! Action obligatoire pour accéder au salon, sinon l'entrée vous sera refusée. Places limitées : {lien1}"

/** Variantes proposees dans la fiche evenement, a un clic. */
export const TIMESLOT_SURVEY_SMS_VARIANTS: Array<{ id: string; label: string; text: string }> = [
  {
    id: 'confirmer',
    label: 'Confirmer (recommandé)',
    text: TIMESLOT_SURVEY_SMS_TEMPLATE,
  },
  {
    id: 'refusee',
    label: 'Entrée refusée',
    text: "{prenom}, confirmez votre venue au salon de demain : choisissez votre créneau ! Action obligatoire, sinon l'entrée vous sera refusée : {lien1}",
  },
  {
    id: 'court',
    label: 'Plus court',
    text: "{prenom}, confirmez votre participation au salon de demain en choisissant votre créneau ! Action obligatoire pour y accéder : {lien1}",
  },
]

export type TimeslotSurveyCopy = {
  title: string
  intro: string
  note: string
  sms: string
  success: string
}

export const DEFAULT_TIMESLOT_COPY: TimeslotSurveyCopy = {
  title: 'Choisissez votre créneau',
  intro:
    'Le choix du créneau est obligatoire pour accéder au salon. Sans créneau, vous ne pourrez pas entrer.',
  note: 'Les places sont limitées par créneau.',
  sms: TIMESLOT_SURVEY_SMS_TEMPLATE,
  success: 'Merci, votre créneau est bien enregistré. À samedi.',
}

export type TimeslotCapacities = Record<string, number | null>

const SUPERSEDED_SMS = new Set([
  '{prenom}, le salon medecine du 19/09 a trop d’inscrits. Choisissez votre creneau (places limitees) : {lien1}',
  "{prenom}, c'est demain ! Salon des etudes de medecine Diploma Sante. Confirmez votre venue en choisissant votre creneau, places limitees : {lien1}",
  '{prenom}, salon medecine Diploma Sante demain. Le choix du creneau est obligatoire pour participer, places limitees : {lien1}',
  "{prenom}, on vous attend demain au Salon des etudes de medecine Diploma Sante ! Dites-nous votre creneau, places limitees : {lien1}",
  "{prenom}, derniere etape avant le salon medecine de demain : choisissez votre creneau d'arrivee, places limitees : {lien1}",
  "{prenom}, le salon des etudes de medecine Diploma Sante, c'est demain. Pour y acceder, vous devez obligatoirement choisir votre creneau. Sans ce choix, pas d'acces au salon. Places limitees : {lien1}",
  "{prenom}, salon medecine Diploma Sante demain. Attention : sans choix de creneau, vous n'aurez pas acces au salon. Choisissez-le obligatoirement ici, places limitees : {lien1}",
  "{prenom}, c'est demain : salon des etudes de medecine Diploma Sante. Le creneau est obligatoire, sinon pas d'entree. Choisissez le votre : {lien1}",
  "{prenom}, confirmez votre participation au salon de demain en choisissant votre creneau ! Action obligatoire pour acceder au salon, sinon pas d'entree. Places limitees : {lien1}",
  "{prenom}, confirmez votre venue au salon de demain : choisissez votre creneau ! Action obligatoire, sans creneau pas d'acces au salon : {lien1}",
  "{prenom}, confirmez votre participation au salon de demain en choisissant votre creneau ! Action obligatoire pour y acceder : {lien1}",
])

const SUPERSEDED_INTRO = new Set([
  'Les inscriptions au salon sont très nombreuses. Pour vous accueillir correctement, dites-nous à quelle heure vous pensez venir.',
])

export function normalizeTimeslotCopy(raw?: Partial<TimeslotSurveyCopy> | null): TimeslotSurveyCopy {
  const sms = String(raw?.sms || '').trim()
  const intro = String(raw?.intro || '').trim()
  return {
    title: String(raw?.title || '').trim() || DEFAULT_TIMESLOT_COPY.title,
    intro: !intro || SUPERSEDED_INTRO.has(intro) ? DEFAULT_TIMESLOT_COPY.intro : intro,
    note: String(raw?.note || '').trim() || DEFAULT_TIMESLOT_COPY.note,
    sms: !sms || SUPERSEDED_SMS.has(sms) ? DEFAULT_TIMESLOT_COPY.sms : sms,
    success: String(raw?.success || '').trim() || DEFAULT_TIMESLOT_COPY.success,
  }
}

export function normalizeTimeslotCapacities(raw?: TimeslotCapacities | null): TimeslotCapacities {
  const out: TimeslotCapacities = {}
  for (const slot of TIMESLOT_SLOTS) {
    const n = raw?.[slot.value]
    const places = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
    out[slot.value] = places && places > 0 ? places : null
  }
  return out
}

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
  return { byEventId: {}, feedback: [], copy: DEFAULT_TIMESLOT_COPY, capacities: normalizeTimeslotCapacities() }
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
    copy: raw.copy && typeof raw.copy === 'object' ? normalizeTimeslotCopy(raw.copy) : DEFAULT_TIMESLOT_COPY,
    capacities: normalizeTimeslotCapacities(raw.capacities),
    campaignId: typeof raw.campaignId === 'string' ? raw.campaignId : undefined,
    relance: raw.relance && typeof raw.relance === 'object' ? (raw.relance as TimeslotRelance) : undefined,
    drip: raw.drip && typeof raw.drip === 'object' ? (raw.drip as TimeslotDrip) : undefined,
    jourJ: raw.jourJ && typeof raw.jourJ === 'object' ? (raw.jourJ as TimeslotJourJ) : undefined,
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
  store.byEventId[eventId] = {
    ...(store.byEventId[eventId] || {}),
    formId: form.id,
    slug: form.slug,
  }
  await writeStore(db, store)
}

export async function getTimeslotSurveyCopy(): Promise<TimeslotSurveyCopy> {
  const db = createServiceClient()
  const store = await readStore(db)
  return normalizeTimeslotCopy(store.copy)
}

export async function getTimeslotSurveyCapacities(): Promise<TimeslotCapacities> {
  const db = createServiceClient()
  const store = await readStore(db)
  return normalizeTimeslotCapacities(store.capacities)
}

export async function saveTimeslotSurveySettings(input: {
  copy?: Partial<TimeslotSurveyCopy>
  capacities?: TimeslotCapacities
}): Promise<{ copy: TimeslotSurveyCopy; capacities: TimeslotCapacities }> {
  const db = createServiceClient()
  const store = await readStore(db)
  if (input.copy) store.copy = normalizeTimeslotCopy({ ...store.copy, ...input.copy })
  if (input.capacities) store.capacities = normalizeTimeslotCapacities(input.capacities)
  await writeStore(db, store)

  const copy = normalizeTimeslotCopy(store.copy)
  const form = await ensureTimeslotSurveyForm()
  await db
    .from('forms')
    .update({
      title: copy.title,
      subtitle: copy.intro,
      success_message: copy.success,
    })
    .eq('id', form.id)
  await invalidatePublicFormCache(form.slug)
  return { copy, capacities: normalizeTimeslotCapacities(store.capacities) }
}

export async function rememberTimeslotSurveyCampaign(campaignId: string) {
  const db = createServiceClient()
  const store = await readStore(db)
  store.campaignId = campaignId
  await writeStore(db, store)
}

export async function getTimeslotSurveyCampaignId(): Promise<string | null> {
  const db = createServiceClient()
  const store = await readStore(db)
  return store.campaignId || null
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
  by_slot: Array<{
    value: string
    label: string
    count: number
    places: number | null
    remaining: number | null
  }>
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

  const capacities = await getTimeslotSurveyCapacities()

  return {
    total: (data || []).length,
    unique_contacts: latestByContact.size,
    by_slot: TIMESLOT_SLOTS.map((s) => {
      const count = counts.get(s.value) || 0
      const places = capacities[s.value] ?? null
      return {
        value: s.value,
        label: s.label,
        count,
        places,
        remaining: places == null ? null : places - count,
      }
    }),
  }
}

export type TimeslotSurveyAudience = {
  /** Préinscrits du salon (table registrations). */
  registrations: number
  /** Contacts CRM retrouvés ET joignables par SMS. */
  ready: number
  /** Préinscrits sans fiche CRM correspondante. */
  unmatched: number
  /** Fiches CRM trouvées mais sans numéro exploitable. */
  no_phone: number
  contact_ids: string[]
}

function phoneVariants(raw: string | null | undefined): string[] {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 9) return []
  const last9 = digits.slice(-9)
  return [`+33${last9}`, `0${last9}`, `0033${last9}`, `33${last9}`]
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/**
 * Audience du SMS : les préinscrits du salon, rattachés à leur fiche CRM par
 * email puis par téléphone. On renvoie des hubspot_contact_id (et pas des
 * numéros bruts) car c'est ce qui permet de signer un lien unique par contact.
 */
export async function resolveTimeslotSurveyAudience(): Promise<TimeslotSurveyAudience> {
  const eventsDb = createEventsClient()
  const regs: Array<{ email: string | null; phone: string | null }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await eventsDb
      .from('registrations')
      .select('email, phone')
      .eq('event_id', SALON_MEDECINE_2026_EVENT_ID)
      .range(from, from + 999)
    if (error) break
    regs.push(...((data || []) as Array<{ email: string | null; phone: string | null }>))
    if (!data || data.length < 1000) break
  }

  const db = createServiceClient()
  const byEmail = new Map<string, { id: string; phone: string | null }>()
  const emails = [...new Set(regs.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean))]
  for (const part of chunk(emails, 300)) {
    const { data } = await db.from('crm_contacts').select('hubspot_contact_id, email, phone').in('email', part)
    for (const row of data || []) {
      const key = String(row.email || '').trim().toLowerCase()
      if (key && row.hubspot_contact_id) byEmail.set(key, { id: String(row.hubspot_contact_id), phone: row.phone })
    }
  }

  const pendingPhones = regs
    .filter((r) => !byEmail.has(String(r.email || '').trim().toLowerCase()))
    .flatMap((r) => phoneVariants(r.phone))
  const byPhone = new Map<string, { id: string; phone: string | null }>()
  for (const part of chunk([...new Set(pendingPhones)], 300)) {
    const { data } = await db.from('crm_contacts').select('hubspot_contact_id, phone').in('phone', part)
    for (const row of data || []) {
      const digits = String(row.phone || '').replace(/\D/g, '')
      if (digits.length >= 9 && row.hubspot_contact_id) {
        byPhone.set(digits.slice(-9), { id: String(row.hubspot_contact_id), phone: row.phone })
      }
    }
  }

  const ready = new Set<string>()
  let unmatched = 0
  let noPhone = 0
  for (const reg of regs) {
    const email = String(reg.email || '').trim().toLowerCase()
    const digits = String(reg.phone || '').replace(/\D/g, '')
    const match = byEmail.get(email) || (digits.length >= 9 ? byPhone.get(digits.slice(-9)) : undefined)
    if (!match) {
      unmatched += 1
      continue
    }
    if (ready.has(match.id)) continue
    if (!formatPhoneForSms(String(match.phone || reg.phone || ''))) {
      noPhone += 1
      continue
    }
    ready.add(match.id)
  }

  return {
    registrations: regs.length,
    ready: ready.size,
    unmatched,
    no_phone: noPhone,
    contact_ids: [...ready],
  }
}

export const TIMESLOT_RELANCE_SMS_TEMPLATE =
  "{prenom}, dernière chance ! Choisissez votre créneau pour le salon de demain, sinon l'entrée vous sera refusée. Confirmez vite votre présence : {lien1}"

export async function getTimeslotRelance(): Promise<TimeslotRelance | null> {
  const db = createServiceClient()
  const store = await readStore(db)
  return store.relance || null
}

export async function saveTimeslotRelance(patch: Partial<TimeslotRelance>): Promise<TimeslotRelance> {
  const db = createServiceClient()
  const store = await readStore(db)
  const next: TimeslotRelance = {
    scheduledAt: patch.scheduledAt ?? store.relance?.scheduledAt ?? new Date().toISOString(),
    sms: (patch.sms ?? store.relance?.sms ?? TIMESLOT_RELANCE_SMS_TEMPLATE).trim(),
    campaignId: patch.campaignId ?? store.relance?.campaignId,
    status: patch.status ?? store.relance?.status ?? 'scheduled',
    startedAt: patch.startedAt ?? store.relance?.startedAt,
    finishedAt: patch.finishedAt ?? store.relance?.finishedAt,
  }
  store.relance = next
  await writeStore(db, store)
  return next
}

/** hubspot_contact_id de tous ceux qui ont déjà répondu au sondage. */
export async function listTimeslotResponders(formId: string): Promise<Set<string>> {
  const db = createServiceClient()
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('form_submissions')
      .select('data')
      .eq('form_id', formId)
      .neq('status', 'spam')
      .range(from, from + 999)
    if (error) break
    for (const row of data || []) {
      const payload = (row.data || {}) as Record<string, unknown>
      if (!String(payload[TIMESLOT_FIELD_KEY] || '').trim()) continue
      const cid = String(payload._contact_id || '').trim()
      if (cid) out.add(cid)
    }
    if (!data || data.length < 1000) break
  }
  return out
}

export type RelanceTarget = { contactId: string; phone: string; firstname: string | null }

/**
 * Cible de la relance, recalculée à chaud : a bien reçu le premier SMS, n'a pas
 * encore choisi son créneau, et n'a pas déjà été relancé.
 */
export async function resolveTimeslotRelanceTargets(input: {
  originCampaignId: string
  relanceCampaignId?: string | null
  formId: string
}): Promise<RelanceTarget[]> {
  const db = createServiceClient()

  const received = new Map<string, { phone: string; firstname: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('sms_campaign_recipients')
      .select('hubspot_contact_id, phone, firstname, status')
      .eq('campaign_id', input.originCampaignId)
      .eq('status', 'sent')
      .range(from, from + 999)
    if (error) break
    for (const row of data || []) {
      const cid = String(row.hubspot_contact_id || '').trim()
      if (cid && row.phone) received.set(cid, { phone: String(row.phone), firstname: row.firstname ?? null })
    }
    if (!data || data.length < 1000) break
  }

  const responders = await listTimeslotResponders(input.formId)

  const alreadyRelanced = new Set<string>()
  if (input.relanceCampaignId) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from('sms_campaign_recipients')
        .select('hubspot_contact_id')
        .eq('campaign_id', input.relanceCampaignId)
        .range(from, from + 999)
      if (error) break
      for (const row of data || []) {
        const cid = String(row.hubspot_contact_id || '').trim()
        if (cid) alreadyRelanced.add(cid)
      }
      if (!data || data.length < 1000) break
    }
  }

  const out: RelanceTarget[] = []
  for (const [contactId, info] of received) {
    if (responders.has(contactId)) continue
    if (alreadyRelanced.has(contactId)) continue
    out.push({ contactId, phone: info.phone, firstname: info.firstname })
  }
  return out
}

export const TIMESLOT_DRIP_SMS_DEMAIN = TIMESLOT_SURVEY_SMS_TEMPLATE

export const TIMESLOT_DRIP_SMS_AUJOURDHUI =
  "{prenom}, le salon des études de médecine c'est aujourd'hui ! Confirmez votre présence en précisant votre créneau d'arrivée, c'est obligatoire pour accéder au salon : {lien1}"

export async function getTimeslotDrip(): Promise<TimeslotDrip | null> {
  const db = createServiceClient()
  const store = await readStore(db)
  return store.drip || null
}

export async function saveTimeslotDrip(patch: Partial<TimeslotDrip>): Promise<TimeslotDrip> {
  const db = createServiceClient()
  const store = await readStore(db)
  const next: TimeslotDrip = {
    enabled: patch.enabled ?? store.drip?.enabled ?? true,
    cutoffAt: patch.cutoffAt ?? store.drip?.cutoffAt ?? new Date().toISOString(),
    delayMinutes: patch.delayMinutes ?? store.drip?.delayMinutes ?? 5,
    smsDemain: (patch.smsDemain ?? store.drip?.smsDemain ?? TIMESLOT_DRIP_SMS_DEMAIN).trim(),
    smsAujourdhui: (patch.smsAujourdhui ?? store.drip?.smsAujourdhui ?? TIMESLOT_DRIP_SMS_AUJOURDHUI).trim(),
    fallbackAfterMinutes: patch.fallbackAfterMinutes ?? store.drip?.fallbackAfterMinutes ?? 30,
    campaignId: patch.campaignId ?? store.drip?.campaignId,
  }
  store.drip = next
  await writeStore(db, store)
  return next
}

/** Date du salon des études de médecine (samedi 19 septembre 2026). */
export const SALON_MEDECINE_2026_DATE = '2026-09-19'

/** true le jour même du salon, en heure de Paris. */
export function isSalonDay(now = new Date(), eventDate = SALON_MEDECINE_2026_DATE): boolean {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }) === eventDate
}

export type DripTarget = {
  registrationId: string
  contactId: string | null
  phone: string
  firstname: string | null
  lastname: string | null
  email: string | null
  registeredAt: string
  /** true si on a attendu trop longtemps une fiche CRM : lien non pré-rempli. */
  fallback: boolean
}

/**
 * Nouveaux inscrits à notifier : inscrits après le cutoff, passé le délai,
 * jamais notifiés, et qui n'ont pas déjà choisi leur créneau.
 */
export async function resolveTimeslotDripTargets(input: {
  drip: TimeslotDrip
  formId: string
  /** Campagnes déjà envoyées : personne n'y figurant ne sera re-textée. */
  alreadySentCampaignIds?: (string | null | undefined)[]
  now?: Date
}): Promise<DripTarget[]> {
  const now = input.now ?? new Date()
  const readyBefore = new Date(now.getTime() - input.drip.delayMinutes * 60_000).toISOString()

  const eventsDb = createEventsClient()
  const { data: regs } = await eventsDb
    .from('registrations')
    .select('id, email, phone, first_name, last_name, hubspot_contact_id, registered_at')
    .eq('event_id', SALON_MEDECINE_2026_EVENT_ID)
    .gt('registered_at', input.drip.cutoffAt)
    .lte('registered_at', readyBefore)
    .order('registered_at', { ascending: true })
    .limit(2000)
  if (!regs || regs.length === 0) return []

  const db = createServiceClient()

  // Déjà notifiés : une ligne destinataire existe pour eux, que ce soit sur
  // l'envoi auto, la campagne de masse ou la relance.
  const notified = new Set<string>()
  const campaignIds = [input.drip.campaignId, ...(input.alreadySentCampaignIds || [])].filter(
    (id): id is string => Boolean(id),
  )
  for (const campaignId of [...new Set(campaignIds)]) {
    const { data } = await db
      .from('sms_campaign_recipients')
      .select('hubspot_contact_id, phone')
      .eq('campaign_id', campaignId)
      .limit(5000)
    for (const row of data || []) {
      if (row.hubspot_contact_id) notified.add(`cid:${row.hubspot_contact_id}`)
      if (row.phone) notified.add(`tel:${String(row.phone).replace(/\D/g, '').slice(-9)}`)
    }
  }

  const responders = await listTimeslotResponders(input.formId)

  // Rattachement CRM : id porté par l'inscription, sinon email, sinon téléphone.
  const emails = [...new Set(regs.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean))]
  const byEmail = new Map<string, { id: string; phone: string | null; firstname: string | null; lastname: string | null }>()
  for (const part of chunk(emails, 300)) {
    const { data } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, email, phone, firstname, lastname')
      .in('email', part)
    for (const row of data || []) {
      const key = String(row.email || '').trim().toLowerCase()
      if (key && row.hubspot_contact_id) {
        byEmail.set(key, {
          id: String(row.hubspot_contact_id),
          phone: row.phone,
          firstname: row.firstname,
          lastname: row.lastname,
        })
      }
    }
  }

  const out: DripTarget[] = []
  for (const reg of regs) {
    const phone = String(reg.phone || '').trim()
    if (!formatPhoneForSms(phone)) continue

    const last9 = phone.replace(/\D/g, '').slice(-9)
    const email = String(reg.email || '').trim().toLowerCase()
    const match = byEmail.get(email)
    const contactId = String(reg.hubspot_contact_id || '').trim() || match?.id || null

    if (contactId && responders.has(contactId)) continue
    if (contactId && notified.has(`cid:${contactId}`)) continue
    if (last9 && notified.has(`tel:${last9}`)) continue

    const waitedMinutes = (now.getTime() - new Date(reg.registered_at).getTime()) / 60_000
    if (!contactId && waitedMinutes < input.drip.fallbackAfterMinutes) continue

    out.push({
      registrationId: String(reg.id),
      contactId,
      phone,
      firstname: reg.first_name || match?.firstname || null,
      lastname: reg.last_name || match?.lastname || null,
      email: reg.email || null,
      registeredAt: reg.registered_at,
      fallback: !contactId,
    })
  }
  return out
}

/**
 * Verrou applicatif entre deux passages d'un même cron. Vercel relance la
 * fonction chaque minute sans attendre la fin de la précédente : sans verrou,
 * deux passages calculent la même cible et envoient deux fois (relance du
 * 18/09 : 349 doublons). Le bail expire tout seul si la fonction est coupée.
 */
export async function acquireTimeslotLock(name: string, ttlMs: number): Promise<boolean> {
  const db = createServiceClient()
  const key = `event_timeslot_lock_${name}`
  const now = Date.now()
  const { data } = await db.from('crm_settings').select('value').eq('key', key).maybeSingle()
  const current = (data?.value || {}) as { until?: number }
  if (Number(current.until || 0) > now) return false

  const token = randomUUID()
  const { error } = await db.from('crm_settings').upsert(
    {
      key,
      value: { until: now + ttlMs, token },
      description: 'Verrou cron sondage créneaux',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (error) return false

  // Deux passages ont pu écrire quasi simultanément : seul celui dont le jeton
  // est resté en base continue, l'autre s'efface.
  const { data: check } = await db.from('crm_settings').select('value').eq('key', key).maybeSingle()
  return ((check?.value || {}) as { token?: string }).token === token
}

export async function releaseTimeslotLock(name: string): Promise<void> {
  const db = createServiceClient()
  await db.from('crm_settings').upsert(
    {
      key: `event_timeslot_lock_${name}`,
      value: { until: 0 },
      description: 'Verrou cron sondage créneaux',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
}

export const DEFAULT_TIMESLOT_JOUR_J: TimeslotJourJ = {
  smsAvecCreneau: 'Vous êtes attendu(e) entre {creneau_debut} et {creneau_fin}.',
  smsSansCreneau: 'Le salon est ouvert de 10h à 18h.',
  emailAvecCreneau:
    'Vous avez choisi le créneau {creneau_debut} – {creneau_fin} : vous pouvez arriver à partir de {creneau_debut}.',
  emailSansCreneau: 'Vous pouvez arriver à partir de 10h, le salon reste ouvert jusqu’à 18h.',
}

export async function getTimeslotJourJ(): Promise<TimeslotJourJ> {
  const db = createServiceClient()
  const store = await readStore(db)
  return { ...DEFAULT_TIMESLOT_JOUR_J, ...(store.jourJ || {}) }
}

export async function saveTimeslotJourJ(patch: Partial<TimeslotJourJ>): Promise<TimeslotJourJ> {
  const db = createServiceClient()
  const store = await readStore(db)
  const current = { ...DEFAULT_TIMESLOT_JOUR_J, ...(store.jourJ || {}) }
  const next: TimeslotJourJ = {
    smsAvecCreneau: (patch.smsAvecCreneau ?? current.smsAvecCreneau).trim(),
    smsSansCreneau: (patch.smsSansCreneau ?? current.smsSansCreneau).trim(),
    emailAvecCreneau: (patch.emailAvecCreneau ?? current.emailAvecCreneau).trim(),
    emailSansCreneau: (patch.emailSansCreneau ?? current.emailSansCreneau).trim(),
  }
  store.jourJ = next
  await writeStore(db, store)
  return next
}

/** « 10-12 » → début « 10h », fin « 12h ». */
function slotBounds(value: string): { debut: string; fin: string } {
  const [a, b] = value.split('-')
  return { debut: a ? `${a}h` : '', fin: b ? `${b}h` : '' }
}

export type TimeslotMergeFields = {
  creneau: string
  creneau_debut: string
  creneau_fin: string
  phraseSms: string
  phraseEmail: string
}

/**
 * Créneau choisi par chaque inscrit, pour personnaliser les rappels du jour J.
 * Rattachement par contact CRM, puis email, puis téléphone : une personne peut
 * avoir répondu depuis un lien signé sans que l'inscription porte son id.
 *
 * Renvoie une map vide pour tout autre événement que le salon.
 */
export async function timeslotMergeFieldsForRegistrations(
  eventId: string,
  regs: { id: string; email?: string | null; phone?: string | null; hubspot_contact_id?: string | null }[],
): Promise<Map<string, TimeslotMergeFields>> {
  const out = new Map<string, TimeslotMergeFields>()
  if (eventId !== SALON_MEDECINE_2026_EVENT_ID || regs.length === 0) return out

  const form = await ensureTimeslotSurveyForm()
  const db = createServiceClient()

  const byContact = new Map<string, string>()
  const byEmail = new Map<string, string>()
  const byPhone = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('form_submissions')
      .select('data, submitted_at')
      .eq('form_id', form.id)
      .neq('status', 'spam')
      .order('submitted_at', { ascending: true })
      .range(from, from + 999)
    if (error) break
    for (const row of data || []) {
      const payload = (row.data || {}) as Record<string, unknown>
      const slot = String(payload[TIMESLOT_FIELD_KEY] || '').trim()
      if (!slot) continue
      // Ordre croissant : la dernière réponse écrase les précédentes.
      const cid = String(payload._contact_id || '').trim()
      if (cid) byContact.set(cid, slot)
      const email = String(payload.email || '').trim().toLowerCase()
      if (email) byEmail.set(email, slot)
      const last9 = String(payload.phone || '').replace(/\D/g, '').slice(-9)
      if (last9.length === 9) byPhone.set(last9, slot)
    }
    if (!data || data.length < 1000) break
  }

  const jourJ = await getTimeslotJourJ()

  for (const reg of regs) {
    const cid = String(reg.hubspot_contact_id || '').trim()
    const email = String(reg.email || '').trim().toLowerCase()
    const last9 = String(reg.phone || '').replace(/\D/g, '').slice(-9)
    const slot =
      (cid ? byContact.get(cid) : undefined) ||
      (email ? byEmail.get(email) : undefined) ||
      (last9.length === 9 ? byPhone.get(last9) : undefined) ||
      null

    if (!slot) {
      out.set(reg.id, {
        creneau: '',
        creneau_debut: '',
        creneau_fin: '',
        phraseSms: jourJ.smsSansCreneau,
        phraseEmail: jourJ.emailSansCreneau,
      })
      continue
    }

    const { debut, fin } = slotBounds(slot)
    const fill = (tpl: string) =>
      tpl
        .replace(/\{creneau_debut\}/gi, debut)
        .replace(/\{creneau_fin\}/gi, fin)
        .replace(/\{creneau\}/gi, slotLabel(slot))
    out.set(reg.id, {
      creneau: slotLabel(slot),
      creneau_debut: debut,
      creneau_fin: fin,
      phraseSms: fill(jourJ.smsAvecCreneau),
      phraseEmail: fill(jourJ.emailAvecCreneau),
    })
  }

  return out
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
