/**
 * GET /api/cron/timeslot-survey-relance
 *
 * Relance « dernière chance » des inscrits du salon qui n'ont pas encore choisi
 * leur créneau.
 *
 * Deux différences volontaires avec une campagne SMS programmée classique :
 *
 *  1. L'audience est recalculée à CHAQUE passage, jamais figée à la
 *     programmation. Quelqu'un qui répond avant l'heure d'envoi ne reçoit rien.
 *  2. L'envoi se fait par lots de CHUNK numéros. Un envoi de ~700 SMS
 *     personnalisés dépasse la limite de 300s d'une fonction Vercel : le cron
 *     repasse chaque minute et reprend là où il s'est arrêté.
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
  acquireTimeslotLock,
  ensureTimeslotSurveyForm,
  getTimeslotRelance,
  releaseTimeslotLock,
  getTimeslotSurveyCampaignId,
  resolveTimeslotRelanceTargets,
  saveTimeslotRelance,
  timeslotSurveyPublicUrl,
} from '@/lib/event-timeslot-survey'

export const maxDuration = 300

/** Assez petit pour tenir largement sous les 300s, assez gros pour finir vite. */
const CHUNK = 100
const RELANCE_NAME = 'Salon médecine 19/09 — relance créneau'

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

const LOCK = 'relance'

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  // Un seul passage à la fois : sans ce verrou, deux passages parallèles ont
  // envoyé 349 doublons le 18/09.
  if (!(await acquireTimeslotLock(LOCK, 4 * 60_000))) {
    return NextResponse.json({ ok: true, skipped: 'passage précédent encore en cours' })
  }
  try {
    return await run(req)
  } finally {
    await releaseTimeslotLock(LOCK)
  }
}

async function run(req: NextRequest) {
  const relance = await getTimeslotRelance()
  if (!relance) return NextResponse.json({ ok: true, skipped: 'aucune relance programmée' })
  if (relance.status === 'sent' || relance.status === 'cancelled') {
    return NextResponse.json({ ok: true, skipped: `relance ${relance.status}` })
  }

  const now = Date.now()
  const due = new Date(relance.scheduledAt).getTime()
  if (!Number.isFinite(due) || now < due) {
    return NextResponse.json({ ok: true, waiting_until: relance.scheduledAt })
  }

  const originCampaignId = await getTimeslotSurveyCampaignId()
  if (!originCampaignId) {
    return NextResponse.json({ error: 'campagne initiale introuvable' }, { status: 500 })
  }

  const db = createServiceClient()
  const form = await ensureTimeslotSurveyForm()
  const sms = relance.sms.includes('{lien1}') ? relance.sms : `${relance.sms.trim()} {lien1}`
  const publicUrl = timeslotSurveyPublicUrl()

  // Campagne de relance créée au premier lot seulement.
  let relanceCampaignId = relance.campaignId ?? null
  if (!relanceCampaignId) {
    const { data, error } = await db
      .from('sms_campaigns')
      .insert({
        name: RELANCE_NAME,
        message: sms,
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
      return NextResponse.json({ error: error?.message || 'campagne relance non créée' }, { status: 500 })
    }
    relanceCampaignId = String(data.id)
    await saveTimeslotRelance({
      campaignId: relanceCampaignId,
      status: 'sending',
      startedAt: new Date().toISOString(),
    })
  } else if (relance.status !== 'sending') {
    await saveTimeslotRelance({ status: 'sending', startedAt: new Date().toISOString() })
  }

  const targets = await resolveTimeslotRelanceTargets({
    originCampaignId,
    relanceCampaignId,
    formId: form.id,
  })

  if (targets.length === 0) {
    const { count } = await db
      .from('sms_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', relanceCampaignId)
      .eq('status', 'sent')
    await db
      .from('sms_campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: count ?? 0 })
      .eq('id', relanceCampaignId)
    await saveTimeslotRelance({ status: 'sent', finishedAt: new Date().toISOString() })
    return NextResponse.json({ ok: true, done: true, total_sent: count ?? 0 })
  }

  const batch = targets.slice(0, CHUNK)
  const ids = batch.map((t) => t.contactId)
  const { data: contactRows } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email, phone')
    .in('hubspot_contact_id', ids)
  const contactById = new Map((contactRows || []).map((c) => [String(c.hubspot_contact_id), c]))

  const base = baseUrl(req)
  let sent = 0
  let failed = 0

  for (const target of batch) {
    const contact = contactById.get(target.contactId)
    const firstname = contact?.firstname || target.firstname || ''
    const rendered = sms.replace(/\{(\w+)\}/g, (m, key) =>
      key === 'prenom' || key === 'firstname' ? firstname : m,
    )

    // Une ligne destinataire par contact : c'est elle qui garantit qu'on ne
    // relance pas deux fois la même personne si le cron repasse.
    const { data: recipient, error: recErr } = await db
      .from('sms_campaign_recipients')
      .insert({
        campaign_id: relanceCampaignId,
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

    const token = makeToken()
    const signedUrl = resolveTrackedLinkDestination(publicUrl, {
      hubspot_contact_id: target.contactId,
      firstname: contact?.firstname ?? firstname,
      lastname: contact?.lastname ?? null,
      email: contact?.email ?? null,
      phone: contact?.phone ?? target.phone,
    })
    await db.from('sms_campaign_link_tokens').insert({
      token,
      campaign_id: relanceCampaignId,
      recipient_id: recipient.id,
      placeholder: '{lien1}',
      label: 'Choix du créneau',
      original_url: signedUrl,
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

  logger.info('timeslot-relance', 'lot traité', {
    campaign_id: relanceCampaignId,
    sent,
    failed,
    restant: targets.length - batch.length,
  })
  await logger.flush()

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    remaining: targets.length - batch.length,
  })
}
