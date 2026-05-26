import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'

type SupabaseClient = ReturnType<typeof createServiceClient>

const FRESH_TTL_MS = 5 * 60 * 1000
const STALE_TTL_MS = 60 * 60 * 1000

const refreshInFlight = new Set<string>()

/** Mode rapide Edumove : Typesense filtre recent_conversion_event + meta-only IDs. */
export type FormEventFilterHybrid = {
  mode: 'hybrid'
  exactNames: string[]
  metaOnlyIds: string[]
}

/** Mode Linova (variantes datees) : liste complete de contact_ids. */
export type FormEventFilterIds = {
  mode: 'ids'
  contactIds: string[]
}

export type FormEventFilterResult = FormEventFilterHybrid | FormEventFilterIds

function parseFilterValue(filterValue: string): {
  normalizedFormNames: string[]
  distinctPrefixes: string[]
} {
  const formNames = filterValue.split(',').map(s => s.trim()).filter(Boolean)
  const normalizedFormNames = [...new Set(formNames)]
  const formNamePrefixes = [...new Set(
    normalizedFormNames
      .map(name => name.replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/i, '').trim())
      .filter(prefix => prefix.length >= 6)
  )]
  const namesSet = new Set(normalizedFormNames)
  const distinctPrefixes = formNamePrefixes.filter(p => !namesSet.has(p))
  return { normalizedFormNames, distinctPrefixes }
}

async function paginateContactIdsByEventNames(
  db: SupabaseClient,
  normalizedFormNames: string[],
): Promise<Set<string>> {
  const namesIds = new Set<string>()
  const PAGE = 1000
  let off = 0
  while (true) {
    const { data: rows } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id')
      .in('recent_conversion_event', normalizedFormNames)
      .range(off, off + PAGE - 1)
    if (!rows || rows.length === 0) break
    for (const r of rows) {
      const cid = (r as { hubspot_contact_id: string | null }).hubspot_contact_id
      if (cid) namesIds.add(cid)
    }
    if (rows.length < PAGE) break
    off += PAGE
  }
  return namesIds
}

async function paginateMetaContactIds(
  db: SupabaseClient,
  normalizedFormNames: string[],
  distinctPrefixes: string[],
): Promise<Set<string>> {
  const metaFormsById = new Map<string, string>()
  const { data: exactForms } = await db
    .from('meta_lead_forms')
    .select('form_id, name')
    .in('name', normalizedFormNames)
  for (const mf of (exactForms ?? []) as Array<{ form_id: string; name: string | null }>) {
    if (mf?.form_id) metaFormsById.set(mf.form_id, mf.name ?? '')
  }
  await Promise.all(distinctPrefixes.map(async (prefix) => {
    const { data: prefRows } = await db
      .from('meta_lead_forms')
      .select('form_id, name')
      .ilike('name', `${prefix}%`)
      .limit(200)
    for (const mf of (prefRows ?? []) as Array<{ form_id: string; name: string | null }>) {
      if (mf?.form_id) metaFormsById.set(mf.form_id, mf.name ?? '')
    }
  }))

  const metaIds = new Set<string>()
  const metaFormIds = [...metaFormsById.keys()]
  if (metaFormIds.length === 0) return metaIds

  const PAGE = 1000
  let off = 0
  while (true) {
    const { data: ev } = await db
      .from('meta_lead_events')
      .select('contact_id')
      .in('form_id', metaFormIds)
      .not('contact_id', 'is', null)
      .range(off, off + PAGE - 1)
    if (!ev || ev.length === 0) break
    for (const r of ev) {
      const cid = (r as { contact_id: string | null }).contact_id
      if (cid) metaIds.add(cid)
    }
    if (ev.length < PAGE) break
    off += PAGE
  }
  return metaIds
}

async function paginateContactIdsByPrefixes(
  db: SupabaseClient,
  distinctPrefixes: string[],
): Promise<Set<string>> {
  const namesIds = new Set<string>()
  const PAGE = 1000
  await Promise.all(distinctPrefixes.map(async (prefix) => {
    let off = 0
    while (true) {
      const { data: rows } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .ilike('recent_conversion_event', `${prefix}%`)
        .range(off, off + PAGE - 1)
      if (!rows || rows.length === 0) break
      for (const r of rows) {
        const cid = (r as { hubspot_contact_id: string | null }).hubspot_contact_id
        if (cid) namesIds.add(cid)
      }
      if (rows.length < PAGE) break
      off += PAGE
    }
  }))
  return namesIds
}

/**
 * Meta-only : leads Meta Ads dont recent_conversion_event n'est pas deja
 * un des noms exacts. On ne scanne PAS les 2.7K contacts HubSpot — Typesense
 * filtre recent_conversion_event directement pour ceux-la.
 */
async function computeMetaOnlyIds(
  db: SupabaseClient,
  normalizedFormNames: string[],
): Promise<string[]> {
  const metaIds = await paginateMetaContactIds(db, normalizedFormNames, [])
  if (metaIds.size === 0) return []

  const namesSet = new Set(normalizedFormNames)
  const metaOnly: string[] = []
  const metaList = [...metaIds]
  const BATCH = 500
  for (let i = 0; i < metaList.length; i += BATCH) {
    const batch = metaList.slice(i, i + BATCH)
    const { data: rows } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, recent_conversion_event')
      .in('hubspot_contact_id', batch)
    const covered = new Set<string>()
    for (const r of (rows ?? []) as Array<{ hubspot_contact_id: string | null; recent_conversion_event: string | null }>) {
      const cid = r.hubspot_contact_id
      const ev = r.recent_conversion_event
      if (cid && ev && namesSet.has(ev)) covered.add(cid)
    }
    for (const id of batch) {
      if (!covered.has(id)) metaOnly.push(id)
    }
  }
  return metaOnly
}

/** Mode hybride : meta-only IDs en cache, noms exacts via Typesense (pas de liste 2.7K). */
async function computeHybrid(
  db: SupabaseClient,
  normalizedFormNames: string[],
): Promise<FormEventFilterHybrid> {
  const metaOnlyIds = await computeMetaOnlyIds(db, normalizedFormNames)
  return { mode: 'hybrid', exactNames: normalizedFormNames, metaOnlyIds }
}

/** Mode ids : union complete (Linova avec variantes datees). */
async function computeFullIds(
  db: SupabaseClient,
  normalizedFormNames: string[],
  distinctPrefixes: string[],
): Promise<FormEventFilterIds> {
  const [namesEqIds, prefixIds, metaIds] = await Promise.all([
    paginateContactIdsByEventNames(db, normalizedFormNames),
    distinctPrefixes.length > 0
      ? paginateContactIdsByPrefixes(db, distinctPrefixes)
      : Promise.resolve(new Set<string>()),
    paginateMetaContactIds(db, normalizedFormNames, distinctPrefixes),
  ])
  const allIds = new Set<string>()
  for (const id of namesEqIds) allIds.add(id)
  for (const id of prefixIds) allIds.add(id)
  for (const id of metaIds) allIds.add(id)
  return { mode: 'ids', contactIds: [...allIds] }
}

async function compute(
  db: SupabaseClient,
  filterValue: string,
): Promise<FormEventFilterResult> {
  const { normalizedFormNames, distinctPrefixes } = parseFilterValue(filterValue)
  if (normalizedFormNames.length === 0) {
    return { mode: 'hybrid', exactNames: [], metaOnlyIds: [] }
  }
  if (distinctPrefixes.length === 0) {
    return computeHybrid(db, normalizedFormNames)
  }
  return computeFullIds(db, normalizedFormNames, distinctPrefixes)
}

/** contact_ids en cache = metaOnlyIds (mode hybrid) ou liste complete (mode ids). */
function cacheContactIds(result: FormEventFilterResult): string[] {
  return result.mode === 'hybrid' ? result.metaOnlyIds : result.contactIds
}

async function writeCache(
  db: SupabaseClient,
  filterHash: string,
  filterValue: string,
  result: FormEventFilterResult,
): Promise<void> {
  try {
    await db
      .from('crm_form_event_cache')
      .upsert(
        {
          filter_hash: filterHash,
          filter_value: filterValue,
          contact_ids: cacheContactIds(result),
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'filter_hash' },
      )
  } catch {
    // ignore
  }
}

function readCache(
  filterValue: string,
  contactIds: string[],
  distinctPrefixes: string[],
): FormEventFilterResult {
  const { normalizedFormNames } = parseFilterValue(filterValue)
  if (distinctPrefixes.length === 0) {
    return { mode: 'hybrid', exactNames: normalizedFormNames, metaOnlyIds: contactIds }
  }
  return { mode: 'ids', contactIds }
}

function refreshAsync(db: SupabaseClient, filterHash: string, filterValue: string): void {
  if (refreshInFlight.has(filterHash)) return
  refreshInFlight.add(filterHash)
  ;(async () => {
    try {
      const result = await compute(db, filterValue)
      await writeCache(db, filterHash, filterValue, result)
    } catch {
      // ignore
    } finally {
      refreshInFlight.delete(filterHash)
    }
  })()
}

export async function resolveFormEventFilter(
  db: SupabaseClient,
  filterValue: string,
): Promise<FormEventFilterResult> {
  const filterHash = crypto.createHash('sha1').update(filterValue).digest('hex')
  const { distinctPrefixes } = parseFilterValue(filterValue)
  const now = Date.now()
  const staleThreshold = new Date(now - STALE_TTL_MS).toISOString()

  type CacheRow = { contact_ids: string[]; computed_at: string; filter_value: string }
  let cacheRow: CacheRow | null = null
  try {
    const { data } = await db
      .from('crm_form_event_cache')
      .select('contact_ids, computed_at, filter_value')
      .eq('filter_hash', filterHash)
      .gte('computed_at', staleThreshold)
      .maybeSingle()
    if (data && Array.isArray((data as CacheRow).contact_ids)) {
      cacheRow = data as CacheRow
    }
  } catch {
    // table absente
  }

  if (cacheRow) {
    const computedAt = new Date(cacheRow.computed_at).getTime()
    const age = now - computedAt
    if (age > FRESH_TTL_MS) {
      refreshAsync(db, filterHash, filterValue)
    }
    return readCache(filterValue, cacheRow.contact_ids, distinctPrefixes)
  }

  const result = await compute(db, filterValue)
  await writeCache(db, filterHash, filterValue, result)
  return result
}

/** @deprecated Utiliser resolveFormEventFilter — conserve pour compat interne. */
export async function resolveFormEventContactIds(
  db: SupabaseClient,
  filterValue: string,
): Promise<string[]> {
  const result = await resolveFormEventFilter(db, filterValue)
  if (result.mode === 'ids') return result.contactIds
  const namesIds = await paginateContactIdsByEventNames(db, result.exactNames)
  const all = new Set(namesIds)
  for (const id of result.metaOnlyIds) all.add(id)
  return [...all]
}

export async function warmupFormEventCache(filterValues: string[]): Promise<void> {
  const db = createServiceClient()
  await Promise.all(
    filterValues.map(async (fv) => {
      try {
        await resolveFormEventFilter(db, fv)
      } catch {
        // ignore
      }
    }),
  )
}
