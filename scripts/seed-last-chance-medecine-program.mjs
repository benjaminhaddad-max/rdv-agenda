#!/usr/bin/env bun
/**
 * Crée le programme « Last Chance Médecine » (J1–J20, tous les 2 jours).
 * Usage: bun run scripts/seed-last-chance-medecine-program.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { getBrandCharter, defaultBrandStepBody } from '../lib/brand-charter.ts'

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

const STEPS = [
  { brand: 'afem', label: 'J1', subject: 'Tu vises la médecine à Paris en 2026 : la meilleure prépa PASS/LAS est…' },
  { brand: 'numerus', label: 'J2', subject: 'Futur PASS/LAS : où en es-tu vraiment ? (test gratuit avant septembre)' },
  { brand: 'hermione', label: 'J3', subject: 'Tu vises la médecine en 2026 ? Installe ta méthode avant le PASS/LAS' },
  { brand: 'prepamedecine', label: 'J4', subject: 'Futur PASS/LAS : ton comparatif prépa personnalisé en 24 h (gratuit)' },
  { brand: 'afem', label: 'J5', subject: 'PASS, LAS ou LSPS : prépa, tutorat ou les deux avant septembre ?' },
  { brand: 'numerus', label: 'J6', subject: "Futur étudiant en médecine : ce que le premier concours blanc t'apprendra" },
  { brand: 'hermione', label: 'J7', subject: 'Futur PASS/LAS : le planning à préparer cet été (pas en septembre)' },
  { brand: 'prepamedecine', label: 'J8', subject: '30 prépas pour futurs PASS/LAS — filtre par ville et budget' },
  { brand: 'afem', label: 'J9', subject: 'Tu vises la médecine à Paris : 6 facs — ta prépa prépare la bonne ?' },
  { brand: 'numerus', label: 'J10', subject: "Futur PASS/LAS : ce sera une année de classement (anticipe avant septembre)" },
  { brand: 'hermione', label: 'J11', subject: 'Avant la rentrée médecine : août utile ou août perdu ?' },
  { brand: 'prepamedecine', label: 'J12', subject: 'PASS, LAS ou LSPS : 4 questions avant de choisir ta prépa' },
  { brand: 'afem', label: 'J13', subject: 'Prépa PASS/LAS Paris : 7 790 € ou 9 200 € — le vrai calcul avant septembre' },
  { brand: 'numerus', label: 'J14', subject: 'Futur PASS/LAS à Paris : 5 erreurs à éviter avant la rentrée' },
  { brand: 'hermione', label: 'J15', subject: 'Tu vas faire médecine : anticiper les oraux avant septembre' },
  { brand: 'prepamedecine', label: 'J16', subject: "Top prépas PASS/LAS 2025 : ce que les avis disent (avant de t'inscrire)" },
  { brand: 'afem', label: 'J17', subject: 'Futur PASS/LAS : QCM, rédactionnel, oral — ta fac ne joue pas pareil' },
  { brand: 'numerus', label: 'J18', subject: "Tu n'es pas encore en médecine — et c'est ton avantage" },
  { brand: 'hermione', label: 'J19', subject: 'Futur PASS/LAS : un coach avant la rentrée, ça change quoi ?' },
  { brand: 'prepamedecine', label: 'J20', subject: 'Rentrée PASS/LAS 2026 : checklist 7 points + rappel conseiller gratuit' },
]

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey)

const { data: brands } = await db.from('email_brands').select('id, slug')
const brandMap = Object.fromEntries((brands || []).map(b => [b.slug, b.id]))

const programPayload = {
  slug: 'last-chance-medecine',
  name: 'Last Chance Médecine',
  description: 'Séquence J1–J20 tous les 2 jours — AFEM, Numerus, Hermione, PrépaMédecine',
  interval_days: 2,
  status: 'draft',
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

const rows = STEPS.map((s, i) => {
  const charter = getBrandCharter(s.brand)
  return {
    program_id: programId,
    step_index: i,
    day_offset: i * 2,
    brand_id: brandMap[s.brand] || null,
    label: s.label,
    subject: s.subject,
    html_body: charter ? defaultBrandStepBody(charter, s.label) : `<p>Bonjour {{prenom}},</p><p>${s.label}</p>`,
  }
})

const { error: stepsErr } = await db.from('email_program_steps').insert(rows)
if (stepsErr) throw stepsErr

console.log(`✅ ${rows.length} étapes insérées`)
console.log('→ CRM : /admin/crm/campaigns/programs/' + programId)
