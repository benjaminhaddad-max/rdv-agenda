import type { EventDateFormat, EventLandingEvent, LandingKind } from './types'

const MONTHS_SHORT = ['JAN', 'FÉV', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC']

function parisHourMinute(iso: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  }).formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')?.value || '0')
  const m = Number(parts.find((p) => p.type === 'minute')?.value || '0')
  return { h, m }
}

export function formatHourLabel(h: number, m: number): string {
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

export function formatHourFromHhmm(hhmm: string | null | undefined): string | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null
  const [hs, ms] = hhmm.split(':')
  return formatHourLabel(Number(hs), Number(ms))
}

export function formatEventDate(event: EventLandingEvent): EventDateFormat {
  const start = new Date(event.event_date)
  const jour = start.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'Europe/Paris' })
  const monthIdx =
    Number(
      start.toLocaleDateString('en-CA', { month: 'numeric', timeZone: 'Europe/Paris' }),
    ) - 1
  const mois = MONTHS_SHORT[monthIdx] || ''
  const weekdayRaw = start.toLocaleDateString('fr-FR', {
    weekday: 'long',
    timeZone: 'Europe/Paris',
  })
  const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1)
  const dateLongue = start.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })
  const startHm = parisHourMinute(event.event_date)
  const timeStart = formatHourLabel(startHm.h, startHm.m)
  const timeEnd = formatHourFromHhmm(event.event_time_end)
  const horaires = timeEnd ? `${timeStart} – ${timeEnd}` : timeStart

  const dayKey = start.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  const endClock = event.event_time_end && /^\d{1,2}:\d{2}$/.test(event.event_time_end)
    ? `${event.event_time_end}:00`
    : '23:59:00'
  const endIso = new Date(`${dayKey}T${endClock}`).toISOString()

  return {
    jour,
    mois,
    weekday,
    dateLongue,
    horaires,
    timeStart,
    timeEnd,
    startIso: event.event_date,
    endIso,
  }
}

export function isCampusLocation(location: string | null | undefined): boolean {
  const l = (location || '').toLowerCase()
  return /rap[eé]e|ledru|lauriston/.test(l)
}

export function campusAccess(location: string | null | undefined): string {
  const l = (location || '').toLowerCase()
  if (/rap[eé]e/.test(l)) return 'M° Gare de Lyon\nlignes 1, 14, RER A et D'
  if (/ledru/.test(l)) return 'M° Ledru-Rollin — ligne 8'
  if (/lauriston/.test(l)) return 'M° Kléber / Boissière — ligne 6'
  return 'Indications précises envoyées après inscription'
}

export function prettyLocation(location: string | null | undefined): string {
  if (!location) return ''
  return location.replace(/\bRapee\b/gi, 'Rapée')
}

export function detectLandingKind(event: EventLandingEvent): LandingKind {
  const name = (event.name || '').toLowerCase()
  if (/immersion/.test(name)) return 'immersion'
  if (event.event_type === 'webinaire' || /webinaire/.test(name)) return 'webinaire'
  if (event.event_type === 'salon' && !isCampusLocation(event.location)) return 'salon'
  if (/salon/.test(name) && !isCampusLocation(event.location)) return 'salon'
  return 'jpo'
}

export function durationHours(event: EventLandingEvent): number {
  const start = parisHourMinute(event.event_date)
  const endLabel = formatHourFromHhmm(event.event_time_end)
  if (!event.event_time_end || !endLabel) return 2
  const [eh, em] = event.event_time_end.split(':').map(Number)
  return Math.max(0.5, eh + em / 60 - (start.h + start.m / 60))
}

/** Afficher le compteur seulement quand le remplissage est perceptible. */
export function shouldShowRemaining(
  remaining: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (remaining == null || max == null || max <= 0) return false
  if (remaining <= 0) return false
  if (remaining > 20 && remaining / max > 0.35) return false
  return true
}

export function remainingLabel(
  remaining: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (!shouldShowRemaining(remaining, max)) return null
  const n = remaining as number
  const total = max as number
  return `Il reste ${n} place${n > 1 ? 's' : ''} sur les ${total}`
}
