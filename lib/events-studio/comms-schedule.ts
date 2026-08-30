/**
 * Horaires d’envoi des communications Events (emails / SMS).
 * Stockés dans `custom_emails._schedule` (pas de colonne dédiée).
 */

import { getParisMsOffset, parisDateKey } from '@/lib/date-paris'

export const COMMS_SCHEDULE_KEY = '_schedule'

export type CommsScheduleEntry =
  | { mode: 'immediate' }
  | { mode: 'days_before'; days: number; time: string }
  | { mode: 'day_of'; time: string }
  | { mode: 'minutes_before'; minutes: number }

export type CommsScheduleMap = Record<string, CommsScheduleEntry>

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time)
}

/** Instant UTC pour une date calendaire + heure murale à Paris. */
export function parisWallTimeToUtc(dateKey: string, time: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const [hh, mm] = time.split(':').map((x) => parseInt(x, 10) || 0)
  const ref = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))
  const offset = getParisMsOffset(ref)
  return new Date(Date.UTC(y, mo - 1, d, hh, mm, 0) - offset)
}

export function defaultScheduleForStep(stepId: string): CommsScheduleEntry {
  if (stepId === 'confirmation') return { mode: 'immediate' }

  const daysMatch = stepId.match(/^j-(\d+)$/)
  if (daysMatch) {
    return { mode: 'days_before', days: parseInt(daysMatch[1], 10), time: '08:00' }
  }

  if (stepId === 'j-0-matin') return { mode: 'day_of', time: '08:00' }
  if (stepId === 'j-0-10h') return { mode: 'day_of', time: '10:00' }
  if (stepId === 'j-0-11h') return { mode: 'day_of', time: '11:00' }
  if (stepId === 'j-0-14h') return { mode: 'day_of', time: '14:00' }
  if (stepId === 'j-0-18h25') return { mode: 'minutes_before', minutes: 5 }
  if (stepId === 'j-0-5min') return { mode: 'minutes_before', minutes: 5 }

  const minMatch = stepId.match(/(\d+)\s*min/i)
  if (minMatch) return { mode: 'minutes_before', minutes: parseInt(minMatch[1], 10) }

  return { mode: 'days_before', days: 1, time: '08:00' }
}

function normalizeEntry(raw: unknown, stepId: string): CommsScheduleEntry {
  const fallback = defaultScheduleForStep(stepId)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const o = raw as Record<string, unknown>
  const mode = o.mode

  if (mode === 'immediate') return { mode: 'immediate' }

  if (mode === 'days_before') {
    const days = typeof o.days === 'number' ? o.days : parseInt(String(o.days ?? ''), 10)
    const time = typeof o.time === 'string' && isValidTime(o.time) ? o.time : '08:00'
    if (Number.isFinite(days) && days >= 0 && days <= 30) {
      return { mode: 'days_before', days, time }
    }
    return fallback.mode === 'days_before' ? fallback : { mode: 'days_before', days: 1, time }
  }

  if (mode === 'day_of') {
    const time = typeof o.time === 'string' && isValidTime(o.time) ? o.time : '08:00'
    return { mode: 'day_of', time }
  }

  if (mode === 'minutes_before') {
    const minutes =
      typeof o.minutes === 'number' ? o.minutes : parseInt(String(o.minutes ?? ''), 10)
    if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 180) {
      return { mode: 'minutes_before', minutes }
    }
    return fallback.mode === 'minutes_before' ? fallback : { mode: 'minutes_before', minutes: 10 }
  }

  return fallback
}

export function extractCommsSchedule(
  customEmails: Record<string, unknown> | null | undefined,
): CommsScheduleMap {
  const raw = customEmails?.[COMMS_SCHEDULE_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: CommsScheduleMap = {}
  for (const [stepId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (stepId.startsWith('_')) continue
    out[stepId] = normalizeEntry(value, stepId)
  }
  return out
}

export function attachCommsSchedule<T extends Record<string, unknown>>(
  emails: T,
  schedule: CommsScheduleMap,
): T & { [COMMS_SCHEDULE_KEY]: CommsScheduleMap } {
  const cleaned: CommsScheduleMap = {}
  for (const [k, v] of Object.entries(schedule)) {
    if (!k || k.startsWith('_')) continue
    cleaned[k] = normalizeEntry(v, k)
  }
  return { ...emails, [COMMS_SCHEDULE_KEY]: cleaned }
}

export function resolveSchedule(
  schedule: CommsScheduleMap | null | undefined,
  stepId: string,
): CommsScheduleEntry {
  const custom = schedule?.[stepId]
  if (custom) return normalizeEntry(custom, stepId)
  return defaultScheduleForStep(stepId)
}

export function formatScheduleLabel(entry: CommsScheduleEntry): string {
  switch (entry.mode) {
    case 'immediate':
      return 'À l’inscription / publication'
    case 'days_before':
      return entry.days === 0
        ? `Jour J à ${entry.time} (Paris)`
        : `J-${entry.days} à ${entry.time} (Paris)`
    case 'day_of':
      return `Jour J à ${entry.time} (Paris)`
    case 'minutes_before':
      return `${entry.minutes} min avant le début`
    default:
      return '—'
  }
}

/** Calcule l’instant d’envoi prévu (UTC), ou null si immédiat / inconnu. */
export function computeSendAt(eventDateIso: string, entry: CommsScheduleEntry): Date | null {
  const eventAt = new Date(eventDateIso)
  if (Number.isNaN(eventAt.getTime())) return null

  if (entry.mode === 'immediate') return null

  if (entry.mode === 'minutes_before') {
    return new Date(eventAt.getTime() - entry.minutes * 60 * 1000)
  }

  const eventDay = parisDateKey(eventAt)

  if (entry.mode === 'day_of') {
    return parisWallTimeToUtc(eventDay, entry.time)
  }

  if (entry.mode === 'days_before') {
    const [y, m, d] = eventDay.split('-').map(Number)
    const target = new Date(Date.UTC(y, m - 1, d - entry.days, 12, 0, 0))
    const targetKey = parisDateKey(target)
    return parisWallTimeToUtc(targetKey, entry.time)
  }

  return null
}

export function formatScheduleAbsolute(
  eventDateIso: string,
  entry: CommsScheduleEntry,
): string | null {
  if (entry.mode === 'immediate') return null
  const at = computeSendAt(eventDateIso, entry)
  if (!at) return null
  // Intl + Europe/Paris : correct en local (Paris) et sur Vercel (UTC)
  return at.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function minutesBeforeForStep(
  schedule: CommsScheduleMap | null | undefined,
  stepId: string,
): number {
  const entry = resolveSchedule(schedule, stepId)
  if (entry.mode === 'minutes_before') return entry.minutes
  return defaultScheduleForStep(stepId).mode === 'minutes_before'
    ? (defaultScheduleForStep(stepId) as { minutes: number }).minutes
    : 10
}
