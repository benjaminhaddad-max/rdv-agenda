/**
 * GET /api/cron/sms-48h
 *
 * Envoi du SMS de confirmation 48h avant le RDV.
 * Planifié 2×/jour : 8h UTC et 20h UTC (couvre tous les créneaux).
 * Fenêtre de recherche : start_at dans [+44h, +52h] pour éviter doublons
 * entre les deux runs quotidiens.
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendSms, build48hSms } from '@/lib/smsfactor'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { randomUUID } from 'crypto'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Fenêtre +44h → +52h (centré sur 48h, large de 8h pour couvrir les 2 runs/jour)
  const windowStart = new Date(now.getTime() + 44 * 60 * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + 52 * 60 * 60 * 1000)

  const db = createServiceClient()
  const { data: appointments, error } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_phone, start_at, meeting_type, sms_48h_sent_at, confirmation_token')
    .in('status', ['confirme', 'confirme_prospect'])
    .not('prospect_phone', 'is', null)
    .gte('start_at', windowStart.toISOString())
    .lte('start_at', windowEnd.toISOString())

  if (error) {
    console.error('[cron/sms-48h] Erreur Supabase :', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Aucun RDV dans la fenêtre 48h' })
  }

  const results: { id: string; name: string; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

  for (const appt of appointments) {
    if (appt.sms_48h_sent_at) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'déjà envoyé' })
      continue
    }
    if (!appt.prospect_phone) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'pas de téléphone' })
      continue
    }

    const token: string = appt.confirmation_token ?? randomUUID()
    if (!appt.confirmation_token) {
      await db.from('rdv_appointments').update({ confirmation_token: token }).eq('id', appt.id)
    }

    const startDate = new Date(appt.start_at)
    const parisOffset = getParisMsOffset(startDate)
    const startParis = new Date(startDate.getTime() + parisOffset)
    const dateStr = format(startParis, "EEEE d MMMM 'à' HH'h'mm", { locale: fr })
    const firstName = appt.prospect_name.trim().split(/\s+/)[0]

    const message = build48hSms(firstName, dateStr, appt.meeting_type, token)
    const smsResult = await sendSms(appt.prospect_phone, message)

    if (smsResult.ok) {
      await db.from('rdv_appointments').update({ sms_48h_sent_at: new Date().toISOString() }).eq('id', appt.id)
      results.push({ id: appt.id, name: appt.prospect_name, status: 'sent' })
    } else {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'error', reason: smsResult.error })
    }
  }

  const sentCount = results.filter(r => r.status === 'sent').length
  console.log(`[cron/sms-48h] ${sentCount}/${appointments.length} SMS envoyés`)
  return NextResponse.json({ sent: sentCount, total: appointments.length, results })
}

function getParisMsOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const parisStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  return new Date(parisStr).getTime() - new Date(utcStr).getTime()
}
