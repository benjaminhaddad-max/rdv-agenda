/**
 * GET /api/cron/timeslot-survey-nouveaux
 *
 * Envoi automatique du SMS « choisissez votre créneau » aux personnes qui
 * s'inscrivent au salon après la campagne de masse. Chacune le reçoit quelques
 * minutes après son inscription, avec son lien personnalisé.
 *
 * Le texte bascule tout seul : « le salon de demain » la veille, « le salon
 * c'est aujourd'hui » le jour J (heure de Paris).
 *
 * Planifié toutes les minutes via vercel.json. Sécurisé par CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { resolveTrackedLinkDestination } from '@/lib/hermione-orientation-link'
import { detectUrls, replaceUrlsWithShortPlaceholder, sendSms } from '@/lib/smsfactor'
import {
  ensureTimeslotSurveyForm,
  getTimeslotDrip,
  getTimeslotRelance,
  getTimeslotSurveyCampaignId,
  isSalonDay,
  resolveTimeslotDripTargets,
  saveTimeslotDrip,
  timeslotSurveyPublicUrl,
} from '@/lib/event-timeslot-survey'

export const maxDuration = 300

/** Le flux est un filet d'eau (~2 inscriptions/heure) : un petit lot suffit. */
const CHUNK = 40
const CAMPAIGN_NAME = 'Salon médecine 19/09 — créneau nouveaux inscrits'

function makeToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function baseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  const host = req.headers.get('host')
  return host ? `${req.headers.get('x-forwarded-proto') ?? 'https'}://${host}` : 'http://localhost:3000'
}

function capitalize(value: string): string {
  const clean = value.trim()
  if (!clean) return ''
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const drip = await getTimeslotDrip()
  if (!drip || !drip.enabled) {
    return NextResponse.json({ ok: true, skipped: 'envoi auto désactivé' })
  }

  const db = createServiceClient()
  const form = await ensureTimeslotSurveyForm()
  const publicUrl = timeslotSurveyPublicUrl()

  const today = isSalonDay()
  const rawTemplate = today ? drip.smsAujourdhui : drip.smsDemain
  const template = rawTemplate.includes('{lien1}') ? rawTemplate : `${rawTemplate.trim()} {lien1}`

  const relance = await getTimeslotRelance()
  const targets = await resolveTimeslotDripTargets({
    drip,
    formId: form.id,
    alreadySentCampaignIds: [await getTimeslotSurveyCampaignId(), relance?.campaignId],
  })
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, variante: today ? 'aujourdhui' : 'demain' })
  }

  // Campagne créée au premier envoi seulement : elle sert de journal et de
  // garde-fou anti-doublon pour les passages suivants.
  let campaignId = drip.campaignId ?? null
  if (!campaignId) {
    const { data, error } = await db
      .from('sms_campaigns')
      .insert({
        name: CAMPAIGN_NAME,
        message: template,
        sender: 'Diploma',
        campaign_type: 'alert',
        shorten_links: true,
        tracked_links: [{ placeholder: '{lien1}', url: publicUrl, label: 'Choix du créneau', tracked: true }],
        segment_ids: [],
        filters: {},
        filter_groups: [],
        manual_contact_ids: [],
        manual_phones: [],
        status: 'sending',
      })
      .select('id')
      .single()
    if (error || !data?.id) {
      return NextResponse.json({ error: error?.message || 'campagne non créée' }, { status: 500 })
    }
    campaignId = String(data.id)
    await saveTimeslotDrip({ campaignId })
  }

  const batch = targets.slice(0, CHUNK)
  const base = baseUrl(req)
  let sent = 0
  let failed = 0

  for (const target of batch) {
    const firstname = capitalize(target.firstname || '')
    const rendered = template.replace(/\{(\w+)\}/g, (m, key) =>
      key === 'prenom' || key === 'firstname' ? firstname : m,
    )

    const { data: recipient, error: recErr } = await db
      .from('sms_campaign_recipients')
      .insert({
        campaign_id: campaignId,
        hubspot_contact_id: target.contactId,
        phone: target.phone,
        firstname: firstname || null,
        rendered_message: rendered,
        status: 'pending',
      })
      .select('id')
      .single()
    if (recErr || !recipient?.id) {
      failed += 1
      continue
    }

    // Sans fiche CRM, on envoie le lien nu : la page demande alors nom et email.
    const destination = target.contactId
      ? resolveTrackedLinkDestination(publicUrl, {
          hubspot_contact_id: target.contactId,
          firstname: target.firstname,
          lastname: target.lastname,
          email: target.email,
          phone: target.phone,
        })
      : publicUrl

    const token = makeToken()
    await db.from('sms_campaign_link_tokens').insert({
      token,
      campaign_id: campaignId,
      recipient_id: recipient.id,
      placeholder: '{lien1}',
      label: 'Choix du créneau',
      original_url: destination,
    })

    let textToSend = rendered.split('{lien1}').join(`${base}/r/${token}`)
    let shortenLinksOpt: { urls: string[] } | undefined
    if (detectUrls(textToSend).length > 0) {
      const transformed = replaceUrlsWithShortPlaceholder(textToSend)
      textToSend = transformed.text
      shortenLinksOpt = { urls: transformed.urls }
    }

    try {
      const result = await sendSms(target.phone, textToSend, {
        sender: 'Diploma',
        pushtype: 'alert',
        shortenLinks: shortenLinksOpt,
      })
      if (result.ok) {
        sent += 1
        await db
          .from('sms_campaign_recipients')
          .update({ status: 'sent', sms_factor_ticket: result.ticket || null, sent_at: new Date().toISOString() })
          .eq('id', recipient.id)
      } else {
        failed += 1
        await db
          .from('sms_campaign_recipients')
          .update({ status: 'failed', error_message: result.error || 'Erreur inconnue' })
          .eq('id', recipient.id)
      }
    } catch (e) {
      failed += 1
      await db
        .from('sms_campaign_recipients')
        .update({ status: 'failed', error_message: e instanceof Error ? e.message : String(e) })
        .eq('id', recipient.id)
    }

    await new Promise((r) => setTimeout(r, 100))
  }

  if (sent > 0 || failed > 0) {
    const { count } = await db
      .from('sms_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')
    await db
      .from('sms_campaigns')
      .update({ message: template, sent_count: count ?? 0, sent_at: new Date().toISOString() })
      .eq('id', campaignId)
    logger.info('timeslot-nouveaux', 'lot traité', {
      campaign_id: campaignId,
      variante: today ? 'aujourdhui' : 'demain',
      sent,
      failed,
      restant: targets.length - batch.length,
    })
    await logger.flush()
  }

  return NextResponse.json({
    ok: true,
    variante: today ? 'aujourdhui' : 'demain',
    sent,
    failed,
    remaining: targets.length - batch.length,
  })
}
