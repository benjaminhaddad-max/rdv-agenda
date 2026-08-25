/**
 * Buckets d'attribution CRM.
 *
 * Un bucket = un type de lead (classe + zone). Les sous-vues sont toujours
 * les mêmes par défaut, puis ajustables à la main comme n'importe quelle vue.
 *
 * Pour créer un bucket demain : passer `enabled: true` ci-dessous, puis
 * `bun run scripts/seed-attribution-buckets.ts`.
 */

import type { CRMFilterGroup, CRMFilterOp, CRMFilterRule } from './crm-constants'
import type { CRMSavedView } from './crm-views'

export const ATTRIBUTION_ID_PREFIX = 'b_'

export const MEDIBOX_ZONES = [
  'Lille',
  'Bordeaux / Pau',
  'Montpellier / Nimes',
  'Aix / Marseille',
] as const

export const UNTREATED_LEAD_STATUSES = [
  'Nouveau',
  'Nouveau - Chaud',
  'NRP1',
  'NRP2',
  'NRP3',
  'NRP4',
  'A relancer',
  'A replanifier',
] as const

export const NRP_LEAD_STATUSES = ['NRP1', 'NRP2', 'NRP3', 'NRP4'] as const

export const NOUVEAU_LEAD_STATUSES = ['Nouveau', 'Nouveau - Chaud'] as const

export const INSCRIT_LEAD_STATUSES = [
  'Inscrit',
  'Pré-inscrit 2026/2027',
  'Pré-inscrit 2025/2026',
] as const

export const ETUDES_SUP_CLASSES = [
  'Etudes Sup.',
  'Autres',
  'PASS',
  'LSPS 1',
  'LSPS 2',
  'LSPS 3',
  'LAS 1',
  'LAS 2',
  'LAS 3',
  'Etudes médicales',
] as const

export type AttributionSubViewKey =
  | 'unassigned'
  | 'untreated'
  | 'nouveau'
  | 'nrp'
  | 'relancer'
  | 'replanifier'
  | 'inscrit'

export interface AttributionBucketFilters {
  classe?: string[]
  classeNot?: string[]
  zone?: string[]
  zoneNot?: string[]
}

export interface AttributionBucketDef {
  id: string
  name: string
  /** Seuls les buckets enabled sont matérialisés en base. */
  enabled: boolean
  filters: AttributionBucketFilters
  note?: string
}

export interface AttributionSubViewDef {
  key: AttributionSubViewKey
  name: string
  leadStatuses?: readonly string[]
  includeEmptyLeadStatus?: boolean
  noTelepro?: boolean
}

/** Sous-vues créées automatiquement pour chaque bucket. */
export const DEFAULT_ATTRIBUTION_SUBVIEWS: AttributionSubViewDef[] = [
  { key: 'unassigned', name: 'Non assignés télépro', noTelepro: true },
  {
    key: 'untreated',
    name: 'Non traités',
    leadStatuses: UNTREATED_LEAD_STATUSES,
    includeEmptyLeadStatus: true,
  },
  { key: 'nouveau', name: 'Nouveau', leadStatuses: NOUVEAU_LEAD_STATUSES },
  { key: 'nrp', name: 'NRP', leadStatuses: NRP_LEAD_STATUSES },
  { key: 'relancer', name: 'À relancer', leadStatuses: ['A relancer'] },
  { key: 'replanifier', name: 'À replanifier', leadStatuses: ['A replanifier'] },
  { key: 'inscrit', name: 'Inscrit', leadStatuses: INSCRIT_LEAD_STATUSES },
]

export const ATTRIBUTION_BUCKETS: AttributionBucketDef[] = [
  {
    id: 'b_term_hors_idf_medibox',
    name: 'Terminale Hors IDF MEDIBOX',
    enabled: true,
    filters: {
      classe: ['Terminale'],
      zone: [...MEDIBOX_ZONES],
    },
    note: 'Régions Medibox : Lille, Bordeaux, Montpellier, Marseille.',
  },
  {
    id: 'b_term_hors_idf_hors_medibox',
    name: 'Terminale Hors IDF HORS MEDIBOX',
    enabled: false,
    filters: {
      classe: ['Terminale'],
      zoneNot: ['IDF', ...MEDIBOX_ZONES],
    },
  },
  {
    id: 'b_premiere_idf',
    name: 'Première IDF',
    enabled: false,
    filters: {
      classe: ['Première'],
      zone: ['IDF'],
    },
  },
  {
    id: 'b_premiere_hors_idf',
    name: 'Première hors IDF',
    enabled: false,
    filters: {
      classe: ['Première'],
      zoneNot: ['IDF'],
    },
  },
  {
    id: 'b_etudes_sup_autres',
    name: 'Études Sup / Autres',
    enabled: false,
    filters: {
      classe: [...ETUDES_SUP_CLASSES],
    },
    note: 'IDF + hors IDF. À affiner (PASS / LAS / LSPS inclus pour l’instant).',
  },
]

function makeRule(
  id: string,
  field: CRMFilterRule['field'],
  operator: CRMFilterOp,
  value: string,
): CRMFilterRule {
  return { id, field, operator, value }
}

export function bucketBaseGroups(bucket: AttributionBucketDef): CRMFilterGroup[] {
  const rules: CRMFilterRule[] = []
  const f = bucket.filters
  if (f.classe && f.classe.length > 0) {
    rules.push(makeRule(
      `${bucket.id}_r_classe`,
      'classe',
      f.classe.length > 1 ? 'is_any' : 'is',
      f.classe.join(','),
    ))
  }
  if (f.classeNot && f.classeNot.length > 0) {
    rules.push(makeRule(
      `${bucket.id}_r_classe_not`,
      'classe',
      f.classeNot.length > 1 ? 'is_none' : 'is_not',
      f.classeNot.join(','),
    ))
  }
  if (f.zone && f.zone.length > 0) {
    rules.push(makeRule(
      `${bucket.id}_r_zone`,
      'zone',
      f.zone.length > 1 ? 'is_any' : 'is',
      f.zone.join(','),
    ))
  }
  if (f.zoneNot && f.zoneNot.length > 0) {
    rules.push(makeRule(
      `${bucket.id}_r_zone_not`,
      'zone',
      f.zoneNot.length > 1 ? 'is_none' : 'is_not',
      f.zoneNot.join(','),
    ))
  }
  return [{ id: `${bucket.id}_g`, rules }]
}

export function subViewId(bucketId: string, key: AttributionSubViewKey): string {
  return `${bucketId}__${key}`
}

export function parseAttributionParentId(id: string): string | null {
  if (!id.startsWith(ATTRIBUTION_ID_PREFIX)) return null
  const idx = id.indexOf('__')
  if (idx < 0) return null
  return id.slice(0, idx)
}

export function isAttributionBucketId(id: string): boolean {
  return id.startsWith(ATTRIBUTION_ID_PREFIX) && !id.includes('__')
}

export function isAttributionSubViewId(id: string): boolean {
  return id.startsWith(ATTRIBUTION_ID_PREFIX) && id.includes('__')
}

export function inferViewKind(id: string, parentId?: string | null): CRMSavedView['kind'] {
  if (parentId || isAttributionSubViewId(id)) return 'subview'
  if (isAttributionBucketId(id)) return 'bucket'
  return 'view'
}

function subViewGroups(bucket: AttributionBucketDef, sub: AttributionSubViewDef): CRMFilterGroup[] {
  const base = bucketBaseGroups(bucket)
  const extra: CRMFilterRule[] = []
  if (sub.leadStatuses && sub.leadStatuses.length > 0) {
    extra.push(makeRule(
      `${subViewId(bucket.id, sub.key)}_r_status`,
      'lead_status',
      sub.leadStatuses.length > 1 ? 'is_any' : 'is',
      sub.leadStatuses.join(','),
    ))
  }
  const first = base[0]
  if (!first) return extra.length ? [{ id: `${subViewId(bucket.id, sub.key)}_g`, rules: extra }] : []
  return [{ ...first, rules: [...first.rules, ...extra] }]
}

export function buildBucketParentView(bucket: AttributionBucketDef): CRMSavedView {
  return {
    id: bucket.id,
    name: bucket.name,
    groups: bucketBaseGroups(bucket),
    kind: 'bucket',
    parentId: null,
    isDefault: false,
  }
}

export function buildBucketSubView(
  bucket: AttributionBucketDef,
  sub: AttributionSubViewDef,
): CRMSavedView {
  return {
    id: subViewId(bucket.id, sub.key),
    name: sub.name,
    groups: subViewGroups(bucket, sub),
    kind: 'subview',
    parentId: bucket.id,
    presetFlags: {
      ...(sub.noTelepro ? { noTelepro: true } : {}),
      ...(sub.includeEmptyLeadStatus ? { includeEmptyLeadStatus: true } : {}),
    },
  }
}

export function buildBucketFamily(bucket: AttributionBucketDef): CRMSavedView[] {
  const parent = buildBucketParentView(bucket)
  const children = DEFAULT_ATTRIBUTION_SUBVIEWS.map(sub => buildBucketSubView(bucket, sub))
  return [parent, ...children]
}

export function enabledAttributionBuckets(): AttributionBucketDef[] {
  return ATTRIBUTION_BUCKETS.filter(b => b.enabled)
}

export function findAttributionBucket(id: string): AttributionBucketDef | undefined {
  const parentId = parseAttributionParentId(id) ?? (isAttributionBucketId(id) ? id : null)
  if (!parentId) return undefined
  return ATTRIBUTION_BUCKETS.find(b => b.id === parentId)
}
