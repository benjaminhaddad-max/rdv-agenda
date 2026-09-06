import { NextRequest, NextResponse } from 'next/server'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createEventsClient } from '@/lib/events-studio/client'
import {
  sendDueEventReminders,
  sendEventPendingConfirmations,
} from '@/lib/events-studio/send-confirmations'

export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }

const CORS_ORIGINS = new Set([
  'https://hub.diploma-sante.fr',
  'https://qr.diploma-sante.fr',
  'https://rdv-agenda.vercel.app',
  'https://rdv-agenda-edumove-team.vercel.app',
])

function corsHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get('origin') || ''
  if (!CORS_ORIGINS.has(origin) && !origin.endsWith('.vercel.app')) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

/** Accepte session CRM ou JWT utilisateur Events Studio. */
async function authorized(req: NextRequest): Promise<boolean> {
  const crmUser = await requireCrmUserId()
  if (crmUser) return true

  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!auth) return false
  try {
    const db = createEventsClient()
    const { data, error } = await db.auth.getUser(auth)
    return !error && !!data?.user
  } catch {
    return false
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

/**
 * POST /api/events-studio/events/[id]/send-comms
 * Remplace l’appel direct aux edge stubs par les templates plateforme CRM.
 * Body: { mode?: 'confirmations' | 'reminders' | 'both', force_email?: boolean }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const headers = corsHeaders(req)
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers })

  const body = await req.json().catch(() => ({}))
  const mode = typeof body.mode === 'string' ? body.mode : 'confirmations'
  const forceEmail = !!body.force_email

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = { success: true, proxied: true, event_id: id }

  if (mode === 'confirmations' || mode === 'both') {
    out.confirmations = await sendEventPendingConfirmations(id, { forceEmail })
    out.sent = out.confirmations?.emails_sent ?? out.confirmations?.sent ?? 0
  }
  if (mode === 'reminders' || mode === 'both') {
    out.reminders = await sendDueEventReminders()
  }

  return NextResponse.json(out, { headers })
}
