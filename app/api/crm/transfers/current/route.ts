import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { isMissingTransfersTable } from '@/lib/telepro-transfers'
import type { CallApproach, TransferBadgeInfo } from '@/lib/telepro-transfers-shared'

// POST /api/crm/transfers/current { contact_ids } — pastille « Transfert » :
// dernier transfert de chaque contact, tant que le lead est chez le télépro qui l'a reçu.
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.contact_ids)
    ? ([...new Set(body.contact_ids.filter((x: unknown) => typeof x === 'string' && x))] as string[]).slice(0, 1000)
    : []
  if (!ids.length) return NextResponse.json({ available: true, transfers: {} })
  const db = createServiceClient()

  const { data, error } = await db.from('crm_contact_transfers')
    .select('id, hubspot_contact_id, from_rdv_user_id, to_telepro_user_id, created_at, seen_at, call_approach, call_started_at')
    .in('hubspot_contact_id', ids)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingTransfersTable(error)) return NextResponse.json({ available: false, transfers: {} })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const latest = new Map<string, { id: string; from_rdv_user_id: string | null; to_telepro_user_id: string; created_at: string; seen_at: string | null; call_approach: string | null; call_started_at: string | null }>()
  for (const r of (data ?? []) as Array<{ id: string; hubspot_contact_id: string; from_rdv_user_id: string | null; to_telepro_user_id: string; created_at: string; seen_at: string | null; call_approach: string | null; call_started_at: string | null }>) {
    if (!latest.has(r.hubspot_contact_id)) latest.set(r.hubspot_contact_id, r)
  }
  if (!latest.size) return NextResponse.json({ available: true, transfers: {} })

  const { data: contacts } = await db.from('crm_contacts').select('hubspot_contact_id, telepro_user_id').in('hubspot_contact_id', [...latest.keys()])
  const holder = new Map(((contacts ?? []) as Array<{ hubspot_contact_id: string; telepro_user_id: string | number | null }>).map(c => [c.hubspot_contact_id, String(c.telepro_user_id ?? '')]))
  const fromIds = [...new Set([...latest.values()].map(t => t.from_rdv_user_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (fromIds.length) {
    const { data: users } = await db.from('rdv_users').select('id, name').in('id', fromIds)
    for (const u of (users ?? []) as { id: string; name: string }[]) names.set(u.id, u.name)
  }

  const transfers: Record<string, TransferBadgeInfo> = {}
  for (const [cid, t] of latest) {
    if (holder.get(cid) !== String(t.to_telepro_user_id)) continue // lead reparti ailleurs depuis
    transfers[cid] = {
      id: t.id,
      created_at: t.created_at,
      seen: !!t.seen_at,
      from_name: t.from_rdv_user_id ? names.get(t.from_rdv_user_id) ?? null : null,
      approach: (t.call_approach as CallApproach | null) ?? null,
      call_started_at: t.call_started_at,
    }
  }
  return NextResponse.json({ available: true, transfers })
}
