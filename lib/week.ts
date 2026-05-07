/**
 * Helpers pour la gestion des semaines (lundi -> dimanche).
 *
 * Le systeme de disponibilites des closers est par semaine : chaque semaine
 * est identifiee par son lundi (week_start). Ces helpers centralisent le
 * calcul pour eviter les bugs de fuseau horaire.
 */

/** Lundi 00:00 de la semaine d'une date donnee (en local time). */
export function startOfWeekMonday(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date.getTime())
  const day = d.getDay() // 0=dim, 1=lun, ..., 6=sam
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMonday)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Format YYYY-MM-DD du lundi de la semaine d'une date. */
export function weekStartISO(date: Date | string): string {
  const m = startOfWeekMonday(date)
  const y = m.getFullYear()
  const mo = String(m.getMonth() + 1).padStart(2, '0')
  const d = String(m.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/** Ajoute n semaines a un week_start ISO et renvoie un week_start ISO. */
export function addWeeks(weekStartISO_: string, n: number): string {
  const d = new Date(weekStartISO_ + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** Renvoie une plage [lundi, dimanche 23:59:59] a partir d'un weekStart ISO. */
export function weekRange(weekStartISO_: string): { start: Date; end: Date } {
  const start = new Date(weekStartISO_ + 'T00:00:00')
  const end = new Date(start.getTime())
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}
