/** Libellés du formulaire de collecte sur stand (salons externes). */

export const SALON_STAND_DEFAULT_SUCCESS =
  'Un conseiller vous rappelle sous 48 h. En attendant, passez nous voir sur le stand ou découvrez nos préparations.'
export const SALON_STAND_PREPARATIONS_URL = 'https://diploma-sante.fr/nos-preparations/'
export const SALON_STAND_PRIVACY_URL = 'https://diploma-sante.fr/politique-de-confidentialite/'

/** Tablette du stand : retour au formulaire vierge quelques secondes après l’envoi. */
export const SALON_STAND_RESET_MS = 8000

/**
 * « Salon Studyrama » → préfixe « Salon » + accent « Studyrama ».
 * Un nom qui contient déjà « salon » ailleurs n’est pas re-préfixé.
 */
export function splitSalonTitle(name: string | null | undefined): { prefix: string | null; accent: string } {
  const raw = String(name || '').replace(/\s+/g, ' ').trim() || 'Salon'
  const m = raw.match(/^salon\s+(.+)$/i)
  if (m) return { prefix: 'Salon', accent: m[1].trim() }
  if (/salon/i.test(raw)) return { prefix: null, accent: raw }
  return { prefix: 'Salon', accent: raw }
}

function parisParts(iso: string): { day: number; monthShort: string; monthLong: string; monthKey: string } {
  const d = new Date(iso)
  const day = Number(d.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'Europe/Paris' }))
  const monthShort = d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'Europe/Paris' })
  const monthLong = d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'Europe/Paris' })
  const monthKey = d.toLocaleDateString('en-CA', { year: 'numeric', month: 'numeric', timeZone: 'Europe/Paris' })
  return { day, monthShort, monthLong, monthKey }
}

function dayLabel(day: number): string {
  return day === 1 ? '1er' : String(day)
}

export type SalonStandDates = {
  /** Badge mobile : « 26 » ou « 3–4 ». */
  badgeDay: string
  /** Badge mobile : « sept. ». */
  badgeMonth: string
  /** Pastille desktop : « 26 sept. » ou « 3–4 oct. » ou « 30 sept. – 1er oct. ». */
  pill: string
  /** Pied de carte : « du 26 septembre » ou « du 3 au 4 octobre ». */
  duPhrase: string
}

/** Dates du salon (Europe/Paris), mono ou multi-jours ([date_end=…]). */
export function salonStandDates(eventDateIso: string, dateEnd?: string | null): SalonStandDates {
  const start = parisParts(eventDateIso)
  const end = dateEnd && /^\d{4}-\d{2}-\d{2}$/.test(dateEnd) ? parisParts(`${dateEnd}T12:00:00`) : null
  const multi = !!end && (end.monthKey > start.monthKey || (end.monthKey === start.monthKey && end.day > start.day))

  if (!multi || !end) {
    return {
      badgeDay: String(start.day),
      badgeMonth: start.monthShort,
      pill: `${dayLabel(start.day)} ${start.monthShort}`,
      duPhrase: `du ${dayLabel(start.day)} ${start.monthLong}`,
    }
  }
  if (end.monthKey === start.monthKey) {
    return {
      badgeDay: `${start.day}–${end.day}`,
      badgeMonth: start.monthShort,
      pill: `${start.day}–${end.day} ${start.monthShort}`,
      duPhrase: `du ${dayLabel(start.day)} au ${dayLabel(end.day)} ${start.monthLong}`,
    }
  }
  return {
    badgeDay: String(start.day),
    badgeMonth: start.monthShort,
    pill: `${dayLabel(start.day)} ${start.monthShort} – ${dayLabel(end.day)} ${end.monthShort}`,
    duPhrase: `du ${dayLabel(start.day)} ${start.monthLong} au ${dayLabel(end.day)} ${end.monthLong}`,
  }
}
