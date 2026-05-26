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

/**
 * Etend les prefixes (ex: "LINOVA - Form LGF") en la liste des noms distincts
 * actuellement presents dans crm_contacts.recent_conversion_event et
 * meta_lead_forms.name. Resultat petit (~10-50 par prefixe), permet de passer
 * la totalite a Typesense en filtre exact recent_conversion_event:=[noms].
 *
 * Necessite l'index trgm sur recent_conversion_event (v36b).
 */
async function expandPrefixesToDistinctNames(
  db: SupabaseClient,
  distinctPrefixes: string[],
): Promise<string[]> {
  const allNames = new Set<string>()
  await Promise.all(distinctPrefixes.map(async (prefix) => {
    const [contactsRes, formsRes] = await Promise.all([
      db
        .from('crm_contacts')
        .select('recent_conversion_event')
        .ilike('recent_conversion_event', `${prefix}%`)
        .not('recent_conversion_event', 'is', null)
        .limit(5000),
      db
        .from('meta_lead_forms')
        .select('name')
        .ilike('name', `${prefix}%`)
        .limit(500),
    ])
    for (const r of (contactsRes.data ?? []) as Array<{ recent_conversion_event: string | null }>) {
      if (r.recent_conversion_event) allNames.add(r.recent_conversion_event)
    }
    for (const r of (formsRes.data ?? []) as Array<{ name: string | null }>) {
      if (r.name) allNames.add(r.name)
    }
  }))
  return [...allNames]
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

/**
 * Resolution generique mode hybride :
 *  1. Etend les prefixes en noms distincts (utilise index trgm v36b)
 *  2. Calcule metaOnlyIds (leads Meta Ads pas couverts par les noms)
 *  3. Renvoie les noms etendus + metaOnlyIds → Typesense filtre directement.
 *
 * Marche pour Edumove (16 noms, 0 prefixe), Linova (2 noms + variantes
 * datees), et toute autre vue future avec form_event.
 */
async function computeHybrid(
  db: SupabaseClient,
  normalizedFormNames: string[],
  distinctPrefixes: string[],
): Promise<FormEventFilterHybrid> {
  const expandedFromPrefixes = distinctPrefixes.length > 0
    ? await expandPrefixesToDistinctNames(db, distinctPrefixes)
    : []
  const allNames = new Set<string>(normalizedFormNames)
  for (const n of expandedFromPrefixes) allNames.add(n)
  const exactNames = [...allNames]
  const metaOnlyIds = await computeMetaOnlyIds(db, exactNames)
  return { mode: 'hybrid', exactNames, metaOnlyIds }
}

async function compute(
  db: SupabaseClient,
  filterValue: string,
): Promise<FormEventFilterResult> {
  const { normalizedFormNames, distinctPrefixes } = parseFilterValue(filterValue)
  if (normalizedFormNames.length === 0) {
    return { mode: 'hybrid', exactNames: [], metaOnlyIds: [] }
  }
  return computeHybrid(db, normalizedFormNames, distinctPrefixes)
}

async function writeCache(
  db: SupabaseClient,
  filterHash: string,
  filterValue: string,
  result: FormEventFilterResult,
): Promise<void> {
  const cacheContactIds = result.mode === 'hybrid' ? result.metaOnlyIds : result.contactIds
  const fullPayload = {
    filter_hash: filterHash,
    filter_value: filterValue,
    contact_ids: cacheContactIds,
    result_json: result,
    computed_at: new Date().toISOString(),
  }
  try {
    const { error } = await db
      .from('crm_form_event_cache')
      .upsert(fullPayload, { onConflict: 'filter_hash' })
    if (error) {
      // Colonne result_json absente : retry sans elle.
      const { result_json: _omit, ...legacyPayload } = fullPayload
      await db
        .from('crm_form_event_cache')
        .upsert(legacyPayload, { onConflict: 'filter_hash' })
    }
  } catch {
    // ignore
  }
}

function readCache(
  filterValue: string,
  contactIds: string[],
  resultJson: unknown,
): FormEventFilterResult {
  if (resultJson && typeof resultJson === 'object') {
    const r = resultJson as Partial<FormEventFilterHybrid> & Partial<FormEventFilterIds> & { mode?: string }
    if (r.mode === 'hybrid' && Array.isArray(r.exactNames) && Array.isArray(r.metaOnlyIds)) {
      return { mode: 'hybrid', exactNames: r.exactNames, metaOnlyIds: r.metaOnlyIds }
    }
    if (r.mode === 'ids' && Array.isArray(r.contactIds)) {
      return { mode: 'ids', contactIds: r.contactIds }
    }
  }
  // Fallback : ancienne entree (contact_ids seuls).
  const { normalizedFormNames, distinctPrefixes } = parseFilterValue(filterValue)
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
  const now = Date.now()
  const staleThreshold = new Date(now - STALE_TTL_MS).toISOString()

  type CacheRow = {
    contact_ids: string[]
    computed_at: string
    filter_value: string
    result_json: unknown
  }
  let cacheRow: CacheRow | null = null
  try {
    const { data, error } = await db
      .from('crm_form_event_cache')
      .select('contact_ids, computed_at, filter_value, result_json')
      .eq('filter_hash', filterHash)
      .gte('computed_at', staleThreshold)
      .maybeSingle()
    if (!error && data && Array.isArray((data as CacheRow).contact_ids)) {
      cacheRow = data as CacheRow
    } else if (error) {
      // Colonne result_json non migree (v36c absent) : retry sans elle.
      const { data: legacy } = await db
        .from('crm_form_event_cache')
        .select('contact_ids, computed_at, filter_value')
        .eq('filter_hash', filterHash)
        .gte('computed_at', staleThreshold)
        .maybeSingle()
      if (legacy && Array.isArray((legacy as Omit<CacheRow, 'result_json'>).contact_ids)) {
        cacheRow = { ...(legacy as Omit<CacheRow, 'result_json'>), result_json: null }
      }
    }
  } catch {
    // table absente : fallback compute
  }

  if (cacheRow) {
    const computedAt = new Date(cacheRow.computed_at).getTime()
    const age = now - computedAt
    if (age > FRESH_TTL_MS) {
      refreshAsync(db, filterHash, filterValue)
    }
    return readCache(filterValue, cacheRow.contact_ids, cacheRow.result_json)
  }

  const result = await compute(db, filterValue)
  await writeCache(db, filterHash, filterValue, result)
  return result
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
