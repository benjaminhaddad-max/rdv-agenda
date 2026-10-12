/**
 * GET /api/cron/ads-creatives-reminders — tous les jours ~9 h.
 * Pour chaque événement à venir (hors annulé / « pas de campagne ») dont une colonne
 * de créas (statique / vidéo) est encore vide : SMS au responsable à J-3, J-2, J-1
 * avant la deadline créas, le jour J, puis chaque jour de retard jusqu'au lancement.
 * Colonne Ads Manager : SMS au responsable Ads le jour du lancement puis chaque jour
 * tant que la campagne n'est pas cochée « en ligne » (jusqu'à l'événement).
 * Une seule relance par événement / colonne / jour (event_ad_creative_reminders).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { sendSms } from '@/lib/smsfactor'
import { loadAdsEvents, loadSettings, shareLink } from '@/lib/ads-creatives-server'
import { CREATIVE_ROLES, adsReminderText, diffDays, parisDay, reminderText } from '@/lib/ads-creatives'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  const db = createServiceClient()
  try {
    const settings = await loadSettings(db)
    if (!settings.reminders_enabled && !dryRun) return NextResponse.json({ ok: true, skipped: 'relances désactivées' })

    const today = parisDay()
    const events = await loadAdsEvents(db, { fromDay: today })
    const link = shareLink(settings.share_token)

    const { data: already } = await db
      .from('event_ad_creative_reminders')
      .select('event_id, role')
      .eq('sent_on', today)
      .eq('ok', true)
    const done = new Set((already || []).map((r) => `${r.event_id}:${r.role}`))

    const sent: Array<{ event: string; role: string; days_left: number; ok: boolean; text: string; error?: string }> = []
    for (const ev of events) {
      if (ev.no_campaign) continue
      for (const role of CREATIVE_ROLES) {
        if (ev.items.some((i) => i.role === role)) continue
        if (done.has(`${ev.id}:${role}`)) continue
        const phone = role === 'static' ? settings.static_owner_phone : settings.video_owner_phone
        const ownerName = role === 'static' ? settings.static_owner_name : settings.video_owner_name
        const daysLeft = diffDays(today, ev.creas_deadline)
        const text = reminderText({
          role,
          ownerName,
          eventName: ev.name,
          eventDay: ev.day,
          location: ev.location,
          daysLeft,
          campaignStart: ev.campaign_start,
          today,
          link,
        })
        if (!text) continue
        if (dryRun) {
          sent.push({ event: ev.name, role, days_left: daysLeft, ok: true, text })
          continue
        }
        if (!phone) {
          sent.push({ event: ev.name, role, days_left: daysLeft, ok: false, text, error: 'pas de numéro' })
          continue
        }
        const res = await sendSms(phone, text, { autoShorten: true })
        await db.from('event_ad_creative_reminders').upsert(
          { event_id: ev.id, role, sent_on: today, days_left: daysLeft, phone, ok: res.ok, error: res.error || null },
          { onConflict: 'event_id,role,sent_on' },
        )
        sent.push({ event: ev.name, role, days_left: daysLeft, ok: res.ok, text, error: res.error })
      }
    }
    // Colonne Ads Manager
    for (const ev of events) {
      if (ev.no_campaign || ev.launched_at || done.has(`${ev.id}:ads`)) continue
      const text = adsReminderText({
        ownerName: settings.ads_owner_name,
        eventName: ev.name,
        eventDay: ev.day,
        campaignStart: ev.campaign_start,
        today,
        link,
      })
      if (!text) continue
      const daysLeft = diffDays(today, ev.campaign_start)
      const phone = settings.ads_owner_phone
      if (dryRun || !phone) {
        sent.push({ event: ev.name, role: 'ads', days_left: daysLeft, ok: dryRun, text, error: dryRun ? undefined : 'pas de numéro' })
        continue
      }
      const res = await sendSms(phone, text, { autoShorten: true })
      await db.from('event_ad_creative_reminders').upsert(
        { event_id: ev.id, role: 'ads', sent_on: today, days_left: daysLeft, phone, ok: res.ok, error: res.error || null },
        { onConflict: 'event_id,role,sent_on' },
      )
      sent.push({ event: ev.name, role: 'ads', days_left: daysLeft, ok: res.ok, text, error: res.error })
    }

    return NextResponse.json({ ok: true, today, dryRun, count: sent.length, sent })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
