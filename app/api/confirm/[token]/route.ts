import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { addNoteToEngagements } from '@/lib/hubspot'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// GET /api/confirm/[token] — Infos du RDV par token de confirmation
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = createServiceClient()

  const { data, error } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, start_at, meeting_type, status, sms_confirmed_at')
    .eq('confirmation_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// POST /api/confirm/[token] — Action OUI (confirm)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { action } = await req.json() // 'confirm'

  if (action !== 'confirm') {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: appt } = await db
    .from('rdv_appointments')
    .select('id, status, start_at, hubspot_deal_id, hubspot_contact_id, sms_confirmed_at')
    .eq('confirmation_token', token)
    .single()

  if (!appt) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 404 })
  }

  // Idempotent : déjà confirmé
  if (appt.sms_confirmed_at) {
    return NextResponse.json({ ok: true, already: true })
  }

  const now = new Date()

  // 1. Mettre à jour le statut + horodatage SMS
  await db
    .from('rdv_appointments')
    .update({
      status: 'confirme_prospect',
      sms_confirmed_at: now.toISOString(),
    })
    .eq('id', appt.id)

  // 2. Ajouter une note HubSpot sur le deal
  if (appt.hubspot_deal_id) {
    const dateStr = format(new Date(appt.start_at), "EEEE d MMMM 'à' HH'h'mm", { locale: fr })
    await addNoteToEngagements({
      dealId: appt.hubspot_deal_id,
      contactId: appt.hubspot_contact_id ?? null,
      body: `📱 CONFIRMATION SMS\nLe prospect a confirmé sa présence via le lien SMS J-1.\nRDV : ${dateStr}`,
    })
  }

  return NextResponse.json({ ok: true })
}
