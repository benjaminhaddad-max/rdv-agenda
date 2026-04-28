import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/contacts/[id]/details
 *
 * Charge la fiche contact en parallèle (Promise.all) avec un cache
 * mémoire process pour les properties (5min) et owners (60s).
 * Avant : ~8 requêtes en série, ~800ms-1s
 * Après : 1 requête contact + 8 en parallèle, ~150-300ms
 */

// ── Cache mémoire process (survit entre requêtes sur Lambda chaud) ─────────
type CacheEntry<T> = { data: T; expiresAt: number }
const propertiesCache: Record<string, CacheEntry<Array<Record<string, unknown>>>> = {}
let ownersCache: CacheEntry<Array<Record<string, unknown>>> | null = null

const PROP_TTL_MS   = 5 * 60_000  // 5 min
const OWNERS_TTL_MS = 60_000      // 1 min

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCachedProperties(db: any, objectType: 'contacts' | 'deals') {
  const now = Date.now()
  const cached = propertiesCache[objectType]
  if (cached && cached.expiresAt > now) return cached.data

  const fields = objectType === 'contacts'
    ? 'name, label, description, group_name, type, field_type, options, display_order'
    : 'name, label, options'

  let q = db
    .from('crm_properties')
    .select(fields)
    .eq('object_type', objectType)
    .eq('archived', false)
  if (objectType === 'contacts') {
    q = q.order('display_order', { ascending: true, nullsFirst: false })
         .order('label', { ascending: true })
  }
  const { data } = await q

  const result = data ?? []
  propertiesCache[objectType] = { data: result, expiresAt: now + PROP_TTL_MS }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCachedOwners(db: any) {
  const now = Date.now()
  if (ownersCache && ownersCache.expiresAt > now) return ownersCache.data

  const { data } = await db
    .from('crm_owners')
    .select('hubspot_owner_id, email, firstname, lastname, archived')
    .eq('archived', false)
    .order('firstname', { ascending: true })

  const result = data ?? []
  ownersCache = { data: result, expiresAt: now + OWNERS_TTL_MS }
  return result
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = createServiceClient()
  const { id: contactId } = await params

  // 1. Contact (séquentiel — il faut savoir s'il existe + récupérer l'email)
  const { data: contact, error: contactErr } = await db
    .from('crm_contacts')
    .select('*')
    .eq('hubspot_contact_id', contactId)
    .maybeSingle()

  if (contactErr || !contact) {
    return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })
  }

  // 2. Toutes les autres requêtes en PARALLÈLE
  const [
    dealsRes,
    properties,
    dealProperties,
    activities,
    formSubmissions,
    tasks,
    emailEvents,
    owners,
  ] = await Promise.all([
    db.from('crm_deals').select('*')
      .eq('hubspot_contact_id', contactId)
      .order('createdate', { ascending: false }),

    getCachedProperties(db, 'contacts'),
    getCachedProperties(db, 'deals'),

    db.from('crm_activities')
      .select('id, hubspot_engagement_id, activity_type, subject, body, direction, status, owner_id, metadata, occurred_at, hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)
      .order('occurred_at', { ascending: false })
      .limit(200)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => r.data ?? [])
      .catch(() => [] as Array<Record<string, unknown>>),

    db.from('crm_form_submissions')
      .select('id, form_id, form_title, form_type, page_url, values, submitted_at')
      .eq('hubspot_contact_id', contactId)
      .order('submitted_at', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => r.data ?? [])
      .catch(() => [] as Array<Record<string, unknown>>),

    db.from('crm_tasks')
      .select('id, title, description, owner_id, status, priority, task_type, due_at, completed_at, created_at, hubspot_deal_id')
      .eq('hubspot_contact_id', contactId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => r.data ?? [])
      .catch(() => [] as Array<Record<string, unknown>>),

    contact.email
      ? db.from('email_events')
          .select('event_type, occurred_at, event_data')
          .eq('email', contact.email)
          .order('occurred_at', { ascending: false })
          .limit(500)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .then((r: any) => r.data ?? [])
          .catch(() => [] as Array<Record<string, unknown>>)
      : Promise.resolve([] as Array<Record<string, unknown>>),

    getCachedOwners(db),
  ])

  const deals = dealsRes.data ?? []

  // 3. Appointments — dépend de deals donc séquentiel après le Promise.all
  const apptIds = deals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => d.supabase_appt_id as string | null)
    .filter((v: string | null): v is string => !!v)

  let appointments: Array<Record<string, unknown>> = []
  if (apptIds.length > 0) {
    const { data: appts } = await db
      .from('rdv_appointments')
      .select('id, start_at, end_at, status, prospect_name, prospect_phone, prospect_email, notes, commercial_id')
      .in('id', apptIds)
    appointments = appts ?? []
  }

  // 4. Agrège email_events par messageId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailStatsByMessageId: Record<string, { sent: number; delivered: number; opens: number; clicks: number; bounces: number; spam: number; lastEventAt?: string; events: Array<{ type: string; at: string; data?: any }> }> = {}
  for (const ev of emailEvents) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (ev as any).event_data as any
    const msgId = data?.messageId || data?.message_id || data?.['message-id']
    if (!msgId) continue
    const key = String(msgId)
    if (!emailStatsByMessageId[key]) {
      emailStatsByMessageId[key] = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, spam: 0, events: [] }
    }
    const s = emailStatsByMessageId[key]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = String((ev as any).event_type || '').toLowerCase()
    if (t === 'sent' || t === 'request')                                  s.sent++
    else if (t === 'delivered')                                           s.delivered++
    else if (t === 'open' || t === 'opens' || t === 'opened' || t === 'unique_opened' || t === 'proxy_open') s.opens++
    else if (t === 'click' || t === 'clicks' || t === 'unique_clicked')   s.clicks++
    else if (t.includes('bounce'))                                        s.bounces++
    else if (t === 'spam' || t === 'complaint')                           s.spam++
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const occurredAt = (ev as any).occurred_at as string
    s.events.push({ type: t, at: occurredAt, data })
    if (!s.lastEventAt || occurredAt > s.lastEventAt) {
      s.lastEventAt = occurredAt
    }
  }

  // 5. Groupes de propriétés
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: Record<string, any[]> = {}
  for (const p of properties) {
    const g = (p.group_name as string) || 'other'
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }

  return NextResponse.json({
    contact,
    deals,
    appointments,
    properties,
    dealProperties,
    groups,
    activities,
    formSubmissions,
    owners,
    tasks,
    emailStatsByMessageId,
  })
}
