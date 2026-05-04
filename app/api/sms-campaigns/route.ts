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
    .select('id, name, message, sender, status, campaign_type, shorten_links, segment_ids, manual_contact_ids, manual_phones, filters, filter_groups, preset_flags, scheduled_at, sent_at, total_recipients, sent_count, failed_count, segments_used, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  let body: {
    name?: string
    message?: string
    sender?: string
    campaign_type?: 'alert' | 'marketing'
    shorten_links?: boolean
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

  const db = createServiceClient()
  const { data, error } = await db.from('sms_campaigns').insert({
    name: body.name.trim(),
    message: body.message.trim(),
    sender: body.sender || 'DiploSante',
    campaign_type: campaignType,
    shorten_links: !!body.shorten_links,
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
