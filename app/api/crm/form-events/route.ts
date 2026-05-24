import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/form-events
 *
 * Renvoie STRICTEMENT les noms autorisés pour le filtre
 * "Soumission de formulaire" :
 *   1. forms.name           (formulaires créés dans le CRM)
 *   2. meta_lead_forms.name (formulaires Meta Lead Ads)
 */

export async function GET() {
  const db = createServiceClient()
  const all = new Set<string>()

  const [
    crmFormsRes,
    metaFormsRes,
  ] = await Promise.all([
    db.from('forms').select('name').not('name', 'is', null).limit(5000),
    db.from('meta_lead_forms').select('name').not('name', 'is', null).limit(5000),
  ])

  for (const r of (crmFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') all.add(n.trim())
  }
  for (const r of (metaFormsRes.data ?? [])) {
    const n = (r as { name: string | null }).name
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
