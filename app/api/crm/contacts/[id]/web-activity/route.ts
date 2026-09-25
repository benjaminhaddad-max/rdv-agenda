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
  metadata: Record<string, unknown> | null
  user_agent: string | null
}

type PageClick = { at: string; kind: string; text: string | null; href: string | null }

type PageView = {
  at: string
  left_at: string | null
  path: string | null
  url: string | null
  title: string | null
  seconds: number | null
  scroll_pct: number | null
  submitted_form: boolean
  clicks: PageClick[]
}

const CLICK_EVENTS = new Set(['link_click', 'button_click', 'element_click'])
const PAGE_EVENTS = new Set(['page_view', 'page_leave', 'form_submit'])

/** Appareil lisible depuis le user-agent : "Mobile · iOS · Safari". */
function describeDevice(ua: string | null): string | null {
  if (!ua) return null
  const type = /iPad|Tablet/i.test(ua) ? 'Tablette' : /Mobi|iPhone|Android/i.test(ua) ? 'Mobile' : 'Ordinateur'
  const os = /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux'
    : null
  const browser = /Instagram/i.test(ua) ? 'Instagram (navigateur intégré)'
    : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook (navigateur intégré)'
    : /TikTok|musical_ly/i.test(ua) ? 'TikTok (navigateur intégré)'
    : /Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
    : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
    : /Chrome|CriOS/i.test(ua) ? 'Chrome'
    : /Safari/i.test(ua) ? 'Safari'
    : null
  return [type, os, browser].filter(Boolean).join(' · ')
}

function metaString(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
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
    .select('event_name, occurred_at, session_id, pageview_id, page_url, page_path, page_title, referrer, utm_source, utm_medium, utm_campaign, click_ids, seconds_on_page, metadata, user_agent')
    .in('visitor_id', visitorIds)
    .in('event_name', [...PAGE_EVENTS, ...CLICK_EVENTS])
    .order('occurred_at', { ascending: true })
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = (data ?? []) as WebEvent[]

  // Par page vue : temps (max des page_leave), sortie, scroll max, clics, formulaire
  const secondsByPageview = new Map<string, number>()
  const leftAtByPageview = new Map<string, string>()
  const scrollByPageview = new Map<string, number>()
  const clicksByPageview = new Map<string, PageClick[]>()
  const formPageviews = new Set<string>()
  for (const e of events) {
    if (!e.pageview_id) continue
    const pv = e.pageview_id
    if (e.event_name === 'page_leave') {
      if (e.seconds_on_page !== null) secondsByPageview.set(pv, Math.max(secondsByPageview.get(pv) ?? 0, e.seconds_on_page))
      leftAtByPageview.set(pv, e.occurred_at)
      const scroll = Number(e.metadata?.scroll_pct)
      if (Number.isFinite(scroll)) scrollByPageview.set(pv, Math.max(scrollByPageview.get(pv) ?? 0, scroll))
    }
    if (e.event_name === 'form_submit') formPageviews.add(pv)
    if (CLICK_EVENTS.has(e.event_name)) {
      const text = metaString(e.metadata, 'text')
      const href = metaString(e.metadata, 'href')
      if (!text && !href) continue
      const list = clicksByPageview.get(pv) ?? []
      list.push({ at: e.occurred_at, kind: e.event_name === 'link_click' ? 'lien' : 'bouton', text: text?.slice(0, 120) ?? null, href })
      clicksByPageview.set(pv, list)
    }
  }

  const views = events.filter(e => e.event_name === 'page_view')
  const visitsBySession = new Map<string, { session_id: string; started_at: string; ended_at: string; device: string | null; referrer: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; click_ids: Record<string, string> | null; pages: PageView[] }>()
  for (const v of views) {
    const key = v.session_id ?? v.pageview_id ?? v.occurred_at
    let visit = visitsBySession.get(key)
    if (!visit) {
      visit = {
        session_id: key,
        started_at: v.occurred_at,
        ended_at: v.occurred_at,
        device: describeDevice(v.user_agent),
        referrer: v.referrer,
        utm_source: v.utm_source,
        utm_medium: v.utm_medium,
        utm_campaign: v.utm_campaign,
        click_ids: v.click_ids,
        pages: [],
      }
      visitsBySession.set(key, visit)
    }
    const pv = v.pageview_id
    const leftAt = pv ? leftAtByPageview.get(pv) ?? null : null
    visit.pages.push({
      at: v.occurred_at,
      left_at: leftAt,
      path: v.page_path,
      url: v.page_url,
      title: v.page_title,
      seconds: pv ? secondsByPageview.get(pv) ?? null : null,
      scroll_pct: pv ? scrollByPageview.get(pv) ?? null : null,
      submitted_form: pv ? formPageviews.has(pv) : false,
      clicks: pv ? clicksByPageview.get(pv) ?? [] : [],
    })
    const end = leftAt && leftAt > v.occurred_at ? leftAt : v.occurred_at
    if (end > visit.ended_at) visit.ended_at = end
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
      device: first.device,
    },
    totals: {
      visits: visits.length,
      page_views: views.length,
      seconds: visits.reduce((acc, v) => acc + v.total_seconds, 0),
      last_seen: views[views.length - 1]?.occurred_at ?? null,
    },
  })
}
