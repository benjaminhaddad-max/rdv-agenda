#!/usr/bin/env bun
/**
 * Synchronise marques + programme Last Chance Médecine (expéditeurs, contenus, chartes).
 * Usage: bun run scripts/sync-marketing-brands-and-program.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { getBrandCharter } from '../lib/brand-charter.ts'
import { BRAND_SENDER_CONFIGS } from '../lib/marketing/brand-senders.ts'
import {
  LAST_CHANCE_MEDECINE_STEPS,
  buildLastChanceStepBody,
} from '../lib/marketing/last-chance-medecine-steps.ts'

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

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey)

// ─── 1. Sync marques (expéditeurs + chartes) ───────────────────────────────
for (const cfg of BRAND_SENDER_CONFIGS) {
  const charter = getBrandCharter(cfg.slug)
  const patch = {
    name: cfg.name,
    sender_email: cfg.sender_email,
    sender_name: cfg.sender_name,
    reply_to: cfg.reply_to,
    website_url: cfg.website_url,
    charter_source_url: cfg.charter_source_url,
    active: cfg.active,
    ...(charter
      ? {
          primary_color: charter.primary_color,
          secondary_color: charter.secondary_color,
          accent_color: charter.accent_color,
          background_color: charter.background_color,
          text_color: charter.text_color,
          font_family: charter.font_family,
          logo_url: charter.logo_url,
          logo_text: charter.logo_text,
          tone: charter.tone,
        }
      : {}),
  }

  const { error } = await db.from('email_brands').update(patch).eq('slug', cfg.slug)
  if (error) console.warn(`⚠ ${cfg.slug}:`, error.message)
  else console.log(`✓ Marque ${cfg.slug} — ${cfg.sender_email} (${cfg.active ? 'actif' : 'inactif Brevo'})`)
}

const { data: brands } = await db.from('email_brands').select('id, slug')
const brandMap = Object.fromEntries((brands || []).map(b => [b.slug, b.id]))

// ─── 2. Programme Last Chance Médecine ───────────────────────────────────
const programPayload = {
  slug: 'last-chance-medecine',
  name: 'Last Chance Médecine',
  description: 'Séquence J1–J20 tous les 2 jours — AFEM, Numerus, Hermione, PrépaMédecine',
  interval_days: 2,
  status: 'draft',
  prefill_form_slug: process.env.CAMPAIGN_PREFILL_FORM_SLUG || null,
}

const { data: existing } = await db
  .from('email_programs')
  .select('id')
  .eq('slug', 'last-chance-medecine')
  .maybeSingle()

let programId = existing?.id
if (!programId) {
  const { data: created, error } = await db.from('email_programs').insert(programPayload).select('id').single()
  if (error) throw error
  programId = created.id
  console.log('✅ Programme créé:', programId)
} else {
  await db.from('email_programs').update(programPayload).eq('id', programId)
  console.log('↻ Programme mis à jour:', programId)
}

await db.from('email_program_steps').delete().eq('program_id', programId)

const rows = LAST_CHANCE_MEDECINE_STEPS.map((step, i) => {
  const charter = getBrandCharter(step.brand)
  if (!charter) throw new Error(`Charte manquante: ${step.brand}`)
  return {
    program_id: programId,
    step_index: i,
    day_offset: i * 2,
    brand_id: brandMap[step.brand] || null,
    label: step.label,
    subject: step.subject,
    preheader: step.preheader,
    html_body: buildLastChanceStepBody(step, charter),
    text_body: null,
  }
})

const { error: stepsErr } = await db.from('email_program_steps').insert(rows)
if (stepsErr) throw stepsErr

console.log(`✅ ${rows.length} étapes avec contenu rédigé`)
console.log('→ https://hub.diploma-sante.fr/admin/crm/campaigns/programs/' + programId)
console.log('')
console.log('Expéditeurs Brevo à valider si pas encore fait :')
for (const c of BRAND_SENDER_CONFIGS) {
  console.log(`  • ${c.sender_email} (${c.active ? 'actif' : 'à valider puis activer dans Marques'})`)
}
