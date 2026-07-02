import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const maxDuration = 300

const ORIGINE_NOMAD = 'Nomad Education (Partenaire)'
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function verifyNomadKey(req: NextRequest): boolean {
  const expected = process.env.NOMAD_IMPORT_KEY || ''
  const provided =
    req.headers.get('x-nomad-key') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const value = provided || ''
  if (!value || !expected) return false
  return timingSafeEqual(value, expected)
}

export async function POST(req: NextRequest) {
  if (!verifyNomadKey(req)) {
    return NextResponse.json({ error: 'Invalid NOMAD import key' }, { status: 401 })
  }

  const db = createServiceClient()
  const limit = Math.min(1000, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '300', 10) || 300))
  const afterId = String(req.nextUrl.searchParams.get('after_id') || '').trim()
  const nowIso = new Date().toISOString()

  let query = db
    .from('crm_contacts')
    .select('hubspot_contact_id')
    .eq('origine', ORIGINE_NOMAD)
    .not('departement', 'is', null)
    .order('hubspot_contact_id', { ascending: true })
    .limit(limit)
  if (afterId) query = query.gt('hubspot_contact_id', afterId)

  const { data: rows, error: listErr } = await query
  if (listErr) {
    return NextResponse.json({ error: listErr.message, after_id: afterId, limit }, { status: 500 })
  }

  const ids = (rows ?? [])
    .map((r) => String(r.hubspot_contact_id || '').trim())
    .filter(Boolean)

  if (ids.length > 0) {
    const { error: updErr } = await db
      .from('crm_contacts')
      .update({
        zone_localite: null,
        synced_at: nowIso,
      })
      .in('hubspot_contact_id', ids)
    if (updErr) {
      return NextResponse.json({ error: updErr.message, after_id: afterId, limit }, { status: 500 })
    }
  }
  const lastId = ids.length > 0 ? ids[ids.length - 1] : null

  return NextResponse.json({
    ok: true,
    origine: ORIGINE_NOMAD,
    after_id: afterId || null,
    limit,
    updated: ids.length,
    next_after_id: lastId,
    has_more: ids.length === limit,
    failed: 0,
  })
}
