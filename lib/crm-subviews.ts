/**
 * Sous-vues cliquables : n'importe quelle vue CRM peut avoir ses sous-vues
 * (pastilles sous les onglets), créées en cochant des critères simples
 * (télépro, zone, classe, statut… et, pour une vue Lab, app / ville / action).
 *
 * Une sous-vue = une ligne crm_saved_views avec parent_id = la vue parente et
 * kind = 'subview'. Ses filter_groups sont COMPLETS (règles du parent + ses
 * propres règles, préfixées `sv_`) pour que les compteurs, l'API (view_id) et
 * les vues télépro fonctionnent sans rien changer. Quand on modifie les
 * filtres du parent, on recompose ses sous-vues (voir `recomposeSubview`).
 */

import type { CRMFilterGroup, CRMFilterOp, CRMFilterRule } from './crm-constants'
import type { CRMSavedView } from './crm-views'
import {
  BUCKET_FACET_IDF_ZONES,
  ETUDES_SUP_CLASSES,
  INSCRIT_LEAD_STATUSES,
  MEDIBOX_ZONES,
  NOUVEAU_LEAD_STATUSES,
  NRP_LEAD_STATUSES,
  UNTREATED_LEAD_STATUSES,
} from './crm-attribution-buckets'
import { INSCRIPTION_PROGRAMMES } from './inscription-programmes'

export const SUBVIEW_RULE_PREFIX = 'sv_'

type RuleField = CRMFilterRule['field']

export interface SubviewChoice {
  key: string
  label: string
  field: RuleField
  operator: CRMFilterOp
  values: readonly string[]
  /** Ex. « Non traités » inclut les contacts sans statut. */
  includeEmptyLeadStatus?: boolean
}

export interface SubviewSection {
  key: string
  label: string
  /** Une seule valeur à la fois (ex. avec / sans télépro). */
  single?: boolean
  choices: SubviewChoice[]
}

const POSITIVE_OPS: CRMFilterOp[] = ['is', 'is_any']
const NEGATIVE_OPS: CRMFilterOp[] = ['is_not', 'is_none']
/** Champs résolus côté API par familles : jamais fusionnés entre règles. */
const RESOLVED_FIELDS = new Set<string>(['lab_app', 'lab_callback', 'inscription_programme'])

const splitValues = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)

function parentRules(parent: CRMSavedView): CRMFilterRule[] {
  return parent.groups[0]?.rules ?? []
}

function parentPositiveValues(parent: CRMSavedView, field: string): string[] | null {
  const r = parentRules(parent).find(x => x.field === field && POSITIVE_OPS.includes(x.operator))
  return r ? splitValues(r.value) : null
}

function parentNegativeValues(parent: CRMSavedView, field: string): string[] {
  return parentRules(parent)
    .filter(x => x.field === field && NEGATIVE_OPS.includes(x.operator))
    .flatMap(x => splitValues(x.value))
}

/** La vue parente est-elle une vue « apps Lab » ? */
export function isLabView(parent: CRMSavedView): boolean {
  return parentRules(parent).some(r => r.field === 'lab_app')
}

/**
 * Critères proposés pour une vue donnée : on masque ce que la vue fixe déjà
 * (classe unique, télépro…) et on restreint les valeurs à celles possibles.
 */
export function subviewSectionsFor(parent: CRMSavedView): SubviewSection[] {
  const sections: SubviewSection[] = []

  if (isLabView(parent)) {
    sections.push({
      key: 'lab_app',
      label: 'App',
      choices: [
        { key: 'diplomalab', label: 'Diplomalab', field: 'lab_app', operator: 'is_any', values: ['diplomalab'] },
        { key: 'medibox', label: 'Medibox Lab', field: 'lab_app', operator: 'is_any', values: ['medibox'] },
      ],
    })
    sections.push({
      key: 'lab_city',
      label: 'Ville Medibox',
      choices: [
        { key: 'marseille', label: 'Marseille', field: 'lab_app', operator: 'is_any', values: ['ville_marseille'] },
        { key: 'montpellier', label: 'Montpellier', field: 'lab_app', operator: 'is_any', values: ['ville_montpellier'] },
        { key: 'lille', label: 'Lille', field: 'lab_app', operator: 'is_any', values: ['ville_lille'] },
        { key: 'bordeaux', label: 'Bordeaux', field: 'lab_app', operator: 'is_any', values: ['ville_bordeaux'] },
        { key: 'autre', label: 'Autre / sans ville', field: 'lab_app', operator: 'is_any', values: ['ville_autre'] },
      ],
    })
    sections.push({
      key: 'lab_action',
      label: "Dans l'app",
      choices: [
        { key: 'essai', label: 'Essai gratuit', field: 'lab_app', operator: 'is_any', values: ['essai'] },
        { key: 'rappel', label: 'A demandé un rappel', field: 'lab_app', operator: 'is_any', values: ['rappel'] },
        { key: 'candidature', label: 'A déposé sa candidature', field: 'lab_app', operator: 'is_any', values: ['candidature'] },
      ],
    })
  }

  // Vue « inscrits » : sous-vues par programme et par étape d'inscription.
  if (parentRules(parent).some(r => r.field === 'inscription_programme')) {
    sections.push({
      key: 'inscription_programme',
      label: 'Programme',
      choices: INSCRIPTION_PROGRAMMES.map(p => ({
        key: p.key, label: p.label, field: 'inscription_programme' as RuleField, operator: 'is_any' as CRMFilterOp, values: [p.key],
      })),
    })
    sections.push({
      key: 'inscription_etape',
      label: 'Étape',
      choices: [
        { key: 'preinscrit', label: 'Pré-inscrit', field: 'inscription_programme', operator: 'is_any', values: ['etape_preinscrit'] },
        { key: 'finalisation', label: 'En finalisation', field: 'inscription_programme', operator: 'is_any', values: ['etape_finalisation'] },
        { key: 'finalise', label: 'Finalisé', field: 'inscription_programme', operator: 'is_any', values: ['etape_finalise'] },
      ],
    })
  }

  const teleproFixed = !!parent.presetFlags?.noTelepro ||
    parentRules(parent).some(r => r.field === 'telepro')
  if (!teleproFixed) {
    sections.push({
      key: 'telepro',
      label: 'Télépro',
      single: true,
      choices: [
        { key: 'sans', label: 'Sans télépro', field: 'telepro', operator: 'is_empty', values: [] },
        { key: 'avec', label: 'Avec télépro', field: 'telepro', operator: 'is_not_empty', values: [] },
      ],
    })
  }

  // Zone : si la vue fixe déjà des zones, on ne propose que celles-ci.
  const parentZones = parentPositiveValues(parent, 'zone')
  const excludedZones = parentNegativeValues(parent, 'zone')
  let zoneChoices: SubviewChoice[]
  if (parentZones) {
    zoneChoices = parentZones.length > 1
      ? parentZones.map(z => ({ key: z, label: z, field: 'zone' as RuleField, operator: 'is_any' as CRMFilterOp, values: [z] }))
      : []
  } else {
    const allZones: SubviewChoice[] = [
      { key: 'idf', label: 'IDF', field: 'zone', operator: 'is_any', values: [...BUCKET_FACET_IDF_ZONES] },
      { key: 'hors_idf', label: 'Hors IDF', field: 'zone', operator: 'is_none', values: [...BUCKET_FACET_IDF_ZONES] },
      ...MEDIBOX_ZONES.map(z => ({ key: z, label: z, field: 'zone' as RuleField, operator: 'is_any' as CRMFilterOp, values: [z] })),
    ]
    zoneChoices = allZones.filter(c => c.operator !== 'is_any' || !c.values.every(v => excludedZones.includes(v)))
    if (excludedZones.length > 0) zoneChoices = zoneChoices.filter(c => c.key !== 'hors_idf')
  }
  if (zoneChoices.length > 0) sections.push({ key: 'zone', label: 'Zone', choices: zoneChoices })

  // Classe : masquée si la vue est déjà sur une seule classe.
  const parentClasses = parentPositiveValues(parent, 'classe')
  const classeChoices: SubviewChoice[] = [
    { key: 'seconde', label: 'Seconde', field: 'classe', operator: 'is_any', values: ['Seconde'] },
    { key: 'premiere', label: 'Première', field: 'classe', operator: 'is_any', values: ['Première'] },
    { key: 'terminale', label: 'Terminale', field: 'classe', operator: 'is_any', values: ['Terminale'] },
    { key: 'etudes_sup', label: 'Études sup.', field: 'classe', operator: 'is_any', values: [...ETUDES_SUP_CLASSES] },
  ].filter(c => !parentClasses || c.values.some(v => parentClasses.includes(v))) as SubviewChoice[]
  if (classeChoices.length > 1) sections.push({ key: 'classe', label: 'Classe', choices: classeChoices })

  sections.push({
    key: 'lead_status',
    label: 'Statut du lead',
    choices: [
      { key: 'untreated', label: 'Non traités', field: 'lead_status', operator: 'is_any', values: [...UNTREATED_LEAD_STATUSES], includeEmptyLeadStatus: true },
      { key: 'nouveau', label: 'Nouveau', field: 'lead_status', operator: 'is_any', values: [...NOUVEAU_LEAD_STATUSES] },
      { key: 'nrp', label: 'NRP', field: 'lead_status', operator: 'is_any', values: [...NRP_LEAD_STATUSES] },
      { key: 'relancer', label: 'À relancer', field: 'lead_status', operator: 'is_any', values: ['A relancer'] },
      { key: 'replanifier', label: 'À replanifier', field: 'lead_status', operator: 'is_any', values: ['A replanifier'] },
      { key: 'inscrit', label: 'Inscrit', field: 'lead_status', operator: 'is_any', values: [...INSCRIT_LEAD_STATUSES] },
    ],
  })

  return sections
}

/** Sélection courante : clé de section → clés de choix cochés. */
export type SubviewSelection = Record<string, string[]>

/** Règles propres d'une sous-vue à partir des choix cochés. */
export function selectionToRules(sections: SubviewSection[], selection: SubviewSelection): {
  rules: CRMFilterRule[]
  includeEmptyLeadStatus: boolean
} {
  const rules: CRMFilterRule[] = []
  let includeEmptyLeadStatus = false
  const stamp = Date.now().toString(36)
  for (const section of sections) {
    const picked = section.choices.filter(c => (selection[section.key] ?? []).includes(c.key))
    if (picked.length === 0) continue
    // Regroupe par (champ, opérateur) : les valeurs d'une section sont en OU.
    const byOp = new Map<string, { field: RuleField; operator: CRMFilterOp; values: string[] }>()
    for (const c of picked) {
      if (c.includeEmptyLeadStatus) includeEmptyLeadStatus = true
      const k = `${c.field}|${c.operator}`
      const cur = byOp.get(k) ?? { field: c.field, operator: c.operator, values: [] }
      for (const v of c.values) if (!cur.values.includes(v)) cur.values.push(v)
      byOp.set(k, cur)
    }
    let i = 0
    for (const r of byOp.values()) {
      rules.push({
        id: `${SUBVIEW_RULE_PREFIX}${section.key}_${i++}_${stamp}`,
        field: r.field,
        operator: r.operator,
        value: r.values.join(','),
      })
    }
  }
  return { rules, includeEmptyLeadStatus }
}

/** Nom proposé : « Medibox Lab · Marseille · Sans télépro ». */
export function suggestSubviewName(sections: SubviewSection[], selection: SubviewSelection): string {
  return sections
    .map(s => s.choices.filter(c => (selection[s.key] ?? []).includes(c.key)).map(c => c.label).join(' / '))
    .filter(Boolean)
    .join(' · ')
}

/**
 * Règles du parent + règles propres, dans le 1er groupe (ET). Une règle
 * propre sur le même champ qu'une règle du parent la remplace par
 * l'intersection (positif) ou l'union (exclusion), car la page n'applique
 * qu'une valeur par champ.
 */
export function composeSubviewGroups(parentGroups: CRMFilterGroup[], ownRules: CRMFilterRule[]): CRMFilterGroup[] {
  const [first, ...rest] = parentGroups
  let base = [...(first?.rules ?? [])]
  const own: CRMFilterRule[] = []
  for (const rule of ownRules) {
    let value = rule.value
    if (!RESOLVED_FIELDS.has(rule.field)) {
      if (POSITIVE_OPS.includes(rule.operator)) {
        const p = base.find(r => r.field === rule.field && POSITIVE_OPS.includes(r.operator))
        if (p) {
          const allowed = splitValues(p.value)
          const inter = splitValues(rule.value).filter(v => allowed.includes(v))
          if (inter.length > 0) value = inter.join(',')
          base = base.filter(r => r !== p)
        }
      } else if (NEGATIVE_OPS.includes(rule.operator)) {
        const ps = base.filter(r => r.field === rule.field && NEGATIVE_OPS.includes(r.operator))
        if (ps.length > 0) {
          value = [...new Set([...splitValues(rule.value), ...ps.flatMap(r => splitValues(r.value))])].join(',')
          base = base.filter(r => !ps.includes(r))
        }
      }
    }
    const operator: CRMFilterOp = splitValues(value).length > 1 && rule.operator === 'is' ? 'is_any'
      : splitValues(value).length > 1 && rule.operator === 'is_not' ? 'is_none'
        : rule.operator
    own.push({ ...rule, operator, value })
  }
  return [{ id: first?.id ?? `${SUBVIEW_RULE_PREFIX}g`, rules: [...base, ...own] }, ...rest]
}

/** Règles propres d'une sous-vue créée en cliquant (préfixe `sv_`). */
export function ownSubviewRules(view: CRMSavedView): CRMFilterRule[] {
  return (view.groups[0]?.rules ?? []).filter(r => r.id.startsWith(SUBVIEW_RULE_PREFIX))
}

/** Construit une sous-vue (non persistée) à partir d'une sélection. */
export function buildSubview(
  parent: CRMSavedView,
  sections: SubviewSection[],
  selection: SubviewSelection,
  name: string,
): CRMSavedView {
  const { rules, includeEmptyLeadStatus } = selectionToRules(sections, selection)
  return {
    id: `v_sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || suggestSubviewName(sections, selection) || 'Sous-vue',
    groups: composeSubviewGroups(parent.groups, rules),
    presetFlags: {
      ...(parent.presetFlags ?? {}),
      ...(includeEmptyLeadStatus ? { includeEmptyLeadStatus: true } : {}),
    },
    kind: 'subview',
    parentId: parent.id,
    isDefault: false,
  }
}

/** Recalcule une sous-vue après modification des filtres de son parent. */
export function recomposeSubview(parent: CRMSavedView, child: CRMSavedView): CRMSavedView | null {
  const own = ownSubviewRules(child)
  if (own.length === 0) return null
  return {
    ...child,
    groups: composeSubviewGroups(parent.groups, own),
    presetFlags: {
      ...(parent.presetFlags ?? {}),
      ...(child.presetFlags?.includeEmptyLeadStatus ? { includeEmptyLeadStatus: true } : {}),
    },
  }
}
