import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/sms-campaigns          — liste paginée
 * POST /api/sms-campaigns         — créer une campagne (status=draft)
 *
 * Query params GET :
 *   ?status=draft|scheduled|sent|...
 *   ?limit=20  (default), max 100
 */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || ''
  const limit = Math.min(parseInt(sp.get('limit') || '20', 10), 100)

  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db.from('sms_campaigns')
    .select('id, name, message, sender, status, campaign_type, shorten_links, tracked_links, segment_ids, manual_contact_ids, manual_phones, filters, filter_groups, preset_flags, scheduled_at, sent_at, total_recipients, sent_count, failed_count, segments_used, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrichit chaque campagne avec le total de clics agreges (uniquement si
  // au moins un lien tracke est defini sur la campagne — evite la requete
  // pour les campagnes sans lien).
  const rows = (data ?? []) as Array<{ id: string; tracked_links?: unknown[] }>
  const idsWithLinks = rows
    .filter(r => Array.isArray(r.tracked_links) && r.tracked_links.length > 0)
    .map(r => r.id)
  const clicksByCampaign: Record<string, { clicks: number; tokens: number; clicked_recipients: number }> = {}
  if (idsWithLinks.length > 0) {
    const { data: tokens } = await db
      .from('sms_campaign_link_tokens')
      .select('campaign_id, recipient_id, click_count')
      .in('campaign_id', idsWithLinks)
    const byCampaignRecipients: Record<string, Set<string>> = {}
    for (const t of (tokens ?? []) as Array<{ campaign_id: string; recipient_id: string; click_count: number | null }>) {
      const cid = t.campaign_id
      if (!clicksByCampaign[cid]) clicksByCampaign[cid] = { clicks: 0, tokens: 0, clicked_recipients: 0 }
      clicksByCampaign[cid].clicks += t.click_count ?? 0
      clicksByCampaign[cid].tokens += 1
      if ((t.click_count ?? 0) > 0) {
        if (!byCampaignRecipients[cid]) byCampaignRecipients[cid] = new Set()
        byCampaignRecipients[cid].add(t.recipient_id)
      }
    }
    for (const cid of Object.keys(byCampaignRecipients)) {
      clicksByCampaign[cid].clicked_recipients = byCampaignRecipients[cid].size
    }
  }
  const enriched = rows.map(r => ({
    ...r,
    clicks_total: clicksByCampaign[r.id]?.clicks ?? 0,
    clicked_recipients: clicksByCampaign[r.id]?.clicked_recipients ?? 0,
    tracked_tokens_total: clicksByCampaign[r.id]?.tokens ?? 0,
  }))

  return NextResponse.json({ data: enriched })
}

// Forme attendue d'un lien tracke
interface TrackedLinkInput {
  placeholder?: string
  url?: string
  label?: string
  tracked?: boolean
}

function sanitizeTrackedLinks(input: unknown): TrackedLinkInput[] {
  if (!Array.isArray(input)) return []
  const out: TrackedLinkInput[] = []
  const seenPlaceholders = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const placeholder = String(r.placeholder ?? '').trim()
    const url = String(r.url ?? '').trim()
    if (!placeholder || !/^\{[a-z0-9_]+\}$/i.test(placeholder)) continue
    if (!url) continue
    // sanity URL
    let normalized = url
    if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized
    try { new URL(normalized) } catch { continue }
    if (seenPlaceholders.has(placeholder)) continue
    seenPlaceholders.add(placeholder)
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 200) : null
    const tracked = r.tracked !== false  // par defaut tracke
    out.push({ placeholder, url: normalized, label: label || undefined, tracked })
  }
  return out.slice(0, 10)  // hard cap 10 liens / campagne
}

export async function POST(req: NextRequest) {
  let body: {
    name?: string
    message?: string
    sender?: string
    campaign_type?: 'alert' | 'marketing'
    shorten_links?: boolean
    tracked_links?: unknown
    segment_ids?: string[]
    filters?: Record<string, unknown>
    filter_groups?: unknown[]
    preset_flags?: Record<string, unknown> | null
    manual_contact_ids?: string[]
    manual_phones?: string[]
    scheduled_at?: string | null
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }

  if (!body.name || !body.name.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  if (!body.message || !body.message.trim()) return NextResponse.json({ error: 'Message requis' }, { status: 400 })

  const campaignType: 'alert' | 'marketing' =
    body.campaign_type === 'marketing' ? 'marketing' : 'alert'

  const trackedLinks = sanitizeTrackedLinks(body.tracked_links)

  const db = createServiceClient()
  const { data, error } = await db.from('sms_campaigns').insert({
    name: body.name.trim(),
    message: body.message.trim(),
    sender: body.sender || 'DiploSante',
    campaign_type: campaignType,
    shorten_links: !!body.shorten_links,
    tracked_links: trackedLinks,
    segment_ids: body.segment_ids || [],
    filters: body.filters || {},
    filter_groups: body.filter_groups ?? [],
    preset_flags: body.preset_flags ?? null,
    manual_contact_ids: body.manual_contact_ids || [],
    manual_phones: body.manual_phones || [],
    scheduled_at: body.scheduled_at || null,
    status: body.scheduled_at ? 'scheduled' : 'draft',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
