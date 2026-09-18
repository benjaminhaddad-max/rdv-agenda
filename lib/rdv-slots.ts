/** Dernier début de créneau bookable (créneaux de 30 min → fin à 21:00). */
export const LATEST_BOOKING_SLOT_START = { hour: 20, minute: 30 } as const

const LATEST_START_MINS =
  LATEST_BOOKING_SLOT_START.hour * 60 + LATEST_BOOKING_SLOT_START.minute

/** True si le créneau peut encore être proposé à la prise de RDV. */
export function isBookableSlotStart(d: Date): boolean {
  return d.getHours() * 60 + d.getMinutes() <= LATEST_START_MINS
}

/**
 * Borne haute de la fenêtre de dispo pour la génération de créneaux
 * (fin du dernier slot de 30 min démarrant à 20:30 → 21:00).
 */
export function clampBookingWindowEnd(dateYmd: string, ruleEnd: Date): Date {
  const latest = new Date(dateYmd)
  latest.setHours(
    LATEST_BOOKING_SLOT_START.hour,
    LATEST_BOOKING_SLOT_START.minute + 30,
    0,
    0,
  )
  return ruleEnd > latest ? latest : ruleEnd
}
