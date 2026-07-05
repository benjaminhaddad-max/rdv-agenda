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
  { id: 'Etudes Sup.',       label: 'Études Sup.' },
  { id: 'Autres',            label: 'Autres' },
]

export const PERIOD_OPTIONS: SelectOption[] = [
  { id: '',       label: 'Toutes les périodes' },
  { id: 'today',  label: "Aujourd'hui" },
  { id: 'week',   label: 'Cette semaine' },
  { id: 'month',  label: 'Ce mois' },
]

// Fallback de "Statut du lead" : tant que /api/crm/field-options n'a pas répondu
// (elle peut prendre ~20s en prod car elle scanne crm_contacts), on a déjà la
// liste connue dans le dropdown. Évite que le filtre tombe en input texte.
export const LEAD_STATUS_OPTIONS_FALLBACK: SelectOption[] = [
  { id: 'Nouveau',                     label: 'Nouveau' },
  { id: 'Nouveau - Chaud',             label: 'Nouveau - Chaud' },
  { id: 'En cours',                    label: 'En cours' },
  { id: 'RDV pris',                    label: 'RDV pris' },
  { id: 'A replanifier',               label: 'A replanifier' },
  { id: 'A relancer',                  label: 'A relancer' },
  { id: 'NRP1',                        label: 'NRP1' },
  { id: 'NRP2',                        label: 'NRP2' },
  { id: 'NRP3',                        label: 'NRP3' },
  { id: 'NRP4',                        label: 'NRP4' },
  { id: 'Raccroche au nez',            label: 'Raccroche au nez' },
  { id: 'Mauvais numéro',              label: 'Mauvais numéro' },
  { id: 'En attente / Réfléchit',      label: 'En attente / Réfléchit' },
  { id: 'Autre prépa concurrente',     label: 'Autre prépa concurrente' },
  { id: "A garder pour l'an prochain", label: "A garder pour l'an prochain" },
  { id: 'Pré-inscrit 2025/2026',       label: 'Pré-inscrit 2025/2026' },
  { id: 'Pré-inscrit 2026/2027',       label: 'Pré-inscrit 2026/2027' },
  { id: 'Inscrit',                     label: 'Inscrit' },
  { id: 'Doublon',                     label: 'Doublon' },
  { id: 'Disqualifié',                 label: 'Disqualifié' },
]

// ── Système de filtres avancés ─────────────────────────────────────────────

export type CRMFilterField =
  | 'stage' | 'formation' | 'classe' | 'closer_contact' | 'closer' | 'contact_owner' | 'telepro'
  | 'lead_status' | 'source' | 'period' | 'search' | 'zone' | 'departement'
  | 'pipeline' | 'prior_preinscription' | 'form_event' | 'parcoursup_verdict'

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

// Verdict Parcoursup (saison 2026-2027). Source : crm_pre_inscriptions
// (external_data.parcoursup.verdict) + override CRM, calculé côté serveur —
// ce n'est PAS une propriété HubSpot, d'où l'option hardcodée ici.
export const PARCOURSUP_VERDICT_FILTER_OPTIONS: SelectOption[] = [
  { id: 'ok_valide',  label: 'OK VALIDÉ' },
  { id: 'ok_attente', label: 'OK EN ATTENTE' },
  { id: 'good',       label: 'GOOD EN PRINCIPE' },
  { id: 'attention',  label: 'ATTENTION JUSTE' },
  { id: 'bascule',    label: 'BASCULE COMPLÈTE PAES' },
  { id: 'aucun',      label: 'Sans verdict' },
]

export const CRM_FILTER_FIELDS: { key: CRMFilterField; label: string; type: 'select' | 'text' }[] = [
  { key: 'stage',              label: 'Étape de transaction',          type: 'select' },
  { key: 'formation',          label: 'Formation souhaitée',           type: 'select' },
  { key: 'classe',             label: 'Classe actuelle',               type: 'select' },
  { key: 'contact_owner',      label: 'Propriétaire du contact',       type: 'select' },
  { key: 'closer_contact',     label: 'Closer du contact',             type: 'select' },
  { key: 'telepro',            label: 'Télépro',                       type: 'select' },
  { key: 'lead_status',        label: 'Statut du lead',                type: 'select' },
  { key: 'source',             label: 'Origine',                       type: 'select' },
  { key: 'zone',               label: 'Zone / Localité',               type: 'select' },
  { key: 'departement',        label: 'Département',                   type: 'select' },
  { key: 'period',             label: 'Période',                       type: 'select' },
  { key: 'pipeline',           label: 'Pipeline (Année)',              type: 'select' },
  { key: 'prior_preinscription', label: 'Pré-inscrits années préc.', type: 'select' },
  { key: 'form_event',         label: 'Soumission de formulaire',      type: 'select' },
  { key: 'parcoursup_verdict', label: 'Verdict Parcoursup',            type: 'select' },
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

// Verdict Parcoursup : résolution par liste de statuts côté API.
//  - is / is_any  → filtre sur un ou plusieurs statuts précis
//  - is_not_empty → "est connu" : tous ceux qui ont un verdict (quel qu'il soit)
//  - is_empty     → "est inconnu" : ceux sans verdict
export const PARCOURSUP_VERDICT_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'is',           label: 'est' },
  { key: 'is_any',       label: 'est parmi' },
  { key: 'is_not_empty', label: 'est connu' },
  { key: 'is_empty',     label: 'est inconnu' },
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

/** Propriétés HubSpot (custom:xxx) → clé filtre natif CRM. */
export const HUBSPOT_PROP_TO_FILTER_KEY: Record<string, CRMFilterField> = {
  hs_lead_status: 'lead_status',
  origine: 'source',
  zone_localite: 'zone',
  classe_actuelle: 'classe',
  formation_souhaitee: 'formation',
  teleprospecteur: 'telepro',
  hubspot_owner_id: 'contact_owner',
  closer_hs_id: 'closer_contact',
  contact_owner_hs_id: 'contact_owner',
}

export function normalizeFilterFieldKey(field: string): string {
  if (field.startsWith('custom:')) {
    const name = field.slice(7)
    return HUBSPOT_PROP_TO_FILTER_KEY[name] ?? field
  }
  if (field === 'origine') return 'source'
  return field
}

/** Champs filtre CRM affichés en multi-sélection (valeurs séparées par des virgules). */
export const MULTI_SELECT_FILTER_FIELDS = new Set<CRMFilterField>([
  'stage', 'formation', 'closer_contact', 'contact_owner', 'telepro',
  'lead_status', 'source', 'zone', 'departement', 'pipeline', 'form_event',
  'parcoursup_verdict',
])

export const LEAD_STATUS_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'is_any',       label: 'est parmi' },
  { key: 'is_none',      label: "n'est aucun de" },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

export function fieldUsesMultiSelect(field: CRMFilterField | string): boolean {
  const key = normalizeFilterFieldKey(field)
  return MULTI_SELECT_FILTER_FIELDS.has(key as CRMFilterField)
}

export function defaultOpForField(
  field: CRMFilterField | string,
  prop?: { type?: string; field_type?: string },
): CRMFilterOp {
  if (prop) {
    const k = propertyKindOf(prop.type, prop.field_type)
    if (k === 'date' || k === 'datetime') return 'eq'
    if (k === 'number') return 'eq'
    if (k === 'enum') return 'is_any'
    if (k === 'text') return 'contains'
    return 'is'
  }
  if (fieldUsesMultiSelect(field)) return 'is_any'
  const f = CRM_FILTER_FIELDS.find(ff => ff.key === field)
  return f?.type === 'select' ? 'is' : 'contains'
}

/** Opérateur compatible multi-sélection (règles legacy « est » → « est parmi »). */
export function coerceMultiSelectOperator(field: CRMFilterField | string, operator: CRMFilterOp): CRMFilterOp {
  if (!fieldUsesMultiSelect(field)) return operator
  if (operator === 'is') return 'is_any'
  if (operator === 'is_not') return 'is_none'
  return operator
}

export function shouldRenderMultiSelect(field: CRMFilterField | string, operator: CRMFilterOp): boolean {
  if (!opNeedsValue(operator)) return false
  return opIsMulti(operator) || fieldUsesMultiSelect(field)
}

export function normalizeFilterRule(rule: CRMFilterRule): CRMFilterRule {
  const rawField = String(rule.field)
  const canonical = normalizeFilterFieldKey(rawField)
  const field = (canonical.startsWith('custom:') ? rawField : canonical) as CRMFilterField
  return {
    ...rule,
    field,
    operator: coerceMultiSelectOperator(field, rule.operator),
  }
}

export function normalizeFilterGroups(groups: CRMFilterGroup[]): CRMFilterGroup[] {
  return groups.map(g => ({
    ...g,
    rules: g.rules.map(normalizeFilterRule),
  }))
}

/** Convertit le 1er groupe de filtres avancés en `filters` plat (backup / legacy). */
export function filterGroupsToLegacyFilters(groups: CRMFilterGroup[]): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  const firstGroup = groups[0]
  if (!firstGroup) return filters

  const pushMulti = (key: string, raw: string) => {
    const vals = raw.split(',').map(s => s.trim()).filter(Boolean)
    if (vals.length === 0) return
    filters[key] = vals.length > 1 ? vals : vals[0]
  }

  for (const rule of firstGroup.rules) {
    if (!rule.value && rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty') continue
    const field = normalizeFilterFieldKey(rule.field)
    if (rule.operator === 'is_any' || rule.operator === 'is') {
      switch (field) {
        case 'classe': pushMulti('classe', rule.value); break
        case 'zone': pushMulti('zone', rule.value); break
        case 'departement': pushMulti('departement', rule.value); break
        case 'formation': pushMulti('formation', rule.value); break
        case 'lead_status': pushMulti('lead_status', rule.value); break
        case 'source': pushMulti('origine', rule.value); break
        case 'contact_owner': pushMulti('contact_owner', rule.value); break
        default: break
      }
    }
  }
  return filters
}

export function hasActiveFilterGroups(groups: CRMFilterGroup[] | null | undefined): boolean {
  return Array.isArray(groups) && groups.some(g => (g.rules?.length ?? 0) > 0)
}

export function opsForField(field: CRMFilterField | string) {
  const key = normalizeFilterFieldKey(field)
  if (key === 'parcoursup_verdict') return PARCOURSUP_VERDICT_OPS
  if (key === 'lead_status') return LEAD_STATUS_OPS
  const f = CRM_FILTER_FIELDS.find(ff => ff.key === key)
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
