import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/reschedule/[token] — Infos du RDV original pour la page de report
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = createServiceClient()

  const { data, error } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_email, prospect_phone, formation_type, meeting_type')
    .eq('confirmation_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// POST /api/reschedule/[token] — Annule le RDV original après report
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { action } = await req.json()

  if (action !== 'cancel_original') {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: appt } = await db
    .from('rdv_appointments')
    .select('id')
    .eq('confirmation_token', token)
    .single()

  if (!appt) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 404 })
  }

  // Marquer l'ancien RDV comme "à replanifier"
  await db
    .from('rdv_appointments')
    .update({ status: 'a_travailler' })
    .eq('id', appt.id)

  return NextResponse.json({ ok: true })
}
