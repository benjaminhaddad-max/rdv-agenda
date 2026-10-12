import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { isMissingCyclesSchema, type CycleEtat, type SalesCycle } from '@/lib/sales-cycles'
import { cycleActorName } from '@/lib/sales-cycles-server'

const ETATS: CycleEtat[] = ['ouvert', 'gagne', 'perdu', 'reporte']

// PATCH /api/crm/cycles/:cycleId — produit / saison, ou clôture (gagné / perdu / reporté)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.isDemo) return NextResponse.json({ error: 'Action indisponible' }, { status: 403 })
  const { cycleId } = await params
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()

  const { data: cycle, error: fetchErr } = await db.from('crm_sales_cycles').select('*').eq('id', cycleId).maybeSingle()
  if (fetchErr) {
    if (isMissingCyclesSchema(fetchErr)) return NextResponse.json({ error: 'Cycles de vente pas encore activés (migration v80)' }, { status: 503 })
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!cycle) return NextResponse.json({ error: 'Cycle introuvable' }, { status: 404 })
  const cur = cycle as SalesCycle
  const by = await cycleActorName(db, ctx)
  const now = new Date().toISOString()

  const update: Record<string, unknown> = { updated_at: now }
  const events: { kind: string; old_value: string | null; new_value: string | null }[] = []

  if ('product_code' in body || 'product_label' in body) {
    const code = body.product_code || null
    let label: string | null = body.product_label?.trim() || null
    if (code && !label) {
      const { data: p } = await db.from('crm_cycle_products').select('label').eq('code', code).maybeSingle()
      label = (p as { label?: string } | null)?.label ?? null
    }
    update.product_code = code
    update.product_label = label
    events.push({ kind: 'edit', old_value: cur.product_label ?? cur.product_code, new_value: label ?? code })
  }
  if (typeof body.saison === 'string' && /^\d{4}-\d{4}$/.test(body.saison) && body.saison !== cur.saison) {
    update.saison = body.saison
    events.push({ kind: 'edit', old_value: cur.saison, new_value: body.saison })
  }
  if (typeof body.etat === 'string' && ETATS.includes(body.etat as CycleEtat) && body.etat !== cur.etat) {
    const etat = body.etat as CycleEtat
    update.etat = etat
    update.motif = etat === 'ouvert' ? null : (body.motif?.trim() || cur.motif || null)
    update.closed_at = etat === 'ouvert' ? null : now
    update.closed_by = etat === 'ouvert' ? null : by
    events.push({ kind: 'close', old_value: cur.etat, new_value: etat + (update.motif ? ` — ${update.motif}` : '') })
  } else if (typeof body.motif === 'string' && cur.etat !== 'ouvert') {
    update.motif = body.motif.trim() || null
  }

  const { data: updated, error } = await db.from('crm_sales_cycles').update(update).eq('id', cycleId).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (events.length) {
    await db.from('crm_sales_cycle_events').insert(events.map(e => ({ ...e, cycle_id: cycleId, hubspot_contact_id: cur.hubspot_contact_id, by })))
  }
  return NextResponse.json({ ok: true, cycle: updated })
}
