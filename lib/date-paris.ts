/**
 * lib/date-paris.ts
 *
 * Formatage de dates en heure de Paris, indépendant du fuseau du serveur.
 *
 * Contexte : en production sur Vercel, le serveur tourne en UTC. Un RDV pris
 * à 18h30 (heure de Paris) est stocké en UTC (16h30Z). Si on formate cette
 * date avec `format()` de date-fns sans conversion, on obtient « 16h30 » au
 * lieu de « 18h30 » → décalage de 1h (hiver) ou 2h (été) dans les SMS/emails.
 *
 * Ce module centralise la conversion vers Europe/Paris pour que tous les
 * envois (confirmation immédiate, crons J-48h / J-24h, etc.) affichent la même
 * heure que celle vue par l'utilisateur dans le CRM.
 */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Décalage (en millisecondes) entre UTC et Europe/Paris pour une date donnée.
 * Gère automatiquement l'heure d'été / d'hiver.
 */
export function getParisMsOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const parisStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  return new Date(parisStr).getTime() - new Date(utcStr).getTime()
}

/**
 * Formate une date en heure de Paris avec date-fns (locale fr).
 *
 * @param date    Date à formater (instant absolu, ex: depuis start_at ISO)
 * @param pattern Pattern date-fns. Défaut : "EEEE d MMMM 'à' HH'h'mm"
 *                → ex. « vendredi 29 mai à 10h00 »
 */
export function formatParis(
  date: Date,
  pattern = "EEEE d MMMM 'à' HH'h'mm",
): string {
  const parisDate = new Date(date.getTime() + getParisMsOffset(date))
  return format(parisDate, pattern, { locale: fr })
}

/** Date calendaire (YYYY-MM-DD) en heure de Paris pour un instant donné. */
export function parisDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Lundi de la semaine (YYYY-MM-DD) contenant `date`, semaine ISO (lun→dim). */
export function parisWeekStartKey(date: Date): string {
  const key = parisDateKey(date)
  const [y, m, d] = key.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12))
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
  }).format(utcNoon)
  const dayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  }
  const offset = dayMap[weekday] ?? 0
  const monday = new Date(Date.UTC(y, m - 1, d - offset, 12))
  return monday.toISOString().slice(0, 10)
}

/** Ajoute `weeks` semaines à un lundi (YYYY-MM-DD). */
export function addParisWeeks(weekStartKey: string, weeks: number): string {
  const [y, m, d] = weekStartKey.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + weeks * 7, 12))
  return next.toISOString().slice(0, 10)
}

/** Libellé « 6 au 12 juillet 2026 » pour une semaine lun→dim. */
export function formatParisWeekRange(weekStartKey: string): string {
  const [y, m, d] = weekStartKey.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, 12))
  const end = new Date(Date.UTC(y, m - 1, d + 6, 12))
  const startLabel = formatParis(start, 'd MMMM')
  const endLabel = formatParis(end, 'd MMMM yyyy')
  return `${startLabel} au ${endLabel}`
}

/** Instant UTC correspondant à minuit (00:00) à Paris pour une date calendaire. */
export function parisMidnightUtc(dateKey: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const ref = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))
  const offset = getParisMsOffset(ref)
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) - offset)
}

/** Bornes UTC [start, end) pour filtrer created_at sur une semaine Paris. */
export function parisWeekUtcBounds(weekStartKey: string): { start: string; end: string } {
  const startUtc = parisMidnightUtc(weekStartKey)
  const endUtc = parisMidnightUtc(addParisWeeks(weekStartKey, 1))
  return { start: startUtc.toISOString(), end: endUtc.toISOString() }
}
