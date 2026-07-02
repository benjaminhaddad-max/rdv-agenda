/**
 * GET /api/cron/sms-intraday
 *
 * Rappels intra-journée pour les RDV visio uniquement.
 * Planifié toutes les 5 minutes : `* /5 * * * *` (sans espace)
 *
 * Deux vérifications à chaque run :
 * 1. SMS + email 1h avant  : start_at dans [+55min, +65min] → sms_1h_sent_at IS NULL
 * 2. SMS + email 5min avant: start_at dans [+3min, +8min]   → sms_5min_sent_at IS NULL
 *
 * Sécurisé par le header `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { sendSms, build1hSms, build5minSms } from '@/lib/smsfactor'
import { sendVisio1hEmail, sendVisio5minEmail } from '@/lib/email-reminders'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const now = new Date()

  const win1hStart  = new Date(now.getTime() + 55 * 60 * 1000)
  const win1hEnd    = new Date(now.getTime() + 65 * 60 * 1000)
  const win5minStart = new Date(now.getTime() +  3 * 60 * 1000)
  const win5minEnd   = new Date(now.getTime() +  8 * 60 * 1000)

  const db = createServiceClient()

  // ── 1h avant ─────────────────────────────────────────────────────────────
  const { data: appts1h } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_phone, prospect_email, email_parent, start_at, meeting_type, meeting_link, sms_1h_sent_at')
    .in('status', ['confirme', 'confirme_prospect'])
    .eq('meeting_type', 'visio')
    .not('prospect_phone', 'is', null)
    .is('sms_1h_sent_at', null)
    .gte('start_at', win1hStart.toISOString())
    .lte('start_at', win1hEnd.toISOString())

  // ── 5min avant ───────────────────────────────────────────────────────────
  const { data: appts5min } = await db
    .from('rdv_appointments')
    .select('id, prospect_name, prospect_phone, prospect_email, email_parent, start_at, meeting_type, meeting_link, sms_5min_sent_at')
    .in('status', ['confirme', 'confirme_prospect'])
    .eq('meeting_type', 'visio')
    .not('prospect_phone', 'is', null)
    .is('sms_5min_sent_at', null)
    .gte('start_at', win5minStart.toISOString())
    .lte('start_at', win5minEnd.toISOString())

  const results: { id: string; name: string; type: '1h' | '5min'; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

  // Envoyer 1h
  for (const appt of appts1h ?? []) {
    if (!appt.prospect_phone) continue
    const startDate = new Date(appt.start_at)
    const parisOffset = getParisMsOffset(startDate)
    const startParis = new Date(startDate.getTime() + parisOffset)
    const heureStr = format(startParis, "HH'h'mm", { locale: fr })
    const firstName = appt.prospect_name.trim().split(/\s+/)[0]
    const message = build1hSms(firstName, heureStr, appt.meeting_type, appt.meeting_link)
    const smsResult = await sendSms(appt.prospect_phone, message)
    if (smsResult.ok) {
      if (appt.prospect_email && appt.meeting_link) {
        const emailResult = await sendVisio1hEmail(
          { prospectEmail: appt.prospect_email, emailParent: appt.email_parent || null },
          firstName,
          heureStr,
          appt.meeting_link,
          appt.id,
        )
        if (!emailResult.ok) {
          console.error('[cron/sms-intraday] Erreur email 1h:', emailResult.error, 'appt:', appt.id)
        }
      }
      await db.from('rdv_appointments').update({ sms_1h_sent_at: new Date().toISOString() }).eq('id', appt.id)
      results.push({ id: appt.id, name: appt.prospect_name, type: '1h', status: 'sent' })
    } else {
      results.push({ id: appt.id, name: appt.prospect_name, type: '1h', status: 'error', reason: smsResult.error })
    }
  }

  // Envoyer 5min
  for (const appt of appts5min ?? []) {
    if (!appt.prospect_phone) continue
    const firstName = appt.prospect_name.trim().split(/\s+/)[0]
    const message = build5minSms(firstName, appt.meeting_type, appt.meeting_link)
    const smsResult = await sendSms(appt.prospect_phone, message)
    if (smsResult.ok) {
      if (appt.prospect_email && appt.meeting_link) {
        const emailResult = await sendVisio5minEmail(
          { prospectEmail: appt.prospect_email, emailParent: appt.email_parent || null },
          firstName,
          appt.meeting_link,
          appt.id,
        )
        if (!emailResult.ok) {
          console.error('[cron/sms-intraday] Erreur email 5min:', emailResult.error, 'appt:', appt.id)
        }
      }
      await db.from('rdv_appointments').update({ sms_5min_sent_at: new Date().toISOString() }).eq('id', appt.id)
      results.push({ id: appt.id, name: appt.prospect_name, type: '5min', status: 'sent' })
    } else {
      results.push({ id: appt.id, name: appt.prospect_name, type: '5min', status: 'error', reason: smsResult.error })
    }
  }

  const sentCount = results.filter(r => r.status === 'sent').length
  console.log(`[cron/sms-intraday] ${sentCount} SMS envoyés (1h: ${results.filter(r => r.type === '1h' && r.status === 'sent').length}, 5min: ${results.filter(r => r.type === '5min' && r.status === 'sent').length})`)
  return NextResponse.json({ sent: sentCount, total: results.length, results })
}

function getParisMsOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const parisStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  return new Date(parisStr).getTime() - new Date(utcStr).getTime()
}
