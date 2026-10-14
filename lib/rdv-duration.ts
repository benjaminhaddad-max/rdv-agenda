/**
 * Durée d'un RDV closer pris depuis le CRM (télépros, admins, closers) :
 *  - visio / présentiel → 45 min
 *  - téléphone (ou type inconnu) → 30 min
 *
 * Les prises de RDV publiques (widget web, liens /book, Medibox) gardent
 * leurs créneaux de 30 min.
 */
export function rdvDurationMin(meetingType: string | null | undefined): number {
  return meetingType === 'visio' || meetingType === 'presentiel' ? 45 : 30
}

/** Fin du RDV (ISO) à partir de son début et de son type. */
export function rdvEndAtIso(startAt: string | Date, meetingType: string | null | undefined): string {
  return new Date(new Date(startAt).getTime() + rdvDurationMin(meetingType) * 60_000).toISOString()
}
