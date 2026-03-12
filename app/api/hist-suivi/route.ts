import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// PATCH /api/hist-suivi — Sauvegarder le suivi pour un deal HubSpot-only
export async function PATCH(req: NextRequest) {
  const { deal_id, suivi } = await req.json()
  const validSuivi = ['ne_repond_plus', 'a_travailler', 'pre_positif', null]
  if (!deal_id || !validSuivi.includes(suivi)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_hist_suivi')
    .upsert({
      hubspot_deal_id: deal_id,
      telepro_suivi: suivi || null,
      telepro_suivi_at: suivi ? new Date().toISOString() : null,
    }, { onConflict: 'hubspot_deal_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
