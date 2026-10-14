import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { PIPELINES, getStageMeta } from '@/lib/crm-stages'
import { isMissingCyclesSchema, seasonOf, type CycleEvent, type CycleHistoryRdv, type SalesCycle } from '@/lib/sales-cycles'
import { cycleActorName } from '@/lib/sales-cycles-server'

const NEGATIF_LABELS: Record<string, string> = {
  inscrit_autre_prepa: 'Inscrit dans une autre prépa',
  pas_les_moyens: 'Pas les moyens',
  reorientation: 'Réorientation',
  autre: 'Autre',
}

// GET /api/crm/contacts/:id/cycles — cycle courant + tout l'historique du lead :
// cycles, RDV (formation, issue, raison), statuts successifs, anciennes transactions.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const db = createServiceClient()

  const { data: contact } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, hs_lead_status, classe_actuelle, createdate')
    .eq('hubspot_contact_id', id)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: 'Contact introuvable' }, { status: 404 })

  const [cyclesRes, productsRes, rdvRes, historyRes, dealsRes] = await Promise.all([
    db.from('crm_sales_cycles').select('*').eq('hubspot_contact_id', id).order('opened_at', { ascending: false }).limit(50),
    db.from('crm_cycle_products').select('*').order('sort'),
    db.from('rdv_appointments')
      .select('id, start_at, status, commercial_id, formation_type, negatif_reason, negatif_reason_detail, report_summary')
      .eq('hubspot_contact_id', id).order('start_at', { ascending: false }).limit(50),
    db.from('crm_property_history')
      .select('value, changed_at, source_label')
      .eq('hubspot_contact_id', id).eq('property_name', 'hs_lead_status')
      .order('changed_at', { ascending: false }).limit(200),
    db.from('crm_deals')
      .select('hubspot_deal_id, dealname, formation, dealstage, pipeline, createdate, closedate')
      .eq('hubspot_contact_id', id).limit(30),
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

  // RDV
  const rawRdvs = (rdvRes.data ?? []) as {
    id: string; start_at: string; status: string; commercial_id: string | null; formation_type: string | null
    negatif_reason: string | null; negatif_reason_detail: string | null; report_summary: string | null
  }[]
  const closerIds = [...new Set(rawRdvs.map(r => r.commercial_id).filter(Boolean))] as string[]
  const closerNames = new Map<string, string>()
  if (closerIds.length) {
    const { data: users } = await db.from('rdv_users').select('id, name').in('id', closerIds)
    for (const u of (users ?? []) as { id: string; name: string }[]) closerNames.set(u.id, u.name)
  }
  const rdvs: CycleHistoryRdv[] = rawRdvs.map(r => {
    let detail = r.negatif_reason_detail
    if (r.negatif_reason === 'inscrit_autre_prepa' && detail) {
      try { detail = (JSON.parse(detail) as string[]).join(', ') } catch { /* texte brut */ }
    }
    return {
      id: r.id,
      start_at: r.start_at,
      status: r.status,
      closer: r.commercial_id ? closerNames.get(r.commercial_id) ?? null : null,
      formation: r.formation_type,
      negatif: r.negatif_reason ? [NEGATIF_LABELS[r.negatif_reason] ?? r.negatif_reason, detail].filter(Boolean).join(' — ') : null,
      summary: r.report_summary ? r.report_summary.slice(0, 400) : null,
    }
  })

  // Statuts successifs (avant v80 : historique importé de HubSpot + modifs CRM)
  const statusHistory = ((historyRes.data ?? []) as { value: string | null; changed_at: string; source_label: string | null }[])
    .filter(h => h.value && h.value.trim())
    .map(h => ({ value: h.value!.trim(), at: h.changed_at, source: h.source_label }))

  // Anciennes transactions = ce qu'on avait essayé de vendre, saison par saison
  const deals = ((dealsRes.data ?? []) as {
    hubspot_deal_id: string; dealname: string | null; formation: string | null; dealstage: string | null
    pipeline: string | null; createdate: string | null; closedate: string | null
  }[]).map(d => {
    const at = d.createdate ?? d.closedate
    const pipelineSeason = d.pipeline ? PIPELINES[d.pipeline]?.label ?? (d.pipeline.match(/(\d{4})_(\d{4})/)?.slice(1, 3).join('-') ?? null) : null
    return {
      id: d.hubspot_deal_id,
      saison: pipelineSeason ?? (at ? seasonOf(at) : null),
      formation: d.formation || d.dealname || null,
      stage: d.dealstage ? getStageMeta(d.dealstage)?.label ?? null : null,
      at,
    }
  }).filter(d => d.saison)

  return NextResponse.json({
    available: true,
    contact,
    current: cycles.find(c => c.is_current) ? { ...cycles.find(c => c.is_current)!, events: eventsByCycle.get(cycles.find(c => c.is_current)!.id) ?? [] } : null,
    history: cycles.filter(c => !c.is_current).map(c => ({ ...c, events: eventsByCycle.get(c.id) ?? [] })),
    products: productsRes.data ?? [],
    rdvs,
    status_history: statusHistory,
    deals,
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
