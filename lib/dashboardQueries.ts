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

  // ── Groupement temporel (day/week/month) ──────────────────────────────
  if (gb === 'day' || gb === 'week' || gb === 'month') {
    let q = db.from(src.table).select(src.dateField)
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    q = applyFilters(q, config)
    q = q.limit(10000)
    const { data } = await q

    const buckets = new Map<string, number>()
    for (const row of (data || [])) {
      const dateStr = row[src.dateField] as string | null
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
    let q = db.from(src.table).select('dealstage')
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    q = applyFilters(q, config)
    q = q.limit(50000)
    const { data } = await q

    const counts = new Map<string, number>()
    for (const row of (data || [])) {
      const s = (row.dealstage as string) || 'unknown'
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
    // On récupère d'abord les owners puis on joint
    let q = db.from(src.table).select('hubspot_owner_id')
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    q = applyFilters(q, config)
    q = q.limit(50000)
    const { data } = await q

    const counts = new Map<string, number>()
    for (const row of (data || [])) {
      const id = (row.hubspot_owner_id as string) || 'unassigned'
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
  if (gb === 'conversion_event') {
    let q = db.from(src.table).select('recent_conversion_event')
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    q = applyFilters(q, config)
    q = q.limit(50000)
    const { data } = await q

    const counts = new Map<string, number>()
    for (const row of (data || [])) {
      const raw = (row.recent_conversion_event as string) || 'Aucun formulaire'
      // Simplification du nom : "Page - Brand: Form Name" → "Form Name"
      const clean = raw.includes(':') ? raw.split(':').slice(-1)[0].trim() : raw
      counts.set(clean, (counts.get(clean) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key.length > 50 ? key.slice(0, 50) + '…' : key, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }

  // ── Groupement par source/origine ─────────────────────────────────────
  if (gb === 'source' || gb === 'origine') {
    const field = config.data_source === 'contacts' ? 'origine' : 'source'
    let q = db.from(src.table).select(field)
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    q = applyFilters(q, config)
    q = q.limit(50000)
    const { data } = await q

    // Valeurs techniques HubSpot (hs_analytics_source) à EXCLURE :
    // on ne garde que les valeurs de la vraie propriété custom "Origine"
    const HS_TECHNICAL = new Set([
      'OFFLINE', 'PAID_SOCIAL', 'ORGANIC_SEARCH', 'DIRECT_TRAFFIC',
      'PAID_SEARCH', 'REFERRALS', 'AI_REFERRALS', 'EMAIL_MARKETING',
      'SOCIAL_MEDIA', 'OTHER_CAMPAIGNS',
    ])

    const counts = new Map<string, number>()
    for (const row of (data || [])) {
      const v = (row[field] as string | null) || null
      if (!v || HS_TECHNICAL.has(v)) continue // ignore null + valeurs techniques
      counts.set(v, (counts.get(v) || 0) + 1)
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
    let q = db.from(src.table).select(field)
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    q = applyFilters(q, config)
    q = q.limit(50000)
    const { data } = await q

    const counts = new Map<string, number>()
    for (const row of (data || [])) {
      const v = (row[field] as string) || 'Non renseigné'
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, label: key, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }

  // ── Groupement par status ────────────────────────────────────────────
  if (gb === 'status') {
    let q = db.from(src.table).select('status')
    if (start) q = q.gte(src.dateField, start)
    if (end)   q = q.lt(src.dateField, end)
    q = applyFilters(q, config)
    q = q.limit(50000)
    const { data } = await q

    const counts = new Map<string, number>()
    for (const row of (data || [])) {
      const v = (row.status as string) || 'unknown'
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
