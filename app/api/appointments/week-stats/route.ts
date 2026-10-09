/**
 * GET /api/appointments/week-stats?from=ISO&to=ISO[&brand=diploma|medibox][&commercial_id=…][&mine=…]
 *
 * Compteur de l'agenda : nombre de RDV placés (créés) sur la période, mêmes
 * filtres que l'agenda (marque, closer). La présence est calculée côté agenda
 * à partir des RDV déjà affichés.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'from et to (ISO) requis' }, { status: 400 })
  }

  const db = createServiceClient()
  let q = db.from('rdv_appointments')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(from).toISOString())
    .lt('created_at', new Date(to).toISOString())
  const brand = sp.get('brand')
  if (brand === 'medibox') q = q.eq('brand', 'medibox')
  else if (brand === 'diploma') q = q.neq('brand', 'medibox')
  const commercialId = sp.get('commercial_id')
  if (commercialId) q = q.eq('commercial_id', commercialId)
  // Agenda « Moi » : RDV placés par la personne ou dont elle est le closer
  const mine = sp.get('mine')
  if (mine && /^[0-9a-f-]{36}$/i.test(mine)) q = q.or(`telepro_id.eq.${mine},commercial_id.eq.${mine}`)

  const { count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ placed: count ?? 0 }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
