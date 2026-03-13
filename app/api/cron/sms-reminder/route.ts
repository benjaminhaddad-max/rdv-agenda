/**
 * GET /api/cron/sms-reminder
 *
 * Appelé chaque matin à 8h UTC (= 9h/10h Paris) par Vercel Cron.
 * Envoie un SMS de rappel J-1 à chaque prospect dont le RDV est demain.
 *
 * Sécurisé par le header Vercel `Authorization: Bearer CRON_SECRET`
 * (configuré dans vercel.json + variables d'env Vercel).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendSms } from '@/lib/smsfactor'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export async function GET(req: NextRequest) {
  // ── Sécurité : vérifier le secret Vercel Cron ─────────────────────────
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Calculer la plage "demain" en UTC ──────────────────────────────────
  // Le cron tourne à 8h UTC. On cherche les RDV du lendemain (J+1).
  const now = new Date()
  const tomorrowStart = new Date(now)
  tomorrowStart.setUTCDate(now.getUTCDate() + 1)
  tomorrowStart.setUTCHours(0, 0, 0, 0)

  const tomorrowEnd = new Date(tomorrowStart)
  tomorrowEnd.setUTCHours(23, 59, 59, 999)

  // ── Récupérer les RDV confirmés de demain avec numéro de téléphone ─────
  const db = createServiceClient()
  const { data: appointments, error } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_phone, start_at, sms_reminder_sent_at')
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
    // Éviter d'envoyer deux fois si déjà envoyé
    if (appt.sms_reminder_sent_at) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'déjà envoyé' })
      continue
    }

    if (!appt.prospect_phone) {
      results.push({ id: appt.id, name: appt.prospect_name, status: 'skipped', reason: 'pas de téléphone' })
      continue
    }

    // Formatter la date/heure (les timestamps sont stockés en UTC dans Supabase)
    const startDate = new Date(appt.start_at)
    // Convertir en heure Paris (+1h hiver / +2h été)
    const parisMsOffset = getParisMsOffset(startDate)
    const startParis = new Date(startDate.getTime() + parisMsOffset)
    const dateStr = format(startParis, "EEEE d MMMM 'à' HH'h'mm", { locale: fr })

    // Construire le message
    const firstName = appt.prospect_name.trim().split(/\s+/)[0]
    const message =
      `Bonjour ${firstName}, votre rendez-vous Diploma Santé est confirmé pour demain ${dateStr}. ` +
      `À très bientôt !`

    // Envoyer le SMS
    const smsResult = await sendSms(appt.prospect_phone, message)

    if (smsResult.ok) {
      // Marquer comme envoyé en base
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
 * Retourne l'offset en millisecondes pour Paris (UTC+1 hiver, UTC+2 été).
 * Approximation via Intl.DateTimeFormat — pas besoin de date-fns-tz.
 */
function getParisMsOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const parisStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  const utcDate = new Date(utcStr)
  const parisDate = new Date(parisStr)
  return parisDate.getTime() - utcDate.getTime()
}
