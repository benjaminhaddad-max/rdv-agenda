import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { dedupeKeyFor, sanitizeCompetitorEvent } from '@/lib/competitor-events'

/**
 * GET /api/crm/competitor-events?include_hidden=1
 * Événements des prépas concurrentes (veille) + infos du dernier passage du bot.
 *
 * POST /api/crm/competitor-events — ajout manuel (admin / manager).
 */
export async function GET(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response

  const includeHidden = req.nextUrl.searchParams.get('include_hidden') === '1'
  const db = createServiceClient()
  // Un an d'historique suffit pour l'agenda.
  const since = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10)
  let q = db
    .from('competitor_events')
    .select('*')
    .gte('start_date', since)
    .order('start_date', { ascending: true })
  if (!includeHidden) q = q.eq('hidden', false)

  const [{ data, error }, { data: lastScan }] = await Promise.all([
    q,
    db
      .from('competitor_events_scans')
      .select('started_at, finished_at, found, inserted, updated, errors')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events: data || [], last_scan: lastScan || null })
}

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response

  const body = await req.json().catch(() => ({}))
  const ev = sanitizeCompetitorEvent(body)
  if (!ev) {
    return NextResponse.json({ error: 'Concurrent, nom et date obligatoires' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('competitor_events')
    .upsert(
      {
        ...ev,
        dedupe_key: dedupeKeyFor(ev.competitor, ev.start_date, ev.event_type),
        found_by: 'manual',
        hidden: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'dedupe_key' },
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data }, { status: 201 })
}
