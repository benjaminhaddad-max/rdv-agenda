export const ALLOWED_CLASSE_ACTUELLE_VALUES = [
  'Terminale',
  'Première',
  'Seconde',
  'Troisième',
  'PASS',
  'LSPS 1',
  'LSPS 2',
  'LSPS 3',
  'LAS 1',
  'LAS 2',
  'LAS 3',
  'Etudes médicales',
  'Etudes Sup.',
  'Autres',
] as const

const ALLOWED_BY_KEY = new Map<string, string>(
  ALLOWED_CLASSE_ACTUELLE_VALUES.map(v => [normalizeClasseKey(v), v]),
)

const ALIAS_MAP: Record<string, string> = {
  premiere: 'Première',
  p1: 'Première',
  terminale: 'Terminale',
  term: 'Terminale',
  seconde: 'Seconde',
  seconde_generale: 'Seconde',
  troisieme: 'Troisième',
  pass: 'PASS',
  paces: 'PASS',
  bac_1: 'Etudes Sup.',
  bac1: 'Etudes Sup.',
  bac_2: 'Etudes Sup.',
  bac2: 'Etudes Sup.',
  bac_3: 'Etudes Sup.',
  bac3: 'Etudes Sup.',
  bac_plus_1: 'Etudes Sup.',
  bac_plus_2: 'Etudes Sup.',
  bac_plus_3: 'Etudes Sup.',
  post_bac: 'Etudes Sup.',
  etudes_superieures: 'Etudes Sup.',
  etude_superieure: 'Etudes Sup.',
  etudes_sup: 'Etudes Sup.',
  etude_sup: 'Etudes Sup.',
  etudesup: 'Etudes Sup.',
  autre: 'Autres',
  autres: 'Autres',
  etudes_medicales: 'Etudes médicales',
  etude_medicale: 'Etudes médicales',
  etudesmedicales: 'Etudes médicales',
}

export function normalizeClasseKey(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function normalizeClasseActuelle(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const key = normalizeClasseKey(raw)
  const exact = ALLOWED_BY_KEY.get(key)
  if (exact) return exact

  const lasMatch = key.match(/^las_?([123])$/)
  if (lasMatch) return `LAS ${lasMatch[1]}`
  if (key === 'las') return 'LAS 1'

  const lspsMatch = key.match(/^lsps_?([123])$/)
  if (lspsMatch) return `LSPS ${lspsMatch[1]}`
  if (key === 'lsps') return 'LSPS 1'

  // Legacy free-text values like "bac +1", "pass +1", "post bac 2", etc.
  if (/^(bac|pass|paces|post_bac)(?:_plus)?_[123]$/.test(key)) return 'Etudes Sup.'

  return ALIAS_MAP[key] ?? null
}

