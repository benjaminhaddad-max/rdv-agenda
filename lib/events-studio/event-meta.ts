/** Métadonnées stockées dans `events.description` (pas encore de colonnes dédiées). */

const DATE_END_RE = /\[date_end=(\d{4}-\d{2}-\d{2})\]/
const STAFF_NEEDED_RE = /\[staff_needed=(\d+)\]/

export function parseDateEnd(description: string | null | undefined): string | null {
  const m = (description || '').match(DATE_END_RE)
  return m ? m[1] : null
}

export function parseStaffNeeded(description: string | null | undefined): number | null {
  const m = (description || '').match(STAFF_NEEDED_RE)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function setStaffNeededInDescription(
  description: string | null | undefined,
  staffNeeded: number | null,
): string {
  let desc = (description || '').replace(/\n?\[staff_needed=\d+\]/g, '').trim()
  if (staffNeeded != null && Number.isFinite(staffNeeded) && staffNeeded >= 0) {
    desc = `${desc}${desc ? '\n' : ''}[staff_needed=${Math.floor(staffNeeded)}]`
  }
  return desc
}

export function humanDescription(description: string | null | undefined): string {
  return (description || '')
    .replace(/\n?\[date_end=\d{4}-\d{2}-\d{2}\]/g, '')
    .replace(/\n?\[staff_needed=\d+\]/g, '')
    .trim()
}

/** Rémunération staff Diploma (affichage planning). */
export const STAFF_PAY = {
  salon: { amount: 120, label: '120 € / jour', hint: 'Salons : 120 € par jour' },
  jpo: { amount: 60, label: '60 € / après-midi', hint: 'JPO : 60 € pour l’après-midi' },
} as const

export function staffPayForType(typeId: string): { amount: number; label: string; hint: string } | null {
  if (typeId === 'salon') return STAFF_PAY.salon
  if (typeId === 'jpo') return STAFF_PAY.jpo
  return null
}
