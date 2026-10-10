/**
 * GET /api/crm/contacts/engagement?ids=a,b,c (200 max)
 * → { [hubspot_contact_id]: { last_contact_at, last_contact_manual, last_call_at, calls_count, score } }
 * Colonnes « Dernier contact » et « Score » de Mes contacts (lib/lead-engagement.ts).
 * Renseigner un contact à la main : POST /api/crm/activities
 * { activity_type: 'call', status: 'COMPLETED', metadata: { manual_contact: true }, occurred_at }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { loadEngagement } from '@/lib/lead-engagement'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'closer', 'telepro', 'manager'])
  if (!authz.ok) return authz.response
  const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200)
  if (!ids.length) return NextResponse.json({})
  try {
    return NextResponse.json(await loadEngagement(createServiceClient(), ids), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
