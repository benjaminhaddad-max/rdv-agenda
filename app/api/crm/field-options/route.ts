import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cached } from '@/lib/cache'
import { normalizeOrigineValue } from '@/lib/origine-normalization'

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
  const [metaRes, crmFormsRes] = await Promise.all([
    db.from('meta_lead_forms').select('name').not('name', 'is', null).limit(5000),
    db.from('forms').select('name').not('name', 'is', null).limit(5000),
  ])

  for (const r of (metaRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') out.add(n.trim())
  }
  for (const r of (crmFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
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
}

function canonicalizeLeadStatuses(raw: string[]): string[] {
  const out = new Set<string>()
  for (const v of raw) out.add(LEAD_STATUS_CANONICAL[v] ?? v)
  return [...out]
}

/**
 * GET /api/crm/field-options
 * Source unique : valeurs distinctes côté CRM/Supabase (sans dépendance HubSpot).
 */
export async function GET() {
  // Bump cache key (v6) pour invalider l'ancien cache qui peut encore contenir
  // le doublon "Pré-inscrit 2026-2027".
  const staticPayload = await cached('crm:field-options:v6:static', 300, async () => {
    const [leadStatuses, sources, formations, zones, departements] = await Promise.all([
      fetchAllDistinctValues('hs_lead_status'),
      fetchAllDistinctValues('origine'),
      fetchAllDistinctValues('formation_demandee'),
      fetchAllDistinctValues('zone_localite'),
      fetchAllDistinctValues('departement'),
    ])
    const normalizedSources = [...new Set(
      sources
        .map((v) => normalizeOrigineValue(v))
        .filter((v): v is string => !!v)
    )]
    return {
      leadStatuses: canonicalizeLeadStatuses(leadStatuses).slice().sort(),
      sources: normalizedSources.slice().sort(),
      formations: formations.slice().sort(),
      zones: zones.slice().sort(),
      departements: departements.slice().sort(),
    }
  })
  const formEvents = await fetchDistinctFormEvents()
  const payload = {
    ...staticPayload,
    formEvents: formEvents.slice().sort(),
  }

  return NextResponse.json(payload, {
    // Hyper-important métier: les nouveaux formulaires (CRM + Meta) doivent
    // apparaître immédiatement dans "Soumission de formulaire".
    headers: { 'Cache-Control': 'no-store' },
  })
}
