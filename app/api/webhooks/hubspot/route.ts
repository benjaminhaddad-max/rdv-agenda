/**
 * Webhook HubSpot → CRM (temps réel)
 *
 * Reçoit les events HubSpot dès qu'une propriété d'un contact ou d'un deal
 * change (latence < 5 sec). Vérifie la signature v3, batch-read les objets
 * touchés, upsert dans Supabase. Bien plus fiable que le polling 5-min car :
 *   - Pas de fenêtre glissante (donc 0 lead manqué si > 2000 modifs/min)
 *   - HubSpot retry 10x sur 24h si on est down
 *   - Couvre les suppressions
 *
 * Configuration côté HubSpot (Developer Portal → Webhooks) :
 *   - URL : https://[domaine]/api/webhooks/hubspot
 *   - Events à cocher : contact.creation, contact.deletion, contact.propertyChange
 *                       deal.creation, deal.deletion, deal.propertyChange
 *   - Secret : copié depuis l'app HubSpot → mis dans HUBSPOT_CLIENT_SECRET
 *
 * En cas de doute, le nightly full sync (3h du matin) rattrape tout.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { batchGetContacts, hubspotFetch } from '@/lib/hubspot'

// Vercel Pro : timeout étendu à 60s (suffit largement, batch read = ~2-5s)
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface HubSpotWebhookEvent {
  eventId: number
  subscriptionId: number
  portalId: number
  appId: number
  occurredAt: number
  subscriptionType: string  // 'contact.propertyChange', 'deal.creation', etc.
  attemptNumber: number
  objectId: number
  propertyName?: string
  propertyValue?: string
  changeSource?: string
  changeFlag?: string
}

const DEAL_PROPS = [
  'dealname', 'dealstage', 'pipeline', 'hubspot_owner_id',
  'teleprospecteur', 'diploma_sante___formation',
  'closedate', 'createdate', 'description',
]

function parseHubSpotDate(v: string | null | undefined): string | null {
  if (!v) return null
  try { return new Date(v).toISOString() } catch { return null }
}

/**
 * Vérifie la signature HubSpot v3.
 * Algorithme : HMAC-SHA256(method + uri + body + timestamp), encodé en base64.
 * Timestamp doit être < 5 min pour éviter les rejeux.
 */
function verifyHubSpotSignature(opts: {
  method: string
  url: string
  body: string
  signature: string
  timestamp: string
}): { valid: boolean; reason?: string } {
  const secret = process.env.HUBSPOT_CLIENT_SECRET
  if (!secret) return { valid: false, reason: 'HUBSPOT_CLIENT_SECRET missing' }
  if (!opts.signature || !opts.timestamp) return { valid: false, reason: 'Missing headers' }

  // Anti-rejeu : timestamp doit être à < 5 min du now
  const tsMs = Number(opts.timestamp)
  if (!Number.isFinite(tsMs)) return { valid: false, reason: 'Invalid timestamp' }
  const ageSec = (Date.now() - tsMs) / 1000
  if (Math.abs(ageSec) > 300) return { valid: false, reason: `Timestamp too old (${Math.round(ageSec)}s)` }

  // HubSpot signe avec l'URL complète externe (pas le pathname relatif)
  const sourceString = `${opts.method}${opts.url}${opts.body}${opts.timestamp}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(sourceString)
  const expected = hmac.digest('base64')
  const ok = crypto.timingSafeEqual(Buffer.from(opts.signature), Buffer.from(expected))
  return { valid: ok, reason: ok ? undefined : 'Signature mismatch' }
}

function buildContactRow(c: { id: string; properties: Record<string, string | null> }, now: string) {
  const p = c.properties
  return {
    hubspot_contact_id:         c.id,
    firstname:                  p.firstname  ?? null,
    lastname:                   p.lastname   ?? null,
    email:                      p.email      ?? null,
    phone:                      p.phone      ?? null,
    departement:                p.departement ?? null,
    classe_actuelle:            p.classe_actuelle ?? null,
    zone_localite:              p.zone___localite ?? null,
    hubspot_owner_id:           p.hubspot_owner_id ?? null,
    teleprospecteur:            p.teleprospecteur ?? null,
    contact_createdate:         parseHubSpotDate(p.createdate),
    recent_conversion_date:     parseHubSpotDate(p.recent_conversion_date),
    recent_conversion_event:    p.recent_conversion_event_name ?? null,
    hs_lead_status:             p.hs_lead_status ?? null,
    origine:                    p.origine ?? null,
    source:                     p.source ?? null,
    formation_demandee:         p.diploma_sante___formation_demandee ?? null,
    formation_souhaitee:        p.formation_souhaitee ?? null,
    synced_at:                  now,
    hubspot_raw:                p,
  }
}

function buildDealRow(d: { id: string; properties: Record<string, string | null> }, now: string) {
  const p = d.properties
  return {
    hubspot_deal_id:    d.id,
    dealname:           p.dealname   ?? null,
    dealstage:          p.dealstage  ?? null,
    pipeline:           p.pipeline   ?? null,
    hubspot_owner_id:   p.hubspot_owner_id ?? null,
    teleprospecteur:    p.teleprospecteur  ?? null,
    formation:          p.diploma_sante___formation ?? null,
    closedate:          parseHubSpotDate(p.closedate),
    createdate:         parseHubSpotDate(p.createdate),
    description:        p.description ?? null,
    synced_at:          now,
    hubspot_raw:        p,
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hubspot-signature-v3') ?? ''
  const timestamp = req.headers.get('x-hubspot-request-timestamp') ?? ''

  // L'URL utilisée pour la signature = celle que HubSpot a envoyée (donc l'URL
  // publique). En prod via Vercel, c'est req.url (https://).
  const fullUrl = req.url

  const check = verifyHubSpotSignature({
    method: 'POST',
    url: fullUrl,
    body: rawBody,
    signature,
    timestamp,
  })
  if (!check.valid) {
    return NextResponse.json({ error: 'Invalid signature', reason: check.reason }, { status: 401 })
  }

  let events: HubSpotWebhookEvent[]
  try {
    events = JSON.parse(rawBody) as HubSpotWebhookEvent[]
    if (!Array.isArray(events)) throw new Error('Body is not an array')
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body', detail: String(e) }, { status: 400 })
  }

  // Regroupe les events par type/id (HubSpot peut envoyer plusieurs events
  // d'un coup, parfois plusieurs propertyChange pour le même objet).
  const contactsToFetch = new Set<string>()
  const dealsToFetch    = new Set<string>()
  const contactsToDelete = new Set<string>()
  const dealsToDelete    = new Set<string>()

  for (const ev of events) {
    const id = String(ev.objectId)
    const t  = ev.subscriptionType
    if (!id || !t) continue
    if (t === 'contact.deletion')      contactsToDelete.add(id)
    else if (t.startsWith('contact.')) contactsToFetch.add(id)
    else if (t === 'deal.deletion')    dealsToDelete.add(id)
    else if (t.startsWith('deal.'))    dealsToFetch.add(id)
  }

  const db = createServiceClient()
  const now = new Date().toISOString()
  const stats = { contacts_upserted: 0, contacts_deleted: 0, deals_upserted: 0, deals_deleted: 0 }

  // ── Contacts : batch read + upsert ──────────────────────────────────────
  if (contactsToFetch.size > 0) {
    const ids = [...contactsToFetch]
    try {
      const contacts = await batchGetContacts(ids)
      if (contacts.length > 0) {
        const rows = contacts.map(c => buildContactRow(c as { id: string; properties: Record<string, string | null> }, now))
        await db.from('crm_contacts').upsert(rows, { onConflict: 'hubspot_contact_id' })
        stats.contacts_upserted = rows.length
      }
    } catch (e) {
      console.error('[webhook hubspot] batchGetContacts failed:', e)
    }
  }

  // ── Contacts : suppressions ─────────────────────────────────────────────
  if (contactsToDelete.size > 0) {
    const ids = [...contactsToDelete]
    const { count } = await db
      .from('crm_contacts')
      .delete({ count: 'exact' })
      .in('hubspot_contact_id', ids)
      .not('hubspot_contact_id', 'like', 'dpl_%')   // préserve les contacts natifs
      .not('hubspot_contact_id', 'like', 'crm_%')
    stats.contacts_deleted = count ?? 0
  }

  // ── Deals : batch read + upsert ─────────────────────────────────────────
  if (dealsToFetch.size > 0) {
    const ids = [...dealsToFetch]
    try {
      const data = await hubspotFetch('/crm/v3/objects/deals/batch/read', {
        method: 'POST',
        body: JSON.stringify({
          inputs: ids.map(id => ({ id })),
          properties: DEAL_PROPS,
        }),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deals: any[] = data.results ?? []
      if (deals.length > 0) {
        const rows = deals.map(d => buildDealRow(d, now))
        await db.from('crm_deals').upsert(rows, { onConflict: 'hubspot_deal_id' })
        stats.deals_upserted = rows.length
      }
    } catch (e) {
      console.error('[webhook hubspot] deals batch read failed:', e)
    }
  }

  // ── Deals : suppressions ────────────────────────────────────────────────
  if (dealsToDelete.size > 0) {
    const ids = [...dealsToDelete]
    const { count } = await db
      .from('crm_deals')
      .delete({ count: 'exact' })
      .in('hubspot_deal_id', ids)
      .not('hubspot_deal_id', 'like', 'dpl_%')
    stats.deals_deleted = count ?? 0
  }

  // Log léger (utile pour debug — peut être désactivé si volume trop important)
  try {
    await db.from('crm_sync_log').insert({
      contacts_upserted: stats.contacts_upserted,
      deals_upserted:    stats.deals_upserted,
      duration_ms:       0,
      source:            'webhook',
      details:           JSON.stringify({ ...stats, events: events.length }),
    })
  } catch { /* table peut ne pas avoir source/details — best-effort */ }

  return NextResponse.json({ ok: true, ...stats, events: events.length })
}

// GET pour test rapide / vérification du déploiement (HubSpot n'utilise pas GET)
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'hubspot-webhook',
    message: 'POST events here from HubSpot. Configure HUBSPOT_CLIENT_SECRET env var.',
  })
}
