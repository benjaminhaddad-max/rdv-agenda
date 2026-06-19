/**
 * Résolution des destinataires d'une campagne email :
 * combine les segments choisis (OR), les filtres ad-hoc (AND), et la liste
 * manuelle de contact_ids (UNION) pour produire la liste finale {email,
 * first_name, last_name, contact_id} prête à envoyer.
 *
 * Format des filtres (`extra_filters` ou `email_segments.filters`) :
 *   {
 *     classe?:           string | string[]   // 'Terminale' | ['Première','Terminale']
 *     zone?:             string | string[]
 *     departement?:      string | string[]
 *     formation?:        string | string[]   // formation_souhaitee
 *     lead_status?:      string | string[]
 *     origine?:          string | string[]
 *     contact_owner?:    string | string[]   // hubspot_owner_id du contact
 *     recent_conversion_after?:  string      // ISO date (YYYY-MM-DD ou full)
 *     recent_conversion_before?: string
 *     created_after?:    string
 *     created_before?:   string
 *     no_owner?:         boolean             // contacts sans hubspot_owner_id
 *     emails_only?:      boolean             // exclut les contacts sans email
 *   }
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSegmentIds } from '@/lib/segment-recipients'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FilterShape = Record<string, any>

export interface ResolvedRecipient {
  contact_id: string
  email: string
  first_name: string | null
  last_name: string | null
}


const COLUMNS = 'hubspot_contact_id, email, firstname, lastname'

async function intersectWithExtraFilters(
  db: SupabaseClient,
  contactIds: string[],
  extraFilters: FilterShape,
): Promise<Array<{ hubspot_contact_id: string; email: string | null; firstname: string | null; lastname: string | null }>> {
  const out: Array<{ hubspot_contact_id: string; email: string | null; firstname: string | null; lastname: string | null }> = []
  for (let i = 0; i < contactIds.length; i += 200) {
    const chunk = contactIds.slice(i, i + 200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from('crm_contacts').select(COLUMNS).in('hubspot_contact_id', chunk)
    q = applyFilters(q, extraFilters)
    q = q.not('email', 'is', null).neq('email', '')
    const { data, error } = await q
    if (error) throw new Error(`intersectWithExtraFilters: ${error.message}`)
    if (data) out.push(...(data as typeof out))
  }
  return out
}

/**
 * Applique un objet de filtres sur un query builder Supabase. Renvoie le
 * builder modifié (chaining-friendly). Le type `any` est nécessaire car le
 * type chain de PostgrestFilterBuilder est trop complexe à exprimer.
 */
function applyFilters(query: any, filters: FilterShape | null): any {
  if (!filters || typeof filters !== 'object') return query

  const arr = (v: unknown): string[] | null =>
    Array.isArray(v) ? v.map(String).filter(Boolean) :
    typeof v === 'string' && v ? [v] : null

  const single = (v: unknown): string | null =>
    typeof v === 'string' && v ? v :
    Array.isArray(v) && v.length === 1 ? String(v[0]) : null

  if (filters.classe) {
    const a = arr(filters.classe)
    if (a && a.length > 1) query = query.in('classe_actuelle', a)
    else if (a && a.length === 1) query = query.eq('classe_actuelle', a[0])
  }
  if (filters.zone) {
    const a = arr(filters.zone)
    if (a && a.length > 1) query = query.in('zone_localite', a)
    else if (a && a.length === 1) query = query.eq('zone_localite', a[0])
  }
  if (filters.departement) {
    const a = arr(filters.departement)
    if (a && a.length > 1) query = query.in('departement', a)
    else if (a && a.length === 1) query = query.eq('departement', a[0])
  }
  if (filters.formation) {
    const a = arr(filters.formation)
    if (a && a.length > 1) query = query.in('formation_souhaitee', a)
    else if (a && a.length === 1) query = query.eq('formation_souhaitee', a[0])
  }
  if (filters.lead_status) {
    const a = arr(filters.lead_status)
    if (a && a.length > 1) query = query.in('hs_lead_status', a)
    else if (a && a.length === 1) query = query.eq('hs_lead_status', a[0])
  }
  if (filters.origine) {
    const a = arr(filters.origine)
    if (a && a.length > 1) query = query.in('origine', a)
    else if (a && a.length === 1) query = query.eq('origine', a[0])
  }
  if (filters.contact_owner) {
    const a = arr(filters.contact_owner)
    if (a && a.length > 1) query = query.in('hubspot_owner_id', a)
    else if (a && a.length === 1) query = query.eq('hubspot_owner_id', a[0])
  }
  if (filters.no_owner === true) {
    query = query.is('hubspot_owner_id', null)
  }
  const ra = single(filters.recent_conversion_after)
  if (ra)  query = query.gte('recent_conversion_date', ra)
  const rb = single(filters.recent_conversion_before)
  if (rb)  query = query.lte('recent_conversion_date', rb)
  const ca = single(filters.created_after)
  if (ca)  query = query.gte('contact_createdate', ca)
  const cb = single(filters.created_before)
  if (cb)  query = query.lte('contact_createdate', cb)

  return query
}

export { applyFilters }

/**
 * Pagine sur Supabase pour récupérer TOUS les contacts qui matchent un
 * combo de filtres (gère la limite 1000 rows/req de PostgREST).
 */
async function fetchAll(
  db: SupabaseClient,
  filters: FilterShape | null,
): Promise<Array<{ hubspot_contact_id: string; email: string | null; firstname: string | null; lastname: string | null }>> {
  const PAGE = 1000
  const out: Array<{ hubspot_contact_id: string; email: string | null; firstname: string | null; lastname: string | null }> = []
  let from = 0
  while (true) {
    let q = db.from('crm_contacts').select(COLUMNS).order('hubspot_contact_id', { ascending: true }).range(from, from + PAGE - 1)
    q = applyFilters(q, filters)
    // Toujours filtrer les contacts sans email
    q = q.not('email', 'is', null).neq('email', '')
    const { data, error } = await q
    if (error) throw new Error(`fetchAll: ${error.message}`)
    if (!data || data.length === 0) break
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.push(...(data as any[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

/**
 * Résout la liste finale de destinataires pour une campagne.
 *
 * Logique :
 *   - segments : OR entre eux. Si une campagne référence segments A et B,
 *     les destinataires sont (segment A) UNION (segment B).
 *   - extra_filters : AND par-dessus chaque segment. Si pas de segment, alors
 *     extra_filters s'applique seul (sur tous les contacts).
 *   - manual_contact_ids : UNION ajoutée à la fin.
 *   - Dédoublonnage final par email (case-insensitive).
 */
export async function resolveCampaignRecipients(
  db: SupabaseClient,
  campaign: {
    segment_ids?: string[] | null
    extra_filters?: FilterShape | null
    manual_contact_ids?: string[] | null
  },
): Promise<ResolvedRecipient[]> {
  const seen = new Map<string, ResolvedRecipient>()  // key = email lowercase
  const add = (rows: Array<{ hubspot_contact_id: string; email: string | null; firstname: string | null; lastname: string | null }>) => {
    for (const r of rows) {
      if (!r.email) continue
      const key = r.email.toLowerCase()
      if (seen.has(key)) continue
      seen.set(key, {
        contact_id: r.hubspot_contact_id,
        email: r.email,
        first_name: r.firstname || null,
        last_name: r.lastname || null,
      })
    }
  }

  // 1–2. Segments (OR) + extra_filters (AND)
  const segmentIds = (campaign.segment_ids || []).filter(Boolean)
  const hasExtra = campaign.extra_filters && Object.keys(campaign.extra_filters).length > 0

  if (segmentIds.length > 0) {
    const resolved = await resolveSegmentIds(db, segmentIds, { channel: 'email' })
    let rows = resolved
      .filter(c => !!c.email)
      .map(c => ({
        hubspot_contact_id: c.contact_id,
        email: c.email,
        firstname: c.first_name,
        lastname: c.last_name,
      }))

    if (hasExtra) {
      const ids = rows.map(r => r.hubspot_contact_id).filter(Boolean)
      rows = await intersectWithExtraFilters(db, ids, campaign.extra_filters!)
    }
    add(rows)
  } else if (hasExtra) {
    const rows = await fetchAll(db, campaign.extra_filters!)
    add(rows)
  }

  // 3. manual_contact_ids : ajouter directement (UNION)
  const manual = (campaign.manual_contact_ids || []).filter(Boolean)
  if (manual.length > 0) {
    const { data, error } = await db
      .from('crm_contacts')
      .select(COLUMNS)
      .in('hubspot_contact_id', manual)
      .not('email', 'is', null)
      .neq('email', '')
    if (error) throw new Error(`load manual: ${error.message}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add((data ?? []) as any[])
  }

  // 4. Exclure les emails désabonnés
  if (seen.size > 0) {
    const emails = Array.from(seen.keys())
    // PostgREST .in() limite par URL length; on chunke par 200
    const unsubscribed = new Set<string>()
    for (let i = 0; i < emails.length; i += 200) {
      const chunk = emails.slice(i, i + 200)
      const { data } = await db
        .from('email_unsubscribes')
        .select('email')
        .in('email', chunk)
      for (const u of (data ?? [])) {
        if (u.email) unsubscribed.add(String(u.email).toLowerCase())
      }
    }
    for (const e of unsubscribed) seen.delete(e)
  }

  return Array.from(seen.values())
}

/**
 * Version "preview" : ne renvoie que le count + un échantillon de N contacts.
 * Utilisé pour l'aperçu avant envoi (l'UI veut juste savoir combien et qui).
 */
export async function previewCampaignRecipients(
  db: SupabaseClient,
  campaign: {
    segment_ids?: string[] | null
    extra_filters?: FilterShape | null
    manual_contact_ids?: string[] | null
  },
  sampleSize = 5,
): Promise<{ total: number; sample: ResolvedRecipient[] }> {
  // Pour avoir un count exact on doit résoudre tout (les filtres sont variés).
  // En pratique sur 160K contacts ça prend < 2s.
  const all = await resolveCampaignRecipients(db, campaign)
  return {
    total: all.length,
    sample: all.slice(0, sampleSize),
  }
}
