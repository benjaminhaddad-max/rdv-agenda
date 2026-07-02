import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/form-events
 *
 * Renvoie les noms autorisés pour le filtre "Soumission de formulaire" :
 *   1. forms.name                        (formulaires créés dans le CRM)
 *   2. meta_lead_forms.name              (formulaires Meta Lead Ads)
 *   3. crm_contacts.recent_conversion_event (soumissions HubSpot réelles)
 */

async function fetchDistinctContactFormEvents(): Promise<string[]> {
  const db = createServiceClient()
  const out = new Set<string>()
  const PAGE_SIZE = 1000
  let offset = 0
  while (true) {
    const { data: rows } = await db
      .from('crm_contacts')
      .select('recent_conversion_event')
      .not('recent_conversion_event', 'is', null)
      .order('recent_conversion_event', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (!rows || rows.length === 0) break
    for (const r of rows as Array<{ recent_conversion_event: string | null }>) {
      const v = r.recent_conversion_event
      if (v && v.trim() !== '') out.add(v.trim())
    }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    if (offset > 500000) break
  }
  return [...out]
}

export async function GET() {
  const db = createServiceClient()
  const all = new Set<string>()

  const [
    crmFormsRes,
    metaFormsRes,
    contactEvents,
  ] = await Promise.all([
    db.from('forms').select('name').not('name', 'is', null).limit(5000),
    db.from('meta_lead_forms').select('name').not('name', 'is', null).limit(5000),
    fetchDistinctContactFormEvents(),
  ])

  for (const r of (crmFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') all.add(n.trim())
  }
  for (const r of (metaFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') all.add(n.trim())
  }
  for (const n of contactEvents) {
    if (n && n.trim() !== '') all.add(n.trim())
  }

  const payload = {
    events: [...all].sort(),
    sources: {
      crm: crmFormsRes.data?.length ?? 0,
      meta: metaFormsRes.data?.length ?? 0,
    },
  }

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
