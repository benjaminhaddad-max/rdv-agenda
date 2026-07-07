import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import { processPendingFormWebhookDeliveries } from '@/lib/form-webhook'

export const maxDuration = 60

/**
 * GET /api/cron/form-webhook-retries
 * Reprend les webhooks formulaire en échec temporaire (5xx / réseau).
 */
export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const db = createServiceClient()
  const stats = await processPendingFormWebhookDeliveries(db)
  return NextResponse.json({ ok: true, ...stats })
}
