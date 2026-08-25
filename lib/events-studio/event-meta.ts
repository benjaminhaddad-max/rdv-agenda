/** Métadonnées stockées dans `events.description` (pas encore de colonnes dédiées). */

const DATE_END_RE = /\[date_end=(\d{4}-\d{2}-\d{2})\]/
const STAFF_NEEDED_RE = /\[staff_needed=(\d+)\]/

export function parseDateEnd(description: string | null | undefined): string | null {
  const m = (description || '').match(DATE_END_RE)
  return m ? m[1] : null
}

export function parseStaffNeeded(description: string | null | undefined): number | null {
  const m = (description || '').match(STAFF_NEEDED_RE)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function setStaffNeededInDescription(
  description: string | null | undefined,
  staffNeeded: number | null,
): string {
  let desc = (description || '').replace(/\n?\[staff_needed=\d+\]/g, '').trim()
  if (staffNeeded != null && Number.isFinite(staffNeeded) && staffNeeded >= 0) {
    desc = `${desc}${desc ? '\n' : ''}[staff_needed=${Math.floor(staffNeeded)}]`
  }
  return desc
}

export function humanDescription(description: string | null | undefined): string {
  return (description || '')
    .replace(/\n?\[date_end=\d{4}-\d{2}-\d{2}\]/g, '')
    .replace(/\n?\[staff_needed=\d+\]/g, '')
    .trim()
}

/** Rémunération staff Diploma (affichage planning). */
export const STAFF_PAY = {
  half_day: {
    amount: 60,
    label: '60 € / demi-journée',
    hint: 'Demi-journée (après-midi) : 60 €',
  },
  full_day: {
    amount: 120,
    label: '120 € / jour',
    hint: 'Salons journée complète : 120 € par jour',
  },
  jpo: {
    amount: 60,
    label: '60 € / après-midi',
    hint: 'JPO : 60 € pour l’après-midi',
  },
} as const

/** Au-delà de 6 h sur une journée → tarif journée complète. */
const FULL_DAY_MINUTES = 6 * 60

export function eventDurationMinutes(ev: {
  event_date: string
  event_time_end?: string | null
}): number | null {
  const d = new Date(ev.event_date)
  const startH = parseInt(
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' }),
    10,
  )
  const startM = parseInt(
    d.toLocaleTimeString('fr-FR', { minute: '2-digit', timeZone: 'Europe/Paris' }),
    10,
  )
  const startMin = startH * 60 + startM
  if (!ev.event_time_end || !/^\d{1,2}:\d{2}$/.test(ev.event_time_end)) return null
  const [eh, em] = ev.event_time_end.split(':').map((x) => parseInt(x, 10))
  const endMin = eh * 60 + em
  if (endMin <= startMin) return null
  return endMin - startMin
}

export function isFullDayStaffEvent(ev: {
  event_date: string
  event_time_end?: string | null
  description?: string | null
}): boolean {
  if (parseDateEnd(ev.description)) return true
  const dur = eventDurationMinutes(ev)
  if (dur == null) return false
  return dur > FULL_DAY_MINUTES
}

export function staffPayForEvent(ev: {
  event_type?: string | null
  event_date: string
  event_time_end?: string | null
  description?: string | null
}): { amount: number; label: string; hint: string } | null {
  const typeId = ev.event_type || 'autre'
  if (typeId === 'jpo') return STAFF_PAY.jpo
  if (typeId === 'salon') {
    return isFullDayStaffEvent(ev) ? STAFF_PAY.full_day : STAFF_PAY.half_day
  }
  return null
}

/** @deprecated Préférer staffPayForEvent(ev) pour tenir compte des horaires. */
export function staffPayForType(typeId: string): { amount: number; label: string; hint: string } | null {
  if (typeId === 'salon') return STAFF_PAY.full_day
  if (typeId === 'jpo') return STAFF_PAY.jpo
  return null
}
