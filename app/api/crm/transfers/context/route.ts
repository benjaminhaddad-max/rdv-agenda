import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { getTransferCandidatesCached } from '@/lib/telepro-transfers'
import type { TransferCandidate } from '@/lib/telepro-transfers-shared'

// POST /api/crm/transfers/context { contact_ids } — appel froid de chaque lead
// (ligne de contexte de la vue « À réattribuer » du tableau Contacts).
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'manager') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const ids = new Set<string>(Array.isArray(body.contact_ids) ? body.contact_ids.filter((x: unknown) => typeof x === 'string').slice(0, 1000) : [])
  const payload = await getTransferCandidatesCached(createServiceClient())
  const context: Record<string, TransferCandidate> = {}
  for (const r of payload.rows) if (ids.has(r.hubspot_contact_id)) context[r.hubspot_contact_id] = r
  return NextResponse.json({ available: payload.available, context })
}
