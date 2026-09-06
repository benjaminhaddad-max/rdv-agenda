/**
 * Envoi des communications événement (confirmations + rappels)
 * avec les templates HTML / SMS de la plateforme Events (aperçu CRM).
 *
 * Idempotence plateforme : Redis `events:platform-comms:*`
 * (Events.sent_reminders a un CHECK trop strict pour un type dédié).
 * On marque aussi sent_reminders (types autorisés) pour que l’edge legacy skip.
 */

import { getRedisClient } from '@/lib/cache'
import { sendBrevoEmail } from '@/lib/brevo'
import { createEventsClient } from '@/lib/events-studio/client'
import {
  defaultEmailBody,
  defaultEmailSubject,
  defaultSmsBody,
  type EmailValue,
} from '@/lib/events-studio/comms-defaults'
import {
  computeSendAt,
  extractCommsSchedule,
  resolveSchedule,
} from '@/lib/events-studio/comms-schedule'
import { emailStepsFor, smsStepsFor } from '@/lib/events-studio/comms-steps'
import { eventHasComms, type EventBrand } from '@/lib/events-studio/config'
import { brandSender, buildEmailHtmlPreview } from '@/lib/events-studio/email-html-preview'
import { sendSms } from '@/lib/smsfactor'
import { logger } from '@/lib/logger'

export type SendConfirmationsOptions = {
  forceEmail?: boolean
  emailOnly?: boolean
  limit?: number
  onlyEmail?: string
  forceEmailRegistrationIds?: string[]
}

export type SendConfirmationsResult = {
  success: boolean
  total: number
  sent: number
  emails_sent: number
  sms_sent: number
  skipped: number
  errors: string[]
  details: Array<{ email: string; action: string }>
}

type RegRow = {
  id: string
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  qr_code: string | null
}

function brandSenderName(brand?: string | null): string {
  if (brand === 'edumove') return 'Edumove'
  if (brand === 'medibox') return 'Medibox'
  return 'Diploma Santé'
}

function smsSenderFor(ev: { brand?: string | null; sms_sender?: string | null }): string {
  const raw = (ev.sms_sender || '').trim()
  if (raw) return raw.slice(0, 11)
  if (ev.brand === 'edumove') return 'EDUMOVE'
  if (ev.brand === 'medibox') return 'MEDIBOX'
  return 'DIPLOMA'
}

function platformRedisKey(eventId: string, stepId: string, channel: 'email' | 'sms') {
  return `events:platform-comms:${eventId}:${stepId}:${channel}`
}

async function fetchPlatformSentIds(
  eventId: string,
  stepId: string,
  channel: 'email' | 'sms',
): Promise<Set<string>> {
  const redis = getRedisClient()
  if (!redis) return new Set()
  try {
    const members = await redis.smembers(platformRedisKey(eventId, stepId, channel))
    return new Set((members || []).map(String))
  } catch {
    return new Set()
  }
}

async function markPlatformSent(
  eventId: string,
  registrationId: string,
  stepId: string,
  channel: 'email' | 'sms',
) {
  const redis = getRedisClient()
  if (!redis) return
  try {
    const key = platformRedisKey(eventId, stepId, channel)
    await redis.sadd(key, registrationId)
    await redis.expire(key, 180 * 24 * 60 * 60)
  } catch (e) {
    logger.error('markPlatformSent redis', e, { eventId, stepId, channel })
  }
}

async function fetchAllRegistrations(eventId: string): Promise<RegRow[]> {
  const db = createEventsClient()
  const rows: RegRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('registrations')
      .select('id, email, phone, first_name, last_name, qr_code')
      .eq('event_id', eventId)
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function fetchLegacySentIds(eventId: string, reminderType: string) {
  const db = createEventsClient()
  const emailIds = new Set<string>()
  const smsIds = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('sent_reminders')
      .select('registration_id, channel')
      .eq('event_id', eventId)
      .eq('reminder_type', reminderType)
      .range(from, from + 999)
    if (error) throw error
    for (const r of data || []) {
      if (r.channel === 'email') emailIds.add(r.registration_id)
      if (r.channel === 'sms') smsIds.add(r.registration_id)
    }
    if (!data || data.length < 1000) break
  }
  return { emailIds, smsIds }
}

async function markLegacySent(
  eventId: string,
  registrationId: string,
  reminderType: string,
  channel: 'email' | 'sms',
) {
  const db = createEventsClient()
  const { data: existing } = await db
    .from('sent_reminders')
    .select('id')
    .eq('event_id', eventId)
    .eq('registration_id', registrationId)
    .eq('reminder_type', reminderType)
    .eq('channel', channel)
    .limit(1)
  if (existing?.length) return
  const { error } = await db.from('sent_reminders').insert({
    event_id: eventId,
    registration_id: registrationId,
    reminder_type: reminderType,
    channel,
  })
  if (error && !/duplicate|unique|23505/i.test(error.message)) {
    logger.error('markLegacySent', error, { eventId, reminderType, channel })
  }
}

/** Efface les marquages confirmation email Events (stubs) pour des registrations. */
export async function clearConfirmationEmailMarks(eventId: string, registrationIds: string[]) {
  if (registrationIds.length === 0) return
  const db = createEventsClient()
  for (let i = 0; i < registrationIds.length; i += 100) {
    const chunk = registrationIds.slice(i, i + 100)
    await db
      .from('sent_reminders')
      .delete()
      .eq('event_id', eventId)
      .eq('reminder_type', 'confirmation')
      .eq('channel', 'email')
      .in('registration_id', chunk)
  }
}

function previewFromEvent(ev: Record<string, unknown>) {
  return {
    name: ev.name as string,
    article: ev.article as string | null,
    event_date: ev.event_date as string,
    event_time_end: ev.event_time_end as string | null,
    location: ev.location as string | null,
    zoom_join_url: ev.zoom_join_url as string | null,
    event_type: ev.event_type as string | null,
    brand: ((ev.brand as string) || 'diploma') as EventBrand,
    brief: ev.brief as string | null,
  }
}

async function sendStepToRegistrations(params: {
  eventId: string
  ev: Record<string, unknown>
  stepId: string
  regs: RegRow[]
  forceEmail?: boolean
  forceEmailRegistrationIds?: Set<string>
  emailOnly?: boolean
}): Promise<SendConfirmationsResult> {
  const { eventId, ev, stepId, regs, forceEmail, forceEmailRegistrationIds, emailOnly } = params
  const customEmails = (ev.custom_emails || {}) as Record<string, EmailValue>
  const customSms = (ev.custom_sms || {}) as Record<string, string>
  const emailVal = (customEmails[stepId] || {}) as EmailValue
  const subject =
    (emailVal.subject || '').trim() || defaultEmailSubject(previewFromEvent(ev), stepId)
  const customBody =
    (emailVal.body || '').trim() ||
    (stepId === 'confirmation' ? '' : defaultEmailBody(previewFromEvent(ev), stepId))
  const smsTemplate =
    (customSms[stepId] || '').trim() || defaultSmsBody(previewFromEvent(ev), stepId)

  const previewEv = previewFromEvent(ev)
  const senderEmail = brandSender(ev.brand as string)
  const senderName = brandSenderName(ev.brand as string)
  const smsSender = smsSenderFor(ev as { brand?: string; sms_sender?: string })
  const smsEnabled = !!ev.sms_factor_enabled && !emailOnly

  const emailSteps = new Set(emailStepsFor(previewEv).map((s) => s.id))
  const smsSteps = new Set(smsStepsFor(previewEv).map((s) => s.id))
  const sendEmailChannel = emailSteps.has(stepId)
  const sendSmsChannel = smsSteps.has(stepId) && smsEnabled

  const [platformEmailIds, platformSmsIds, legacy] = await Promise.all([
    fetchPlatformSentIds(eventId, stepId, 'email'),
    fetchPlatformSentIds(eventId, stepId, 'sms'),
    fetchLegacySentIds(eventId, stepId),
  ])
  const emailIds = platformEmailIds
  const smsIds = new Set([...platformSmsIds, ...legacy.smsIds])

  const result: SendConfirmationsResult = {
    success: true,
    total: regs.length,
    sent: 0,
    emails_sent: 0,
    sms_sent: 0,
    skipped: 0,
    errors: [],
    details: [],
  }

  const CONCURRENCY = 4
  for (let i = 0; i < regs.length; i += CONCURRENCY) {
    const chunk = regs.slice(i, i + CONCURRENCY)
    await Promise.all(
      chunk.map(async (reg) => {
        const email = (reg.email || '').trim().toLowerCase()
        const phone = (reg.phone || '').trim()
        const prenom = (reg.first_name || '').trim() || 'Bonjour'
        const participantName =
          [reg.first_name, reg.last_name].filter(Boolean).join(' ').trim() || prenom

        const forceThis =
          !!forceEmail || (!!forceEmailRegistrationIds && forceEmailRegistrationIds.has(reg.id))
        const needEmail = sendEmailChannel && !!email && (forceThis || !emailIds.has(reg.id))
        const needSms = sendSmsChannel && !!phone && !smsIds.has(reg.id)

        if (!needEmail && !needSms) {
          result.skipped++
          result.details.push({ email: email || phone || reg.id, action: 'already_sent' })
          return
        }

        if (needEmail) {
          try {
            const html = buildEmailHtmlPreview(previewEv, stepId, customBody, {
              prenom,
              participantName,
              qrCode: reg.qr_code,
            })
            await sendBrevoEmail({
              sender: { email: senderEmail, name: senderName },
              to: [{ email, name: participantName }],
              subject,
              htmlContent: html,
              tags: [`events-${stepId}`, `event:${eventId}`, 'events-platform-template'],
            })
            const wasAlready = emailIds.has(reg.id)
            await markPlatformSent(eventId, reg.id, stepId, 'email')
            await markLegacySent(eventId, reg.id, stepId, 'email')
            emailIds.add(reg.id)
            result.emails_sent++
            result.sent++
            result.details.push({
              email,
              action: wasAlready ? 'email_resent' : 'email_sent',
            })
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            result.errors.push(`${email}: ${msg}`)
            result.details.push({ email, action: 'email_error' })
            logger.error('send-event-comms email', e, { event_id: eventId, stepId, email })
          }
        }

        if (needSms) {
          try {
            const text = smsTemplate.replace(/\{prenom\}/gi, prenom)
            const smsRes = await sendSms(phone, text, {
              sender: smsSender,
              pushtype: 'alert',
            })
            if (smsRes?.ok === false) {
              result.errors.push(`${phone}: ${smsRes.error || 'sms failed'}`)
              result.details.push({ email: email || phone, action: 'sms_error' })
            } else {
              await markPlatformSent(eventId, reg.id, stepId, 'sms')
              await markLegacySent(eventId, reg.id, stepId, 'sms')
              smsIds.add(reg.id)
              result.sms_sent++
              result.sent++
              result.details.push({ email: email || phone, action: 'sms_sent' })
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            result.errors.push(`${phone}: ${msg}`)
            result.details.push({ email: email || phone, action: 'sms_error' })
            logger.error('send-event-comms sms', e, { event_id: eventId, stepId, phone })
          }
        }
      }),
    )
  }

  result.success = result.errors.length === 0
  return result
}

export async function sendEventPendingConfirmations(
  eventId: string,
  opts: SendConfirmationsOptions = {},
): Promise<SendConfirmationsResult> {
  const db = createEventsClient()
  const { data: ev, error: evErr } = await db.from('events').select('*').eq('id', eventId).single()
  if (evErr || !ev) {
    return {
      success: false,
      total: 0,
      sent: 0,
      emails_sent: 0,
      sms_sent: 0,
      skipped: 0,
      errors: [evErr?.message || 'Event not found'],
      details: [],
    }
  }
  if (!eventHasComms(ev)) {
    return {
      success: true,
      total: 0,
      sent: 0,
      emails_sent: 0,
      sms_sent: 0,
      skipped: 0,
      errors: [],
      details: [{ email: '-', action: 'no_comms' }],
    }
  }

  let regs = await fetchAllRegistrations(eventId)
  if (opts.onlyEmail) {
    const want = opts.onlyEmail.trim().toLowerCase()
    regs = regs.filter((r) => (r.email || '').trim().toLowerCase() === want)
  }
  if (opts.limit && opts.limit > 0) regs = regs.slice(0, opts.limit)

  return sendStepToRegistrations({
    eventId,
    ev,
    stepId: 'confirmation',
    regs,
    forceEmail: opts.forceEmail,
    forceEmailRegistrationIds: opts.forceEmailRegistrationIds
      ? new Set(opts.forceEmailRegistrationIds)
      : undefined,
    emailOnly: opts.emailOnly,
  })
}

const REMINDER_LOOKBACK_MS = 25 * 60 * 1000
const REMINDER_GRACE_MS = 2 * 60 * 1000

export type DueRemindersResult = {
  success: boolean
  events: number
  steps_sent: number
  emails_sent: number
  sms_sent: number
  errors: string[]
  details: Array<{ event_id: string; step: string; emails: number; sms: number }>
}

export async function sendDueEventReminders(now = new Date()): Promise<DueRemindersResult> {
  const db = createEventsClient()
  const { data: events, error } = await db
    .from('events')
    .select('*')
    .eq('status', 'published')
    .gte('event_date', new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString())
    .limit(200)

  if (error) {
    return {
      success: false,
      events: 0,
      steps_sent: 0,
      emails_sent: 0,
      sms_sent: 0,
      errors: [error.message],
      details: [],
    }
  }

  const out: DueRemindersResult = {
    success: true,
    events: 0,
    steps_sent: 0,
    emails_sent: 0,
    sms_sent: 0,
    errors: [],
    details: [],
  }

  const nowMs = now.getTime()

  for (const ev of events || []) {
    if (!eventHasComms(ev)) continue
    out.events++
    const previewEv = previewFromEvent(ev)
    const schedule = extractCommsSchedule(ev.custom_emails)
    const stepIds = new Set([
      ...emailStepsFor(previewEv).map((s) => s.id),
      ...smsStepsFor(previewEv).map((s) => s.id),
    ])
    stepIds.delete('confirmation')

    let regs: RegRow[] | null = null

    for (const stepId of stepIds) {
      const entry = resolveSchedule(schedule, stepId)
      const sendAt = computeSendAt(String(ev.event_date), entry)
      if (!sendAt) continue
      const t = sendAt.getTime()
      if (t > nowMs + REMINDER_GRACE_MS) continue
      if (t < nowMs - REMINDER_LOOKBACK_MS) continue

      if (!regs) regs = await fetchAllRegistrations(ev.id)
      const result = await sendStepToRegistrations({
        eventId: ev.id,
        ev,
        stepId,
        regs,
      })
      if (result.emails_sent > 0 || result.sms_sent > 0) {
        out.steps_sent++
        out.emails_sent += result.emails_sent
        out.sms_sent += result.sms_sent
        out.details.push({
          event_id: ev.id,
          step: stepId,
          emails: result.emails_sent,
          sms: result.sms_sent,
        })
      }
      if (result.errors.length) {
        out.errors.push(...result.errors.map((e) => `${ev.id}/${stepId}: ${e}`))
      }
    }
  }

  out.success = out.errors.length === 0
  return out
}

export async function sendPendingConfirmationsForPublishedEvents(): Promise<{
  events: number
  emails_sent: number
  sms_sent: number
  errors: string[]
}> {
  const db = createEventsClient()
  const { data: events, error } = await db
    .from('events')
    .select('id, status, event_type, brand, zoom_join_url, event_date')
    .eq('status', 'published')
    .gte('event_date', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
    .limit(200)

  if (error) return { events: 0, emails_sent: 0, sms_sent: 0, errors: [error.message] }

  let emails_sent = 0
  let sms_sent = 0
  const errors: string[] = []
  let n = 0
  for (const ev of events || []) {
    if (!eventHasComms(ev)) continue
    n++
    const r = await sendEventPendingConfirmations(ev.id)
    emails_sent += r.emails_sent
    sms_sent += r.sms_sent
    errors.push(...r.errors.map((e) => `${ev.id}: ${e}`))
  }
  return { events: n, emails_sent, sms_sent, errors }
}
