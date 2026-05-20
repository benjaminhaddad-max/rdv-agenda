import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/form-events
 *
 * Renvoie TOUS les noms distincts de formulaires (recent_conversion_event).
 * Utilise la fonction Postgres crm_distinct_form_events qui renvoie un JSON
 * array unique → bypass la limite max_rows=1000 de PostgREST.
 */
export async function GET() {
  const db = createServiceClient()

  const { data, error } = await db.rpc('crm_distinct_form_events')

  if (error) {
    console.error('form-events RPC:', error.message)
    return NextResponse.json({ events: [], error: error.message }, { status: 500 })
  }

  const events = Array.isArray(data) ? (data as string[]) : []

  return NextResponse.json(
    { events },
    { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600' } },
  )
}
