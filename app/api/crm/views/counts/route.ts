import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cached } from '@/lib/cache'
import { getApiUserContext } from '@/lib/api-auth'

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

async function resolveFormContactIds(db: ReturnType<typeof createServiceClient>, values: string[]): Promise<string[]> {
  if (values.length === 0) return []

  const normalizedNames = [...new Set(values)]
  const prefixes = [...new Set(
    normalizedNames
      .map(name => name.replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/i, '').trim())
      .filter(Boolean)
  )]

  const formIds = new Set<string>()
  const { data: exactForms } = await db.from('meta_lead_forms').select('form_id').in('name', normalizedNames)
  for (const f of exactForms ?? []) if (f.form_id) formIds.add(f.form_id)

  for (const p of prefixes) {
    const { data: prefForms } = await db.from('meta_lead_forms').select('form_id').ilike('name', `${p}%`).limit(200)
    for (const f of prefForms ?? []) if (f.form_id) formIds.add(f.form_id)
  }

  if (formIds.size === 0) return []
  const ids = [...formIds]
  const contactIds = new Set<string>()
  const PAGE = 1000
  for (let off = 0; off < 50000; off += PAGE) {
    const { data: rows } = await db
      .from('meta_lead_events')
      .select('contact_id')
      .in('form_id', ids)
      .not('contact_id', 'is', null)
      .range(off, off + PAGE - 1)
    if (!rows || rows.length === 0) break
    for (const r of rows) if (r.contact_id) contactIds.add(r.contact_id)
    if (rows.length < PAGE) break
  }

  return [...contactIds]
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
      formContactIds = await resolveFormContactIds(db, splitMulti(value))
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
