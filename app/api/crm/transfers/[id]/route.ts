import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { isMissingTransfersTable } from '@/lib/telepro-transfers'
import type { CallApproach, TransferDetail } from '@/lib/telepro-transfers-shared'

// GET /api/crm/transfers/:id — contexte du transfert ; marqué « vu » quand le destinataire l'ouvre
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db.from('crm_contact_transfers').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isMissingTransfersTable(error)) return NextResponse.json({ error: 'Transferts pas encore activés' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Transfert introuvable' }, { status: 404 })
  const t = data as Record<string, string | number | boolean | null>

  const userIds = [t.from_rdv_user_id, t.to_rdv_user_id, t.caller_rdv_user_id].filter(Boolean) as string[]
  const [usersRes, contactRes] = await Promise.all([
    userIds.length ? db.from('rdv_users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] }),
    db.from('crm_contacts').select('firstname, lastname').eq('hubspot_contact_id', String(t.hubspot_contact_id)).maybeSingle(),
  ])
  const names = new Map(((usersRes.data ?? []) as { id: string; name: string }[]).map(u => [u.id, u.name]))
  const c = contactRes.data as { firstname: string | null; lastname: string | null } | null

  let seenAt = (t.seen_at as string | null) ?? null
  if (!seenAt && t.to_rdv_user_id === ctx.appUserId) {
    seenAt = new Date().toISOString()
    await db.from('crm_contact_transfers').update({ seen_at: seenAt }).eq('id', id)
  }

  const detail: TransferDetail = {
    id: String(t.id),
    hubspot_contact_id: String(t.hubspot_contact_id),
    contact_name: [c?.firstname, c?.lastname].filter(Boolean).join(' ') || 'Contact',
    from_name: t.from_rdv_user_id ? names.get(String(t.from_rdv_user_id)) ?? null : null,
    to_name: t.to_rdv_user_id ? names.get(String(t.to_rdv_user_id)) ?? null : null,
    caller_name: t.caller_rdv_user_id ? names.get(String(t.caller_rdv_user_id)) ?? null : null,
    created_by: (t.created_by as string | null) ?? null,
    created_at: String(t.created_at),
    seen_at: seenAt,
    note: (t.note as string | null) ?? null,
    lead_status_at_transfer: (t.lead_status_at_transfer as string | null) ?? null,
    call: {
      started_at: (t.call_started_at as string | null) ?? null,
      talk_sec: (t.talk_sec as number | null) ?? null,
      analysed: !!t.call_analysed,
      approach: (t.call_approach as CallApproach | null) ?? null,
      cause_label: (t.call_cause as string | null) ?? null,
      summary: (t.call_summary as string | null) ?? null,
      missing: (t.call_missing as string | null) ?? null,
      advice: (t.call_advice as string | null) ?? null,
      recording_url: (t.recording_url as string | null) ?? null,
    },
  }
  return NextResponse.json(detail)
}
