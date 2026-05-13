/**
 * Constantes et types statiques utilisés sur la page CRM principale.
 * Extraits de app/admin/crm/page.tsx — pas de logique, juste des données.
 */

// Pipeline actuel (Diploma Santé 2026-2027)
export const CURRENT_PIPELINE_ID = '2313043166'

// ── Options statiques ──────────────────────────────────────────────────────

export interface SelectOption { id: string; label: string }

export const STAGE_OPTIONS: SelectOption[] = [
  { id: '',           label: 'Toutes les étapes de transaction' },
  { id: '3165428979', label: 'À Replanifier' },
  { id: '3165428980', label: 'RDV Pris' },
  { id: '3165428981', label: 'Délai Réflexion' },
  { id: '3165428982', label: 'Pré-inscription' },
  { id: '3165428983', label: 'Finalisation' },
  { id: '3165428984', label: 'Inscription Confirmée' },
  { id: '3165428985', label: 'Fermé Perdu' },
]

export const FORMATION_OPTIONS: SelectOption[] = [
  { id: '',              label: 'Toutes formations souhaitées' },
  { id: 'PASS',          label: 'PASS' },
  { id: 'LSPS',          label: 'LSPS' },
  { id: 'LAS',           label: 'LAS' },
  { id: 'P-1',           label: 'P-1' },
  { id: 'P-2',           label: 'P-2' },
  { id: 'PAES FR',       label: 'PAES FR' },
  { id: 'PAES EU',       label: 'PAES EU' },
  { id: 'LSPS2 UPEC',   label: 'LSPS2 UPEC' },
  { id: 'LSPS3 UPEC',   label: 'LSPS3 UPEC' },
]

export const CLASSE_OPTIONS: SelectOption[] = [
  { id: '',                  label: 'Toutes classes actuelles' },
  { id: 'Terminale',         label: 'Terminale' },
  { id: 'Première',          label: 'Première' },
  { id: 'Seconde',           label: 'Seconde' },
  { id: 'Troisième',         label: 'Troisième' },
  { id: 'PASS',              label: 'PASS' },
  { id: 'LSPS 1',            label: 'LSPS 1' },
  { id: 'LSPS 2',            label: 'LSPS 2' },
  { id: 'LSPS 3',            label: 'LSPS 3' },
  { id: 'LAS 1',             label: 'LAS 1' },
  { id: 'LAS 2',             label: 'LAS 2' },
  { id: 'LAS 3',             label: 'LAS 3' },
  { id: 'Etudes médicales',  label: 'Études médicales' },
]

export const PERIOD_OPTIONS: SelectOption[] = [
  { id: '',       label: 'Toutes les périodes' },
  { id: 'today',  label: "Aujourd'hui" },
  { id: 'week',   label: 'Cette semaine' },
  { id: 'month',  label: 'Ce mois' },
]

// ── Système de filtres avancés ─────────────────────────────────────────────

export type CRMFilterField =
  | 'stage' | 'formation' | 'classe' | 'closer' | 'closer_contact' | 'contact_owner' | 'telepro'
  | 'lead_status' | 'source' | 'period' | 'search' | 'zone' | 'departement'
  | 'pipeline' | 'prior_preinscription'

export type CRMFilterOp =
  | 'is' | 'is_not' | 'is_any' | 'is_none'
  | 'contains' | 'not_contains'
  | 'is_empty' | 'is_not_empty'
  // Numeric / date operators
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between'
  | 'before' | 'after'

export interface CRMFilterRule {
  id: string
  field: CRMFilterField
  operator: CRMFilterOp
  value: string
}

export interface CRMFilterGroup {
  id: string
  rules: CRMFilterRule[]
}

export const CRM_FILTER_FIELDS: { key: CRMFilterField; label: string; type: 'select' | 'text' }[] = [
  { key: 'stage',              label: 'Étape de transaction',          type: 'select' },
  { key: 'formation',          label: 'Formation souhaitée',           type: 'select' },
  { key: 'classe',             label: 'Classe actuelle',               type: 'select' },
  { key: 'contact_owner',      label: 'Propriétaire du contact',       type: 'select' },
  { key: 'closer',             label: 'Propriétaire de la transaction',type: 'select' },
  { key: 'closer_contact',     label: 'Closer du contact',             type: 'select' },
  { key: 'telepro',            label: 'Télépro',                       type: 'select' },
  { key: 'lead_status',        label: 'Statut du lead',                type: 'select' },
  { key: 'source',             label: 'Origine',                       type: 'select' },
  { key: 'zone',               label: 'Zone / Localité',               type: 'select' },
  { key: 'departement',        label: 'Département',                   type: 'select' },
  { key: 'period',             label: 'Période',                       type: 'select' },
  { key: 'pipeline',           label: 'Pipeline (Année)',              type: 'select' },
  { key: 'prior_preinscription', label: 'Pré-inscrits années préc.', type: 'select' },
  { key: 'search',             label: 'Recherche',                     type: 'text' },
]

export const SELECT_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'is',           label: 'est' },
  { key: 'is_not',       label: "n'est pas" },
  { key: 'is_any',       label: 'est parmi' },
  { key: 'is_none',      label: "n'est aucun de" },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

export const TEXT_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'contains',     label: 'contient' },
  { key: 'not_contains', label: 'ne contient pas' },
  { key: 'is',           label: 'est exactement' },
  { key: 'is_not',       label: "n'est pas" },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

export const DATE_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'eq',           label: 'est égal à' },
  { key: 'before',       label: 'est avant' },
  { key: 'after',        label: 'est après' },
  { key: 'between',      label: 'se trouve entre' },
  { key: 'gt',           label: 'est supérieur à' },
  { key: 'lt',           label: 'est inférieur à' },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

export const NUMBER_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'eq',           label: 'est égal à' },
  { key: 'neq',          label: "n'est pas égal à" },
  { key: 'gt',           label: 'est supérieur à' },
  { key: 'gte',          label: 'est supérieur ou égal à' },
  { key: 'lt',           label: 'est inférieur à' },
  { key: 'lte',          label: 'est inférieur ou égal à' },
  { key: 'between',      label: 'est entre' },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

export const BOOL_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'is',           label: 'est' },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

export type PropertyKind = 'date' | 'datetime' | 'number' | 'enum' | 'bool' | 'text'

/** Détermine le « kind » d'une propriété HubSpot pour choisir l'input + les opérateurs. */
export function propertyKindOf(type?: string, fieldType?: string): PropertyKind {
  const t = (type || '').toLowerCase()
  const ft = (fieldType || '').toLowerCase()
  if (t === 'date' || ft === 'date') return 'date'
  if (t === 'datetime' || ft === 'datetime') return 'datetime'
  if (t === 'number' || t === 'int' || t === 'long' || t === 'float' || ft === 'number') return 'number'
  if (t === 'bool' || t === 'boolean' || ft === 'booleancheckbox' || ft === 'radio' && (t === 'bool')) return 'bool'
  if (t === 'enumeration' || ft === 'select' || ft === 'radio' || ft === 'checkbox') return 'enum'
  return 'text'
}

export function opsForKind(kind: PropertyKind) {
  switch (kind) {
    case 'date':
    case 'datetime': return DATE_OPS
    case 'number':   return NUMBER_OPS
    case 'bool':     return BOOL_OPS
    case 'enum':     return SELECT_OPS
    default:         return TEXT_OPS
  }
}

export function opsForField(field: CRMFilterField) {
  const f = CRM_FILTER_FIELDS.find(ff => ff.key === field)
  return f?.type === 'select' ? SELECT_OPS : TEXT_OPS
}

export function opNeedsValue(op: CRMFilterOp) {
  return op !== 'is_empty' && op !== 'is_not_empty'
}

export function opIsMulti(op: CRMFilterOp) {
  return op === 'is_any' || op === 'is_none'
}

export function opIsRange(op: CRMFilterOp) {
  return op === 'between'
}
