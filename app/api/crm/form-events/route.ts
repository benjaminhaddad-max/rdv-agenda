import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/form-events
 *
 * Renvoie les noms de formulaires distincts pour le filtre
 * "Dernier formulaire soumis". Sources fiables (cleaned) :
 *   1. forms.name           (formulaires creees dans le CRM)
 *   2. meta_lead_forms.name (Meta Lead Ads)
 *
 * Query direct via PostgREST (pas de RPC, pas besoin de DDL).
 */
export async function GET() {
  const db = createServiceClient()
  const all = new Set<string>()

  // 1. Forms créés dans le CRM
  const { data: crmForms } = await db
    .from('forms')
    .select('name')
    .not('name', 'is', null)
    .limit(2000)
  for (const r of (crmForms ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') all.add(n.trim())
  }

  // 2. Forms Meta Lead Ads
  const { data: metaForms } = await db
    .from('meta_lead_forms')
    .select('name')
    .not('name', 'is', null)
    .limit(2000)
  for (const r of (metaForms ?? [])) {
    const n = (r as { name: string | null }).name
    if (n && n.trim() !== '') all.add(n.trim())
  }

  const events = [...all].sort()

  return NextResponse.json(
    { events },
    { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600' } },
  )
}
