/** Formulaire classement orientation.hermione.co — constantes partagées CRM + webhook. */

export const HERMIONE_ORIENTATION_FORM_ID = 'hermione-orientation-classement'

/** Valeur écrite dans recent_conversion_event (filtre form_event des vues CRM). */
export const HERMIONE_ORIENTATION_FORM_EVENT =
  'Hermione — Classement orientation santé'

export type HermioneClassementItem = {
  rang?: number
  id?: string
  label?: string
}

export type HermioneOrientationPayload = {
  prenom?: unknown
  nom?: unknown
  email?: unknown
  telephone?: unknown
  departement?: unknown
  classe_actuelle?: unknown
  classement?: unknown
  utm_source?: unknown
  utm_medium?: unknown
  utm_campaign?: unknown
  hubspot_contact_id?: unknown
  submitted_at?: unknown
}

export function parseHermioneClassement(raw: unknown): HermioneClassementItem[] {
  if (!Array.isArray(raw)) return []
  const items: HermioneClassementItem[] = []
  for (const entry of raw) {
    const item = entry as HermioneClassementItem
    const rang = typeof item.rang === 'number' ? item.rang : Number(item.rang) || undefined
    const label = item.label?.trim() || item.id?.trim() || ''
    if (!label) continue
    items.push({ rang, id: item.id, label })
  }
  return items.sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99))
}

export function formatHermioneClassement(classement: unknown): string {
  const items = parseHermioneClassement(classement)
  if (items.length === 0) return '—'
  return items
    .map((item, idx) => {
      const rang = item.rang ?? idx + 1
      return `${rang}. ${item.label}`
    })
    .join('\n')
}

export function isHermioneOrientationForm(formId: string | null | undefined): boolean {
  return formId === HERMIONE_ORIENTATION_FORM_ID
}
