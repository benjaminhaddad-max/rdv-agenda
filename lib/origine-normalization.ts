export type OrigineOption = {
  label: string
  value: string
  hidden?: boolean
  displayOrder?: number
}

/**
 * Origines gérées par le CRM — plus par HubSpot.
 * Toujours injectées dans les menus (fiche contact, filtres, propriétés).
 */
export const CRM_ORIGINE_OPTIONS: OrigineOption[] = [
  { label: 'Thotis - Medibox', value: 'Thotis - Medibox' },
  { label: 'Thotis Prospect', value: 'Thotis Prospect' },
  { label: 'Thotis Suspect', value: 'Thotis Suspect' },
  { label: 'Edumove', value: 'Edumove' },
]

export const CRM_ORIGINE_VALUES = CRM_ORIGINE_OPTIONS.map(o => o.value)

function optionKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Fusionne les origines CRM dans une liste d'options (sans doublon). */
export function mergeCrmOrigineOptions(existing: unknown): OrigineOption[] {
  const list: OrigineOption[] = []
  const seen = new Set<string>()
  if (Array.isArray(existing)) {
    for (const raw of existing) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      const value = String(row.value ?? '').trim()
      if (!value) continue
      const key = optionKey(value)
      if (seen.has(key)) continue
      seen.add(key)
      list.push({
        label: String(row.label ?? value),
        value,
        hidden: Boolean(row.hidden),
        displayOrder: typeof row.displayOrder === 'number' ? row.displayOrder : undefined,
      })
    }
  }

  const extras = CRM_ORIGINE_OPTIONS.filter(o => !seen.has(optionKey(o.value)))
  if (!extras.length) return list

  let lastThotisIdx = -1
  for (let i = 0; i < list.length; i++) {
    if (/thotis/i.test(list[i].value) || /thotis/i.test(list[i].label)) lastThotisIdx = i
  }
  const insertAt = lastThotisIdx >= 0 ? lastThotisIdx + 1 : list.length
  const maxOrder = list.reduce((m, o) => Math.max(m, o.displayOrder ?? 0), -1)
  const withOrder = extras.map((o, i) => ({
    ...o,
    hidden: false,
    displayOrder: maxOrder + 1 + i,
  }))
  return [...list.slice(0, insertAt), ...withOrder, ...list.slice(insertAt)]
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const ORIGINE_CANONICAL_MAP: Record<string, string> = {
  'campagne ads': 'Campagne ADS Google',
  'campagne ads - google': 'Campagne ADS Google',
  'campagne ads google': 'Campagne ADS Google',
  'reseaux sociaux': 'Campagne ADS META',
  'campagne reseaux sociaux - meta': 'Campagne ADS META',
  'campagne reseaux sociaux meta': 'Campagne ADS META',
}

export function normalizeOrigineValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  const canonical = ORIGINE_CANONICAL_MAP[normalizeKey(raw)]
  return canonical ?? raw
}

// Variantes brutes encore présentes en base qui se normalisent vers une même
// valeur canonique. Le menu de filtre affiche la valeur canonique (ex.
// « Campagne ADS Google »), mais d'anciens enregistrements stockent encore la
// variante brute (« Campagne ADS », « Réseaux sociaux »…). Pour que le filtre
// compte TOUTES les lignes, on élargit la valeur canonique sélectionnée à
// l'ensemble de ses variantes au moment de la requête.
const ORIGINE_FILTER_VARIANTS: Record<string, string[]> = {
  'Campagne ADS Google': ['Campagne ADS Google', 'Campagne ADS'],
  'Campagne ADS META': ['Campagne ADS META', 'Réseaux sociaux'],
}

/** Retourne toutes les variantes brutes à matcher pour une valeur d'origine. */
export function expandOrigineFilterValue(value: string): string[] {
  return ORIGINE_FILTER_VARIANTS[value] ?? [value]
}

/** Élargit une liste (CSV déjà splitté) de valeurs d'origine vers leurs variantes. */
export function expandOrigineFilterValues(values: string[]): string[] {
  const out = new Set<string>()
  for (const v of values) {
    for (const variant of expandOrigineFilterValue(v)) out.add(variant)
  }
  return [...out]
}
