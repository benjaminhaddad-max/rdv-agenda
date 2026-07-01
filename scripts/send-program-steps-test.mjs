#!/usr/bin/env bun
/**
 * Envoie N étapes d'un programme email en test (sans inscription CRM).
 *
 * Usage:
 *   bun run scripts/send-program-steps-test.mjs --email=benjamin.haddad@diploma-sante.fr --count=10
 *   bun run scripts/send-program-steps-test.mjs --email=benjamin.haddad@diploma-sante.fr --from=0 --count=10
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sendBrevoEmail, renderTemplate, htmlToText } from '../lib/brevo.ts'
import { getEmailBrand, brandSender, wrapBrandEmailHtml } from '../lib/email-brands.ts'
import { resolveProgramFormLink, getBrandFormUrl } from '../lib/marketing/brand-form-links.ts'

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

const toEmail = (arg('email') || '').trim().toLowerCase()
const count = Math.max(1, Number(arg('count', '10')) || 10)
const fromIndex = Math.max(0, Number(arg('from', '0')) || 0)
const programSlug = (arg('program', 'last-chance-medecine') || 'last-chance-medecine').trim()

if (!toEmail) {
  console.error('Usage: --email=destinataire@exemple.fr [--count=10] [--from=0]')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const brevoKey = process.env.BREVO_API_KEY?.trim()

if (!supabaseUrl || !supabaseKey) {
  console.error('Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!brevoKey) {
  console.error('Manque BREVO_API_KEY')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey)

const { data: program } = await db
  .from('email_programs')
  .select('id, slug, prefill_form_slug')
  .eq('slug', programSlug)
  .maybeSingle()

if (!program) {
  console.error(`Programme introuvable: ${programSlug}`)
  process.exit(1)
}

const { data: steps } = await db
  .from('email_program_steps')
  .select('*')
  .eq('program_id', program.id)
  .gte('step_index', fromIndex)
  .lt('step_index', fromIndex + count)
  .order('step_index', { ascending: true })

if (!steps?.length) {
  console.error('Aucune étape trouvée')
  process.exit(1)
}

const { data: contact } = await db
  .from('crm_contacts')
  .select('hubspot_contact_id, firstname, lastname, email')
  .ilike('email', toEmail)
  .maybeSingle()

const contactInput = {
  hubspot_contact_id: contact?.hubspot_contact_id || `test:${toEmail}`,
  firstname: contact?.firstname || toEmail.split('@')[0],
  lastname: contact?.lastname || '',
  email: toEmail,
}

const formSlug =
  program.prefill_form_slug?.trim() || process.env.CAMPAIGN_PREFILL_FORM_SLUG?.trim() || ''

console.log(`Programme: ${program.slug}`)
console.log(`Destinataire: ${toEmail}`)
console.log(`Contact CRM: ${contact?.hubspot_contact_id || '(aucun — liens formulaire limités)'}`)
console.log(`Étapes: ${steps.map(s => s.label).join(', ')}`)
console.log('')

let sent = 0
let failed = 0

for (const step of steps) {
  const brand = step.brand_id ? await getEmailBrand(db, step.brand_id) : null
  if (brand && !brand.active) {
    console.warn(`⚠ ${step.label} — marque ${brand.slug} inactive, ignoré`)
    failed++
    continue
  }

  const lienFormulaire = contact?.hubspot_contact_id
    ? resolveProgramFormLink(brand?.slug, contactInput, formSlug)
    : getBrandFormUrl(brand?.slug) || ''

  const vars = {
    prenom: contactInput.firstname || 'Benjamin',
    nom: contactInput.lastname || '',
    email: toEmail,
    lien_formulaire: lienFormulaire,
    lien_cta: lienFormulaire,
  }

  const subject = `[TEST ${step.label}] ${renderTemplate(step.subject, vars)}`
  const preheader = step.preheader ? renderTemplate(step.preheader, vars) : ''

  let inner = renderTemplate(step.html_body || '', vars)
  if (preheader) {
    inner = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>${inner}`
  }

  let html = brand ? wrapBrandEmailHtml(brand, inner) : inner

  try {
    const result = await sendBrevoEmail({
      subject,
      htmlContent: html,
      textContent: step.text_body || htmlToText(html),
      to: [{
        email: toEmail,
        name: `${contactInput.firstname} ${contactInput.lastname}`.trim() || undefined,
      }],
      sender: brand ? brandSender(brand) : undefined,
      replyTo: brand?.reply_to ? { email: brand.reply_to } : undefined,
      tags: [`program:${program.slug}`, `step:${step.step_index}`, 'test'],
    })
    console.log(`✓ ${step.label} — ${brand?.sender_email || 'default'} — ${result.messageId || 'ok'}`)
    sent++
  } catch (e) {
    console.error(`✗ ${step.label} —`, e instanceof Error ? e.message : e)
    failed++
  }

  await sleep(1200)
}

console.log('')
console.log(`Terminé: ${sent} envoyés, ${failed} échecs`)
