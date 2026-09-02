/** Campus Diploma Santé disponibles pour les RDV en présentiel. */
export const CAMPUS_OPTIONS = [
  '100 quai de la Rapée 75012 Paris',
  '29 rue Lauriston 75016 Paris',
] as const

export type CampusOption = (typeof CAMPUS_OPTIONS)[number]

export function isValidCampus(value: string): value is CampusOption {
  return (CAMPUS_OPTIONS as readonly string[]).includes(value)
}

/** Adresse campus stockée dans `meeting_link` (hors URL visio). */
export function presentielCampusLabel(meetingLink?: string | null): string | null {
  const candidate = String(meetingLink || '').trim()
  if (!candidate || /^https?:\/\//i.test(candidate)) return null
  return candidate
}

export function campusShortLabel(meetingLink?: string | null): string | null {
  const full = presentielCampusLabel(meetingLink)
  if (!full) return null
  if (/lauriston/i.test(full)) return 'Rue Lauriston'
  if (/rap[eé]e/i.test(full)) return 'Quai de la Rapée'
  return full
}
