import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import type { AppActivitySession } from '@/lib/app-activity'

/**
 * GET /api/crm/contacts/[id]/app-activity
 *
 * Activité du contact dans les applications (Diplomalab…), envoyée par
 * /api/external/app-activity. Regroupée par session (session_id fourni par
 * l'app, sinon par app et par jour) pour l'activité centrale de la fiche.
 */

const WEB_TRACKER_EVENTS = ['page_view', 'page_leave', 'form_submit', 'link_click', 'button_click', 'element_click']

type Row = {
  event_name: string
  occurred_at: string
  session_id: string | null
  site: string | null
  page_title: string | null
  seconds_on_page: number | null
  metadata: Record<string, unknown> | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getApiUserContext())) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createServiceClient()
  const { id: contactId } = await params

  const { data: links, error: linkErr } = await db
    .from('web_visitor_contacts')
    .select('visitor_id')
    .eq('hubspot_contact_id', contactId)
    .like('source', 'app:%')
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })
  const visitorIds = (links ?? []).map(l => l.visitor_id as string)
  if (!visitorIds.length) return NextResponse.json({ sessions: [] })

  const { data, error } = await db
    .from('web_events')
    .select('event_name, occurred_at, session_id, site, page_title, seconds_on_page, metadata')
    .in('visitor_id', visitorIds)
    .not('event_name', 'in', `(${WEB_TRACKER_EVENTS.join(',')})`)
    .order('occurred_at', { ascending: true })
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sessions = new Map<string, AppActivitySession>()
  for (const r of (data ?? []) as Row[]) {
    const app = r.site || 'app'
    const day = r.occurred_at.slice(0, 10)
    const key = `${app}:${r.session_id ?? day}`
    let s = sessions.get(key)
    if (!s) {
      s = { key, app, started_at: r.occurred_at, ended_at: r.occurred_at, events: [] }
      sessions.set(key, s)
    }
    s.events.push({ at: r.occurred_at, event: r.event_name, title: r.page_title, seconds: r.seconds_on_page, details: r.metadata ?? {} })
    if (r.occurred_at > s.ended_at) s.ended_at = r.occurred_at
  }

  return NextResponse.json({ sessions: [...sessions.values()].reverse() })
}
