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
