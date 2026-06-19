/**
 * Résolution des contacts pour segments/listes CRM.
 * Utilisé par les campagnes email, SMS, et l'UI de gestion des segments.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CRMFilterGroup } from '@/lib/crm-constants'
import { viewToParams } from '@/lib/crm-views'
import { applyFilters, type FilterShape } from '@/lib/campaign-recipients'

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

/** Résout des contacts via les filtres CRM avancés (même moteur que la page Contacts). */
export async function resolveContactsFromFilterGroups(
  baseUrl: string,
  cookies: string,
  filterGroups: CRMFilterGroup[],
  presetFlags: Record<string, unknown> | null,
): Promise<ContactDbRow[]> {
  const view = {
    id: 'segment',
    name: '',
    groups: filterGroups,
    presetFlags: (presetFlags ?? undefined) as
      | { noTelepro?: boolean; recentFormMonths?: number; recentFormDays?: number; createdBeforeDays?: number }
      | undefined,
  }
  const params = viewToParams(view)
  params.set('export', '1')
  const url = `${baseUrl.replace(/\/$/, '')}/api/crm/contacts?${params.toString()}`
  const res = await fetch(url, { headers: { cookie: cookies } })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`/api/crm/contacts a renvoyé ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  const data = (json.data ?? []) as ContactDbRow[]
  return data
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

  let { data, error } = await db.from('email_segments').select(SEGMENT_FULL_SELECT).in('id', ids)
  if (error && isMissingColumnError(error.message)) {
    const fallback = await db.from('email_segments').select(SEGMENT_LEGACY_SELECT).in('id', ids)
    data = (fallback.data ?? []).map(r => normalizeLegacySegmentRow(r as Record<string, unknown>))
    error = fallback.error
  }
  if (error) throw new Error(`load segments: ${error.message}`)
  return (data ?? []) as SegmentRow[]
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
  const baseUrl = opts.baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
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
  let all: ResolvedSegmentContact[] = []

  if (Array.isArray(input) && input.length > 0 && typeof input[0] === 'string') {
    all = await resolveSegmentIds(db, input as string[], opts)
  } else if (Array.isArray(input)) {
    const seen = new Map<string, ResolvedSegmentContact>()
    for (const seg of input as SegmentRow[]) {
      const contacts = await resolveSegment(db, seg, opts)
      for (const c of contacts) {
        const key = dedupeKey(c, opts.channel ?? 'any')
        if (!seen.has(key)) seen.set(key, c)
      }
    }
    all = Array.from(seen.values())
  } else {
    all = await resolveSegment(db, input as SegmentRow, opts)
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
