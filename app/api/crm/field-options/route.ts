import { NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cached } from '@/lib/cache'
import { CRM_ORIGINE_VALUES, normalizeOrigineValue } from '@/lib/origine-normalization'

export const maxDuration = 300

/**
 * Paginated helper to fetch all distinct values for a column from crm_contacts.
 * Uses pagination (page size 1000) with ordering to avoid Supabase max_rows limits.
 */
async function fetchAllDistinctValues(column: string): Promise<string[]> {
  const db = createServiceClient()
  const PAGE_SIZE = 1000
  const allValues = new Set<string>()
  let offset = 0
  while (true) {
    const { data: rows } = await db
      .from('crm_contacts')
      .select(column)
      .not(column, 'is', null)
      .order(column, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (!rows || rows.length === 0) break
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of rows as any[]) {
      const v = r[column]
      if (v) allValues.add(v as string)
    }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    if (offset > 500000) break // safety
  }
  return [...allValues]
}

async function fetchDistinctFormEvents(): Promise<string[]> {
  const db = createServiceClient()
  const out = new Set<string>()
  const [metaRes, crmFormsRes, contactEvents] = await Promise.all([
    db.from('meta_lead_forms').select('name').not('name', 'is', null).limit(5000),
    db.from('forms').select('name').not('name', 'is', null).limit(5000),
    fetchAllDistinctValues('recent_conversion_event'),
  ])

  for (const r of (metaRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') out.add(n.trim())
  }
  for (const r of (crmFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') out.add(n.trim())
  }
  for (const n of contactEvents) {
    if (n && n.trim() !== '') out.add(n.trim())
  }

  return [...out].sort()
}

// Statuts du lead à fusionner vers une valeur canonique.
// "Pré-inscrit 2026-2027" (tiret) est l'ancien doublon historique : on le
// canonicalise désormais vers "Pré-inscrit 2026/2027" (slash), seule valeur
// présente dans HubSpot. Évite que le doublon réapparaisse dans les
// dropdowns de filtres si une ancienne valeur traînait encore en base.
const LEAD_STATUS_CANONICAL: Record<string, string> = {
  'Pré-inscrit 2026-2027': 'Pré-inscrit 2026/2027',
  'Pré-inscrit 2027-2028': 'Pré-inscrit 2027/2028',
}

function canonicalizeLeadStatuses(raw: string[]): string[] {
  const out = new Set<string>()
  for (const v of raw) out.add(LEAD_STATUS_CANONICAL[v] ?? v)
  return [...out]
}

/**
 * Le calcul parcourt toute la base contacts (~50K lignes, 6 colonnes, par
 * pages de 1000) : 57 s à froid, alors que le cache mémoire se perd à chaque
 * redémarrage de lambda Vercel → la liste « Statut du lead » restait vide
 * de longues secondes. On garde donc le dernier résultat dans crm_settings :
 * il est servi tout de suite, puis recalculé en arrière-plan s'il a plus de
 * REFRESH_AFTER_MS.
 */
const PERSIST_KEY = 'cache_crm_field_options_v1'
const REFRESH_AFTER_MS = 5 * 60_000

type FieldOptionsPayload = {
  leadStatuses: string[]
  sources: string[]
  formations: string[]
  zones: string[]
  departements: string[]
  formEvents: string[]
}

let refreshing = false

async function computePayload(): Promise<FieldOptionsPayload> {
  const [leadStatuses, sources, formations, zones, departements, formEvents] = await Promise.all([
    fetchAllDistinctValues('hs_lead_status'),
    fetchAllDistinctValues('origine'),
    fetchAllDistinctValues('formation_demandee'),
    fetchAllDistinctValues('zone_localite'),
    fetchAllDistinctValues('departement'),
    fetchDistinctFormEvents(),
  ])
  const normalizedSources = [...new Set([
    ...CRM_ORIGINE_VALUES,
    ...sources
      .map((v) => normalizeOrigineValue(v))
      .filter((v): v is string => !!v),
  ])]
  return {
    leadStatuses: canonicalizeLeadStatuses(leadStatuses).slice().sort(),
    sources: normalizedSources.slice().sort(),
    formations: formations.slice().sort(),
    zones: zones.slice().sort(),
    departements: departements.slice().sort(),
    formEvents: formEvents.slice().sort(),
  }
}

async function computeAndPersist(): Promise<FieldOptionsPayload> {
  const payload = await computePayload()
  const db = createServiceClient()
  await db.from('crm_settings').upsert({
    key: PERSIST_KEY,
    value: payload,
    description: 'Cache des options de filtres CRM (statuts, origines, formations…) — recalculé automatiquement',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  return payload
}

/**
 * GET /api/crm/field-options
 * Source unique : valeurs distinctes côté CRM/Supabase (sans dépendance HubSpot).
 */
export async function GET() {
  const db = createServiceClient()
  const { data: stored } = await db
    .from('crm_settings')
    .select('value, updated_at')
    .eq('key', PERSIST_KEY)
    .maybeSingle()

  let payload = stored?.value as FieldOptionsPayload | undefined
  if (payload?.leadStatuses) {
    const age = Date.now() - Date.parse(String(stored?.updated_at || 0))
    if (!(age < REFRESH_AFTER_MS) && !refreshing) {
      refreshing = true
      // Recalcul après la réponse : l'appelant n'attend pas
      after(async () => {
        try { await computeAndPersist() } finally { refreshing = false }
      })
    }
  } else {
    // Tout premier appel : pas encore de résultat enregistré
    payload = await cached('crm:field-options:v9', 300, computeAndPersist)
  }

  return NextResponse.json(payload, {
    // Les nouveaux formulaires (CRM + Meta + recent_conversion_event) doivent
    // apparaître vite dans « Soumission de formulaire » : pas de cache CDN,
    // le résultat enregistré a au plus quelques minutes.
    headers: { 'Cache-Control': 'no-store' },
  })
}
