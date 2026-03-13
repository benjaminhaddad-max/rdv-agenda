import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { addNoteToEngagements, getDealContactInfo } from '@/lib/hubspot'

const SUIVI_LABELS: Record<string, string> = {
  ne_repond_plus: '📵 Ne répond plus',
  a_travailler: '🔧 À travailler',
  pre_positif: '⭐ Pré-positif',
}

// PATCH /api/closer-suivi — Save suivi + add HubSpot note
export async function PATCH(req: NextRequest) {
  const { appointment_id, deal_id, suivi, closer_name } = await req.json()

  const validSuivi = ['ne_repond_plus', 'a_travailler', 'pre_positif', null]
  if (!validSuivi.includes(suivi)) {
    return NextResponse.json({ error: 'Valeur suivi invalide' }, { status: 400 })
  }

  const db = createServiceClient()
  const isHubSpotOnly = appointment_id === deal_id

  // 1. Save in DB
  if (isHubSpotOnly) {
    // HubSpot-only deal → use rdv_hist_suivi table
    const { error } = await db
      .from('rdv_hist_suivi')
      .upsert({
        hubspot_deal_id: deal_id,
        telepro_suivi: suivi || null,
        telepro_suivi_at: suivi ? new Date().toISOString() : null,
      }, { onConflict: 'hubspot_deal_id' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Supabase-backed appointment
    const { error } = await db
      .from('rdv_appointments')
      .update({
        telepro_suivi: suivi || null,
        telepro_suivi_at: suivi ? new Date().toISOString() : null,
      })
      .eq('id', appointment_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2. Add HubSpot note for tracking
  if (deal_id && suivi) {
    try {
      const contactInfo = await getDealContactInfo(deal_id)
      const now = new Date()
      const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      await addNoteToEngagements({
        dealId: deal_id,
        contactId: contactInfo?.id ?? null,
        body: `📋 SUIVI CLOSER — ${dateStr}\n${closer_name ? `Closer : ${closer_name}\n` : ''}Statut suivi : ${SUIVI_LABELS[suivi] || suivi}`,
      })
    } catch (e) {
      console.error('HubSpot note failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
