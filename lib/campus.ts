/** Campus Diploma Santé disponibles pour les RDV en présentiel. */
export const CAMPUS_OPTIONS = [
  '100 quai de la Rapée 75012 Paris',
  '29 rue Lauriston 75016 Paris',
] as const

export type CampusOption = (typeof CAMPUS_OPTIONS)[number]

export function isValidCampus(value: string): value is CampusOption {
  return (CAMPUS_OPTIONS as readonly string[]).includes(value)
}
