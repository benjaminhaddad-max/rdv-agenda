/**
 * Reprend l'envoi de la campagne SMS "choix du créneau" là où la fonction
 * Vercel a été coupée par sa limite de 300s.
 *
 * Ne cible QUE les destinataires encore en `pending` : les SMS déjà envoyés ne
 * sont jamais renvoyés. Chaque destinataire garde le lien unique qui avait
 * déjà été généré pour lui avant l'interruption.
 *
 *   bun scripts/resume-timeslot-sms-campaign.mjs          # simulation
 *   bun scripts/resume-timeslot-sms-campaign.mjs --go     # envoi réel
 */

import { readFileSync } from 'node:fs'

for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const GO = process.argv.includes('--go')
const BASE_URL = 'https://hub.diploma-sante.fr'

const { getTimeslotSurveyCampaignId } = await import('../lib/event-timeslot-survey.ts')
const { createServiceClient } = await import('../lib/supabase.ts')
const { sendSms, replaceUrlsWithShortPlaceholder, detectUrls } = await import('../lib/smsfactor.ts')

const db = createServiceClient()
const campaignId = await getTimeslotSurveyCampaignId()
if (!campaignId) {
  console.error('Aucune campagne enregistrée.')
  process.exit(1)
}

const { data: campaign } = await db
  .from('sms_campaigns')
  .select('id, name, status, sender, message, campaign_type, shorten_links')
  .eq('id', campaignId)
  .maybeSingle()
if (!campaign) {
  console.error('Campagne introuvable.')
  process.exit(1)
}

const { data: pending } = await db
  .from('sms_campaign_recipients')
  .select('id, phone, firstname, rendered_message')
  .eq('campaign_id', campaignId)
  .eq('status', 'pending')
  .order('id')
  .limit(5000)

const { data: sentRows } = await db
  .from('sms_campaign_recipients')
  .select('id')
  .eq('campaign_id', campaignId)
  .eq('status', 'sent')
  .limit(5000)

const { data: tokens } = await db
  .from('sms_campaign_link_tokens')
  .select('token, recipient_id, placeholder')
  .eq('campaign_id', campaignId)
  .limit(5000)

const tokenByRecipient = new Map()
for (const t of tokens || []) {
  if (t.recipient_id && t.placeholder) tokenByRecipient.set(`${t.recipient_id}|${t.placeholder}`, t.token)
}

console.log(`campagne     : ${campaign.name}`)
console.log(`statut       : ${campaign.status}`)
console.log(`déjà envoyés : ${(sentRows || []).length}  (jamais retouchés)`)
console.log(`à reprendre  : ${(pending || []).length}`)
console.log(`mode         : ${GO ? 'ENVOI RÉEL' : 'SIMULATION'}`)
console.log('')

const missingLink = []
const jobs = []
for (const r of pending || []) {
  const token = tokenByRecipient.get(`${r.id}|{lien1}`)
  if (!token) {
    missingLink.push(r.id)
    continue
  }
  const text = String(r.rendered_message || campaign.message).split('{lien1}').join(`${BASE_URL}/r/${token}`)
  jobs.push({ recipientId: r.id, phone: r.phone, firstname: r.firstname, text })
}

if (missingLink.length > 0) {
  console.log(`⚠ ${missingLink.length} destinataires sans lien généré — ignorés pour ne rien envoyer de cassé.`)
}

for (const j of jobs.slice(0, 3)) {
  console.log(`exemple → ${j.firstname} (${j.phone})`)
  console.log(`          ${j.text}`)
}
console.log('')

if (!GO) {
  console.log(`SIMULATION : ${jobs.length} SMS seraient envoyés. Relancer avec --go pour envoyer.`)
  process.exit(0)
}

let sent = 0
let failed = 0
for (const j of jobs) {
  try {
    let textToSend = j.text
    let shortenLinksOpt
    if (campaign.shorten_links !== false && detectUrls(textToSend).length > 0) {
      const transformed = replaceUrlsWithShortPlaceholder(textToSend)
      textToSend = transformed.text
      shortenLinksOpt = { urls: transformed.urls }
    }

    const result = await sendSms(j.phone, textToSend, {
      sender: campaign.sender,
      pushtype: 'alert',
      shortenLinks: shortenLinksOpt,
    })

    if (result.ok) {
      sent += 1
      await db
        .from('sms_campaign_recipients')
        .update({ status: 'sent', sms_factor_ticket: result.ticket || null, sent_at: new Date().toISOString() })
        .eq('id', j.recipientId)
        .eq('status', 'pending')
    } else {
      failed += 1
      await db
        .from('sms_campaign_recipients')
        .update({ status: 'failed', error_message: result.error || 'Erreur inconnue' })
        .eq('id', j.recipientId)
        .eq('status', 'pending')
    }
  } catch (e) {
    failed += 1
    await db
      .from('sms_campaign_recipients')
      .update({ status: 'failed', error_message: e instanceof Error ? e.message : String(e) })
      .eq('id', j.recipientId)
      .eq('status', 'pending')
  }

  if ((sent + failed) % 25 === 0) {
    console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${sent + failed}/${jobs.length} traités (${sent} ok, ${failed} échecs)`)
  }
  await new Promise((r) => setTimeout(r, 100))
}

// Clôture la campagne avec les totaux réels, toutes reprises confondues.
const { data: finalRows } = await db
  .from('sms_campaign_recipients')
  .select('status, segments_count')
  .eq('campaign_id', campaignId)
  .limit(5000)
const totals = { sent: 0, failed: 0, skipped: 0, segments: 0 }
for (const r of finalRows || []) {
  if (r.status === 'sent') {
    totals.sent += 1
    totals.segments += r.segments_count || 0
  } else if (r.status === 'failed') totals.failed += 1
  else if (r.status === 'skipped') totals.skipped += 1
}

const stillPending = (finalRows || []).filter((r) => r.status === 'pending').length
await db
  .from('sms_campaigns')
  .update({
    status: stillPending === 0 ? 'sent' : 'sending',
    sent_at: new Date().toISOString(),
    total_recipients: (finalRows || []).length,
    sent_count: totals.sent,
    failed_count: totals.failed,
    segments_used: totals.segments,
  })
  .eq('id', campaignId)

console.log('')
console.log('=== TERMINÉ ===')
console.log(`reprise      : ${sent} envoyés, ${failed} échecs`)
console.log(`campagne     : ${totals.sent} envoyés au total, ${totals.failed} échecs, ${totals.skipped} ignorés`)
console.log(`encore en attente : ${stillPending}`)
