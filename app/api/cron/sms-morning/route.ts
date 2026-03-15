/**
 * GET /api/cron/sms-morning
 *
 * Envoi du SMS de rappel le matin du RDV, à 10h heure de Paris.
 * Planifié chaque jour à 8h UTC (= 9h/10h Paris selon DST).
 *
 * Contenu selon le type de RDV :
 * - présentiel : lieu (PREPA_ADDRESS) + code d'entrée (PREPA_CODE)
 * - visio       : rappel + lien de la visioconférence
 * - téléphone   : rappel que notre équipe appellera
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendSms, buildMorningSms } from '@/lib/smsfactor'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Tous les RDV d'aujourd'hui (en UTC — on récupère la journée complète)
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setUTCHours(23, 59, 59, 999)

  const db = createServiceClient()
  const { data: appointments, error } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_phone, start_at, meeting_type, meeting_link, sms_morning_sent_at')
    .in('status', ['confirme', 'confirme_prospect'])
    .not('prospect_phone', 'is', null)
    .gte('start_at', todayStart.toISOString())
    .lte('start_at', todayEnd.toISOString())

  if (error) {
    console.error('[cron/sms-morning] Erreur Supabase :', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Aucun RDV aujourd\'hui' })
  }

  const results: { id: string; name: string; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

  for (const appt of appointments) {
    if (appt.sms_morning_sent_at) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'déjà envoyé' })
      continue
    }
    if (!appt.prospect_phone) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'pas de téléphone' })
      continue
    }

    const startDate = new Date(appt.start_at)
    const parisOffset = getParisMsOffset(startDate)
    const startParis = new Date(startDate.getTime() + parisOffset)
    const heureStr = format(startParis, "HH'h'mm", { locale: fr })
    const firstName = appt.prospect_name.trim().split(/\s+/)[0]

    const message = buildMorningSms(firstName, heureStr, appt.meeting_type, appt.meeting_link)
    const smsResult = await sendSms(appt.prospect_phone, message)

    if (smsResult.ok) {
      await db.from('rdv_appointments').update({ sms_morning_sent_at: new Date().toISOString() }).eq('id', appt.id)
      results.push({ id: appt.id, name: appt.prospect_name, status: 'sent' })
    } else {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'error', reason: smsResult.error })
    }
  }

  const sentCount = results.filter(r => r.status === 'sent').length
  console.log(`[cron/sms-morning] ${sentCount}/${appointments.length} SMS envoyés`)
  return NextResponse.json({ sent: sentCount, total: appointments.length, results })
}

function getParisMsOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const parisStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  return new Date(parisStr).getTime() - new Date(utcStr).getTime()
}
