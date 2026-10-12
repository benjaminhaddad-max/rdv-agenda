import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { isMissingCyclesSchema } from '@/lib/sales-cycles'
import { cycleActorName } from '@/lib/sales-cycles-server'

export const maxDuration = 300

// POST /api/crm/cycles/bulk — ouvre un nouveau cycle pour plusieurs contacts
// (ex. à la rentrée : tous les perdus Terminale → Prépa PASS / LAS 2027-2028 · Recyclé)
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'manager') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.contact_ids) ? body.contact_ids.filter((x: unknown) => typeof x === 'string' && x) : []
  if (!ids.length) return NextResponse.json({ error: 'Aucun contact' }, { status: 400 })
  if (ids.length > 20000) return NextResponse.json({ error: 'Maximum 20 000 contacts à la fois' }, { status: 400 })

  const db = createServiceClient()
  const by = await cycleActorName(db, ctx)
  let done = 0
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.rpc('crm_open_sales_cycle', {
      p_contact_ids: ids.slice(i, i + 300),
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
      return NextResponse.json({ error: error.message, done }, { status: 500 })
    }
    done += typeof data === 'number' ? data : 0
  }
  return NextResponse.json({ ok: true, done })
}
