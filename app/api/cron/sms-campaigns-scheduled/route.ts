/**
 * GET /api/cron/sms-campaigns-scheduled
 *
 * Récupère les campagnes SMS dont le `scheduled_at` est passé et déclenche
 * leur envoi via /api/sms-campaigns/[id]/send.
 *
 * Pour les campagnes marketing, applique la fenêtre légale française
 * (8h–20h, Lundi–Samedi). Les campagnes hors fenêtre sont reportées au
 * prochain run.
 *
 * Planifié toutes les minutes via vercel.json.
 * Sécurisé par `Authorization: Bearer CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const maxDuration = 300

function isWithinMarketingWindow(date: Date): boolean {
  // Europe/Paris — approximation par UTC offset (Paris = UTC+1 hiver, UTC+2 été)
  // Pour rester correct toute l'année, on utilise toLocaleString avec timeZone.
  const parisStr = date.toLocaleString('en-US', {
    timeZone: 'Europe/Paris',
    hour: 'numeric', hour12: false,
    weekday: 'short',
  })
  // ex: "Mon, 14"
  const [weekdayPart, hourPart] = parisStr.split(',').map(s => s.trim())
  const hour = parseInt(hourPart, 10)
  const weekday = weekdayPart.toLowerCase() // mon, tue, wed, thu, fri, sat, sun
  if (weekday === 'sun') return false
  if (hour < 8 || hour >= 20) return false
  return true
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const now = new Date()

  // Cherche les campagnes scheduled dont l'heure est passée
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

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('host')}`

  const results: Array<{ id: string; name: string; status: string; reason?: string }> = []

  for (const campaign of due) {
    // Marketing : respect fenêtre 8h-20h L-S
    if (campaign.campaign_type === 'marketing' && !isWithinMarketingWindow(now)) {
      results.push({ id: campaign.id, name: campaign.name, status: 'deferred', reason: 'hors fenêtre marketing' })
      continue
    }

    try {
      const sendUrl = `${base.replace(/\/$/, '')}/api/sms-campaigns/${campaign.id}/send`
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      })
      const json = await res.json().catch(() => ({}))
      results.push({
        id: campaign.id,
        name: campaign.name,
        status: res.ok ? 'sent' : 'failed',
        reason: res.ok ? undefined : (json.error || `HTTP ${res.status}`),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ id: campaign.id, name: campaign.name, status: 'failed', reason: msg })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
