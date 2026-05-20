import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

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

/**
 * Fetch hardcode pour recent_conversion_event. Retourne aussi des infos de
 * debug pour comprendre pourquoi la liste est vide en prod.
 */
async function fetchDistinctFormEvents(): Promise<{ values: string[]; debug: Record<string, unknown> }> {
  const db = createServiceClient()
  const allValues = new Set<string>()
  const debug: Record<string, unknown> = { pages: [], errors: [] }
  const PAGE = 1000
  for (let off = 0; off < 10; off++) {
    const { data: rows, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, recent_conversion_event')
      .not('recent_conversion_event', 'is', null)
      .order('hubspot_contact_id', { ascending: false })
      .range(off * PAGE, (off + 1) * PAGE - 1)
    if (error) {
      ;(debug.errors as unknown[]).push({ page: off, message: error.message, code: error.code })
      break
    }
    const rowCount = rows?.length ?? 0
    ;(debug.pages as unknown[]).push({ page: off, rows: rowCount })
    if (!rows || rows.length === 0) break
    for (const r of rows) {
      const v = (r as { recent_conversion_event: string | null }).recent_conversion_event
      if (v) allValues.add(v)
    }
    if (rows.length < PAGE) break
  }
  debug.distinctCount = allValues.size
  return { values: [...allValues], debug }
}

/**
 * Récupère les options d'une propriété HubSpot via l'API Properties v3.
 * Retourne un tableau de strings (valeur interne) ou [] si échec.
 */
async function fetchHubSpotPropertyOptions(propertyName: string): Promise<string[]> {
  if (!HUBSPOT_TOKEN) return []
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/properties/contacts/${propertyName}`,
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.options ?? []).map((o: any) => o.value as string).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * GET /api/crm/field-options
 * 1. Essaie d'abord de récupérer les options depuis l'API HubSpot Properties
 *    (source de vérité — toutes les options, même non encore synchro)
 * 2. Si HubSpot ne répond pas, fallback sur les valeurs distinctes dans Supabase
 */
export async function GET() {
  // Appel HubSpot + Supabase en parallèle (Supabase = fallback paginé)
  // formEvents = nom du dernier formulaire soumis (`recent_conversion_event`).
  // Pas d'API HubSpot Properties (champ libre), donc seul Supabase fait foi.
  const [hsLeadStatuses, hsSources, hsFormations, hsZones, hsDepts, sbLeadStatuses, sbSources, sbFormations, sbZones, sbDepts, sbFormEvents] = await Promise.all([
    fetchHubSpotPropertyOptions('hs_lead_status'),
    fetchHubSpotPropertyOptions('origine'),
    fetchHubSpotPropertyOptions('diploma_sante___formation_demandee'),
    fetchHubSpotPropertyOptions('zone___localite'),
    fetchHubSpotPropertyOptions('departement'),
    fetchAllDistinctValues('hs_lead_status'),
    fetchAllDistinctValues('origine'),
    fetchAllDistinctValues('formation_demandee'),
    fetchAllDistinctValues('zone_localite'),
    fetchAllDistinctValues('departement'),
    fetchDistinctFormEvents(),
  ])

  // Priorité HubSpot ; si vide, fallback Supabase
  const leadStatuses  = (hsLeadStatuses.length > 0  ? hsLeadStatuses  : sbLeadStatuses).sort()
  const sources       = (hsSources.length > 0       ? hsSources       : sbSources).sort()
  const formations    = (hsFormations.length > 0     ? hsFormations    : sbFormations).sort()
  const zones         = (hsZones.length > 0          ? hsZones         : sbZones).sort()
  const departements  = (hsDepts.length > 0          ? hsDepts         : sbDepts).sort()
  const formEvents      = sbFormEvents.values.slice().sort()
  const formEventsDebug = sbFormEvents.debug

  // Cache : ces options changent très rarement → 1h CDN + 24h stale-while-revalidate.
  // 1er chargement = lent (HubSpot), tous les suivants = instantanés.
  return NextResponse.json(
    { leadStatuses, sources, formations, zones, departements, formEvents, formEventsDebug },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
