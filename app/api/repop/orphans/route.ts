/**
 * GET /api/repop/orphans
 *
 * Retourne les contacts HubSpot qui :
 *  1. N'ont aucun deal associé (num_associated_deals = 0)
 *  2. Ont soumis au moins 2 formulaires (first_conversion_date ≠ recent_conversion_date)
 *
 * Ce sont des prospects "orphelins" qui reviennent mais n'ont jamais eu de RDV.
 */

import { NextResponse } from 'next/server'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const BASE_URL = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

async function hubspotFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot ${res.status}: ${err}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export type OrphanRepopEntry = {
  contact_id: string
  prospect_name: string
  prospect_phone: string | null
  prospect_email: string
  classe: string | null
  formation: string | null
  zone_localite: string | null
  departement: string | null
  first_form_date: string
  first_form_date_label: string
  first_form_name: string | null
  repop_form_date: string
  repop_form_date_label: string
  repop_form_name: string | null
}

const PROPS = [
  'email', 'firstname', 'lastname', 'phone',
  'classe_actuelle', 'diploma_sante___formation_demandee', 'zone___localite', 'departement',
  'recent_conversion_date', 'recent_conversion_event_name',
  'first_conversion_date', 'first_conversion_event_name',
  'createdate',
]

const HS_FORMATION_MAP: Record<string, string> = {
  'PAS': 'PASS', 'LAS': 'LAS', 'P-1': 'P-1', 'P-2': 'P-2',
  'APES0': 'APES0', 'LAS 2 UPEC': 'LAS 2 UPEC', 'LAS 3 UPEC': 'LAS 3 UPEC',
}

export async function GET() {
  // 1. Search contacts with no deals and at least one form submission
  // Only look at repops from the last 30 days to keep the list manageable
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allContacts: any[] = []
  let after: string | undefined = undefined
  const MAX_PAGES = 5 // Max 500 contacts

  try {
    let page = 0
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        filterGroups: [{
          filters: [
            // num_associated_deals is null (not "0") when contact has no deals
            { propertyName: 'num_associated_deals', operator: 'NOT_HAS_PROPERTY' },
            { propertyName: 'recent_conversion_date', operator: 'GTE', value: thirtyDaysAgo },
            { propertyName: 'first_conversion_date', operator: 'HAS_PROPERTY' },
          ],
        }],
        properties: PROPS,
        sorts: [{ propertyName: 'recent_conversion_date', direction: 'DESCENDING' }],
        limit: 100,
      }
      if (after) body.after = after

      const data = await hubspotFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      allContacts.push(...(data?.results ?? []))
      after = data?.paging?.next?.after ?? undefined
      page++
    } while (after && page < MAX_PAGES)
  } catch (e) {
    console.error('Orphan repop search error:', e)
  }

  // 2. Filter: keep only contacts where first and recent conversion are >= 7 days apart
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  const orphans = allContacts.filter(c => {
    const first = c.properties.first_conversion_date
    const recent = c.properties.recent_conversion_date
    if (!first || !recent) return false
    const firstMs = new Date(first).getTime()
    const recentMs = new Date(recent).getTime()
    if (isNaN(firstMs) || isNaN(recentMs)) return false
    // At least 7 days between 1st and 2nd form submission
    return (recentMs - firstMs) >= SEVEN_DAYS_MS
  })

  // 3. Build result
  const result: OrphanRepopEntry[] = orphans.map(c => {
    const p = c.properties
    const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || 'Inconnu'
    const rawFormation = p.diploma_sante___formation_demandee
    const formation = rawFormation ? (HS_FORMATION_MAP[rawFormation] ?? rawFormation) : null

    const firstDate = new Date(p.first_conversion_date)
    const repopDate = new Date(p.recent_conversion_date)

    return {
      contact_id: c.id,
      prospect_name: name,
      prospect_phone: p.phone ?? null,
      prospect_email: p.email ?? '',
      classe: p.classe_actuelle ?? null,
      formation,
      zone_localite: p.zone___localite ?? null,
      departement: p.departement ?? null,
      first_form_date: firstDate.toISOString(),
      first_form_date_label: format(firstDate, "d MMM yyyy", { locale: fr }),
      first_form_name: p.first_conversion_event_name ?? null,
      repop_form_date: repopDate.toISOString(),
      repop_form_date_label: format(repopDate, "d MMM yyyy 'à' HH'h'mm", { locale: fr }),
      repop_form_name: p.recent_conversion_event_name ?? null,
    }
  })

  // Sort by repop date descending
  result.sort((a, b) => b.repop_form_date.localeCompare(a.repop_form_date))

  return NextResponse.json(result)
}
