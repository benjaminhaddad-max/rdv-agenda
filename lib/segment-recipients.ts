/**
 * Résolution des contacts pour segments/listes CRM.
 * Utilisé par les campagnes email, SMS, et l'UI de gestion des segments.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CRMFilterGroup } from '@/lib/crm-constants'
import { viewToParams } from '@/lib/crm-views'
import { applyFilters, type FilterShape } from '@/lib/campaign-recipients'
import { deriveSiteUrl } from '@/lib/site-url'

export type SegmentChannel = 'email' | 'sms' | 'any'

export interface SegmentRow {
  id: string
  name?: string | null
  segment_type?: 'dynamic' | 'static' | null
  filters?: FilterShape | null
  filter_groups?: CRMFilterGroup[] | null
  preset_flags?: Record<string, unknown> | null
  manual_contact_ids?: string[] | null
}

export interface ResolvedSegmentContact {
  contact_id: string
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
}

const CONTACT_COLUMNS = 'hubspot_contact_id, email, phone, firstname, lastname'

type ContactDbRow = {
  hubspot_contact_id: string
  email: string | null
  phone: string | null
  firstname: string | null
  lastname: string | null
}

function toResolved(row: ContactDbRow): ResolvedSegmentContact {
  return {
    contact_id: row.hubspot_contact_id,
    email: row.email || null,
    phone: row.phone || null,
    first_name: row.firstname || null,
    last_name: row.lastname || null,
  }
}

function passesChannel(c: ResolvedSegmentContact, channel: SegmentChannel): boolean {
  if (channel === 'email') return !!c.email?.trim()
  if (channel === 'sms') return !!c.phone?.trim()
  return true
}

function dedupeKey(c: ResolvedSegmentContact, channel: SegmentChannel): string {
  if (channel === 'sms' && c.phone) return `p:${c.phone.replace(/\D/g, '')}`
  if (c.email) return `e:${c.email.toLowerCase()}`
  return `id:${c.contact_id}`
}

function filterGroupView(
  filterGroup: CRMFilterGroup,
  presetFlags: Record<string, unknown> | null,
) {
  return {
    id: 'segment',
    name: '',
    groups: [filterGroup],
    presetFlags: (presetFlags ?? undefined) as
      | { noTelepro?: boolean; recentFormMonths?: number; recentFormDays?: number; createdBeforeDays?: number }
      | undefined,
  }
}

function activeFilterGroups(filterGroups: CRMFilterGroup[]): CRMFilterGroup[] {
  return filterGroups.filter(g => (g.rules?.length ?? 0) > 0)
}

function mapApiRow(row: Record<string, unknown>): ContactDbRow {
  return {
    hubspot_contact_id: String(row.hubspot_contact_id ?? ''),
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    firstname: (row.firstname as string | null) ?? null,
    lastname: (row.lastname as string | null) ?? null,
  }
}

const CRM_CONTACTS_API_PAGE = 200
const CRM_CONTACTS_EXPORT_PAGE = 10_000

async function fetchCrmContactsPage(
  baseUrl: string,
  cookies: string,
  filterGroup: CRMFilterGroup,
  presetFlags: Record<string, unknown> | null,
  page: number,
  limit: number,
): Promise<{ data: ContactDbRow[]; total: number }> {
  const params = viewToParams(filterGroupView(filterGroup, presetFlags))
  params.set('exact_count', '1')
  params.set('page', String(page))
  if (limit === 0) {
    params.set('limit', '0')
  } else {
    const pageSize = Math.min(limit, CRM_CONTACTS_EXPORT_PAGE)
    if (pageSize > CRM_CONTACTS_API_PAGE) params.set('export', '1')
    params.set('limit', String(pageSize))
  }
  const url = `${baseUrl.replace(/\/$/, '')}/api/crm/contacts?${params.toString()}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { cookie: cookies },
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed'
    throw new Error(`Impossible de joindre ${url} (${msg})`)
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`/api/crm/contacts a renvoyé ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  const raw = Array.isArray(json.data) ? json.data as Record<string, unknown>[] : []
  return {
    data: raw.map(mapApiRow).filter(r => r.hubspot_contact_id),
    total: typeof json.total === 'number' ? json.total : raw.length,
  }
}

async function resolveContactsFromOneFilterGroup(
  baseUrl: string,
  cookies: string,
  filterGroup: CRMFilterGroup,
  presetFlags: Record<string, unknown> | null,
): Promise<ContactDbRow[]> {
  const all: ContactDbRow[] = []
  const PAGE = CRM_CONTACTS_EXPORT_PAGE
  let page = 0
  while (true) {
    const { data } = await fetchCrmContactsPage(baseUrl, cookies, filterGroup, presetFlags, page, PAGE)
    if (data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    page++
    if (page > 200) break
  }
  return all
}

/** Aperçu d'un seul groupe (AND interne). */
async function previewContactsFromOneFilterGroup(
  baseUrl: string,
  cookies: string,
  filterGroup: CRMFilterGroup,
  presetFlags: Record<string, unknown> | null,
  channel: SegmentChannel,
  sampleSize: number,
): Promise<{ total: number; sample: ResolvedSegmentContact[] }> {
  if (channel === 'any') {
    const { total } = await fetchCrmContactsPage(baseUrl, cookies, filterGroup, presetFlags, 0, 0)
    const fetchLimit = Math.max(sampleSize, 10)
    const { data } = await fetchCrmContactsPage(baseUrl, cookies, filterGroup, presetFlags, 0, fetchLimit)
    const sample = data.slice(0, sampleSize).map(toResolved)
    return { total, sample }
  }

  const PAGE = CRM_CONTACTS_EXPORT_PAGE
  let page = 0
  let total = 0
  const sample: ResolvedSegmentContact[] = []
  const seen = new Set<string>()

  while (true) {
    const { data } = await fetchCrmContactsPage(baseUrl, cookies, filterGroup, presetFlags, page, PAGE)
    if (data.length === 0) break
    for (const row of data) {
      const c = toResolved(row)
      if (!passesChannel(c, channel)) continue
      const key = dedupeKey(c, channel)
      if (seen.has(key)) continue
      seen.add(key)
      total++
      if (sample.length < sampleSize) sample.push(c)
    }
    if (data.length < PAGE) break
    page++
    if (page > 200) break
  }

  return { total, sample }
}

function unionResolvedContacts(
  rows: ContactDbRow[],
  channel: SegmentChannel,
  sampleSize: number,
): { total: number; sample: ResolvedSegmentContact[] } {
  const seen = new Map<string, ResolvedSegmentContact>()
  for (const row of rows) {
    const c = toResolved(row)
    if (!passesChannel(c, channel)) continue
    const key = dedupeKey(c, channel)
    if (!seen.has(key)) seen.set(key, c)
  }
  const all = Array.from(seen.values())
  return { total: all.length, sample: all.slice(0, sampleSize) }
}

/** Aperçu : count SQL exact + échantillon. Plusieurs groupes = union OR (comme l'UI). */
async function previewContactsFromFilterGroups(
  baseUrl: string,
  cookies: string,
  filterGroups: CRMFilterGroup[],
  presetFlags: Record<string, unknown> | null,
  channel: SegmentChannel,
  sampleSize: number,
): Promise<{ total: number; sample: ResolvedSegmentContact[] }> {
  const groups = activeFilterGroups(filterGroups)
  if (groups.length === 0) return { total: 0, sample: [] }
  if (groups.length === 1) {
    return previewContactsFromOneFilterGroup(baseUrl, cookies, groups[0], presetFlags, channel, sampleSize)
  }

  const byContactId = new Map<string, ContactDbRow>()
  for (const group of groups) {
    const rows = await resolveContactsFromOneFilterGroup(baseUrl, cookies, group, presetFlags)
    for (const row of rows) byContactId.set(row.hubspot_contact_id, row)
  }
  return unionResolvedContacts(Array.from(byContactId.values()), channel, sampleSize)
}

/** Résout des contacts via les filtres CRM avancés (même moteur que la page Contacts). */
export async function resolveContactsFromFilterGroups(
  baseUrl: string,
  cookies: string,
  filterGroups: CRMFilterGroup[],
  presetFlags: Record<string, unknown> | null,
): Promise<ContactDbRow[]> {
  const groups = activeFilterGroups(filterGroups)
  if (groups.length === 0) return []
  if (groups.length === 1) {
    return resolveContactsFromOneFilterGroup(baseUrl, cookies, groups[0], presetFlags)
  }

  const byContactId = new Map<string, ContactDbRow>()
  for (const group of groups) {
    const rows = await resolveContactsFromOneFilterGroup(baseUrl, cookies, group, presetFlags)
    for (const row of rows) byContactId.set(row.hubspot_contact_id, row)
  }
  return Array.from(byContactId.values())
}

async function fetchAllWithFlatFilters(
  db: SupabaseClient,
  filters: FilterShape | null,
): Promise<ContactDbRow[]> {
  const PAGE = 1000
  const out: ContactDbRow[] = []
  let from = 0
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from('crm_contacts').select(CONTACT_COLUMNS).order('hubspot_contact_id', { ascending: true }).range(from, from + PAGE - 1)
    q = applyFilters(q, filters)
    const { data, error } = await q
    if (error) throw new Error(`fetchAllWithFlatFilters: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as ContactDbRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

function isMissingColumnError(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('column') || m.includes('segment_type') || m.includes('filter_groups')
}

const SEGMENT_FULL_SELECT =
  'id, name, segment_type, filters, filter_groups, preset_flags, manual_contact_ids'
const SEGMENT_LEGACY_SELECT = 'id, name, filters'

function normalizeLegacySegmentRow(row: Record<string, unknown>): SegmentRow {
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    segment_type: 'dynamic',
    filters: (row.filters as FilterShape | null) ?? null,
    filter_groups: [],
    preset_flags: null,
    manual_contact_ids: [],
  }
}

async function loadSegmentRows(db: SupabaseClient, segmentIds: string[]): Promise<SegmentRow[]> {
  const ids = segmentIds.filter(Boolean)
  if (ids.length === 0) return []

  const full = await db.from('email_segments').select(SEGMENT_FULL_SELECT).in('id', ids)
  if (!full.error) return (full.data ?? []) as SegmentRow[]

  if (isMissingColumnError(full.error.message)) {
    const fallback = await db.from('email_segments').select(SEGMENT_LEGACY_SELECT).in('id', ids)
    if (fallback.error) throw new Error(`load segments: ${fallback.error.message}`)
    return (fallback.data ?? []).map(r => normalizeLegacySegmentRow(r as Record<string, unknown>))
  }

  throw new Error(`load segments: ${full.error.message}`)
}

async function loadSegmentRow(db: SupabaseClient, segmentId: string): Promise<SegmentRow | null> {
  const rows = await loadSegmentRows(db, [segmentId])
  return rows[0] ?? null
}

async function fetchByContactIds(db: SupabaseClient, ids: string[]): Promise<ContactDbRow[]> {
  const out: ContactDbRow[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data, error } = await db
      .from('crm_contacts')
      .select(CONTACT_COLUMNS)
      .in('hubspot_contact_id', chunk)
    if (error) throw new Error(`fetchByContactIds: ${error.message}`)
    if (data) out.push(...(data as ContactDbRow[]))
  }
  return out
}

/** Résout les contacts d'un seul segment/liste. */
export async function resolveSegment(
  db: SupabaseClient,
  segment: SegmentRow,
  opts: {
    channel?: SegmentChannel
    baseUrl?: string
    cookies?: string
  } = {},
): Promise<ResolvedSegmentContact[]> {
  const channel = opts.channel ?? 'any'
  const baseUrl = opts.baseUrl ?? deriveSiteUrl()
  const cookies = opts.cookies ?? ''

  let rows: ContactDbRow[] = []

  const legacyContactIds = Array.isArray((segment.filters as { contact_ids?: unknown } | null)?.contact_ids)
    ? ((segment.filters as { contact_ids: string[] }).contact_ids).filter(Boolean)
    : []

  if (segment.segment_type === 'static') {
    const ids = (segment.manual_contact_ids ?? []).filter(Boolean)
    if (ids.length > 0) rows = await fetchByContactIds(db, ids)
  } else if (legacyContactIds.length > 0) {
    rows = await fetchByContactIds(db, legacyContactIds)
  } else {
    const filterGroups = Array.isArray(segment.filter_groups) ? segment.filter_groups : []
    const hasAdvanced = filterGroups.some(g => (g.rules?.length ?? 0) > 0)
    if (hasAdvanced) {
      rows = await resolveContactsFromFilterGroups(baseUrl, cookies, filterGroups, segment.preset_flags ?? null)
    } else if (segment.filters && Object.keys(segment.filters).length > 0) {
      rows = await fetchAllWithFlatFilters(db, segment.filters)
    }
  }

  const seen = new Set<string>()
  const out: ResolvedSegmentContact[] = []
  for (const row of rows) {
    const c = toResolved(row)
    if (!passesChannel(c, channel)) continue
    const key = dedupeKey(c, channel)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/** Union (OR) de plusieurs segments — dédoublonnage par email ou téléphone. */
export async function resolveSegmentIds(
  db: SupabaseClient,
  segmentIds: string[],
  opts: {
    channel?: SegmentChannel
    baseUrl?: string
    cookies?: string
  } = {},
): Promise<ResolvedSegmentContact[]> {
  const ids = segmentIds.filter(Boolean)
  if (ids.length === 0) return []

  const segments = await loadSegmentRows(db, ids)

  const channel = opts.channel ?? 'any'
  const seen = new Map<string, ResolvedSegmentContact>()
  for (const seg of segments) {
    const contacts = await resolveSegment(db, seg, opts)
    for (const c of contacts) {
      const key = dedupeKey(c, channel)
      if (!seen.has(key)) seen.set(key, c)
    }
  }
  return Array.from(seen.values())
}

export async function previewSegments(
  db: SupabaseClient,
  input: SegmentRow | SegmentRow[] | string[],
  opts: {
    channel?: SegmentChannel
    baseUrl?: string
    cookies?: string
    sampleSize?: number
  } = {},
): Promise<{ total: number; sample: ResolvedSegmentContact[] }> {
  const sampleSize = Math.max(1, Math.min(50, opts.sampleSize ?? 10))
  const channel = opts.channel ?? 'any'
  const baseUrl = opts.baseUrl ?? deriveSiteUrl()
  const cookies = opts.cookies ?? ''

  const previewOneSegment = async (segment: SegmentRow): Promise<{ total: number; sample: ResolvedSegmentContact[] }> => {
    const filterGroups = Array.isArray(segment.filter_groups) ? segment.filter_groups : []
    const hasAdvanced = filterGroups.some(g => (g.rules?.length ?? 0) > 0)
    const legacyContactIds = Array.isArray((segment.filters as { contact_ids?: unknown } | null)?.contact_ids)
      ? ((segment.filters as { contact_ids: string[] }).contact_ids).filter(Boolean)
      : []

    if (segment.segment_type === 'static') {
      const ids = (segment.manual_contact_ids ?? []).filter(Boolean)
      const rows = ids.length > 0 ? await fetchByContactIds(db, ids) : []
      return finalizePreview(rows, channel, sampleSize)
    }
    if (legacyContactIds.length > 0) {
      const rows = await fetchByContactIds(db, legacyContactIds)
      return finalizePreview(rows, channel, sampleSize)
    }
    if (hasAdvanced) {
      return previewContactsFromFilterGroups(
        baseUrl, cookies, filterGroups, segment.preset_flags ?? null, channel, sampleSize,
      )
    }
    if (segment.filters && Object.keys(segment.filters).length > 0) {
      const rows = await fetchAllWithFlatFilters(db, segment.filters)
      return finalizePreview(rows, channel, sampleSize)
    }
    return { total: 0, sample: [] }
  }

  if (Array.isArray(input) && input.length > 0 && typeof input[0] === 'string') {
    const segments = await loadSegmentRows(db, input as string[])
    const seen = new Map<string, ResolvedSegmentContact>()
    let total = 0
    for (const seg of segments) {
      const { total: segTotal, sample } = await previewOneSegment(seg)
      total += segTotal
      for (const c of sample) {
        const key = dedupeKey(c, channel)
        if (!seen.has(key)) seen.set(key, c)
      }
    }
    return { total, sample: Array.from(seen.values()).slice(0, sampleSize) }
  }

  if (Array.isArray(input)) {
    const seen = new Map<string, ResolvedSegmentContact>()
    let total = 0
    for (const seg of input as SegmentRow[]) {
      const { total: segTotal, sample } = await previewOneSegment(seg)
      total += segTotal
      for (const c of sample) {
        const key = dedupeKey(c, channel)
        if (!seen.has(key)) seen.set(key, c)
      }
    }
    return { total, sample: Array.from(seen.values()).slice(0, sampleSize) }
  }

  return previewOneSegment(input as SegmentRow)
}

function finalizePreview(
  rows: ContactDbRow[],
  channel: SegmentChannel,
  sampleSize: number,
): { total: number; sample: ResolvedSegmentContact[] } {
  const seen = new Set<string>()
  const all: ResolvedSegmentContact[] = []
  for (const row of rows) {
    const c = toResolved(row)
    if (!passesChannel(c, channel)) continue
    const key = dedupeKey(c, channel)
    if (seen.has(key)) continue
    seen.add(key)
    all.push(c)
  }
  return { total: all.length, sample: all.slice(0, sampleSize) }
}

/** Met à jour contact_count sur un segment (best-effort). */
export async function refreshSegmentContactCount(
  db: SupabaseClient,
  segmentId: string,
  opts: { baseUrl?: string; cookies?: string } = {},
): Promise<number> {
  const data = await loadSegmentRow(db, segmentId)
  if (!data) return 0
  const { total } = await previewSegments(db, data as SegmentRow, { ...opts, channel: 'any', sampleSize: 1 })
  await db.from('email_segments').update({ contact_count: total }).eq('id', segmentId)
  return total
}
