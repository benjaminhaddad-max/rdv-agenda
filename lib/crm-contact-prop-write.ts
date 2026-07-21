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
 * Bulk write : même sémantique que le PATCH unitaire, en lots.
 * `onProgress` optionnel pour logs serveur.
 */
export async function writeContactPropertyBulk(
  db: SupabaseClient,
  contactIds: string[],
  property: string,
  value: unknown,
  opts?: { sourceLabel?: string; batchSize?: number },
): Promise<{ done: number; errors: string[]; normalizedValue: string | null }> {
  const propertyMeta = await loadContactPropertyMeta(db, property)
  if (isReadOnlyProperty(propertyMeta)) {
    return { done: 0, errors: ['Propriété en lecture seule (calculée ou fichier)'], normalizedValue: null }
  }

  const normalizedValue = normalizeContactPropertyValue(property, value, propertyMeta)
  const BATCH = opts?.batchSize ?? 25
  const errors: string[] = []
  let done = 0
  const benjaminIds: string[] = []

  for (let i = 0; i < contactIds.length; i += BATCH) {
    const chunk = contactIds.slice(i, i + BATCH)
    // Concurrency limitée pour rester sous les timeouts / rate limits DB.
    const CONCURRENCY = 8
    for (let j = 0; j < chunk.length; j += CONCURRENCY) {
      const slice = chunk.slice(j, j + CONCURRENCY)
      const results = await Promise.all(
        slice.map(id =>
          writeContactProperty(db, id, property, value, {
            propertyMeta,
            sourceLabel: opts?.sourceLabel ?? 'Modifié en masse depuis le CRM',
            skipBenjaminSync: true,
          }),
        ),
      )
      for (const r of results) {
        if (!r.ok) {
          errors.push(`${r.contactId}: ${r.error}`)
          continue
        }
        done += 1
        if (isTeleproProperty(property) && isBenjaminTeleproId(String(r.normalizedValue ?? ''))) {
          benjaminIds.push(r.contactId)
        }
        await triggerPropertyChangedWorkflows(db, r.contactId, property, r.normalizedValue)
      }
    }
  }

  if (benjaminIds.length > 0) {
    await triggerBenjaminSheetSyncForContacts(db, benjaminIds)
  }

  return { done, errors, normalizedValue }
}
