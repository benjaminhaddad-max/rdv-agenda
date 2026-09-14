/**
 * Vues sauvegardées du CRM : type, defaults, conversion en query params,
 * et helpers de persistence vers l'API /api/crm/views.
 *
 * Extraits de app/admin/crm/page.tsx — pas de logique React, juste de la donnée.
 */

import type { CRMFilterGroup } from './crm-constants'
import { DIPLOMA_SANTE_CRM_VIEW_ID } from './diploma-sante-crm-view'

export interface CRMSavedView {
  id: string
  name: string
  groups: CRMFilterGroup[]
  presetFlags?: {
    noTelepro?: boolean
    recentFormMonths?: number
    recentFormDays?: number
    createdBeforeDays?: number
    includeEmptyLeadStatus?: boolean
  }
  isDefault?: boolean
  parentId?: string | null
  kind?: 'view' | 'bucket' | 'subview'
}

export const CRM_DEFAULT_VIEWS: CRMSavedView[] = [
  { id: 'all', name: 'Tous les leads', groups: [], isDefault: true },
]

/** Vues globales admin exposées aux télépros (filtres serveur via view_id). */
export const TELEPRO_SHARED_VIEW_IDS = ['v_recalif_2026', DIPLOMA_SANTE_CRM_VIEW_ID] as const

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
  if (flags?.includeEmptyLeadStatus) p.set('include_empty_lead_status', '1')
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

      // Verdict Parcoursup : résolu côté API par liste de statuts.
      // "est connu" (is_not_empty) → '__any__', "est inconnu" (is_empty) → 'aucun'.
      if (rule.field === 'parcoursup_verdict') {
        if (rule.operator === 'is_not_empty')  { p.set('parcoursup_verdict', '__any__'); continue }
        if (rule.operator === 'is_empty')      { p.set('parcoursup_verdict', 'aucun'); continue }
        p.set('parcoursup_verdict', val)
        continue
      }

      if (rule.operator === 'is' || rule.operator === 'is_any' || rule.operator === 'contains') {
        switch (rule.field) {
          case 'stage':       p.set('stage', val); break
          case 'formation':   p.set('formation', val); break
          case 'closer':        p.set('closer_contact_hs_id', val); break
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
          case 'closer':        p.set('closer_contact_not', val); break
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
      if (rule.operator === 'is_empty') {
        if (rule.field === 'telepro') {
          p.set('no_telepro', '1')
        } else {
          const prev = p.get('empty_fields')
          p.set('empty_fields', prev ? `${prev},${rule.field}` : String(rule.field))
        }
      }
      if (rule.operator === 'is_not_empty') {
        const prev = p.get('not_empty_fields')
        p.set('not_empty_fields', prev ? `${prev},${rule.field}` : String(rule.field))
      }
    }
  }
  if (customFilters.length > 0) {
    p.set('cf', JSON.stringify(customFilters))
  }
  return p
}

const TELEPRO_VIEW_PARAM_KEYS = ['no_telepro', 'telepro_hs_id', 'telepro_not'] as const

function stripTeleproFromCsv(raw: string | null): string {
  return (raw ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s !== 'telepro')
    .join(',')
}

/**
 * Injecte les filtres d'une vue sauvegardée dans les query params d'une
 * requête /api/crm/contacts, sans écraser ce que le client a déjà envoyé.
 *
 * `skipTeleproConstraints` : vue ouverte depuis « Mes Contacts » d'un télépro.
 * On garde les filtres métier (formulaire, classe, statut…) mais on ignore
 * « sans télépro » / « télépro = X » — sinon les leads qu'on vient de lui
 * attribuer disparaissent de l'onglet alors qu'ils restent dans « Tous mes contacts ».
 */
export function overlaySavedViewParams(
  target: URLSearchParams,
  view: CRMSavedView,
  opts?: { skipTeleproConstraints?: boolean },
): void {
  const fromView = viewToParams(view)
  if (opts?.skipTeleproConstraints) {
    for (const key of TELEPRO_VIEW_PARAM_KEYS) fromView.delete(key)
    const empty = stripTeleproFromCsv(fromView.get('empty_fields'))
    if (empty) fromView.set('empty_fields', empty)
    else fromView.delete('empty_fields')
    const notEmpty = stripTeleproFromCsv(fromView.get('not_empty_fields'))
    if (notEmpty) fromView.set('not_empty_fields', notEmpty)
    else fromView.delete('not_empty_fields')
    // Empêche le fallback `preset_flags.noTelepro` de réappliquer le filtre.
    if (!target.has('no_telepro')) target.set('no_telepro', '0')
  }

  for (const [key, value] of fromView.entries()) {
    if (!value) continue
    if (target.get(key)) continue
    target.set(key, value)
  }
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
      ...(view.parentId ? { parent_id: view.parentId } : {}),
      ...(view.kind && view.kind !== 'view' ? { kind: view.kind } : {}),
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

/** Onglets visibles de l'admin courant (le catalogue des vues reste global). */
export async function persistAdminViewLayout(viewIds: string[]) {
  await fetch('/api/crm/views/layout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ view_ids: viewIds }),
  })
}
