/**
 * GET /api/cron/events-comms
 *
 * Toutes les 5 min :
 * 1) Confirmations manquantes (templates plateforme) sur événements published
 * 2) Rappels email/SMS dus selon les horaires de la fiche événement
 *
 * Sécurisé via Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import {
  sendDueEventReminders,
  sendPendingConfirmationsForPublishedEvents,
} from '@/lib/events-studio/send-confirmations'
import { logger } from '@/lib/logger'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  try {
    const confirmations = await sendPendingConfirmationsForPublishedEvents()
    const reminders = await sendDueEventReminders()

    return NextResponse.json({
      ok: true,
      confirmations,
      reminders,
    })
  } catch (e) {
    logger.error('cron/events-comms', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
