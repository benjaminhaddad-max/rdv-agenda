/**
 * GET /api/cron/sms-campaigns-scheduled
 *
 * Recupere les campagnes SMS dont `scheduled_at` est passe et lance leur
 * envoi via runSmsCampaign() (lib/sms-sender.ts) — appel direct, pas de
 * fetch self-call.
 *
 * Pour les campagnes marketing, applique la fenetre legale francaise
 * (8h-20h, Lundi-Samedi). Les campagnes hors fenetre sont reportees au
 * prochain run.
 *
 * Planifie toutes les minutes via vercel.json.
 * Securise par `Authorization: Bearer CRON_SECRET` si la variable d'env
 * est definie (Vercel injecte automatiquement le bon header).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runSmsCampaign } from '@/lib/sms-sender'
import { logger } from '@/lib/logger'

export const maxDuration = 300

function isWithinMarketingWindow(date: Date): boolean {
  const parisStr = date.toLocaleString('en-US', {
    timeZone: 'Europe/Paris',
    hour: 'numeric', hour12: false,
    weekday: 'short',
  })
  const [weekdayPart, hourPart] = parisStr.split(',').map(s => s.trim())
  const hour = parseInt(hourPart, 10)
  const weekday = weekdayPart.toLowerCase()
  if (weekday === 'sun') return false
  if (hour < 8 || hour >= 20) return false
  return true
}

function deriveBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const now = new Date()

  const { data: due, error } = await db.from('sms_campaigns')
    .select('id, name, campaign_type, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const baseUrl = deriveBaseUrl(req)
  const results: Array<{ id: string; name: string; status: string; reason?: string; sent?: number; failed?: number }> = []

  for (const campaign of due) {
    if (campaign.campaign_type === 'marketing' && !isWithinMarketingWindow(now)) {
      results.push({ id: campaign.id, name: campaign.name, status: 'deferred', reason: 'hors fenetre marketing' })
      continue
    }

    try {
      // Appel direct (pas de HTTP self-call) — robuste et rapide.
      const r = await runSmsCampaign({
        campaignId: campaign.id,
        baseUrl,
      })
      results.push({
        id: campaign.id,
        name: campaign.name,
        status: r.ok ? 'sent' : 'failed',
        sent: r.sent,
        failed: r.failed,
        reason: r.ok ? undefined : (r.error || 'Erreur'),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('cron-sms-campaigns-scheduled', err, { campaign_id: campaign.id })
      results.push({ id: campaign.id, name: campaign.name, status: 'failed', reason: msg })
    }
  }

  await logger.flush()
  return NextResponse.json({ ok: true, processed: results.length, results, base_url: baseUrl })
}
