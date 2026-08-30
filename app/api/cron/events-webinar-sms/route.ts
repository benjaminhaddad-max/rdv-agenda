/**
 * GET /api/cron/events-webinar-sms
 *
 * SMS « X min avant » pour les webinaires Events (j-0-10min).
 * Planifié toutes les 5 minutes.
 *
 * Fenêtre : démarrage dans [minutes_before − 2, minutes_before + 3] (défaut 10).
 * Horaires custom via custom_emails._schedule.j-0-10min.
 * Déduplication via Events.sent_reminders (reminder_type=j-0-10min, channel=sms).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createEventsClient } from '@/lib/events-studio/client'
import { defaultSmsBody } from '@/lib/events-studio/comms-defaults'
import { extractCommsSchedule, minutesBeforeForStep } from '@/lib/events-studio/comms-schedule'
import { sendSms } from '@/lib/smsform'

const REMINDER_TYPE = 'j-0-10min'
/** Couvre jusqu’à 3 h avant le début (minutes_before max raisonnable). */
const LOOKAHEAD_MS = 3 * 60 * 60 * 1000

function personalize(template: string, firstName: string): string {
  const prenom = (firstName || '').trim() || 'Bonjour'
  return template.replace(/\{prenom\}/gi, prenom)
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const now = Date.now()
  const horizonEnd = new Date(now + LOOKAHEAD_MS).toISOString()
  const horizonStart = new Date(now + 1 * 60 * 1000).toISOString()

  const db = createEventsClient()

  const { data: events, error: evErr } = await db
    .from('events')
    .select(
      'id, name, article, brand, event_type, event_date, event_time_end, zoom_join_url, custom_sms, custom_emails, sms_sender, sms_push_type, sms_stop, status',
    )
    .eq('status', 'published')
    .eq('event_type', 'webinaire')
    .gte('event_date', horizonStart)
    .lte('event_date', horizonEnd)

  if (evErr) {
    return NextResponse.json({ error: evErr.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0
  const details: Array<{
    event_id: string
    name: string
    minutes_before: number
    in_window: boolean
    sent: number
    skipped: number
  }> = []

  for (const ev of events || []) {
    const schedule = extractCommsSchedule(ev.custom_emails)
    const minutesBefore = minutesBeforeForStep(schedule, REMINDER_TYPE)
    const eventAt = new Date(ev.event_date).getTime()
    const sendAt = eventAt - minutesBefore * 60 * 1000
    // Fenêtre large de ±2.5 min autour de l’instant cible (cron toutes les 5 min)
    const inWindow = now >= sendAt - 2 * 60 * 1000 && now <= sendAt + 3 * 60 * 1000

    if (!inWindow) {
      details.push({
        event_id: ev.id,
        name: ev.name,
        minutes_before: minutesBefore,
        in_window: false,
        sent: 0,
        skipped: 0,
      })
      continue
    }

    const { data: regs } = await db
      .from('registrations')
      .select('id, first_name, phone, email')
      .eq('event_id', ev.id)
      .limit(5000)

    if (!regs?.length) {
      details.push({
        event_id: ev.id,
        name: ev.name,
        minutes_before: minutesBefore,
        in_window: true,
        sent: 0,
        skipped: 0,
      })
      continue
    }

    const { data: already } = await db
      .from('sent_reminders')
      .select('registration_id')
      .eq('event_id', ev.id)
      .eq('reminder_type', REMINDER_TYPE)
      .eq('channel', 'sms')

    const done = new Set((already || []).map((r) => r.registration_id))

    const zoom = (ev.zoom_join_url || '').trim()
    let template =
      (ev.custom_sms && typeof ev.custom_sms === 'object' && ev.custom_sms[REMINDER_TYPE]) ||
      defaultSmsBody(
        {
          name: ev.name,
          article: ev.article,
          event_date: ev.event_date,
          event_time_end: ev.event_time_end,
          zoom_join_url: ev.zoom_join_url,
          event_type: ev.event_type,
          brand: ev.brand,
        },
        REMINDER_TYPE,
      )

    if (zoom && !template.includes(zoom)) {
      template = `${template.trim()} ${zoom}`
    }
    if (ev.sms_stop && !/\bSTOP\b/i.test(template)) {
      template = `${template.trim()} STOP au 36180`
    }

    const sender =
      (ev.sms_sender || (ev.brand === 'edumove' ? 'EDUMOVE' : ev.brand === 'medibox' ? 'MEDIBOX' : 'DIPLOMA'))
        .toString()
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 11) || 'DIPLOMA'

    let eventSent = 0
    let eventSkipped = 0

    for (const reg of regs) {
      if (done.has(reg.id)) {
        eventSkipped++
        continue
      }
      if (!reg.phone) {
        eventSkipped++
        continue
      }

      const text = personalize(template, reg.first_name || '')
      const result = await sendSms(reg.phone, text, {
        sender,
        pushtype: ev.sms_push_type === 0 ? 'marketing' : 'alert',
        autoShorten: true,
      })

      if (result.ok) {
        await db.from('sent_reminders').insert({
          event_id: ev.id,
          registration_id: reg.id,
          reminder_type: REMINDER_TYPE,
          channel: 'sms',
        })
        eventSent++
        sent++
      } else {
        eventSkipped++
        skipped++
      }
    }

    details.push({
      event_id: ev.id,
      name: ev.name,
      minutes_before: minutesBefore,
      in_window: true,
      sent: eventSent,
      skipped: eventSkipped,
    })
  }

  return NextResponse.json({
    success: true,
    horizon: { start: horizonStart, end: horizonEnd },
    events: (events || []).length,
    sent,
    skipped,
    details,
  })
}
