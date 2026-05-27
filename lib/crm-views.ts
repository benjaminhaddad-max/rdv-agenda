/**
 * Vues sauvegardées du CRM : type, defaults, conversion en query params,
 * et helpers de persistence vers l'API /api/crm/views.
 *
 * Extraits de app/admin/crm/page.tsx — pas de logique React, juste de la donnée.
 */

import type { CRMFilterGroup } from './crm-constants'

export interface CRMSavedView {
  id: string
  name: string
  groups: CRMFilterGroup[]
  presetFlags?: {
    noTelepro?: boolean
    recentFormMonths?: number
    recentFormDays?: number
    createdBeforeDays?: number
  }
  isDefault?: boolean
}

export const CRM_DEFAULT_VIEWS: CRMSavedView[] = [
  { id: 'all', name: 'Tous les leads', groups: [], isDefault: true },
]

export function loadCRMViews(): CRMSavedView[] {
  return CRM_DEFAULT_VIEWS
}

/** Convertit les filtres d'une vue en URLSearchParams pour l'API. */
export function viewToParams(view: CRMSavedView): URLSearchParams {
  const p = new URLSearchParams()
  p.set('all_classes', '1')   // toujours toutes classes pour les counts
  p.set('show_external', '1') // plus de filtre auto "équipe externe" — on compte tout
  const flags = view.presetFlags
  if (flags?.noTelepro)         p.set('no_telepro', '1')
  if (flags?.recentFormMonths)  p.set('recent_form_months', String(flags.recentFormMonths))
  if (flags?.recentFormDays)    p.set('recent_form_days', String(flags.recentFormDays))
  if (flags?.createdBeforeDays) p.set('created_before_days', String(flags.createdBeforeDays))
  const firstGroup = view.groups[0]
  const customFilters: Array<{ field: string; operator: string; value: string }> = []
  if (firstGroup) {
    for (const rule of firstGroup.rules) {
      if (!rule.value && rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty') continue
      const val = rule.value
      // Filtre custom (propriété HubSpot non-hardcodée) → passé tel quel à l'API
      if (typeof rule.field === 'string' && rule.field.startsWith('custom:')) {
        customFilters.push({
          field: rule.field.slice(7),
          operator: rule.operator,
          value: val,
        })
        continue
      }
      // form_event : on privilégie les paramètres dédiés pour activer le
      // resolver hybride côté API (noms + Meta-only IDs), plus robuste que le
      // simple filtre sur recent_conversion_event.
      if (rule.field === 'form_event') {
        if (rule.operator === 'is' || rule.operator === 'is_any') {
          p.set('form_event', val)
          continue
        }
        if (rule.operator === 'is_not' || rule.operator === 'is_none') {
          p.set('form_event_not', val)
          continue
        }
        // contains / not_contains doivent rester en cf pour matcher en ILIKE.
        customFilters.push({ field: 'recent_conversion_event', operator: rule.operator, value: val })
        continue
      }

      if (rule.operator === 'is' || rule.operator === 'is_any' || rule.operator === 'contains') {
        switch (rule.field) {
          case 'stage':       p.set('stage', val); break
          case 'formation':   p.set('formation', val); break
          case 'closer':        p.set('closer_hs_id', val); break
          case 'closer_contact': p.set('closer_contact_hs_id', val); break
          case 'contact_owner': p.set('contact_owner_hs_id', val); break
          case 'telepro':       p.set('telepro_hs_id', val); break
          case 'lead_status':   p.set('lead_status', val); break
          case 'source':      p.set('source', val); break
          case 'zone':        p.set('zone', val); break
          case 'departement': p.set('departement', val); break
          case 'pipeline':    p.set('pipeline', val); break
          case 'prior_preinscription': if (val === '1') p.set('prior_preinscription', '1'); break
          case 'classe':      p.set('classe', val); break
          case 'period':      p.set('period', val); break
        }
      }
      if (rule.operator === 'is_not' || rule.operator === 'is_none') {
        switch (rule.field) {
          case 'stage':         p.set('stage_not', val); break
          case 'formation':     p.set('formation_not', val); break
          case 'closer':        p.set('closer_not', val); break
          case 'closer_contact': p.set('closer_contact_not', val); break
          case 'contact_owner': p.set('contact_owner_not', val); break
          case 'telepro':       p.set('telepro_not', val); break
          case 'lead_status':   p.set('lead_status_not', val); break
          case 'source':        p.set('source_not', val); break
          case 'zone':          p.set('zone_not', val); break
          case 'departement':   p.set('departement_not', val); break
          case 'pipeline':      p.set('pipeline_not', val); break
        }
      }
    }
  }
  if (customFilters.length > 0) {
    p.set('cf', JSON.stringify(customFilters))
  }
  return p
}

/**
 * Paramètres standards pour obtenir un count fiable via /api/crm/contacts.
 * Utilise la même traduction de filtres qu'une vue classique, puis verrouille
 * les options count-only SQL exactes pour la parité badge/table.
 */
export function viewToCountParams(view: CRMSavedView): URLSearchParams {
  const p = viewToParams(view)
  p.set('limit', '0')
  p.set('exact_count', '1')
  p.set('force_sql', '1')
  p.delete('defer_count')
  return p
}

export async function persistViewCreate(view: CRMSavedView, position: number) {
  await fetch('/api/crm/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: view.id,
      name: view.name,
      filter_groups: view.groups,
      preset_flags: view.presetFlags ?? null,
      position,
    }),
  })
}

export async function persistViewUpdate(
  id: string,
  patch: { name?: string; filter_groups?: unknown; position?: number },
) {
  await fetch(`/api/crm/views/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function persistViewDelete(id: string) {
  await fetch(`/api/crm/views/${id}`, { method: 'DELETE' })
}
