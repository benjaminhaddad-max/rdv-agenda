import type { CRMFilterGroup } from './crm-constants'

export const DIPLOMA_SANTE_CRM_VIEW_ID = 'v_candidature_diploma_2026'
export const DIPLOMA_SANTE_CRM_VIEW_NAME = 'Candidature Diploma 2026'

/** Formulaires Diploma Santé : tout nom qui commence par NS. */
export const DIPLOMA_SANTE_NS_FORM_NAMES = [
  'NS - BROCHURE DIPLOMA SANTÉ',
  'NS - Candidater Article',
  'NS - Candidater Global',
  'NS - Candidater Header',
  'NS - Candidater PAES',
  'NS - Candidater Paris 16',
  'NS - Candidater Première Élite',
  'NS - Candidater Prépa LAS',
  'NS - Candidater Prépa LSPS',
  'NS - Candidater Prépa PASS',
  'NS - Candidater Terminale Santé',
  'NS - Financement',
  'NS - Formulaire "Guide Parcoursup 2026" - Diploma Santé',
  'NS - Formulaire KIT PASS / LAS',
  "NS - Obtenir plus d'informations",
] as const

export function isDiplomaNsFormName(name: string): boolean {
  return name.trim().toUpperCase().startsWith('NS')
}

export function buildDiplomaSanteGroups(formNames: readonly string[] = DIPLOMA_SANTE_NS_FORM_NAMES): CRMFilterGroup[] {
  const ns = [...new Set(formNames.filter(isDiplomaNsFormName).map(n => n.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr'))
  return [{
    id: 'grp-candidature-diploma-2026',
    rules: [{
      id: 'r-candidature-diploma-2026-form-event',
      field: 'form_event',
      operator: 'is_any',
      value: ns.join(','),
    }],
  }]
}

export function isDiplomaSanteGroups(groups: CRMFilterGroup[]): boolean {
  const first = groups?.[0]
  if (!first || !Array.isArray(first.rules)) return false
  const rule = first.rules.find(r => r.field === 'form_event' && r.operator === 'is_any')
  if (!rule?.value) return false
  const vals = rule.value.split(',').map(v => v.trim()).filter(Boolean)
  return DIPLOMA_SANTE_NS_FORM_NAMES.every(name => vals.includes(name))
}

export function isDiplomaSanteView(id: string, name?: string): boolean {
  if (id === DIPLOMA_SANTE_CRM_VIEW_ID) return true
  return (name || '').toLowerCase().includes('candidature diploma')
}
