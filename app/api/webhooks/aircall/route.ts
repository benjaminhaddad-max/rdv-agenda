/**
 * /api/webhooks/aircall
 *
 * Reçoit les webhooks Aircall et les relie au CRM, comme l'intégration HubSpot :
 *   - call.created → affiche prénom/nom (+ fiche) dans Aircall Workspace
 *     et pousse le contact dans le carnet partagé
 *   - call.ended   → enregistre l'appel dans crm_activities (timeline fiche)
 *
 * Sécurité : si AIRCALL_WEBHOOK_TOKEN est défini, on accepte si le token Aircall
 * (payload.token), le query ?token=, ou le header x-aircall-token correspond.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { handleAircallCallCreated, handleAircallCallEnded } from '@/lib/aircall-crm'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type AircallWebhookPayload = {
  resource?: string
  event?: string
  timestamp?: number
  token?: string
  data?: Parameters<typeof handleAircallCallEnded>[1]
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function verifyToken(req: NextRequest, payload: AircallWebhookPayload): boolean {
  const expected = process.env.AIRCALL_WEBHOOK_TOKEN || ''
  if (!expected) return true
  const candidates = [
    payload.token,
    req.headers.get('x-aircall-token'),
    req.nextUrl.searchParams.get('token'),
  ].filter((v): v is string => Boolean(v))
  return candidates.some(c => timingSafeEqual(c, expected))
}

export async function POST(req: NextRequest) {
  let payload: AircallWebhookPayload | null = null
  try {
    payload = (await req.json()) as AircallWebhookPayload
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (!verifyToken(req, payload ?? {})) {
    return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 })
  }

  const event = payload?.event ?? ''
  const call = payload?.data

  if (event !== 'call.created' && event !== 'call.ended') {
    return NextResponse.json({ ok: true, ignored: event || 'unknown' })
  }

  if (!call || !call.id) {
    return NextResponse.json({ ok: true, ignored: 'no call data' })
  }

  const db = createServiceClient()

  try {
    if (event === 'call.created') {
      const result = await handleAircallCallCreated(db, call)
      return NextResponse.json({ ok: true, event, ...result })
    }

    const result = await handleAircallCallEnded(db, call)
    return NextResponse.json({ ok: true, event, ...result })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'aircall-webhook',
    usage:
      'Configure cette URL dans Aircall (Integrations → Webhooks) sur call.created et call.ended.',
  })
}
