/**
 * Moteur de requêtes pour les widgets de dashboard.
 *
 * Chaque widget a :
 *  - un data_source (contacts, deals, appointments, etc.)
 *  - une métrique (count, sum, avg...)
 *  - éventuellement un group_by (day, week, month, owner, stage...)
 *  - des filtres et un time_range
 *
 * Ce module convertit tout ça en requête Supabase et retourne le résultat
 * dans un format standardisé :
 *   { total: number, breakdown: Array<{ key, label, value, color? }> }
 */

import { createServiceClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────
export interface WidgetConfig {
  widget_type: string
  data_source: string
  metric?: string | null
  metric_field?: string | null
  group_by?: string | null
  filters?: Record<string, unknown> | null
  time_range?: string | null
  time_start?: string | null
  time_end?: string | null
  options?: Record<string, unknown> | null
}

export interface WidgetResult {
  total: number
  breakdown: Array<{
    key: string
    label: string
    value: number
    color?: string
  }>
  trend?: {
    previous: number
    delta: number      // différence absolue
    deltaPct: number   // pourcentage de variation
  }
}

// ─── Mapping data_source → table ──────────────────────────────────────────
const TABLES: Record<string, { table: string; dateField: string }> = {
  contacts:         { table: 'crm_contacts',      dateField: 'createdate' },
  deals:            { table: 'crm_deals',          dateField: 'createdate' },
  appointments:     { table: 'rdv_appointments',  dateField: 'start_at' },
  campaigns:        { table: 'email_campaigns',    dateField: 'created_at' },
  forms:            { table: 'forms',              dateField: 'created_at' },
  form_submissions: { table: 'form_submissions',   dateField: 'submitted_at' },
  users:            { table: 'rdv_users',          dateField: 'created_at' },
}

// ─── Time range → { start, end } ──────────────────────────────────────────
function computeTimeRange(config: WidgetConfig): { start?: string; end?: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (config.time_range) {
    case 'today': {
      const end = new Date(today); end.setDate(end.getDate() + 1)
      return { start: today.toISOString(), end: end.toISOString() }
    }
    case 'yesterday': {
      const start = new Date(today); start.setDate(start.getDate() - 1)
      return { start: start.toISOString(), end: today.toISOString() }
    }
    case 'last_7_days': {
      const start = new Date(today); start.setDate(start.getDate() - 7)
      return { start: start.toISOString() }
    }
    case 'last_30_days': {
      const start = new Date(today); start.setDate(start.getDate() - 30)
      return { start: start.toISOString() }
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: start.toISOString() }
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end   = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: start.toISOString(), end: end.toISOString() }
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1)
      return { start: start.toISOString() }
    }
    case 'custom':
      return { start: config.time_start || undefined, end: config.time_end || undefined }
    case 'all_time':
    default:
      return {}
  }
}

// ─── Stages du pipeline Diploma Santé (pour libellés) ────────────────────
const STAGE_LABELS: Record<string, { label: string; color: string; order: number }> = {
  '3165428979': { label: '🔴 À Replanifier',        color: '#ef4444', order: 1 },
  '3165428980': { label: '🔵 RDV Pris',              color: '#4cabdb', order: 2 },
  '3165428981': { label: '🟡 Délai Réflexion',       color: '#ccac71', order: 3 },
  '3165428982': { label: '🟢 Pré-inscription',       color: '#22c55e', order: 4 },
  '3165428983': { label: '🟣 Finalisation',          color: '#a855f7', order: 5 },
  '3165428984': { label: '✅ Inscription Confirmée', color: '#16a34a', order: 6 },
  '3165428985': { label: '⚫ Fermé Perdu',           color: '#7c98b6', order: 7 },
}

// ─── Exécution du widget ──────────────────────────────────────────────────
export async function runWidgetQuery(config: WidgetConfig): Promise<WidgetResult> {
  const src = TABLES[config.data_source]
  if (!src) {
    throw new Error(`Unknown data_source: ${config.data_source}`)
  }

  const db = createServiceClient()
  const { start, end } = computeTimeRange(config)

  // ── Query 1 : total sur la période ──────────────────────────────────────
  const baseCountQuery = () => {
    let q = db.from(src.table).select('*', { count: 'exact', head: true })
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    return applyFilters(q, config)
  }

  const { count: total } = await baseCountQuery()

  // ── Query 2 : tendance (période précédente) ─────────────────────────────
  let trend: WidgetResult['trend']
  if (start) {
    const startD = new Date(start)
    const endD = end ? new Date(end) : new Date()
    const duration = endD.getTime() - startD.getTime()
    const prevStart = new Date(startD.getTime() - duration)
    const prevEnd = startD.toISOString()

    let prevQ = db.from(src.table).select('*', { count: 'exact', head: true })
      .gte(src.dateField, prevStart.toISOString())
      .lt(src.dateField, prevEnd)
    prevQ = applyFilters(prevQ, config)
    const { count: prevCount } = await prevQ
    const prev = prevCount || 0
    const t = total || 0
    const delta = t - prev
    const deltaPct = prev > 0 ? (delta / prev) * 100 : (t > 0 ? 100 : 0)
    trend = { previous: prev, delta, deltaPct }
  }

  // ── Si pas de groupement → on retourne juste le total ──────────────────
  if (!config.group_by) {
    return { total: total || 0, breakdown: [], trend }
  }

  // ── Query 3 : breakdown (groupement) ─────────────────────────────────
  const breakdown = await computeBreakdown(db, src, config, start, end)

  return { total: total || 0, breakdown, trend }
}

// ─── Helper : fetch all rows paginated (bypasse limite Supabase 1000) ──
/**
 * Supabase/PostgREST limite chaque requête à ~1000 lignes par défaut.
 * Ce helper itère par pages de 1000 jusqu'à récupérer toutes les lignes.
 *
 * makeQuery doit retourner une nouvelle query à chaque appel (car les
 * queries Supabase sont des promesses à usage unique).
 */
async function fetchAllRows<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: () => any,
  maxRows = 100000,
): Promise<T[]> {
  const pageSize = 1000
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < pageSize) break // dernière page
    from += pageSize
  }
  return all
}

// ─── Application des filtres ──────────────────────────────────────────────
type SbQuery = ReturnType<ReturnType<typeof createServiceClient>['from']>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, config: WidgetConfig): any {
  const filters = config.filters || {}
  // exclude_stages : pour exclure certaines étapes (ex: les deals "fermé perdu")
  if (filters.exclude_stages && Array.isArray(filters.exclude_stages)) {
    q = q.not('dealstage', 'in', `(${(filters.exclude_stages as string[]).join(',')})`)
  }
  if (filters.stages && Array.isArray(filters.stages)) {
    q = q.in('dealstage', filters.stages as string[])
  }
  if (filters.owner_id) {
    q = q.eq('hubspot_owner_id', filters.owner_id)
  }
  if (filters.status) {
    q = q.eq('status', filters.status)
  }
  return q
}

// ─── Calcul du breakdown par group_by ─────────────────────────────────────
async function computeBreakdown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  src: { table: string; dateField: string },
  config: WidgetConfig,
  start?: string,
  end?: string,
): Promise<WidgetResult['breakdown']> {
  const gb = config.group_by!

  // ── Helper pour construire une query avec filtres + time range ─────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildQuery = (columns: string) => () => {
    let q = db.from(src.table).select(columns)
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    return applyFilters(q, config)
  }

  // ── Groupement temporel (day/week/month) ──────────────────────────────
  if (gb === 'day' || gb === 'week' || gb === 'month') {
    const data = await fetchAllRows<Record<string, string | null>>(buildQuery(src.dateField))

    const buckets = new Map<string, number>()
    for (const row of data) {
      const dateStr = row[src.dateField]
      if (!dateStr) continue
      const d = new Date(dateStr)
      const key = bucketKey(d, gb)
      buckets.set(key, (buckets.get(key) || 0) + 1)
    }
    const sortedKeys = Array.from(buckets.keys()).sort()
    return sortedKeys.map(k => ({
      key: k,
      label: formatBucketLabel(k, gb),
      value: buckets.get(k) || 0,
    }))
  }

  // ── Groupement par stage (deals uniquement) ───────────────────────────
  if (gb === 'stage') {
    const data = await fetchAllRows<{ dealstage: string | null }>(buildQuery('dealstage'))

    const counts = new Map<string, number>()
    for (const row of data) {
      const s = row.dealstage || 'unknown'
      counts.set(s, (counts.get(s) || 0) + 1)
    }
    const entries = Array.from(counts.entries())
    return entries
      .map(([key, value]) => {
        const meta = STAGE_LABELS[key]
        return {
          key,
          label: meta?.label || key,
          value,
          color: meta?.color || '#7c98b6',
          order: meta?.order || 999,
        }
      })
      .sort((a, b) => a.order - b.order)
      .map(({ order, ...rest }) => {
        void order
        return rest
      })
  }

  // ── Groupement par owner (closer) ─────────────────────────────────────
  if (gb === 'owner') {
    const data = await fetchAllRows<{ hubspot_owner_id: string | null }>(buildQuery('hubspot_owner_id'))

    const counts = new Map<string, number>()
    for (const row of data) {
      const id = row.hubspot_owner_id || 'unassigned'
      counts.set(id, (counts.get(id) || 0) + 1)
    }

    // Résout les owner_id → nom via rdv_users
    const ownerIds = Array.from(counts.keys()).filter(k => k !== 'unassigned')
    let ownerNames: Record<string, string> = {}
    if (ownerIds.length > 0) {
      const { data: users } = await db
        .from('rdv_users')
        .select('hubspot_owner_id, name, avatar_color')
        .in('hubspot_owner_id', ownerIds)
      ownerNames = Object.fromEntries(
        (users || []).map((u: { hubspot_owner_id: string; name: string }) => [u.hubspot_owner_id, u.name])
      )
    }

    return Array.from(counts.entries())
      .map(([key, value]) => ({
        key,
        label: key === 'unassigned' ? 'Non assigné' : (ownerNames[key] || key.slice(0, 8)),
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }

  // ── Groupement par formulaire de conversion (recent_conversion_event) ──
  if (gb === 'conversion_event' || gb === 'ns_forms') {
    const data = await fetchAllRows<{ recent_conversion_event: string | null }>(buildQuery('recent_conversion_event'))

    const onlyNS = gb === 'ns_forms'
    const counts = new Map<string, number>()
    for (const row of data) {
      const raw = row.recent_conversion_event
      if (!raw) continue // ignore contacts sans formulaire
      // Simplification du nom : "Page - Brand: Form Name" → "Form Name"
      const clean = raw.includes(':') ? raw.split(':').slice(-1)[0].trim() : raw
      // Filtre "NS -" ou "NS-" si demandé
      if (onlyNS && !/^NS\s*-/i.test(clean)) continue
      counts.set(clean, (counts.get(clean) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key.length > 60 ? key.slice(0, 60) + '…' : key, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, onlyNS ? 15 : 10)
  }

  // ── Groupement par source/origine ─────────────────────────────────────
  if (gb === 'source' || gb === 'origine') {
    const field = config.data_source === 'contacts' ? 'origine' : 'source'
    const data = await fetchAllRows<Record<string, string | null>>(buildQuery(field))

    // Valeurs techniques HubSpot → labels lisibles (Meta Ads, Google Ads…)
    // OFFLINE est ignoré (contacts manuels / imports, trop vague).
    const HS_LABELS: Record<string, string> = {
      PAID_SOCIAL:     'Meta Ads (Facebook / Instagram)',
      PAID_SEARCH:     'Google Ads',
      ORGANIC_SEARCH:  'SEO (Google / Bing)',
      DIRECT_TRAFFIC:  'Trafic direct',
      REFERRALS:       'Sites référents',
      AI_REFERRALS:    'IA (ChatGPT, Perplexity…)',
      EMAIL_MARKETING: 'Email marketing',
      SOCIAL_MEDIA:    'Réseaux sociaux (organique)',
      OTHER_CAMPAIGNS: 'Autres campagnes',
    }

    const counts = new Map<string, number>()
    for (const row of data) {
      const v = row[field] || null
      if (!v || v === 'OFFLINE') continue
      const label = HS_LABELS[v] || v
      counts.set(label, (counts.get(label) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }

  // ── Groupement par formation / classe / zone ─────────────────────────
  if (gb === 'formation' || gb === 'classe' || gb === 'zone') {
    const fieldMap: Record<string, string> = {
      formation: 'formation',
      classe:    'classe_actuelle',
      zone:      'zone_localite',
    }
    const field = fieldMap[gb]
    const data = await fetchAllRows<Record<string, string | null>>(buildQuery(field))

    const counts = new Map<string, number>()
    for (const row of data) {
      const v = row[field] || 'Non renseigné'
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }

  // ── Groupement par status ────────────────────────────────────────────
  if (gb === 'status') {
    const data = await fetchAllRows<{ status: string | null }>(buildQuery('status'))

    const counts = new Map<string, number>()
    for (const row of data) {
      const v = row.status || 'unknown'
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value)
  }

  return []
}

// ─── Helpers pour buckets temporels ───────────────────────────────────────
function bucketKey(d: Date, gb: string): string {
  if (gb === 'day')   return d.toISOString().slice(0, 10)
  if (gb === 'week') {
    const monday = new Date(d)
    const day = monday.getDay() || 7
    monday.setDate(monday.getDate() - day + 1)
    return monday.toISOString().slice(0, 10)
  }
  if (gb === 'month') return d.toISOString().slice(0, 7)
  return d.toISOString().slice(0, 10)
}

function formatBucketLabel(key: string, gb: string): string {
  if (gb === 'day') {
    return new Date(key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  }
  if (gb === 'week') {
    return 'Sem. du ' + new Date(key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  }
  if (gb === 'month') {
    const [y, m] = key.split('-')
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }
  return key
}
