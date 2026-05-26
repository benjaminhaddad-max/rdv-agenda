import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cached } from '@/lib/cache'
import { getApiUserContext } from '@/lib/api-auth'
import { resolveFormEventFilter, warmupFormEventCache } from '@/lib/form-event-resolver'

type ViewRule = { field?: string; operator?: string; value?: string }
type ViewGroup = { rules?: ViewRule[] }
type SavedViewRow = {
  id: string
  name: string
  filter_groups: ViewGroup[] | null
  preset_flags?: {
    noTelepro?: boolean
  } | null
}

function splitMulti(v: string): string[] {
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

async function fetchAllMetaLeadContactIds(db: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const ids = new Set<string>()
  const PAGE = 1000
  for (let off = 0; off < 200000; off += PAGE) {
    const { data, error } = await db
      .rpc('crm_meta_lead_contact_ids')
      .range(off, off + PAGE - 1)
    if (error) break
    const rows = (data ?? []) as Array<{ hubspot_contact_id: string | null }>
    if (rows.length === 0) break
    for (const r of rows) {
      if (r?.hubspot_contact_id) ids.add(r.hubspot_contact_id)
    }
    if (rows.length < PAGE) break
  }
  return [...ids]
}

async function resolveScopedTeleproContactIds(
  db: ReturnType<typeof createServiceClient>,
  teleproIds: string[],
): Promise<string[]> {
  if (teleproIds.length === 0) return []
  const out = new Set<string>()
  const PAGE = 1000

  for (let off = 0; off < 100000; off += PAGE) {
    const { data: rows } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id')
      .in('telepro_user_id', teleproIds)
      .range(off, off + PAGE - 1)
    if (!rows || rows.length === 0) break
    for (const r of rows) if (r.hubspot_contact_id) out.add(r.hubspot_contact_id)
    if (rows.length < PAGE) break
  }

  return [...out]
}

async function computeCountForView(
  db: ReturnType<typeof createServiceClient>,
  row: SavedViewRow,
  forcedTeleproIds: string[],
): Promise<number> {
  const first = row.filter_groups?.[0]
  const rules = [...(first?.rules ?? [])]

  const filters: Record<string, unknown> = { all_classes: true }
  if (row.preset_flags?.noTelepro) filters.telepro_user_id = null

  let formContactIds: string[] | null = null
  let metaAdsOnly = false

  const scopedIds = forcedTeleproIds.length > 0
    ? await resolveScopedTeleproContactIds(db, forcedTeleproIds)
    : null

  for (const r of rules) {
    const field = String(r.field || '')
    const op = String(r.operator || '')
    const value = String(r.value || '')
    if (!value && op !== 'is_empty' && op !== 'is_not_empty') continue
    if (op !== 'is' && op !== 'is_any') continue

    if (field === 'telepro') filters.telepro_user_id = splitMulti(value)[0] ?? null
    if (field === 'contact_owner') filters.hubspot_owner_id = splitMulti(value)[0] ?? null
    if (field === 'closer_contact') filters.closer_du_contact_owner_id = splitMulti(value)[0] ?? null
    if (field === 'source') filters.origine = splitMulti(value)[0] ?? null
    if (field === 'lead_status') filters.hs_lead_status = splitMulti(value)[0] ?? null
    if (field === 'classe') filters.classe = splitMulti(value)[0] ?? null
    if (field === 'form_event') {
      const resolved = await resolveFormEventFilter(db, value)
      if (resolved.mode === 'ids') {
        formContactIds = resolved.contactIds
      } else {
        const namesIds = new Set<string>()
        if (resolved.exactNames.length > 0) {
          const PAGE = 1000
          let off = 0
          while (true) {
            const { data: rows } = await db
              .from('crm_contacts')
              .select('hubspot_contact_id')
              .in('recent_conversion_event', resolved.exactNames)
              .range(off, off + PAGE - 1)
            if (!rows || rows.length === 0) break
            for (const r of rows) {
              const cid = (r as { hubspot_contact_id: string | null }).hubspot_contact_id
              if (cid) namesIds.add(cid)
            }
            if (rows.length < PAGE) break
            off += PAGE
          }
        }
        for (const id of resolved.metaOnlyIds) namesIds.add(id)
        formContactIds = [...namesIds]
      }
    }
    if (field === 'custom:meta_lead_ads' || field === 'meta_lead_ads') {
      metaAdsOnly = true
    }
  }

  if (metaAdsOnly) {
    const ids = await fetchAllMetaLeadContactIds(db)
    if (!scopedIds) return ids.length
    const scopedSet = new Set(scopedIds)
    return ids.filter(id => scopedSet.has(id)).length
  }

  if (scopedIds !== null && formContactIds !== null) {
    const scopedSet = new Set(scopedIds)
    filters.form_contact_ids = formContactIds.filter(id => scopedSet.has(id))
  } else if (scopedIds !== null) {
    filters.form_contact_ids = scopedIds
  } else if (formContactIds !== null) {
    filters.form_contact_ids = formContactIds
  }

  const { data } = await db.rpc('crm_contacts_count_filtered', {
    p_filters: filters,
  })
  return Number(data ?? 0)
}

type CountsRequestBody = {
  view_ids?: string[]
}

export async function POST(req: Request) {
  const startedAt = Date.now()
  let body: CountsRequestBody = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const requestedIds = new Set(
    Array.isArray(body.view_ids) ? body.view_ids.map(v => String(v)) : []
  )

  const db = createServiceClient()
  const apiUser = await getApiUserContext()
  let forcedTeleproIds: string[] = []
  const shouldForceScopedTelepro = !!(
    apiUser && (
      apiUser.role === 'telepro' ||
      (
        apiUser.crmScope === 'brand_only' &&
        String(apiUser.crmBrand || '').toLowerCase() === 'linova'
      )
    )
  )
  if (shouldForceScopedTelepro) {
    const { data: me } = await db
      .from('rdv_users')
      .select('id, email, hubspot_user_id, hubspot_owner_id')
      .eq('id', apiUser.appUserId)
      .maybeSingle()
    const ids = [
      me?.hubspot_user_id ? String(me.hubspot_user_id).trim() : '',
      me?.hubspot_owner_id ? String(me.hubspot_owner_id).trim() : '',
      me?.id ? String(me.id).trim() : '',
    ].filter(Boolean)

    const meEmail = String(me?.email || '').trim().toLowerCase()
    if (meEmail) {
      const { data: sameEmailUsers } = await db
        .from('rdv_users')
        .select('id, hubspot_user_id, hubspot_owner_id')
        .ilike('email', meEmail)
      for (const u of (sameEmailUsers ?? []) as Array<{ id?: string | null; hubspot_user_id?: string | null; hubspot_owner_id?: string | null }>) {
        if (u?.id) ids.push(String(u.id).trim())
        if (u?.hubspot_user_id) ids.push(String(u.hubspot_user_id).trim())
        if (u?.hubspot_owner_id) ids.push(String(u.hubspot_owner_id).trim())
      }
    }
    forcedTeleproIds = [...new Set(ids.filter(Boolean))]
  }
  const { data: rows, error } = await db
    .from('crm_saved_views')
    .select('id, name, filter_groups, preset_flags')
    .order('position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allViews: SavedViewRow[] = [{ id: 'all', name: 'Tous les leads', filter_groups: [], preset_flags: null }, ...(rows ?? [])]
  const scopedViews =
    requestedIds.size > 0
      ? allViews.filter(v => requestedIds.has(v.id))
      : allViews

  const entries = await Promise.all(
    scopedViews.map(async (v) => {
      const key = `crm:view-count:${v.id}:telepro:${forcedTeleproIds.sort().join('|') || 'all'}:${crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex')}`
      const count = await cached<number>(key, 30, async () => computeCountForView(db, v, forcedTeleproIds))
      return [v.id, count] as const
    })
  )
  const out: Record<string, number> = Object.fromEntries(entries)

  // Warmup async (fire-and-forget) du cache form_event pour toutes les vues
  // visibles ayant un filtre form_event. Quand l'utilisateur clique sur la
  // vue (ex: Edumove), la liste se chargera depuis le cache, instantanement.
  try {
    const formEventValues = new Set<string>()
    for (const v of scopedViews) {
      const rules = v.filter_groups?.[0]?.rules ?? []
      for (const r of rules) {
        if (r.field === 'form_event' && (r.operator === 'is' || r.operator === 'is_any') && r.value) {
          formEventValues.add(r.value)
        }
      }
    }
    if (formEventValues.size > 0) {
      void warmupFormEventCache([...formEventValues])
    }
  } catch {
    // ignore
  }

  return NextResponse.json(
    { counts: out },
    {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
        'X-Response-Time-Ms': String(Date.now() - startedAt),
      },
    }
  )
}
