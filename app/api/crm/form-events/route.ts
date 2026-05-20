import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/form-events
 *
 * Endpoint dedie aux noms de formulaires distincts (recent_conversion_event).
 * Utilise la fonction Postgres crm_property_value_counts qui fait un DISTINCT
 * cote SQL — plus rapide et fiable que la pagination JS.
 */
export async function GET() {
  const db = createServiceClient()

  const { data, error } = await db.rpc('crm_property_value_counts', {
    p_table: 'crm_contacts',
    p_column: 'recent_conversion_event',
    p_limit: 5000,
  }).range(0, 4999) // force max_rows > 1000

  if (error) {
    console.error('form-events RPC:', error.message)
    return NextResponse.json({ events: [], error: error.message }, { status: 500 })
  }

  const events = ((data ?? []) as Array<{ value: string | null }>)
    .map(r => r.value)
    .filter((v): v is string => !!v)
    .sort()

  return NextResponse.json(
    { events },
    { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600' } },
  )
}
