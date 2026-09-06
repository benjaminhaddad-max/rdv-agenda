/**
 * Envoi des confirmations événement avec les templates plateforme
 * (mêmes HTML que l’aperçu CRM / Events Studio) via Brevo + SMS Factor.
 *
 * Remplace l’edge `send-pending-confirmations` qui n’envoyait qu’une phrase brute.
 */

import { sendBrevoEmail } from '@/lib/brevo'
import { createEventsClient } from '@/lib/events-studio/client'
import { defaultEmailSubject, defaultSmsBody, type EmailValue } from '@/lib/events-studio/comms-defaults'
import { eventHasComms, type EventBrand } from '@/lib/events-studio/config'
import { brandSender, buildEmailHtmlPreview } from '@/lib/events-studio/email-html-preview'
import { sendSms } from '@/lib/smsfactor'
import { logger } from '@/lib/logger'

export type SendConfirmationsOptions = {
  /** Renvoie l’email template même si une confirmation email a déjà été loggée (sans renvoyer le SMS). */
  forceEmail?: boolean
  /** N’envoie que les emails (pas de SMS). */
  emailOnly?: boolean
  /** Limite le nombre d’inscrits traités (debug). */
  limit?: number
  /** Si défini, n’envoie qu’à cette adresse (test). */
  onlyEmail?: string
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

async function fetchAllRegistrations(eventId: string) {
  const db = createEventsClient()
  const rows: Array<{
    id: string
    email: string | null
    phone: string | null
    first_name: string | null
    last_name: string | null
  }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('registrations')
      .select('id, email, phone, first_name, last_name')
      .eq('event_id', eventId)
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function fetchSentConfirmationIds(eventId: string) {
  const db = createEventsClient()
  const emailIds = new Set<string>()
  const smsIds = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('sent_reminders')
      .select('registration_id, channel')
      .eq('event_id', eventId)
      .eq('reminder_type', 'confirmation')
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

async function markSent(
  eventId: string,
  registrationId: string,
  channel: 'email' | 'sms',
) {
  const db = createEventsClient()
  await db.from('sent_reminders').insert({
    event_id: eventId,
    registration_id: registrationId,
    reminder_type: 'confirmation',
    channel,
  })
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

  const confEmailVal = (ev.custom_emails?.confirmation || {}) as EmailValue
  const subject =
    (confEmailVal.subject || '').trim() || defaultEmailSubject(ev, 'confirmation')
  const customBody = (confEmailVal.body || '').trim()
  const smsTemplate =
    (ev.custom_sms?.confirmation || '').trim() || defaultSmsBody(ev, 'confirmation')

  const previewEv = {
    name: ev.name,
    article: ev.article,
    event_date: ev.event_date,
    event_time_end: ev.event_time_end,
    location: ev.location,
    zoom_join_url: ev.zoom_join_url,
    event_type: ev.event_type,
    brand: (ev.brand || 'diploma') as EventBrand,
    brief: ev.brief,
  }

  const senderEmail = brandSender(ev.brand)
  const senderName = brandSenderName(ev.brand)
  const smsSender = smsSenderFor(ev)
  const smsEnabled = !!ev.sms_factor_enabled && !opts.emailOnly

  let regs = await fetchAllRegistrations(eventId)
  if (opts.onlyEmail) {
    const want = opts.onlyEmail.trim().toLowerCase()
    regs = regs.filter((r) => (r.email || '').trim().toLowerCase() === want)
  }
  if (opts.limit && opts.limit > 0) regs = regs.slice(0, opts.limit)

  const { emailIds, smsIds } = await fetchSentConfirmationIds(eventId)

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

        const needEmail =
          !!email && (opts.forceEmail || !emailIds.has(reg.id))
        const needSms = smsEnabled && !!phone && !smsIds.has(reg.id)

        if (!needEmail && !needSms) {
          result.skipped++
          result.details.push({ email: email || phone || reg.id, action: 'already_confirmed' })
          return
        }

        if (needEmail) {
          try {
            const html = buildEmailHtmlPreview(previewEv, 'confirmation', customBody, {
              prenom,
              participantName,
            })
            await sendBrevoEmail({
              sender: { email: senderEmail, name: senderName },
              to: [{ email, name: participantName }],
              subject,
              htmlContent: html,
              tags: ['events-confirmation', `event:${eventId}`],
            })
            const wasAlready = emailIds.has(reg.id)
            if (!wasAlready) {
              await markSent(eventId, reg.id, 'email')
              emailIds.add(reg.id)
            }
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
            logger.error('send-confirmations email', e, { event_id: eventId, email })
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
              await markSent(eventId, reg.id, 'sms')
              smsIds.add(reg.id)
              result.sms_sent++
              result.sent++
              result.details.push({ email: email || phone, action: 'sms_sent' })
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            result.errors.push(`${phone}: ${msg}`)
            result.details.push({ email: email || phone, action: 'sms_error' })
            logger.error('send-confirmations sms', e, { event_id: eventId, phone })
          }
        }
      }),
    )
  }

  result.success = result.errors.length === 0
  return result
}
