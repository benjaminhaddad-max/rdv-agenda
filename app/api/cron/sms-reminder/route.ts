/**
 * GET /api/cron/sms-reminder
 *
 * Appelé chaque matin à 8h UTC (= 9h/10h Paris) par Vercel Cron.
 * Envoie un SMS de rappel J-1 avec lien de confirmation OUI/NON.
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendSms, buildReminderSms } from '@/lib/smsfactor'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { randomUUID } from 'crypto'

export async function GET(req: NextRequest) {
  // ── Sécurité Vercel Cron ──────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Plage "demain" en UTC ─────────────────────────────────────────────
  const now = new Date()
  const tomorrowStart = new Date(now)
  tomorrowStart.setUTCDate(now.getUTCDate() + 1)
  tomorrowStart.setUTCHours(0, 0, 0, 0)

  const tomorrowEnd = new Date(tomorrowStart)
  tomorrowEnd.setUTCHours(23, 59, 59, 999)

  // ── RDV confirmés de demain avec numéro ───────────────────────────────
  const db = createServiceClient()
  const { data: appointments, error } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_phone, start_at, meeting_type, sms_reminder_sent_at, confirmation_token')
    .eq('status', 'confirme')
    .not('prospect_phone', 'is', null)
    .gte('start_at', tomorrowStart.toISOString())
    .lte('start_at', tomorrowEnd.toISOString())

  if (error) {
    console.error('[cron/sms-reminder] Erreur Supabase :', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Aucun RDV demain' })
  }

  const results: {
    id: string
    name: string
    status: 'sent' | 'skipped' | 'error'
    reason?: string
  }[] = []

  for (const appt of appointments) {
    // Déjà envoyé → skip
    if (appt.sms_reminder_sent_at) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'déjà envoyé' })
      continue
    }

    if (!appt.prospect_phone) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'pas de téléphone' })
      continue
    }

    // Générer un token de confirmation si pas encore présent
    const token: string = appt.confirmation_token ?? randomUUID()

    if (!appt.confirmation_token) {
      await db
        .from('rdv_appointments')
        .update({ confirmation_token: token })
        .eq('id', appt.id)
    }

    // Formater la date en heure de Paris
    const startDate = new Date(appt.start_at)
    const parisOffset = getParisMsOffset(startDate)
    const startParis = new Date(startDate.getTime() + parisOffset)
    const dateStr = format(startParis, "EEEE d MMMM 'à' HH'h'mm", { locale: fr })

    const firstName = appt.prospect_name.trim().split(/\s+/)[0]

    // Construire le SMS selon le type de RDV
    const message = buildReminderSms(firstName, dateStr, appt.meeting_type, token)

    // Envoyer
    const smsResult = await sendSms(appt.prospect_phone, message)

    if (smsResult.ok) {
      await db
        .from('rdv_appointments')
        .update({ sms_reminder_sent_at: new Date().toISOString() })
        .eq('id', appt.id)

      results.push({ id: appt.id, name: appt.prospect_name, status: 'sent' })
    } else {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'error', reason: smsResult.error })
    }
  }

  const sentCount = results.filter(r => r.status === 'sent').length
  console.log(`[cron/sms-reminder] ${sentCount}/${appointments.length} SMS envoyés`)

  return NextResponse.json({ sent: sentCount, total: appointments.length, results })
}

/**
 * Retourne l'offset ms Paris par rapport à UTC (gère le DST).
 */
function getParisMsOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const parisStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  return new Date(parisStr).getTime() - new Date(utcStr).getTime()
}
