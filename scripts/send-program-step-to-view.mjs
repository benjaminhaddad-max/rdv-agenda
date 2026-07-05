#!/usr/bin/env bun
/**
 * Envoie une étape programme à une vue CRM ou un segment email.
 * Chaque destinataire reçoit un lien /form?t=… unique (hubspot_contact_id).
 *
 * Usage:
 *   bun run scripts/send-program-step-to-view.mjs --segment-name="Terminale IDF" --step=0
 *   bun run scripts/send-program-step-to-view.mjs --segment-id=a3f2d4d0-e452-48d0-a13e-3528a8658797 --step=0 --execute
 *   bun run scripts/send-program-step-to-view.mjs --view-id=v_1783072603601 --step=0 --execute
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sendBrevoEmail, renderTemplate, htmlToText } from '../lib/brevo.ts'
import { getEmailBrand, brandSender, wrapBrandEmailHtml } from '../lib/email-brands.ts'
import { resolveProgramFormLink } from '../lib/marketing/brand-form-links.ts'
import { verifyFormContactToken } from '../lib/form-contact-link.ts'
import {
  loadSavedView,
  loadEmailSegment,
  resolveSavedViewAudience,
  resolveSegmentAudience,
} from '../lib/saved-view-audience.ts'

const TERMINALE_IDF_SEGMENT_ID = 'a3f2d4d0-e452-48d0-a13e-3528a8658797'
const AARON_HUBSPOT_ID = '761592608998'

function loadEnv() {
  try {
    for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i < 0) continue
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}

function arg(name, fallback = null) {
  const eq = `--${name}=`
  for (const a of process.argv) {
    if (a.startsWith(eq)) return a.slice(eq.length)
  }
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function extractToken(url) {
  try {
    return new URL(url).searchParams.get('t') || ''
  } catch {
    return ''
  }
}

function buildSignedLink(brandSlug, contact, formSlug) {
  const link = resolveProgramFormLink(brandSlug, contact, formSlug)
  if (!link?.includes('?t=')) return null
  const token = extractToken(link)
  const payload = verifyFormContactToken(token)
  if (!payload || payload.cid !== contact.hubspot_contact_id.trim()) return null
  return link
}

loadEnv()

const viewId = (arg('view-id') || '').trim()
const viewName = (arg('view-name') || '').trim()
const segmentId = (arg('segment-id') || '').trim()
const segmentName = (arg('segment-name') || '').trim()
const stepIndex = Math.max(0, Number(arg('step', '0')) || 0)
const programSlug = (arg('program', 'last-chance-medecine') || 'last-chance-medecine').trim()
const dryRun = !process.argv.includes('--execute')
const delayMs = Math.max(200, Number(arg('delay-ms', '400')) || 400)
const skipSent = process.argv.includes('--skip-already-sent')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const brevoKey = process.env.BREVO_API_KEY?.trim()

if (!supabaseUrl || !supabaseKey) {
  console.error('Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!brevoKey && !dryRun) {
  console.error('Manque BREVO_API_KEY')
  process.exit(1)
}
if (!process.env.FORM_CONTACT_LINK_SECRET?.trim() && !process.env.HERMIONE_LINK_SECRET?.trim()) {
  console.error('Manque FORM_CONTACT_LINK_SECRET — liens non signables')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey)

// Aaron : contact CRM + inclusion segment Terminale IDF
const nowIso = new Date().toISOString()
await db.from('crm_contacts').upsert({
  hubspot_contact_id: AARON_HUBSPOT_ID,
  firstname: 'Aaron',
  lastname: 'SARFATI',
  email: 'aaron@diploma-sante.fr',
  classe_actuelle: 'Terminale',
  zone_localite: 'IDF',
  hs_lead_status: 'A replanifier',
  contact_createdate: nowIso,
  synced_at: nowIso,
}, { onConflict: 'hubspot_contact_id' })

const { data: termSegment } = await db
  .from('email_segments')
  .select('manual_contact_ids')
  .eq('id', TERMINALE_IDF_SEGMENT_ID)
  .maybeSingle()

const manualIds = [...new Set([...(termSegment?.manual_contact_ids ?? []), AARON_HUBSPOT_ID])]
await db.from('email_segments').update({ manual_contact_ids: manualIds }).eq('id', TERMINALE_IDF_SEGMENT_ID)

let audienceSource = ''
let audience = []

if (segmentId || segmentName) {
  const segment = await loadEmailSegment(db, {
    segmentId: segmentId || undefined,
    segmentName: segmentId ? undefined : (segmentName || 'Terminale IDF'),
  })
  if (!segment) {
    console.error(`Segment introuvable: ${segmentId || segmentName || 'Terminale IDF'}`)
    process.exit(1)
  }
  audience = await resolveSegmentAudience(db, segment)
  audienceSource = `Segment: ${segment.name} (${segment.id})`
} else {
  const view = await loadSavedView(db, {
    viewId: viewId || undefined,
    viewName: viewId ? undefined : (viewName || 'Term IDF sans telepro'),
  })
  if (!view) {
    console.error(`Vue introuvable: ${viewId || viewName || 'Term IDF sans telepro'}`)
    process.exit(1)
  }
  audience = await resolveSavedViewAudience(db, view)
  audienceSource = `Vue: ${view.name} (${view.id})`
}

const { data: program } = await db
  .from('email_programs')
  .select('id, slug, prefill_form_slug, status')
  .eq('slug', programSlug)
  .maybeSingle()

if (!program) {
  console.error(`Programme introuvable: ${programSlug}`)
  process.exit(1)
}

const { data: step } = await db
  .from('email_program_steps')
  .select('*')
  .eq('program_id', program.id)
  .eq('step_index', stepIndex)
  .maybeSingle()

if (!step) {
  console.error(`Étape introuvable: step_index=${stepIndex}`)
  process.exit(1)
}

const brand = step.brand_id ? await getEmailBrand(db, step.brand_id) : null
if (brand && !brand.active) {
  console.error(`Marque inactive: ${brand.slug}`)
  process.exit(1)
}

const formSlug = program.prefill_form_slug?.trim() || process.env.CAMPAIGN_PREFILL_FORM_SLUG?.trim() || ''

let alreadySent = new Set()
if (skipSent) {
  const { data: prev } = await db
    .from('email_program_sends')
    .select('email')
    .eq('program_id', program.id)
    .eq('step_index', stepIndex)
    .eq('status', 'sent')
  for (const row of prev ?? []) {
    if (row.email) alreadySent.add(String(row.email).toLowerCase())
  }
}

const recipients = []
let skippedNoCid = 0
let skippedNoToken = 0
let skippedDuplicate = 0
const tokenSeen = new Set()

for (const r of audience) {
  if (!r.contact_id || r.contact_id.startsWith('mkt:')) {
    skippedNoCid++
    continue
  }
  if (skipSent && alreadySent.has(r.email.toLowerCase())) {
    skippedDuplicate++
    continue
  }

  const contactInput = {
    hubspot_contact_id: r.contact_id,
    firstname: r.first_name,
    lastname: r.last_name,
    email: r.email,
  }
  const link = buildSignedLink(brand?.slug, contactInput, formSlug)
  if (!link) {
    skippedNoToken++
    continue
  }

  const token = extractToken(link)
  if (tokenSeen.has(token)) {
    console.error(`Token dupliqué pour ${r.email} — abandon`)
    process.exit(1)
  }
  tokenSeen.add(token)

  recipients.push({ ...r, link, contactInput })
}

console.log(audienceSource)
console.log(`Programme: ${program.slug} — ${step.label} (${brand?.slug || 'sans marque'})`)
console.log(
  `Audience: ${recipients.length} prêts | ${skippedNoCid} sans id | ${skippedNoToken} sans token | ${skippedDuplicate} déjà envoyés`,
)
console.log(dryRun ? 'Mode: DRY-RUN (ajouter --execute pour envoyer)' : 'Mode: ENVOI RÉEL')
console.log('')

if (recipients.length === 0) {
  console.error('Aucun destinataire avec lien personnalisé')
  process.exit(1)
}

if (dryRun) {
  console.log('Vérification liens personnalisés (échantillon 5):')
  for (const r of recipients.slice(0, 5)) {
    const payload = verifyFormContactToken(extractToken(r.link))
    console.log(
      `  ${r.email} — cid=${payload?.cid} — token unique ✓`,
    )
  }
  const aaron = recipients.find(r => r.email.toLowerCase() === 'aaron@diploma-sante.fr')
  console.log(aaron ? `  Aaron inclus ✓ (${aaron.contact_id})` : '  Aaron NON inclus ✗')
  process.exit(0)
}

let sent = 0
let failed = 0

for (const recipient of recipients) {
  const vars = {
    prenom: recipient.first_name || '',
    nom: recipient.last_name || '',
    email: recipient.email,
    lien_formulaire: recipient.link,
    lien_cta: recipient.link,
  }

  const subject = renderTemplate(step.subject, vars)
  const preheader = step.preheader ? renderTemplate(step.preheader, vars) : ''
  let inner = renderTemplate(step.html_body || '', vars)
  if (preheader) {
    inner = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>${inner}`
  }
  const html = brand ? wrapBrandEmailHtml(brand, inner) : inner

  if (!html.includes(recipient.link)) {
    console.warn(`⚠ ${recipient.email} — lien absent du HTML rendu, ignoré`)
    failed++
    continue
  }

  try {
    const result = await sendBrevoEmail({
      subject,
      htmlContent: html,
      textContent: step.text_body || htmlToText(html),
      to: [{
        email: recipient.email,
        name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || undefined,
      }],
      sender: brand ? brandSender(brand) : undefined,
      replyTo: brand?.reply_to ? { email: brand.reply_to } : undefined,
      tags: [`program:${program.slug}`, `step:${step.step_index}`, 'recalif-2026'],
    })

    const nextIndex = stepIndex + 1
    const { data: nextStep } = await db
      .from('email_program_steps')
      .select('step_index')
      .eq('program_id', program.id)
      .eq('step_index', nextIndex)
      .maybeSingle()

    const enrollmentPatch = {
      program_id: program.id,
      recipient_source: 'crm',
      contact_id: recipient.contact_id,
      email: recipient.email,
      first_name: recipient.first_name,
      last_name: recipient.last_name,
      current_step_index: nextIndex,
      last_sent_at: new Date().toISOString(),
      ...(nextStep
        ? { status: 'paused', next_send_at: null }
        : { status: 'completed', next_send_at: null, completed_at: new Date().toISOString() }),
    }

    const { data: enrollment } = await db
      .from('email_program_enrollments')
      .upsert(enrollmentPatch, { onConflict: 'program_id,email' })
      .select('id')
      .maybeSingle()

    await db.from('email_program_sends').insert({
      enrollment_id: enrollment?.id || null,
      program_id: program.id,
      step_index: step.step_index,
      brand_id: step.brand_id,
      email: recipient.email,
      subject,
      status: 'sent',
      brevo_message_id: result.messageId || null,
    })

    sent++
    if (sent % 50 === 0 || sent === recipients.length) {
      console.log(`… ${sent}/${recipients.length} — dernier: ${recipient.email}`)
    }
  } catch (e) {
    console.error(`✗ ${recipient.email} —`, e instanceof Error ? e.message : e)
    failed++
  }

  await sleep(delayMs)
}

console.log('')
console.log(`Terminé: ${sent} envoyés, ${failed} échecs (liens personnalisés ?t= pour chaque contact)`)
