import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'

type SupabaseClient = ReturnType<typeof createServiceClient>

const FRESH_TTL_MS = 5 * 60 * 1000
const STALE_TTL_MS = 60 * 60 * 1000

const refreshInFlight = new Set<string>()

export type ResolveResult = string[]

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

async function computeWithRpc(
  db: SupabaseClient,
  normalizedFormNames: string[],
  distinctPrefixes: string[],
): Promise<string[] | null> {
  try {
    const { data: rpcRows, error: rpcErr } = await db.rpc(
      'crm_resolve_form_event_contact_ids_v2',
      {
        p_form_names_exact: normalizedFormNames,
        p_form_name_prefixes: distinctPrefixes,
      },
    )
    if (rpcErr || !Array.isArray(rpcRows)) return null
    return (rpcRows as Array<{ hubspot_contact_id: string | null }>)
      .map(r => r.hubspot_contact_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return null
  }
}

async function computeFallback(
  normalizedFormNames: string[],
  distinctPrefixes: string[],
): Promise<string[]> {
  const formNamePrefixes = [...new Set([...distinctPrefixes, ...normalizedFormNames])]
  const db = createServiceClient()
  const metaFormsById = new Map<string, { form_id: string; name: string | null }>()
  const { data: exactForms } = await db
    .from('meta_lead_forms')
    .select('form_id, name')
    .in('name', normalizedFormNames)
  for (const mf of (exactForms ?? []) as Array<{ form_id: string; name: string | null }>) {
    if (mf?.form_id) metaFormsById.set(mf.form_id, mf)
  }
  await Promise.all(formNamePrefixes.map(async (prefix) => {
    const { data: prefRows } = await db
      .from('meta_lead_forms')
      .select('form_id, name')
      .ilike('name', `${prefix}%`)
      .limit(200)
    for (const mf of (prefRows ?? []) as Array<{ form_id: string; name: string | null }>) {
      if (mf?.form_id) metaFormsById.set(mf.form_id, mf)
    }
  }))

  const metaIds = new Set<string>()
  const metaFormIds = [...metaFormsById.keys()]
  const metaTask = (async () => {
    if (metaFormIds.length === 0) return
    let off = 0
    const PAGE = 1000
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
  })()

  const namesIds = new Set<string>()
  const namesEqTask = (async () => {
    if (normalizedFormNames.length === 0) return
    let off = 0
    const PAGE = 1000
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
  })()

  const prefixTasks = distinctPrefixes.map(async (prefix) => {
    let off = 0
    const PAGE = 1000
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
  })

  await Promise.all([metaTask, namesEqTask, ...prefixTasks])
  const allIds = new Set<string>()
  for (const id of namesIds) allIds.add(id)
  for (const id of metaIds) allIds.add(id)
  return [...allIds]
}

async function compute(filterValue: string): Promise<string[]> {
  const { normalizedFormNames, distinctPrefixes } = parseFilterValue(filterValue)
  if (normalizedFormNames.length === 0) return []
  const db = createServiceClient()
  const viaRpc = await computeWithRpc(db, normalizedFormNames, distinctPrefixes)
  if (viaRpc !== null) return viaRpc
  return computeFallback(normalizedFormNames, distinctPrefixes)
}

async function writeCache(
  db: SupabaseClient,
  filterHash: string,
  filterValue: string,
  contactIds: string[],
): Promise<void> {
  try {
    await db
      .from('crm_form_event_cache')
      .upsert(
        {
          filter_hash: filterHash,
          filter_value: filterValue,
          contact_ids: contactIds,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'filter_hash' },
      )
  } catch {
    // ignore (table absente avant migration)
  }
}

function refreshAsync(db: SupabaseClient, filterHash: string, filterValue: string): void {
  if (refreshInFlight.has(filterHash)) return
  refreshInFlight.add(filterHash)
  ;(async () => {
    try {
      const ids = await compute(filterValue)
      await writeCache(db, filterHash, filterValue, ids)
    } catch {
      // ignore
    } finally {
      refreshInFlight.delete(filterHash)
    }
  })()
}

export async function resolveFormEventContactIds(
  db: SupabaseClient,
  filterValue: string,
): Promise<string[]> {
  const filterHash = crypto.createHash('sha1').update(filterValue).digest('hex')
  const now = Date.now()
  const staleThreshold = new Date(now - STALE_TTL_MS).toISOString()

  type CacheRow = { contact_ids: string[]; computed_at: string }
  let cacheRow: CacheRow | null = null
  try {
    const { data } = await db
      .from('crm_form_event_cache')
      .select('contact_ids, computed_at')
      .eq('filter_hash', filterHash)
      .gte('computed_at', staleThreshold)
      .maybeSingle()
    if (data && Array.isArray((data as CacheRow).contact_ids)) {
      cacheRow = data as CacheRow
    }
  } catch {
    // table absente : on calcule sync
  }

  if (cacheRow) {
    const computedAt = new Date(cacheRow.computed_at).getTime()
    const age = now - computedAt
    if (age > FRESH_TTL_MS) {
      // Stale-but-valid : on sert le cache et on refresh en arriere-plan.
      refreshAsync(db, filterHash, filterValue)
    }
    return cacheRow.contact_ids
  }

  // Cache miss complet (ou plus de 1h) : calcul synchrone.
  const ids = await compute(filterValue)
  await writeCache(db, filterHash, filterValue, ids)
  return ids
}

export async function warmupFormEventCache(filterValues: string[]): Promise<void> {
  const db = createServiceClient()
  await Promise.all(
    filterValues.map(async (fv) => {
      try {
        await resolveFormEventContactIds(db, fv)
      } catch {
        // ignore
      }
    }),
  )
}
