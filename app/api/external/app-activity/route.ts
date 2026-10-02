import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

/**
 * POST /api/external/app-activity — code de suivi des applications (Diplomalab…).
 *
 * Chaque app a sa propre clé : c'est la clé qui dit de quelle app vient
 * l'événement (Diplomalab, Medibox Lab…).
 *
 * Appelé par le BACKEND de l'application (la clé ne doit jamais être dans le
 * navigateur) à chaque action d'un inscrit : connexion, exercice commencé /
 * terminé, cours consulté… Les événements remontent dans l'activité centrale
 * de la fiche contact, regroupés par session.
 *
 * Auth : Authorization: Bearer <DIPLOMALAB_TRACKING_KEY | MEDIBOXLAB_TRACKING_KEY> (ou X-API-Key).
 *
 * Body : un événement, ou { events: [...] } (100 max). Un événement :
 *   {
 *     email | phone | contact_id,      // identifie le contact CRM (au moins un)
 *     event: "exercise_completed",     // nom de l'action
 *     label?: "Texte libre affiché",   // remplace le libellé par défaut
 *     occurred_at?: ISO 8601,          // défaut : maintenant
 *     event_id?: string,               // anti-doublon (renvoi = ignoré)
 *     session_id?: string,             // regroupe les actions d'une session
 *     user_id?: string,                // id de l'utilisateur dans l'app
 *     exercise?: { id?, name?, subject?, chapter? },
 *     score?: number, max_score?: number, success?: boolean,
 *     duration_seconds?: number,
 *     details?: { ...valeurs simples }
 *   }
 *
 * Stockage : web_events (site = nom de l'app), rattaché au contact via
 * web_visitor_contacts — même mécanique que le Parcours web.
 */

const APPS: Record<string, string | undefined> = {
  diplomalab: process.env.DIPLOMALAB_TRACKING_KEY,
  mediboxlab: process.env.MEDIBOXLAB_TRACKING_KEY,
}

const MAX_EVENTS = 100
const EVENT_RE = /^[a-z0-9_:.-]{1,64}$/i
const SESSION_RE = /^[A-Za-z0-9_.:-]{1,64}$/

type Json = Record<string, unknown>

function str(v: unknown, max = 300): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function authenticatedApp(req: NextRequest): string | null {
  const provided =
    req.headers.get('x-api-key')?.trim() ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!provided) return null
  for (const [app, key] of Object.entries(APPS)) {
    if (key?.trim() && timingSafeEqual(provided, key.trim())) return app
  }
  return null
}

/** Valeurs simples uniquement (texte court, nombre, booléen), 30 clés max. */
function scalars(obj: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj as Json).slice(0, 30)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 40)] = v
    else if (typeof v === 'boolean') out[k.slice(0, 40)] = v
    else if (typeof v === 'string' && v.trim()) out[k.slice(0, 40)] = v.trim().slice(0, 300)
  }
  return out
}

function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/[^\d+]/g, '')
  const out = new Set([phone.trim(), digits])
  if (digits.startsWith('+33')) out.add('0' + digits.slice(3))
  else if (digits.startsWith('0') && digits.length === 10) out.add('+33' + digits.slice(1))
  return [...out].filter(Boolean)
}

type Db = ReturnType<typeof createServiceClient>

async function resolveContactId(db: Db, e: Json, cache: Map<string, string | null>): Promise<string | null> {
  const contactId = str(e.contact_id ?? e.hubspot_contact_id, 64)
  const email = str(e.email, 254)?.toLowerCase() ?? null
  const phone = str(e.phone, 40)
  const key = contactId ? `id:${contactId}` : email ? `email:${email}` : phone ? `phone:${phone}` : null
  if (!key) return null
  if (cache.has(key)) return cache.get(key) ?? null

  let found: string | null = null
  if (contactId) {
    const { data } = await db.from('crm_contacts').select('hubspot_contact_id').eq('hubspot_contact_id', contactId).maybeSingle()
    found = (data?.hubspot_contact_id as string | undefined) ?? null
  }
  if (!found && email) {
    const { data } = await db.from('crm_contacts').select('hubspot_contact_id').eq('email', email).limit(1)
    found = (data?.[0]?.hubspot_contact_id as string | undefined) ?? null
  }
  if (!found && phone) {
    const { data } = await db.from('crm_contacts').select('hubspot_contact_id').in('phone', phoneVariants(phone)).limit(1)
    found = (data?.[0]?.hubspot_contact_id as string | undefined) ?? null
  }
  cache.set(key, found)
  return found
}

export async function POST(req: NextRequest) {
  const app = authenticatedApp(req)
  if (!app) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Json | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const events = (Array.isArray(body.events) ? body.events : [body]) as Json[]
  if (events.length === 0) return NextResponse.json({ error: 'No events' }, { status: 400 })
  if (events.length > MAX_EVENTS) return NextResponse.json({ error: `Max ${MAX_EVENTS} events per request` }, { status: 400 })

  const db = createServiceClient()
  const contactCache = new Map<string, string | null>()
  const results: Array<{ index: number; status: 'ok' | 'invalid' | 'contact_not_found'; error?: string }> = []
  const rows: Json[] = []
  const links = new Map<string, string>()

  for (const [index, e] of events.entries()) {
    if (!e || typeof e !== 'object') { results.push({ index, status: 'invalid', error: 'event must be an object' }); continue }
    const eventName = str(e.event ?? e.event_name, 64)
    if (!eventName || !EVENT_RE.test(eventName)) { results.push({ index, status: 'invalid', error: 'missing or invalid "event"' }); continue }
    if (!e.email && !e.phone && !e.contact_id && !e.hubspot_contact_id) {
      results.push({ index, status: 'invalid', error: 'email, phone or contact_id required' }); continue
    }

    const contactId = await resolveContactId(db, e, contactCache)
    if (!contactId) { results.push({ index, status: 'contact_not_found' }); continue }

    const occurredMs = Date.parse(String(e.occurred_at ?? ''))
    // Horloge app acceptée si plausible (passé ≤ 1 an, futur ≤ 1 h)
    const occurred = Number.isFinite(occurredMs) && occurredMs < Date.now() + 3_600_000 && occurredMs > Date.now() - 365 * 86_400_000
      ? new Date(occurredMs).toISOString()
      : new Date().toISOString()

    const exercise = (e.exercise && typeof e.exercise === 'object') ? e.exercise as Json : {}
    const duration = num(e.duration_seconds)
    const sessionId = str(e.session_id, 64)
    const metadata: Json = {
      ...scalars(e.details),
      label: str(e.label),
      app_user_id: str(e.user_id, 100),
      exercise_id: str(exercise.id, 100),
      exercise_name: str(exercise.name),
      subject: str(exercise.subject),
      chapter: str(exercise.chapter),
      score: num(e.score),
      max_score: num(e.max_score),
      success: typeof e.success === 'boolean' ? e.success : null,
    }
    for (const k of Object.keys(metadata)) if (metadata[k] === null) delete metadata[k]

    const visitorId = `app-${app}-${contactId}`
    links.set(visitorId, contactId)
    rows.push({
      event_id: str(e.event_id, 64) ? `${app}:${str(e.event_id, 64)}` : null,
      visitor_id: visitorId,
      session_id: sessionId && SESSION_RE.test(sessionId) ? sessionId : null,
      event_name: eventName,
      occurred_at: occurred,
      site: app,
      page_title: str(exercise.name) ?? str(e.label),
      seconds_on_page: duration !== null && duration >= 0 ? Math.min(Math.round(duration), 86_400) : null,
      metadata,
      user_agent: str(req.headers.get('user-agent'), 400),
    })
    results.push({ index, status: 'ok' })
  }

  if (links.size) {
    const { error } = await db.from('web_visitor_contacts').upsert(
      [...links].map(([visitor_id, hubspot_contact_id]) => ({ visitor_id, hubspot_contact_id, source: `app:${app}` })),
      { onConflict: 'visitor_id,hubspot_contact_id', ignoreDuplicates: true },
    )
    if (error) logger.error('app-activity-link', error, { app })
  }

  if (rows.length) {
    // Avec event_id : upsert idempotent. Sans : insert simple.
    const withId = rows.filter(r => r.event_id)
    const withoutId = rows.filter(r => !r.event_id)
    const [a, b] = await Promise.all([
      withId.length ? db.from('web_events').upsert(withId, { onConflict: 'event_id', ignoreDuplicates: true }) : null,
      withoutId.length ? db.from('web_events').insert(withoutId) : null,
    ])
    const error = a?.error ?? b?.error
    if (error) {
      logger.error('app-activity-insert', error, { app, count: rows.length })
      return NextResponse.json({ error: 'Storage error' }, { status: 500 })
    }
  }

  return NextResponse.json({
    accepted: results.filter(r => r.status === 'ok').length,
    rejected: results.filter(r => r.status !== 'ok').length,
    results,
  })
}
