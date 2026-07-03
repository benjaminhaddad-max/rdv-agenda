/**
 * Résout les contacts d'une vue CRM ou d'un segment email (service role, sans HTTP).
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

const CONTACT_COLUMNS =
  'hubspot_contact_id, email, firstname, lastname, closer_du_contact_owner_id, recent_conversion_event, telepro_user_id, hubspot_owner_id'

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

function passesPostRules(
  row: {
    hubspot_contact_id: string
    closer_du_contact_owner_id?: string | null
  },
  excludeFormIds: Set<string>,
  closerExclude: Set<string>,
): boolean {
  if (excludeFormIds.has(row.hubspot_contact_id)) return false
  const closer = String(row.closer_du_contact_owner_id || '').trim()
  if (closer && closerExclude.has(closer)) return false
  return true
}

function toAudienceContact(row: {
  hubspot_contact_id: string
  email: string | null
  firstname: string | null
  lastname: string | null
}): SavedViewAudienceContact | null {
  if (!row.hubspot_contact_id || !row.email?.trim()) return null
  return {
    contact_id: row.hubspot_contact_id,
    email: row.email.trim(),
    first_name: row.firstname,
    last_name: row.lastname,
  }
}

/** Applique les règles d'un groupe (AND) et retourne les contacts éligibles email. */
export async function resolveFilterGroupAudience(
  db: SupabaseClient,
  group: CRMFilterGroup,
  presetFlags?: Record<string, unknown> | null,
): Promise<SavedViewAudienceContact[]> {
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
    if (field === 'telepro' && (op === 'is' || op === 'is_any')) {
      const vals = splitCsv(val).filter(v => /^\d+$/.test(v))
      if (vals.length > 1) q = q.in('telepro_user_id', vals)
      else if (vals.length === 1) q = q.eq('telepro_user_id', vals[0])
    }
    if (field === 'form_event' && (op === 'is_none' || op === 'is_not')) {
      excludeFormIds = await collectFormEventExcludeIds(db, val)
    }
    if ((field === 'closer_contact' || field === 'closer') && (op === 'is_none' || op === 'is_not')) {
      for (const id of splitCsv(val)) closerExclude.add(id)
    }
  }

  const flags = presetFlags as { noTelepro?: boolean } | null
  if (flags?.noTelepro) {
    q = q.is('telepro_user_id', null)
  }

  q = q.not('email', 'is', null).neq('email', '')

  const PAGE = 1000
  const out: SavedViewAudienceContact[] = []
  const seen = new Set<string>()
  let off = 0

  while (true) {
    const { data, error } = await q.range(off, off + PAGE - 1)
    if (error) throw new Error(`resolveFilterGroupAudience: ${error.message}`)
    if (!data?.length) break

    for (const row of data as Array<{
      hubspot_contact_id: string
      email: string | null
      firstname: string | null
      lastname: string | null
      closer_du_contact_owner_id?: string | null
    }>) {
      if (!passesPostRules(row, excludeFormIds, closerExclude)) continue
      const c = toAudienceContact(row)
      if (!c) continue
      const key = c.email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }

    if (data.length < PAGE) break
    off += PAGE
  }

  return out
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

/** Charge un segment email par id ou nom. */
export async function loadEmailSegment(
  db: SupabaseClient,
  opts: { segmentId?: string; segmentName?: string },
) {
  if (opts.segmentId) {
    const { data, error } = await db
      .from('email_segments')
      .select('id, name, segment_type, filters, filter_groups, preset_flags, manual_contact_ids')
      .eq('id', opts.segmentId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  const name = opts.segmentName?.trim()
  if (!name) return null

  const { data, error } = await db
    .from('email_segments')
    .select('id, name, segment_type, filters, filter_groups, preset_flags, manual_contact_ids')
    .ilike('name', name)
    .limit(5)
  if (error) throw new Error(error.message)
  const exact = (data ?? []).find(s => s.name?.toLowerCase() === name.toLowerCase())
  return exact ?? data?.[0] ?? null
}

/** Audience d'une vue (premier groupe de filtres). */
export async function resolveSavedViewAudience(
  db: SupabaseClient,
  view: {
    filter_groups?: CRMFilterGroup[] | null
    preset_flags?: Record<string, unknown> | null
  },
): Promise<SavedViewAudienceContact[]> {
  const group = (view.filter_groups as CRMFilterGroup[] | null)?.[0]
  if (!group) return []
  return resolveFilterGroupAudience(db, group, view.preset_flags)
}

/**
 * Audience d'un segment dynamique : union OR des groupes + manual_contact_ids.
 */
export async function resolveSegmentAudience(
  db: SupabaseClient,
  segment: {
    filters?: Record<string, unknown> | null
    filter_groups?: CRMFilterGroup[] | null
    preset_flags?: Record<string, unknown> | null
    manual_contact_ids?: string[] | null
  },
): Promise<SavedViewAudienceContact[]> {
  const seen = new Map<string, SavedViewAudienceContact>()
  const groups = (segment.filter_groups as CRMFilterGroup[] | null)?.filter(
    g => (g.rules?.length ?? 0) > 0,
  ) ?? []

  if (groups.length > 0) {
    for (const group of groups) {
      const batch = await resolveFilterGroupAudience(db, group, segment.preset_flags)
      for (const c of batch) seen.set(c.email.toLowerCase(), c)
    }
  } else if (segment.filters && Object.keys(segment.filters).length > 0) {
    const f = segment.filters as Record<string, unknown>
    const group: CRMFilterGroup = {
      id: 'legacy_filters',
      rules: [],
    }
    if (f.classe) {
      group.rules.push({
        id: 'classe',
        field: 'classe',
        operator: Array.isArray(f.classe) ? 'is_any' : 'is',
        value: Array.isArray(f.classe) ? f.classe.join(',') : String(f.classe),
      })
    }
    if (f.zone) {
      group.rules.push({
        id: 'zone',
        field: 'zone',
        operator: Array.isArray(f.zone) ? 'is_any' : 'is',
        value: Array.isArray(f.zone) ? f.zone.join(',') : String(f.zone),
      })
    }
    if (f.lead_status) {
      group.rules.push({
        id: 'lead_status',
        field: 'lead_status',
        operator: Array.isArray(f.lead_status) ? 'is_any' : 'is',
        value: Array.isArray(f.lead_status) ? f.lead_status.join(',') : String(f.lead_status),
      })
    }
    const batch = await resolveFilterGroupAudience(db, group, segment.preset_flags)
    for (const c of batch) seen.set(c.email.toLowerCase(), c)
  }

  const manualIds = (segment.manual_contact_ids ?? []).filter(Boolean)
  if (manualIds.length > 0) {
    for (let i = 0; i < manualIds.length; i += 200) {
      const chunk = manualIds.slice(i, i + 200)
      const { data, error } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, email, firstname, lastname')
        .in('hubspot_contact_id', chunk)
      if (error) throw new Error(error.message)
      for (const row of data ?? []) {
        const c = toAudienceContact(row)
        if (c) seen.set(c.email.toLowerCase(), c)
      }
    }
  }

  return Array.from(seen.values())
}
