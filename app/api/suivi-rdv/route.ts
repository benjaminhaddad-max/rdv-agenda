import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUser, forbidden } from '@/lib/api-auth'
import { isSuiviStatus } from '@/lib/suivi-rdv'

const SUIVI_SELECT = `
  id, prospect_name, prospect_email, prospect_phone,
  start_at, created_at, status, formation_type, classe_actuelle, departement,
  telepro_id, commercial_id, notes,
  closer:commercial_id (id, name),
  telepro:telepro_id (id, name, avatar_color)
`

function canSeeAll(role: string) {
  return role === 'admin' || role === 'manager'
}

/**
 * GET /api/suivi-rdv?telepro_id=<uuid|all>
 * Liste des RDV placés par un télépro (ou tous les télépros pour l'admin),
 * avec la correction manuelle de statut de suivi éventuelle.
 * Un télépro ne voit que ses propres RDV.
 */
export async function GET(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response
  const { ctx } = authz

  const requested = (req.nextUrl.searchParams.get('telepro_id') || '').trim()
  let teleproId: string | 'all'
  if (canSeeAll(ctx.role)) {
    teleproId = requested || 'all'
  } else if (ctx.role === 'telepro') {
    teleproId = ctx.appUserId
  } else {
    return forbidden()
  }

  const db = createServiceClient()
  let query = db.from('rdv_appointments').select(SUIVI_SELECT)
  query = teleproId === 'all' ? query.not('telepro_id', 'is', null) : query.eq('telepro_id', teleproId)
  const { data, error } = await query.order('start_at', { ascending: false }).limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const overrides = new Map<string, { suivi_status: string; source_status: string | null; updated_at: string }>()
  let overridesAvailable = true
  const ids = rows.map(r => r.id as string)
  for (let i = 0; i < ids.length && overridesAvailable; i += 300) {
    const { data: ov, error: ovErr } = await db
      .from('rdv_suivi_status')
      .select('appointment_id, suivi_status, source_status, updated_at')
      .in('appointment_id', ids.slice(i, i + 300))
    if (ovErr) { overridesAvailable = false; break } // table pas encore créée
    for (const o of ov ?? []) overrides.set(o.appointment_id, o)
  }

  return NextResponse.json({
    overrides_available: overridesAvailable,
    appointments: rows.map(r => ({ ...r, suivi_override: overrides.get(r.id as string) ?? null })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * PATCH /api/suivi-rdv  { appointment_id, suivi_status | null }
 * Corrige manuellement le statut de suivi (null = revenir au statut automatique).
 */
export async function PATCH(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response
  const { ctx } = authz

  const body = await req.json().catch(() => ({}))
  const appointmentId = String(body.appointment_id || '')
  const suiviStatus = body.suivi_status ?? null
  if (!appointmentId) return NextResponse.json({ error: 'appointment_id requis' }, { status: 400 })
  if (suiviStatus !== null && !isSuiviStatus(suiviStatus)) {
    return NextResponse.json({ error: 'Statut de suivi invalide' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: appt } = await db
    .from('rdv_appointments')
    .select('id, status, telepro_id')
    .eq('id', appointmentId)
    .maybeSingle()
  if (!appt) return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  if (!canSeeAll(ctx.role) && appt.telepro_id !== ctx.appUserId) return forbidden()

  if (suiviStatus === null) {
    const { error } = await db.from('rdv_suivi_status').delete().eq('appointment_id', appointmentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ suivi_override: null })
  }

  const row = {
    appointment_id: appointmentId,
    suivi_status: suiviStatus,
    source_status: appt.status ?? null,
    updated_by: ctx.appUserId,
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('rdv_suivi_status').upsert(row, { onConflict: 'appointment_id' })
  if (error) {
    return NextResponse.json({
      error: error.message.includes('rdv_suivi_status')
        ? 'Migration manquante : exécuter supabase-migration-suivi-rdv.sql'
        : error.message,
    }, { status: 500 })
  }
  return NextResponse.json({ suivi_override: row })
}
