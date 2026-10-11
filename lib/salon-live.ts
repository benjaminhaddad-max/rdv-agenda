/**
 * Pages publiques « leads en direct » d'un salon (lien partagé aux responsables du stand).
 * Accès par token secret dans l'URL — uniquement des compteurs, aucune donnée personnelle.
 */
export type SalonLiveConfig = {
  title: string
  location: string
  /** Formulaire(s) CRM utilisés sur le stand. */
  formIds: string[]
  /** Jours du salon (YYYY-MM-DD, heure de Paris). */
  days: string[]
}

export const SALON_LIVE: Record<string, SalonLiveConfig> = {
  // Santé, social, paramédical et sport — Paris Expo Porte de Versailles, 10 & 11/10/2026
  '4b46270466f1': {
    title: 'Santé, social, paramédical et sport',
    location: 'Paris Expo Porte de Versailles — Pav. 7.2',
    formIds: ['2ef932fb-0fb6-4c1b-be77-3ba926f2db24'],
    days: ['2026-10-10', '2026-10-11'],
  },
}
