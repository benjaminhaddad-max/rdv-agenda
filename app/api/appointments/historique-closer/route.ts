import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
const STAGE_BY_STATUS: Record<string, { label: string; color: string }> = {
  non_assigne: { label: 'Non assigné', color: '#64748b' },
  confirme: { label: 'RDV Pris', color: '#ccac71' },
  confirme_prospect: { label: 'RDV Pris', color: '#ccac71' },
  no_show: { label: 'À replanifier', color: '#f97316' },
  annule: { label: 'À replanifier', color: '#f97316' },
  a_travailler: { label: 'Délai de réflexion', color: '#eab308' },
  pre_positif: { label: 'Délai de réflexion', color: '#eab308' },
  positif: { label: 'Pré-inscription', color: '#a855f7' },
  negatif: { label: 'Fermé / Perdu', color: '#ef4444' },
  va_reflechir: { label: 'Délai de réflexion', color: '#eab308' },
  preinscription: { label: 'Pré-inscription', color: '#a855f7' },
}

// GET /api/appointments/historique-closer?closer_id=xxx
export async function GET(req: NextRequest) {
  const closerId = req.nextUrl.searchParams.get('closer_id')
  if (!closerId) return NextResponse.json([])

  const db = createServiceClient()
  const now = new Date().toISOString()
  const { data } = await db
    .from('rdv_appointments')
    .select(`
      *,
      telepro:telepro_id (id, name),
      users:commercial_id (id, name, avatar_color, slug)
    `)
    .eq('commercial_id', closerId)
    .lt('start_at', now)
    .order('start_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (data ?? []).map((r: any) => {
    const stage = STAGE_BY_STATUS[r.status] ?? { label: r.status ?? '—', color: '#8b8fa8' }
    return {
      ...r,
      hs_stage: r.status ?? null,
      hs_stage_label: stage.label,
      hs_stage_color: stage.color,
      repop_form_date: null,
      repop_form_name: null,
    }
  })

  return NextResponse.json(enriched)
}
