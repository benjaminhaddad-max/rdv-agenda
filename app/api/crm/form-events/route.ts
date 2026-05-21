import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/form-events
 *
 * Renvoie les noms de formulaires distincts pour le filtre
 * "Soumission de formulaire". Sources :
 *   1. forms.name           (formulaires creees nativement dans le CRM)
 *   2. meta_lead_forms.name (Meta Lead Ads connectes directement)
 *   3. HubSpot Forms API    (tous les forms HubSpot, incluant Meta Lead Ads
 *                            tracked via l'integration HubSpot↔Meta)
 */

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

async function fetchHubSpotForms(): Promise<string[]> {
  if (!HUBSPOT_TOKEN) return []
  const names = new Set<string>()
  let url: string | null = 'https://api.hubapi.com/marketing/v3/forms?limit=100'
  let pages = 0
  while (url && pages < 50) {
    try {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
      })
      if (!res.ok) break
      const data = await res.json() as {
        results?: Array<{ name?: string }>
        paging?: { next?: { link?: string } }
      }
      for (const f of (data.results ?? [])) {
        if (f.name && f.name.trim()) names.add(f.name.trim())
      }
      url = data.paging?.next?.link ?? null
      pages++
    } catch {
      break
    }
  }
  return [...names]
}

/**
 * Pull les variantes de noms de formulaires depuis crm_contacts.recent_conversion_event
 * Filtre pour garder uniquement ceux qui ressemblent à des formulaires (et pas
 * les pages de site, articles, etc).
 */
async function fetchHubSpotFormVariantsFromContacts(
  db: ReturnType<typeof createServiceClient>,
): Promise<string[]> {
  const out = new Set<string>()
  const PAGE = 2000
  // Pagine 10 batchs en parallele (l'index partiel rend ca rapide)
  const queries = []
  for (let off = 0; off < 10; off++) {
    queries.push(
      db.from('crm_contacts')
        .select('recent_conversion_event')
        .not('recent_conversion_event', 'is', null)
        .range(off * PAGE, (off + 1) * PAGE - 1)
    )
  }
  const results = await Promise.all(queries)
  for (const { data: rows, error } of results) {
    if (error) continue
    for (const r of (rows ?? [])) {
      const v = (r as { recent_conversion_event: string | null }).recent_conversion_event
      if (!v) continue
      const lower = v.toLowerCase()
      // Garde uniquement les entries qui ressemblent à des forms :
      // - prefixées "Facebook Lead Ads:" → Meta Lead Ads importés via HubSpot
      // - contenant "Form:" / "Formulaire" / "Form " → forms HubSpot natifs
      if (
        lower.startsWith('facebook lead ads:') ||
        lower.startsWith('form:') ||
        lower.includes('formulaire ') ||
        lower.startsWith('form ')
      ) {
        out.add(v.trim())
      }
    }
  }
  return [...out]
}

export async function GET() {
  const db = createServiceClient()
  const all = new Set<string>()

  // En parallele : 4 sources
  const [
    crmFormsRes,
    metaFormsRes,
    hubspotNames,
    contactVariants,
  ] = await Promise.all([
    db.from('forms').select('name, hubspot_form_id').not('name', 'is', null).is('hubspot_form_id', null).limit(2000),
    db.from('meta_lead_forms').select('name').not('name', 'is', null).limit(2000),
    fetchHubSpotForms(),
    fetchHubSpotFormVariantsFromContacts(db),
  ])

  // 1. Forms natifs CRM
  for (const r of (crmFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') all.add(n.trim())
  }
  // 2. Forms Meta Lead Ads connectes au CRM
  for (const r of (metaFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') all.add(n.trim())
  }
  // 3. Forms HubSpot Marketing
  for (const n of hubspotNames) all.add(n)
  // 4. Variantes "Facebook Lead Ads:" + "Form:" depuis crm_contacts (capture
  //    les Meta Lead Ads passes via l'integration HubSpot)
  for (const n of contactVariants) all.add(n)

  const events = [...all].sort()

  return NextResponse.json(
    {
      events,
      sources: {
        crm: crmFormsRes.data?.length ?? 0,
        meta: metaFormsRes.data?.length ?? 0,
        hubspot: hubspotNames.length,
        contact_variants: contactVariants.length,
      },
    },
    { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600' } },
  )
}
