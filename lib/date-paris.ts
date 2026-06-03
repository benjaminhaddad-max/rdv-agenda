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
