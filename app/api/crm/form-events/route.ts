import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/form-events
 *
 * Endpoint dedie aux noms de formulaires distincts (recent_conversion_event)
 * pour le filtre "Dernier formulaire soumis". Pagine 25 pages de 2000 lignes
 * en parallele = ~50k contacts couverts. Index partiel garantit la rapidite.
 */
export async function GET() {
  const db = createServiceClient()
  const allValues = new Set<string>()
  const PAGE = 2000

  const queries = []
  for (let off = 0; off < 25; off++) {
    queries.push(
      db.from('crm_contacts')
        .select('recent_conversion_event')
        .not('recent_conversion_event', 'is', null)
        .range(off * PAGE, (off + 1) * PAGE - 1)
    )
  }
  const results = await Promise.all(queries)
  for (const { data: rows, error } of results) {
    if (error) {
      console.error('form-events:', error.message)
      continue
    }
    if (!rows) continue
    for (const r of rows) {
      const v = (r as { recent_conversion_event: string | null }).recent_conversion_event
      if (v) allValues.add(v)
    }
  }

  return NextResponse.json(
    { events: [...allValues].sort() },
    { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600' } },
  )
}
