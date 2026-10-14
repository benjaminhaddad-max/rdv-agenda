import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { isMissingCyclesSchema, type CurrentCycleLite, type CycleEtat } from '@/lib/sales-cycles'

// POST /api/crm/cycles/current { contact_ids } — cycle courant de chaque contact
// (affiché sous le statut du lead dans le tableau du CRM)
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.contact_ids)
    ? [...new Set(body.contact_ids.filter((x: unknown): x is string => typeof x === 'string' && x !== ''))].slice(0, 1000) as string[]
    : []
  if (!ids.length) return NextResponse.json({ available: true, cycles: {} })

  const db = createServiceClient()
  const [cyclesRes, productsRes] = await Promise.all([
    db.from('crm_sales_cycles')
      .select('hubspot_contact_id, saison, product_code, product_label, status, etat, opened_at')
      .in('hubspot_contact_id', ids)
      .eq('is_current', true),
    db.from('crm_cycle_products').select('code, label'),
  ])
  if (cyclesRes.error) {
    if (isMissingCyclesSchema(cyclesRes.error)) return NextResponse.json({ available: false, cycles: {} })
    return NextResponse.json({ error: cyclesRes.error.message }, { status: 500 })
  }
  const labels = new Map(((productsRes.data ?? []) as { code: string; label: string }[]).map(p => [p.code, p.label]))
  const cycles: Record<string, CurrentCycleLite> = {}
  for (const c of (cyclesRes.data ?? []) as {
    hubspot_contact_id: string; saison: string; product_code: string | null; product_label: string | null
    status: string | null; etat: CycleEtat; opened_at: string
  }[]) {
    cycles[c.hubspot_contact_id] = {
      saison: c.saison,
      product: c.product_label ?? (c.product_code ? labels.get(c.product_code) ?? c.product_code : null),
      status: c.status,
      etat: c.etat,
      opened_at: c.opened_at,
    }
  }
  return NextResponse.json({ available: true, cycles })
}
