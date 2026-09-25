import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { AD_CLICK_ID_KEYS } from '@/lib/ad-attribution'
import { isAllowedFormOriginHeader, isBlockedAutomatedTestUserAgent, isBlockedBotUserAgent } from '@/lib/form-submit-guard'

/**
 * POST /api/web/track — reçoit les événements de public/diploma-tracker.js
 * (page_view, page_leave, clics, form_submit) depuis les sites autorisés.
 *
 * Le tracker envoie en text/plain (sendBeacon) pour éviter le preflight CORS.
 * Réponse toujours 204 : le tracker ne lit pas la réponse et un site ne doit
 * jamais être impacté par une erreur de tracking.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Tracking-Token',
}

const MAX_BODY_BYTES = 16_000
const ID_RE = /^[A-Za-z0-9_.-]{6,64}$/
const EVENT_RE = /^[a-z0-9_:.-]{1,64}$/i

function str(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

function id(v: unknown): string | null {
  const s = str(v, 64)
  return s && ID_RE.test(s) ? s : null
}

function pathOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname.slice(0, 500)
  } catch {
    return null
  }
}

/** Garde uniquement les valeurs scalaires courtes (texte du lien, href, ids de form…). */
function cleanMetadata(meta: Record<string, unknown> | null): Record<string, string | number | boolean> | null {
  if (!meta) return null
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(meta).slice(0, 20)) {
    if (k === 'seconds_on_page') continue
    if (typeof v === 'number' || typeof v === 'boolean') out[k.slice(0, 40)] = v
    else if (typeof v === 'string' && v.trim()) out[k.slice(0, 40)] = v.trim().slice(0, 300)
  }
  return Object.keys(out).length ? out : null
}

function noContent() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return noContent()
}

export async function POST(req: Request) {
  const userAgent = req.headers.get('user-agent')
  if (isBlockedBotUserAgent(userAgent) || isBlockedAutomatedTestUserAgent(userAgent)) return noContent()
  if (!isAllowedFormOriginHeader(req.headers.get('origin')) && !isAllowedFormOriginHeader(req.headers.get('referer'))) {
    return noContent()
  }

  const text = await req.text().catch(() => '')
  if (!text || text.length > MAX_BODY_BYTES) return noContent()

  let body: Record<string, unknown>
  try {
    body = JSON.parse(text)
  } catch {
    return noContent()
  }

  const visitorId = id(body.visitor_id)
  const eventName = str(body.event_name, 64)
  if (!visitorId || !eventName || !EVENT_RE.test(eventName)) return noContent()

  const pageUrl = str(body.page_url, 2000)
  const metadata = (body.metadata && typeof body.metadata === 'object') ? body.metadata as Record<string, unknown> : null
  const seconds = Number(metadata?.seconds_on_page)

  const rawIds = (body.attribution && typeof body.attribution === 'object') ? body.attribution as Record<string, unknown> : {}
  const clickIds: Record<string, string> = {}
  for (const k of AD_CLICK_ID_KEYS) {
    const v = str(rawIds[k])
    if (v) clickIds[k] = v
  }

  const occurredAt = Date.parse(String(body.occurred_at ?? ''))
  // Horloge client : acceptée si plausible (± 1 jour), sinon heure serveur
  const occurred = Number.isFinite(occurredAt) && Math.abs(occurredAt - Date.now()) < 86_400_000
    ? new Date(occurredAt).toISOString()
    : new Date().toISOString()

  const row = {
    event_id: str(body.event_id, 64),
    visitor_id: visitorId,
    session_id: id(body.session_id),
    pageview_id: id(body.pageview_id),
    event_name: eventName,
    occurred_at: occurred,
    site: str(body.site, 120),
    page_url: pageUrl,
    page_path: pathOf(pageUrl),
    page_title: str(body.page_title, 300),
    referrer: str(body.referrer, 2000),
    utm_source: str(body.utm_source, 200),
    utm_medium: str(body.utm_medium, 200),
    utm_campaign: str(body.utm_campaign, 300),
    utm_term: str(body.utm_term, 300),
    utm_content: str(body.utm_content, 300),
    click_ids: Object.keys(clickIds).length ? clickIds : null,
    seconds_on_page: Number.isFinite(seconds) && seconds >= 0 ? Math.min(Math.round(seconds), 86_400) : null,
    metadata: cleanMetadata(metadata),
    user_agent: str(userAgent, 400),
  }

  try {
    const db = createServiceClient()
    const { error } = await db.from('web_events').upsert(row, { onConflict: 'event_id', ignoreDuplicates: true })
    if (error) logger.error('web-track-insert', error, { event_name: eventName })
  } catch (e) {
    logger.error('web-track', e)
  }

  return noContent()
}
