import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { isMissingCyclesSchema, type CycleEvent, type SalesCycle } from '@/lib/sales-cycles'
import { cycleActorName } from '@/lib/sales-cycles-server'

// GET /api/crm/contacts/:id/cycles — cycle courant + historique + catalogue produits
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const db = createServiceClient()

  const { data: contact } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, hs_lead_status, classe_actuelle, createdate')
    .eq('hubspot_contact_id', id)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })

  const [cyclesRes, productsRes, rdvRes] = await Promise.all([
    db.from('crm_sales_cycles').select('*').eq('hubspot_contact_id', id).order('opened_at', { ascending: false }).limit(50),
    db.from('crm_cycle_products').select('*').order('sort'),
    db.from('rdv_appointments').select('id, start_at, status, commercial_id').eq('hubspot_contact_id', id).order('start_at', { ascending: false }).limit(50),
  ])

  if (cyclesRes.error || productsRes.error) {
    if (isMissingCyclesSchema(cyclesRes.error) || isMissingCyclesSchema(productsRes.error)) {
      return NextResponse.json({ available: false, contact })
    }
    return NextResponse.json({ error: (cyclesRes.error ?? productsRes.error)!.message }, { status: 500 })
  }

  const cycles = (cyclesRes.data ?? []) as SalesCycle[]
  const ids = cycles.map(c => c.id)
  const eventsByCycle = new Map<string, CycleEvent[]>()
  if (ids.length) {
    const { data: events } = await db
      .from('crm_sales_cycle_events')
      .select('id, cycle_id, kind, old_value, new_value, at, by')
      .in('cycle_id', ids)
      .order('at', { ascending: false })
      .limit(300)
    for (const e of (events ?? []) as (CycleEvent & { cycle_id: string })[]) {
      const list = eventsByCycle.get(e.cycle_id) ?? []
      list.push(e)
      eventsByCycle.set(e.cycle_id, list)
    }
  }

  // RDV rangés dans le cycle ouvert à leur date
  const rdvs = (rdvRes.data ?? []) as { id: string; start_at: string; status: string; commercial_id: string | null }[]
  const closerIds = [...new Set(rdvs.map(r => r.commercial_id).filter(Boolean))] as string[]
  const closerNames = new Map<string, string>()
  if (closerIds.length) {
    const { data: users } = await db.from('rdv_users').select('id, name').in('id', closerIds)
    for (const u of (users ?? []) as { id: string; name: string }[]) closerNames.set(u.id, u.name)
  }
  const chrono = [...cycles].sort((a, b) => a.opened_at.localeCompare(b.opened_at))
  const rdvsByCycle = new Map<string, NonNullable<SalesCycle['rdvs']>>()
  for (const r of rdvs) {
    let target: SalesCycle | undefined
    for (const c of chrono) if (c.opened_at <= r.start_at || c === chrono[0]) target = c
    // Un RDV posé après la clôture d'un cycle non courant appartient au suivant (déjà géré par l'ordre)
    if (!target) continue
    const list = rdvsByCycle.get(target.id) ?? []
    list.push({ id: r.id, start_at: r.start_at, status: r.status, closer: r.commercial_id ? closerNames.get(r.commercial_id) ?? null : null })
    rdvsByCycle.set(target.id, list)
  }

  const withDetails = cycles.map(c => ({ ...c, events: eventsByCycle.get(c.id) ?? [], rdvs: rdvsByCycle.get(c.id) ?? [] }))
  return NextResponse.json({
    available: true,
    contact,
    current: withDetails.find(c => c.is_current) ?? null,
    history: withDetails.filter(c => !c.is_current),
    products: productsRes.data ?? [],
    // RDV d'un contact qui n'a pas encore de cycle enregistré
    loose_rdvs: cycles.length ? [] : rdvs.map(r => ({ id: r.id, start_at: r.start_at, status: r.status, closer: r.commercial_id ? closerNames.get(r.commercial_id) ?? null : null })),
  })
}

// POST /api/crm/contacts/:id/cycles — ouvre un nouveau cycle (clôt le courant)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.isDemo) return NextResponse.json({ error: 'Action indisponible' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()
  const by = await cycleActorName(db, ctx)

  const { error } = await db.rpc('crm_open_sales_cycle', {
    p_contact_ids: [id],
    p_saison: body.saison || null,
    p_product_code: body.product_code || null,
    p_product_label: body.product_label || null,
    p_status: body.status || null,
    p_close_etat: body.close_etat || null,
    p_close_motif: body.close_motif?.trim() || null,
    p_by: by,
  })
  if (error) {
    if (isMissingCyclesSchema(error)) return NextResponse.json({ error: 'Cycles de vente pas encore activés (migration v80)' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
