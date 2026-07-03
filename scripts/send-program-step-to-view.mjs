#!/usr/bin/env bun
/**
 * Envoie une étape d'un programme email à l'audience d'une vue CRM.
 * Liens formulaire signés (?t=…) par contact HubSpot.
 *
 * Usage:
 *   bun run scripts/send-program-step-to-view.mjs --view-name="Term IDF sans telepro" --step=0
 *   bun run scripts/send-program-step-to-view.mjs --view-id=v_1783072603601 --step=0 --dry-run
 *   bun run scripts/send-program-step-to-view.mjs --view-id=... --step=0 --execute
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sendBrevoEmail, renderTemplate, htmlToText } from '../lib/brevo.ts'
import { getEmailBrand, brandSender, wrapBrandEmailHtml } from '../lib/email-brands.ts'
import { resolveProgramFormLink } from '../lib/marketing/brand-form-links.ts'
import { loadSavedView, resolveSavedViewAudience } from '../lib/saved-view-audience.ts'

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

loadEnv()

const viewId = (arg('view-id') || '').trim()
const viewName = (arg('view-name') || 'Term IDF sans telepro').trim()
const stepIndex = Math.max(0, Number(arg('step', '0')) || 0)
const programSlug = (arg('program', 'last-chance-medecine') || 'last-chance-medecine').trim()
const dryRun = !process.argv.includes('--execute')
const delayMs = Math.max(200, Number(arg('delay-ms', '800')) || 800)

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

const db = createClient(supabaseUrl, supabaseKey)

const view = await loadSavedView(db, { viewId: viewId || undefined, viewName: viewId ? undefined : viewName })
if (!view) {
  console.error(`Vue introuvable: ${viewId || viewName}`)
  process.exit(1)
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

const audience = await resolveSavedViewAudience(db, view)
const withCid = audience.filter(r => r.contact_id && !r.contact_id.startsWith('mkt:'))
const skippedNoCid = audience.length - withCid.length

console.log(`Vue: ${view.name} (${view.id})`)
console.log(`Programme: ${program.slug} — ${step.label} (${brand?.slug || 'sans marque'})`)
console.log(`Audience: ${withCid.length} contact(s) avec lien signé (${skippedNoCid} sans hubspot id ignorés)`)
console.log(dryRun ? 'Mode: DRY-RUN (ajouter --execute pour envoyer)' : 'Mode: ENVOI RÉEL')
console.log('')

if (withCid.length === 0) {
  console.error('Aucun destinataire')
  process.exit(1)
}

if (dryRun) {
  console.log('Échantillon (5 premiers):')
  for (const r of withCid.slice(0, 5)) {
    const lien = resolveProgramFormLink(brand?.slug, {
      hubspot_contact_id: r.contact_id,
      firstname: r.first_name,
      lastname: r.last_name,
      email: r.email,
    }, program.prefill_form_slug)
    console.log(`  ${r.email} — ${lien?.includes('?t=') ? 'lien signé ✓' : 'PAS DE TOKEN'}`)
  }
  process.exit(0)
}

const formSlug = program.prefill_form_slug?.trim() || process.env.CAMPAIGN_PREFILL_FORM_SLUG?.trim() || ''
let sent = 0
let failed = 0

for (const recipient of withCid) {
  const contactInput = {
    hubspot_contact_id: recipient.contact_id,
    firstname: recipient.first_name,
    lastname: recipient.last_name,
    email: recipient.email,
  }

  const lienFormulaire = resolveProgramFormLink(brand?.slug, contactInput, formSlug)
  if (!lienFormulaire.includes('?t=')) {
    console.warn(`⚠ ${recipient.email} — pas de token, ignoré`)
    failed++
    continue
  }

  const vars = {
    prenom: recipient.first_name || '',
    nom: recipient.last_name || '',
    email: recipient.email,
    lien_formulaire: lienFormulaire,
    lien_cta: lienFormulaire,
  }

  const subject = renderTemplate(step.subject, vars)
  const preheader = step.preheader ? renderTemplate(step.preheader, vars) : ''
  let inner = renderTemplate(step.html_body || '', vars)
  if (preheader) {
    inner = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>${inner}`
  }
  const html = brand ? wrapBrandEmailHtml(brand, inner) : inner

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
      tags: [`program:${program.slug}`, `step:${step.step_index}`, `view:${view.id}`, 'recalif-2026'],
    })

    const { data: enrollment } = await db
      .from('email_program_enrollments')
      .upsert({
        program_id: program.id,
        recipient_source: 'crm',
        contact_id: recipient.contact_id,
        email: recipient.email,
        first_name: recipient.first_name,
        last_name: recipient.last_name,
        current_step_index: stepIndex + 1,
        status: 'active',
        last_sent_at: new Date().toISOString(),
        next_send_at: null,
      }, { onConflict: 'program_id,email' })
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

    console.log(`✓ ${recipient.email} — ${result.messageId || 'ok'}`)
    sent++
  } catch (e) {
    console.error(`✗ ${recipient.email} —`, e instanceof Error ? e.message : e)
    failed++
  }

  await sleep(delayMs)
}

console.log('')
console.log(`Terminé: ${sent} envoyés, ${failed} échecs`)
