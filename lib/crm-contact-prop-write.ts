/**
 * Écriture d'une propriété contact CRM (fiche + bulk).
 * Source de vérité : Supabase (colonne connue + hubspot_raw). HubSpot non mirroir.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import {
  isReadOnlyProperty,
  normalizePropertyValueForDbColumn,
  normalizePropertyValueForHubSpot,
} from '@/lib/crm-property-normalization'
import {
  CONTACT_IDENTITY_COLUMNS,
  HUBSPOT_PROPERTY_TO_COLUMN,
  mergeSafeHubspotRaw,
} from '@/lib/crm-contact-write'
import {
  isBenjaminTeleproId,
  isTeleproProperty,
  triggerBenjaminSheetSyncForContact,
  triggerBenjaminSheetSyncForContacts,
} from '@/lib/benjamin-sheet-sync'

export type PropertyMetaLite = {
  type?: string | null
  field_type?: string | null
}

export type WriteContactPropertyResult = {
  ok: true
  contactId: string
  normalizedValue: string | null
} | {
  ok: false
  contactId: string
  error: string
}

export async function loadContactPropertyMeta(
  db: SupabaseClient,
  property: string,
): Promise<PropertyMetaLite | null> {
  const { data } = await db
    .from('crm_properties')
    .select('type, field_type')
    .eq('object_type', 'contacts')
    .eq('name', property)
    .maybeSingle()
  return data ?? null
}

export function normalizeContactPropertyValue(
  property: string,
  value: unknown,
  propertyMeta: PropertyMetaLite | null,
): string | null {
  const normalizedByType = normalizePropertyValueForHubSpot(value, propertyMeta)
  if (property === 'classe_actuelle') {
    return normalizeClasseActuelle(String(normalizedByType ?? '')) ?? 'Autres'
  }
  return normalizedByType
}

/**
 * Écrit une propriété sur un contact. Ne déclenche pas les workflows
 * (à faire en batch côté appelant si besoin).
 */
export async function writeContactProperty(
  db: SupabaseClient,
  contactId: string,
  property: string,
  value: unknown,
  opts?: {
    propertyMeta?: PropertyMetaLite | null
    sourceLabel?: string
    skipHistory?: boolean
    skipBenjaminSync?: boolean
  },
): Promise<WriteContactPropertyResult> {
  const propertyMeta = opts?.propertyMeta === undefined
    ? await loadContactPropertyMeta(db, property)
    : opts.propertyMeta

  if (isReadOnlyProperty(propertyMeta)) {
    return { ok: false, contactId, error: 'Propriété en lecture seule (calculée ou fichier)' }
  }

  const col = HUBSPOT_PROPERTY_TO_COLUMN[property]
  const now = new Date().toISOString()
  const normalizedValue = normalizeContactPropertyValue(property, value, propertyMeta)

  const update: Record<string, unknown> = { synced_at: now }
  if (col) update[col] = normalizePropertyValueForDbColumn(normalizedValue, propertyMeta)

  const { data: existing } = await db
    .from('crm_contacts')
    .select(CONTACT_IDENTITY_COLUMNS.join(','))
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, contactId, error: 'Contact introuvable' }
  }

  const ex = existing as unknown as Record<string, unknown>
  update.hubspot_raw = mergeSafeHubspotRaw(ex, { [property]: normalizedValue })

  const { error: updateErr } = await db
    .from('crm_contacts')
    .update(update)
    .eq('hubspot_contact_id', contactId)

  if (updateErr) {
    return { ok: false, contactId, error: updateErr.message }
  }

  if (!opts?.skipHistory) {
    try {
      await db.from('crm_property_history').insert({
        hubspot_contact_id: contactId,
        property_name: property,
        value: normalizedValue === null ? null : String(normalizedValue),
        changed_at: now,
        source_type: 'CRM_UI',
        source_id: null,
        source_label: opts?.sourceLabel ?? 'Modifié depuis le CRM',
        source_metadata: null,
      })
    } catch (e) {
      console.warn('[crm-contact-prop-write] history insert failed:', e)
    }
  }

  if (
    !opts?.skipBenjaminSync &&
    isTeleproProperty(property) &&
    isBenjaminTeleproId(String(normalizedValue ?? ''))
  ) {
    await triggerBenjaminSheetSyncForContact(db, contactId)
  }

  return { ok: true, contactId, normalizedValue }
}

/** Déclenche les workflows property_changed pour une valeur donnée. */
export async function triggerPropertyChangedWorkflows(
  db: SupabaseClient,
  contactId: string,
  property: string,
  normalizedValue: string | null,
) {
  try {
    const { enrollContact } = await import('@/lib/workflow-engine')
    const { data: workflows } = await db
      .from('crm_workflows')
      .select('id, trigger_config')
      .eq('status', 'active')
      .eq('trigger_type', 'property_changed')
    for (const wf of (workflows ?? [])) {
      const cfg = (wf.trigger_config ?? {}) as { property?: string; to?: string | string[] }
      if (cfg.property && cfg.property !== property) continue
      if (cfg.to !== undefined && cfg.to !== null) {
        const expected = Array.isArray(cfg.to) ? cfg.to : [cfg.to]
        if (!expected.includes(String(normalizedValue ?? ''))) continue
      }
      await enrollContact(db, wf.id, contactId, { property, value: normalizedValue, source: 'CRM_UI' })
    }
  } catch (e) {
    console.warn('[crm-contact-prop-write] workflow trigger failed:', e)
  }
}

/**
 * Bulk write : fetch en lot + updates parallèles + history en batch.
 * Pas de workflows ni sync Benjamin awaités (trop lents en masse).
 */
export async function writeContactPropertyBulk(
  db: SupabaseClient,
  contactIds: string[],
  property: string,
  value: unknown,
  opts?: {
    sourceLabel?: string
    /** Concurrence des UPDATEs (défaut 40). */
    concurrency?: number
    skipWorkflows?: boolean
  },
): Promise<{ done: number; errors: string[]; normalizedValue: string | null }> {
  const propertyMeta = await loadContactPropertyMeta(db, property)
  if (isReadOnlyProperty(propertyMeta)) {
    return { done: 0, errors: ['Propriété en lecture seule (calculée ou fichier)'], normalizedValue: null }
  }

  const normalizedValue = normalizeContactPropertyValue(property, value, propertyMeta)
  const col = HUBSPOT_PROPERTY_TO_COLUMN[property]
  const dbColValue = normalizePropertyValueForDbColumn(normalizedValue, propertyMeta)
  const now = new Date().toISOString()
  const sourceLabel = opts?.sourceLabel ?? 'Modifié en masse depuis le CRM'
  const CONCURRENCY = opts?.concurrency ?? 40
  const errors: string[] = []
  let done = 0
  const benjaminIds: string[] = []
  const historyRows: Array<{
    hubspot_contact_id: string
    property_name: string
    value: string | null
    changed_at: string
    source_type: string
    source_id: null
    source_label: string
    source_metadata: null
  }> = []

  // Fetch identity rows par pages de 200 (limite PostgREST `.in`).
  const FETCH = 200
  const existingById = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < contactIds.length; i += FETCH) {
    const idChunk = contactIds.slice(i, i + FETCH)
    const { data, error } = await db
      .from('crm_contacts')
      .select(CONTACT_IDENTITY_COLUMNS.join(','))
      .in('hubspot_contact_id', idChunk)
    if (error) {
      errors.push(`fetch: ${error.message}`)
      continue
    }
    for (const row of data ?? []) {
      const r = row as unknown as Record<string, unknown>
      const id = String(r.hubspot_contact_id ?? '')
      if (id) existingById.set(id, r)
    }
  }

  // Updates parallèles
  const ids = contactIds.filter(id => {
    if (existingById.has(id)) return true
    errors.push(`${id}: Contact introuvable`)
    return false
  })

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const slice = ids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(slice.map(async (contactId) => {
      const existing = existingById.get(contactId)!
      const update: Record<string, unknown> = {
        synced_at: now,
        hubspot_raw: mergeSafeHubspotRaw(existing, { [property]: normalizedValue }),
      }
      if (col) update[col] = dbColValue

      const { error: updateErr } = await db
        .from('crm_contacts')
        .update(update)
        .eq('hubspot_contact_id', contactId)

      if (updateErr) return { ok: false as const, contactId, error: updateErr.message }
      return { ok: true as const, contactId }
    }))

    for (const r of results) {
      if (!r.ok) {
        errors.push(`${r.contactId}: ${r.error}`)
        continue
      }
      done += 1
      historyRows.push({
        hubspot_contact_id: r.contactId,
        property_name: property,
        value: normalizedValue === null ? null : String(normalizedValue),
        changed_at: now,
        source_type: 'CRM_UI',
        source_id: null,
        source_label: sourceLabel,
        source_metadata: null,
      })
      if (isTeleproProperty(property) && isBenjaminTeleproId(String(normalizedValue ?? ''))) {
        benjaminIds.push(r.contactId)
      }
    }
  }

  // History en un seul insert (chunks de 500)
  for (let i = 0; i < historyRows.length; i += 500) {
    const rows = historyRows.slice(i, i + 500)
    try {
      const { error } = await db.from('crm_property_history').insert(rows)
      if (error) console.warn('[crm-contact-prop-write] bulk history insert failed:', error.message)
    } catch (e) {
      console.warn('[crm-contact-prop-write] bulk history insert failed:', e)
    }
  }

  // Workflows : volontairement skip en bulk (trop lent). Option pour réactiver.
  if (opts?.skipWorkflows === false && done > 0) {
    const sampleIds = ids.slice(0, Math.min(ids.length, done))
    // Charge les workflows UNE fois, puis enroll en parallèle limité.
    try {
      const { enrollContact } = await import('@/lib/workflow-engine')
      const { data: workflows } = await db
        .from('crm_workflows')
        .select('id, trigger_config')
        .eq('status', 'active')
        .eq('trigger_type', 'property_changed')
      const matching = (workflows ?? []).filter(wf => {
        const cfg = (wf.trigger_config ?? {}) as { property?: string; to?: string | string[] }
        if (cfg.property && cfg.property !== property) return false
        if (cfg.to !== undefined && cfg.to !== null) {
          const expected = Array.isArray(cfg.to) ? cfg.to : [cfg.to]
          if (!expected.includes(String(normalizedValue ?? ''))) return false
        }
        return true
      })
      if (matching.length > 0) {
        const WF_CONC = 10
        for (let i = 0; i < sampleIds.length; i += WF_CONC) {
          const slice = sampleIds.slice(i, i + WF_CONC)
          await Promise.all(
            slice.flatMap(contactId =>
              matching.map(wf =>
                enrollContact(db, wf.id, contactId, { property, value: normalizedValue, source: 'CRM_UI' })
                  .catch(() => {}),
              ),
            ),
          )
        }
      }
    } catch (e) {
      console.warn('[crm-contact-prop-write] bulk workflow trigger failed:', e)
    }
  }

  if (benjaminIds.length > 0) {
    // Best-effort, ne bloque pas la réponse si lent
    void triggerBenjaminSheetSyncForContacts(db, benjaminIds)
  }

  return { done, errors, normalizedValue }
}
