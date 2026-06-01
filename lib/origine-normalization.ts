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
