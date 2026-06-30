import type { CRMFilterGroup } from './crm-constants'

export const EDUMOVE_CRM_VIEW_ID = 'v_edumove_marianne'
export const EDUMOVE_CRM_VIEW_NAME = 'Edumove - Marianne'

/** Sous-chaîne commune à tous les forms Edumove (HubSpot + Meta). */
export const EDUMOVE_FORM_EVENT_CONTAINS = 'edumove'

export function buildEdumoveGroups(): CRMFilterGroup[] {
  return [{
    id: 'grp-edumove-forms',
    rules: [{
      id: 'edumove-form-event-contains',
      field: 'form_event',
      operator: 'contains',
      value: EDUMOVE_FORM_EVENT_CONTAINS,
    }],
  }]
}

export function isEdumoveGroups(groups: CRMFilterGroup[]): boolean {
  const first = groups?.[0]
  if (!first || !Array.isArray(first.rules)) return false
  const rule = first.rules.find(r => r.field === 'form_event' && r.operator === 'contains')
  return rule?.value?.toLowerCase() === EDUMOVE_FORM_EVENT_CONTAINS
}
