/**
 * Résout les contacts d'une vue CRM sauvegardée (service role, sans HTTP).
 * Utilisé pour les envois programme / campagnes batch.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CRMFilterGroup } from '@/lib/crm-constants'
import { resolveFormEventFilter } from '@/lib/form-event-resolver'

export interface SavedViewAudienceContact {
  contact_id: string
  email: string
  first_name: string | null
  last_name: string | null
}

const CONTACT_COLUMNS = 'hubspot_contact_id, email, firstname, lastname, closer_du_contact_owner_id, recent_conversion_event'

function splitCsv(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

async function collectFormEventExcludeIds(
  db: SupabaseClient,
  formEventValue: string,
): Promise<Set<string>> {
  const exclude = new Set<string>()
  const result = await resolveFormEventFilter(db, formEventValue)

  if (result.mode === 'hybrid') {
    const PAGE = 1000
    let off = 0
    while (result.exactNames.length > 0) {
      const { data } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .in('recent_conversion_event', result.exactNames)
        .range(off, off + PAGE - 1)
      if (!data?.length) break
      for (const row of data) {
        if (row.hubspot_contact_id) exclude.add(row.hubspot_contact_id)
      }
      if (data.length < PAGE) break
      off += PAGE
    }
    for (const id of result.metaOnlyIds) exclude.add(id)
    return exclude
  }

  for (const id of result.contactIds) exclude.add(id)
  return exclude
}

function passesRules(
  row: {
    hubspot_contact_id: string
    closer_du_contact_owner_id?: string | null
    recent_conversion_event?: string | null
  },
  excludeFormIds: Set<string>,
  closerExclude: Set<string>,
): boolean {
  if (excludeFormIds.has(row.hubspot_contact_id)) return false
  const closer = String(row.closer_du_contact_owner_id || '').trim()
  if (closer && closerExclude.has(closer)) return false
  return true
}

/** Charge une vue par id ou nom (insensible à la casse). */
export async function loadSavedView(
  db: SupabaseClient,
  opts: { viewId?: string; viewName?: string },
) {
  if (opts.viewId) {
    const { data, error } = await db
      .from('crm_saved_views')
      .select('id, name, filter_groups, preset_flags')
      .eq('id', opts.viewId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  const name = opts.viewName?.trim()
  if (!name) return null

  const { data, error } = await db
    .from('crm_saved_views')
    .select('id, name, filter_groups, preset_flags')
    .ilike('name', name)
    .limit(5)
  if (error) throw new Error(error.message)
  const exact = (data ?? []).find(v => v.name?.toLowerCase() === name.toLowerCase())
  return exact ?? data?.[0] ?? null
}

/**
 * Résout l'audience email d'une vue (premier groupe de filtres = AND).
 * Supporte les règles courantes : classe, zone, lead_status, telepro vide,
 * form_event is_none, closer_contact is_none.
 */
export async function resolveSavedViewAudience(
  db: SupabaseClient,
  view: {
    filter_groups?: CRMFilterGroup[] | null
    preset_flags?: Record<string, unknown> | null
  },
): Promise<SavedViewAudienceContact[]> {
  const group = (view.filter_groups as CRMFilterGroup[] | null)?.[0]
  const rules = group?.rules ?? []

  let excludeFormIds = new Set<string>()
  const closerExclude = new Set<string>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db.from('crm_contacts').select(CONTACT_COLUMNS)

  for (const rule of rules) {
    const field = String(rule.field || '')
    const op = String(rule.operator || '')
    const val = String(rule.value ?? '')
    if (!field || !op) continue
    if (!val && op !== 'is_empty' && op !== 'is_not_empty') continue

    if (field === 'classe' && (op === 'is' || op === 'is_any')) {
      const vals = splitCsv(val)
      q = vals.length > 1 ? q.in('classe_actuelle', vals) : q.eq('classe_actuelle', val)
    }
    if (field === 'zone' && (op === 'is' || op === 'is_any')) {
      const vals = splitCsv(val)
      q = vals.length > 1 ? q.in('zone_localite', vals) : q.eq('zone_localite', val)
    }
    if (field === 'lead_status' && (op === 'is' || op === 'is_any')) {
      const vals = splitCsv(val)
      q = vals.length > 1 ? q.in('hs_lead_status', vals) : q.eq('hs_lead_status', val)
    }
    if (field === 'telepro' && op === 'is_empty') {
      q = q.is('telepro_user_id', null)
    }
    if (field === 'form_event' && (op === 'is_none' || op === 'is_not')) {
      excludeFormIds = await collectFormEventExcludeIds(db, val)
    }
    if ((field === 'closer_contact' || field === 'closer') && (op === 'is_none' || op === 'is_not')) {
      for (const id of splitCsv(val)) closerExclude.add(id)
    }
  }

  const flags = view.preset_flags as { noTelepro?: boolean } | null
  if (flags?.noTelepro) {
    q = q.is('telepro_user_id', null)
  }

  q = q.not('email', 'is', null).neq('email', '')

  const PAGE = 1000
  const seen = new Map<string, SavedViewAudienceContact>()
  let off = 0

  while (true) {
    const { data, error } = await q.range(off, off + PAGE - 1)
    if (error) throw new Error(`resolveSavedViewAudience: ${error.message}`)
    if (!data?.length) break

    for (const row of data as Array<{
      hubspot_contact_id: string
      email: string | null
      firstname: string | null
      lastname: string | null
      closer_du_contact_owner_id?: string | null
      recent_conversion_event?: string | null
    }>) {
      if (!row.hubspot_contact_id || !row.email?.trim()) continue
      if (!passesRules(row, excludeFormIds, closerExclude)) continue
      const key = row.email.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.set(key, {
        contact_id: row.hubspot_contact_id,
        email: row.email.trim(),
        first_name: row.firstname,
        last_name: row.lastname,
      })
    }

    if (data.length < PAGE) break
    off += PAGE
  }

  return Array.from(seen.values())
}
