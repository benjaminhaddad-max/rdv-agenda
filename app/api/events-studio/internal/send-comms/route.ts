import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret, verifyEventPlatformApiKey } from '@/lib/api-auth'
import {
  sendDueEventReminders,
  sendEventPendingConfirmations,
  sendPendingConfirmationsForPublishedEvents,
} from '@/lib/events-studio/send-confirmations'

export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  if (verifyEventPlatformApiKey(req)) return true
  // Alias : même secret que Events (CRM_API_KEY côté gestionnaire)
  const crmKey = process.env.CRM_API_KEY?.trim() || process.env.EVENT_PLATFORM_API_KEY?.trim() || ''
  if (crmKey) {
    const provided =
      req.headers.get('x-api-key') ||
      (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (provided && provided === crmKey) return true
  }
  const cron = requireCronSecret(req)
  return cron.ok
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const mode = typeof body.mode === 'string' ? body.mode : 'both'
  const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : ''
  const forceEmail = !!body.force_email

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = { success: true }

  if (mode === 'confirmations' || mode === 'both') {
    if (eventId) {
      out.confirmations = await sendEventPendingConfirmations(eventId, { forceEmail })
    } else {
      out.confirmations = await sendPendingConfirmationsForPublishedEvents()
    }
  }

  if (mode === 'reminders' || mode === 'both') {
    out.reminders = await sendDueEventReminders()
  }

  return NextResponse.json(out)
}
