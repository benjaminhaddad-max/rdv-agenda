/**
 * lib/booking-forms.ts — helpers pour les formulaires de prise de rendez-vous
 *
 * Un formulaire avec `form_type='booking'` se comporte comme un Calendly :
 *   1. Le prospect choisit une date dans le calendrier (horizon: booking_horizon_days)
 *   2. Il choisit un créneau de booking_duration_minutes parmi les dispos
 *   3. Il remplit le formulaire (mêmes champs que les forms classiques)
 *   4. Au submit : on crée un `form_submission` + un `rdv_appointment`
 *
 * Les créneaux dispos sont calculés à partir des disponibilités hebdo du
 * `booking_owner_user_id` (par défaut Pascal Tawfik). On exclut les créneaux
 * déjà bookés (`rdv_appointments` non annulés) sur ce closer.
 */

import { createServiceClient } from '@/lib/supabase'
import { PASCAL_OWNER_ID } from '@/lib/closer-assignment'
import { weekStartISO } from '@/lib/week'

export type MeetingType = 'visio' | 'presentiel' | 'telephone'

export interface BookingSlot {
  start: string // ISO datetime
  end: string   // ISO datetime
}

export interface BookingFormConfig {
  duration_minutes: number
  horizon_days: number
  min_notice_hours: number
  meeting_types: MeetingType[]
  default_meeting_type: MeetingType | null
  location_label: string | null
  owner_user_id: string | null // UUID rdv_users.id, NULL → Pascal
}

/** Renvoie l'UUID rdv_users.id de Pascal (fallback owner si non configuré sur le form). */
export async function getPascalUserId(): Promise<string | null> {
  const db = createServiceClient()
  const { data } = await db
    .from('rdv_users')
    .select('id')
    .eq('hubspot_owner_id', PASCAL_OWNER_ID)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

/**
 * Calcule les créneaux dispos pour un jour donné selon les règles du closer
 * "owner" du formulaire (Pascal par défaut).
 *
 * Le résultat est un tableau de créneaux start/end de `duration_minutes` chacun
 * pendant les plages où l'owner est dispo, en excluant ceux qui chevauchent
 * un RDV non annulé (limite 3 RDV simultanés, comme l'agenda interne).
 */
export async function getBookingSlotsForDate(
  ownerUserId: string,
  dateISO: string, // YYYY-MM-DD
  durationMinutes: number,
  minNoticeHours: number,
): Promise<BookingSlot[]> {
  const db = createServiceClient()

  const targetDate = new Date(`${dateISO}T00:00:00`)
  if (isNaN(targetDate.getTime())) return []

  // Pas de RDV dans le passé ou avant le préavis minimum
  const now = new Date()
  const minBookable = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000)

  const dayOfWeek = targetDate.getDay() // 0=dim, 6=sam

  // Date bloquée pour cet owner ? → aucun créneau
  const { data: blocked } = await db
    .from('rdv_blocked_dates')
    .select('id')
    .eq('user_id', ownerUserId)
    .eq('blocked_date', dateISO)
    .limit(1)
  if (blocked && blocked.length > 0) return []

  // 1) Tentative table hebdo (rdv_availability_weekly)
  const weekStart = weekStartISO(targetDate)
  type Rule = { start_time: string; end_time: string; is_active: boolean }
  let rules: Rule[] = []

  const weeklyRes = await db
    .from('rdv_availability_weekly')
    .select('start_time, end_time, is_active')
    .eq('user_id', ownerUserId)
    .eq('week_start', weekStart)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)

  if (weeklyRes.data && weeklyRes.data.length > 0) {
    rules = weeklyRes.data as Rule[]
  } else {
    // Fallback table récurrente (rdv_availability)
    const legacyRes = await db
      .from('rdv_availability')
      .select('start_time, end_time, is_active')
      .eq('user_id', ownerUserId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
    rules = (legacyRes.data ?? []) as Rule[]
  }

  if (rules.length === 0) return []

  // 2) RDV déjà pris ce jour-là pour cet owner (non annulés)
  const dayStart = new Date(targetDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(targetDate)
  dayEnd.setHours(23, 59, 59, 999)

  const { data: booked } = await db
    .from('rdv_appointments')
    .select('start_at, end_at')
    .eq('commercial_id', ownerUserId)
    .neq('status', 'annule')
    .gte('start_at', dayStart.toISOString())
    .lte('start_at', dayEnd.toISOString())

  const bookedRanges = (booked || []).map(b => ({
    start: new Date(b.start_at as string).getTime(),
    end: new Date(b.end_at as string).getTime(),
  }))

  // 3) Découpe chaque règle en créneaux de `durationMinutes` minutes
  const slots: BookingSlot[] = []
  const stepMs = durationMinutes * 60 * 1000

  for (const rule of rules) {
    const [sH, sM] = String(rule.start_time).split(':').map(Number)
    const [eH, eM] = String(rule.end_time).split(':').map(Number)

    const ruleStart = new Date(targetDate)
    ruleStart.setHours(sH, sM, 0, 0)
    const ruleEnd = new Date(targetDate)
    ruleEnd.setHours(eH, eM, 0, 0)

    let cursor = ruleStart.getTime()
    while (cursor + stepMs <= ruleEnd.getTime()) {
      const slotEnd = cursor + stepMs

      // Skip slots dans le passé ou avant le préavis
      if (cursor < minBookable.getTime()) {
        cursor += stepMs
        continue
      }

      // Compte les RDV qui chevauchent ce créneau
      const overlap = bookedRanges.filter(b => b.start < slotEnd && b.end > cursor).length

      // Limite 3 RDV simultanés (cohérent avec /api/availability/pool)
      if (overlap < 3) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(slotEnd).toISOString(),
        })
      }
      cursor += stepMs
    }
  }

  return slots
}

/**
 * Vérifie qu'un créneau soumis (start/end) est cohérent avec la config booking
 * du formulaire et qu'il est effectivement encore dispo au moment du submit.
 *
 * Renvoie null si OK, sinon un message d'erreur prêt à afficher au prospect.
 */
export async function validateBookingSlot(
  ownerUserId: string,
  config: BookingFormConfig,
  startISO: string,
  endISO: string,
): Promise<string | null> {
  const start = new Date(startISO)
  const end = new Date(endISO)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 'Créneau invalide.'
  }
  if (end <= start) {
    return 'Créneau invalide (fin avant début).'
  }

  // Durée doit matcher la config
  const durationMs = end.getTime() - start.getTime()
  const expectedMs = config.duration_minutes * 60 * 1000
  if (Math.abs(durationMs - expectedMs) > 60_000) {
    return 'Durée du créneau incorrecte.'
  }

  // Préavis minimum respecté
  const now = new Date()
  const minBookable = new Date(now.getTime() + config.min_notice_hours * 60 * 60 * 1000)
  if (start < minBookable) {
    return 'Ce créneau est trop proche pour être réservé.'
  }

  // Pas au-delà de l'horizon
  const horizon = new Date(now.getTime() + config.horizon_days * 24 * 60 * 60 * 1000)
  if (start > horizon) {
    return 'Ce créneau dépasse la période de réservation autorisée.'
  }

  // Le créneau doit faire partie des dispos calculées pour ce jour
  const dateISO = startISO.slice(0, 10)
  const available = await getBookingSlotsForDate(
    ownerUserId,
    dateISO,
    config.duration_minutes,
    config.min_notice_hours,
  )
  const match = available.find(s => s.start === startISO)
  if (!match) {
    return 'Ce créneau n\'est plus disponible. Choisissez-en un autre.'
  }

  return null
}

/** Construit un objet BookingFormConfig à partir d'une ligne `forms`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildBookingConfig(form: any): BookingFormConfig {
  const meeting_types = (Array.isArray(form?.booking_meeting_types) && form.booking_meeting_types.length > 0
    ? form.booking_meeting_types
    : ['visio', 'presentiel']) as MeetingType[]
  const default_meeting_type = (form?.booking_default_meeting_type as MeetingType | null) || (meeting_types[0] || null)
  return {
    duration_minutes: Number(form?.booking_duration_minutes) || 30,
    horizon_days: Number(form?.booking_horizon_days) || 30,
    min_notice_hours: Number(form?.booking_min_notice_hours ?? 2),
    meeting_types,
    default_meeting_type,
    location_label: form?.booking_location_label || null,
    owner_user_id: form?.booking_owner_user_id || null,
  }
}
