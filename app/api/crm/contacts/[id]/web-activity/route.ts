import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'

/**
 * GET /api/crm/contacts/[id]/web-activity
 *
 * Parcours web du contact (diploma-tracker.js) : pages vues avec temps passé,
 * regroupées par visite, + source de la 1re visite. Équivalent de l'historique
 * de navigation HubSpot.
 */

type WebEvent = {
  event_name: string
  occurred_at: string
  session_id: string | null
  pageview_id: string | null
  page_url: string | null
  page_path: string | null
  page_title: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  click_ids: Record<string, string> | null
  seconds_on_page: number | null
}

type PageView = {
  at: string
  path: string | null
  url: string | null
  title: string | null
  seconds: number | null
  submitted_form: boolean
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getApiUserContext())) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createServiceClient()
  const { id: contactId } = await params

  const { data: links, error: linkErr } = await db
    .from('web_visitor_contacts')
    .select('visitor_id')
    .eq('hubspot_contact_id', contactId)
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })
  const visitorIds = (links ?? []).map(l => l.visitor_id as string)
  if (!visitorIds.length) return NextResponse.json({ visits: [], first_touch: null, totals: null })

  const { data, error } = await db
    .from('web_events')
    .select('event_name, occurred_at, session_id, pageview_id, page_url, page_path, page_title, referrer, utm_source, utm_medium, utm_campaign, click_ids, seconds_on_page')
    .in('visitor_id', visitorIds)
    .in('event_name', ['page_view', 'page_leave', 'form_submit'])
    .order('occurred_at', { ascending: true })
    .limit(3000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = (data ?? []) as WebEvent[]

  // Temps passé : max des page_leave de chaque page vue
  const secondsByPageview = new Map<string, number>()
  const formPageviews = new Set<string>()
  for (const e of events) {
    if (!e.pageview_id) continue
    if (e.event_name === 'page_leave' && e.seconds_on_page !== null) {
      secondsByPageview.set(e.pageview_id, Math.max(secondsByPageview.get(e.pageview_id) ?? 0, e.seconds_on_page))
    }
    if (e.event_name === 'form_submit') formPageviews.add(e.pageview_id)
  }

  const views = events.filter(e => e.event_name === 'page_view')
  const visitsBySession = new Map<string, { session_id: string; started_at: string; referrer: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; click_ids: Record<string, string> | null; pages: PageView[] }>()
  for (const v of views) {
    const key = v.session_id ?? v.pageview_id ?? v.occurred_at
    let visit = visitsBySession.get(key)
    if (!visit) {
      visit = {
        session_id: key,
        started_at: v.occurred_at,
        referrer: v.referrer,
        utm_source: v.utm_source,
        utm_medium: v.utm_medium,
        utm_campaign: v.utm_campaign,
        click_ids: v.click_ids,
        pages: [],
      }
      visitsBySession.set(key, visit)
    }
    visit.pages.push({
      at: v.occurred_at,
      path: v.page_path,
      url: v.page_url,
      title: v.page_title,
      seconds: v.pageview_id ? secondsByPageview.get(v.pageview_id) ?? null : null,
      submitted_form: v.pageview_id ? formPageviews.has(v.pageview_id) : false,
    })
  }

  const visits = [...visitsBySession.values()].map(v => ({
    ...v,
    total_seconds: v.pages.reduce((acc, p) => acc + (p.seconds ?? 0), 0),
  }))
  const first = visits[0] ?? null

  return NextResponse.json({
    visits: visits.reverse(),
    first_touch: first && {
      at: first.started_at,
      referrer: first.referrer,
      utm_source: first.utm_source,
      utm_medium: first.utm_medium,
      utm_campaign: first.utm_campaign,
      click_ids: first.click_ids,
      landing_path: first.pages[0]?.path ?? null,
    },
    totals: {
      visits: visits.length,
      page_views: views.length,
      seconds: visits.reduce((acc, v) => acc + v.total_seconds, 0),
      last_seen: views[views.length - 1]?.occurred_at ?? null,
    },
  })
}
