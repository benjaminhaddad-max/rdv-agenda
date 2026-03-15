import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

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
  const db = createServiceClient()

  // Appel HubSpot + Supabase en parallèle
  const [hsLeadStatuses, hsSources, hsFormations, supabaseStatus, supabaseSource, supabaseFormation] = await Promise.all([
    fetchHubSpotPropertyOptions('hs_lead_status'),
    fetchHubSpotPropertyOptions('hs_analytics_source'),
    fetchHubSpotPropertyOptions('diploma_sante___formation_demandee'),
    db.from('crm_contacts').select('hs_lead_status').not('hs_lead_status', 'is', null).limit(5000),
    db.from('crm_contacts').select('hs_analytics_source').not('hs_analytics_source', 'is', null).limit(5000),
    db.from('crm_contacts').select('formation_demandee').not('formation_demandee', 'is', null).limit(5000),
  ])

  // Valeurs Supabase (fallback)
  const supabaseLeadStatuses = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...new Set((supabaseStatus.data ?? []).map((r: any) => r.hs_lead_status as string).filter(Boolean)),
  ]
  const supabaseSources = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...new Set((supabaseSource.data ?? []).map((r: any) => r.hs_analytics_source as string).filter(Boolean)),
  ]
  const supabaseFormations = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...new Set((supabaseFormation.data ?? []).map((r: any) => r.formation_demandee as string).filter(Boolean)),
  ]

  // Priorité HubSpot ; si vide, fallback Supabase
  const leadStatuses  = (hsLeadStatuses.length > 0  ? hsLeadStatuses  : supabaseLeadStatuses).sort()
  const sources       = (hsSources.length > 0       ? hsSources       : supabaseSources).sort()
  const formations    = (hsFormations.length > 0     ? hsFormations    : supabaseFormations).sort()

  return NextResponse.json({ leadStatuses, sources, formations })
}
