import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET    /api/sms-campaigns/[id]            — détail + recipients
 * PATCH  /api/sms-campaigns/[id]            — édit (uniquement si status=draft)
 * DELETE /api/sms-campaigns/[id]            — supprimer
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = createServiceClient()

  const { data: campaign, error } = await db.from('sms_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!campaign) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const { data: recipients } = await db.from('sms_campaign_recipients')
    .select('id, hubspot_contact_id, phone, firstname, status, sms_factor_ticket, error_message, segments_count, sent_at')
    .eq('campaign_id', id)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(500)

  return NextResponse.json({ data: campaign, recipients: recipients ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }

  const db = createServiceClient()
  // Empêche d'éditer une campagne déjà envoyée
  const { data: existing } = await db.from('sms_campaigns').select('status').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (existing.status === 'sent' || existing.status === 'sending') {
    return NextResponse.json({ error: `Campagne ${existing.status}, modification impossible` }, { status: 400 })
  }

  const allowed = ['name', 'message', 'sender', 'segment_ids', 'filters', 'manual_contact_ids', 'scheduled_at', 'status']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) updates[k] = body[k]

  const { data, error } = await db.from('sms_campaigns').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('sms_campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
