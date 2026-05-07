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
  const [hsLeadStatuses, hsSources, hsFormations, hsZones, hsDepts, sbLeadStatuses, sbSources, sbFormations, sbZones, sbDepts] = await Promise.all([
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
  ])

  // Priorité HubSpot ; si vide, fallback Supabase
  const leadStatuses  = (hsLeadStatuses.length > 0  ? hsLeadStatuses  : sbLeadStatuses).sort()
  const sources       = (hsSources.length > 0       ? hsSources       : sbSources).sort()
  const formations    = (hsFormations.length > 0     ? hsFormations    : sbFormations).sort()
  const zones         = (hsZones.length > 0          ? hsZones         : sbZones).sort()
  const departements  = (hsDepts.length > 0          ? hsDepts         : sbDepts).sort()

  // Cache : ces options changent très rarement → 1h CDN + 24h stale-while-revalidate.
  // 1er chargement = lent (HubSpot), tous les suivants = instantanés.
  return NextResponse.json(
    { leadStatuses, sources, formations, zones, departements },
    {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    },
  )
}
