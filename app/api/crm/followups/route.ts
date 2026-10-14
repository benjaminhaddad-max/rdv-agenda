import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { invalidateTransferCandidates } from '@/lib/telepro-transfers'

function missingTable(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /crm_contact_followups/.test(err.message ?? ''))
}

// POST /api/crm/followups { contact_ids } — « Relance prévue » des lignes affichées
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.contact_ids)
    ? ([...new Set(body.contact_ids.filter((x: unknown) => typeof x === 'string' && x))] as string[]).slice(0, 1000)
    : []
  if (!ids.length) return NextResponse.json({ available: true, followups: {} })
  const { data, error } = await createServiceClient()
    .from('crm_contact_followups').select('hubspot_contact_id, relance_at, set_by').in('hubspot_contact_id', ids)
  if (error) {
    if (missingTable(error)) return NextResponse.json({ available: false, followups: {} })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const followups: Record<string, { relance_at: string | null; set_by: string | null }> = {}
  for (const r of (data ?? []) as Array<{ hubspot_contact_id: string; relance_at: string | null; set_by: string | null }>) {
    followups[r.hubspot_contact_id] = { relance_at: r.relance_at, set_by: r.set_by }
  }
  return NextResponse.json({ available: true, followups })
}

// PUT /api/crm/followups { contact_id, relance_at | null } — pose / efface la relance prévue
export async function PUT(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.isDemo) return NextResponse.json({ error: 'Action indisponible' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const contactId = typeof body.contact_id === 'string' ? body.contact_id : ''
  const relanceAt = body.relance_at ? new Date(body.relance_at) : null
  if (!contactId) return NextResponse.json({ error: 'contact_id requis' }, { status: 400 })
  if (relanceAt && !Number.isFinite(relanceAt.getTime())) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })

  const db = createServiceClient()
  const { data: me } = await db.from('rdv_users').select('name').eq('id', ctx.appUserId).maybeSingle()
  const by = (me as { name?: string } | null)?.name ?? null
  const now = new Date().toISOString()
  const { error } = await db.from('crm_contact_followups').upsert({
    hubspot_contact_id: contactId,
    relance_at: relanceAt ? relanceAt.toISOString() : null,
    set_by_user_id: ctx.appUserId,
    set_by: by,
    updated_at: now,
  }, { onConflict: 'hubspot_contact_id' })
  if (error) {
    if (missingTable(error)) return NextResponse.json({ error: 'Relance prévue pas encore activée (migration v87)' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await db.from('crm_property_history').insert({
    hubspot_contact_id: contactId, property_name: 'relance_prevue',
    value: relanceAt ? relanceAt.toISOString() : null, changed_at: now,
    source_type: 'CRM_UI', source_label: by ? `Relance prévue par ${by}` : 'Relance prévue',
  })
  invalidateTransferCandidates()
  return NextResponse.json({ ok: true, relance_at: relanceAt ? relanceAt.toISOString() : null, set_by: by })
}
