#!/usr/bin/env bun
/**
 * Importe un planning Ads (xlsx, onglet « Planning webinaires ») dans ads_campaigns.
 *
 * Usage :
 *   bun --env-file=.env.local run scripts/import-ads-planning.mjs <fichier.xlsx> --brand medibox [--dry]
 *
 * - Colonnes reconnues par leur en-tête (N°, Date, Horaire, Pilier, Webinaire, Accroche / angle,
 *   Cible, Géo, Funnel, Allumage, Extinction, Livraison créa, Référence Diploma, CPL réf.,
 *   CPL cible, Budget cible, Leads attendus, Logique budget, Intervenant, CTA, Pourquoi, Points à vérifier, Statut).
 * - Relançable : une ligne = (marque, N°). Une relance met à jour le brief et les dates,
 *   sans toucher aux dépôts de créas, à la coche « en ligne » ni au rattachement à l'événement.
 * - Les dates d'allumage / livraison ne sont stockées que si elles diffèrent de la règle de
 *   la marque (ads_brand_settings) : sinon elles suivent les délais réglés.
 * - La colonne Extinction du fichier est ignorée : l'extinction suit la règle de la marque
 *   (le jour de l'événement).
 */
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const brand = args[args.indexOf('--brand') + 1]
const dry = args.includes('--dry')
if (!file || !['diploma', 'medibox', 'edumove'].includes(brand)) {
  console.error('Usage : bun run scripts/import-ads-planning.mjs <fichier.xlsx> --brand medibox|diploma|edumove [--dry]')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const COLS = {
  num: /^n°$/i,
  date: /^date$/i,
  event_time: /^horaire$/i,
  pilier: /^pilier$/i,
  title: /^webinaire$|^événement$|^evenement$/i,
  accroche: /^accroche/i,
  cible: /^cible$/i,
  geo: /^g[ée]o$/i,
  funnel: /^funnel$/i,
  launch: /^allumage/i,
  creas: /^livraison/i,
  ref_diploma: /^r[ée]f[ée]rence/i,
  cpl_ref: /^cpl r[ée]f/i,
  cpl_target: /^cpl cible/i,
  budget_target: /^budget cible/i,
  leads_expected: /^leads attendus/i,
  budget_logic: /^logique budget/i,
  intervenant: /^intervenant/i,
  cta: /^cta/i,
  why: /^pourquoi/i,
  to_check: /^points? à v[ée]rifier/i,
  status: /^statut$/i,
}

const wb = XLSX.readFile(file, { cellDates: true })
const sheetName = wb.SheetNames.find((n) => /planning/i.test(n)) || wb.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null })
const headerIdx = rows.findIndex((r) => r.some((c) => typeof c === 'string' && COLS.num.test(c.trim())))
if (headerIdx < 0) throw new Error('En-tête « N° » introuvable')
const header = rows[headerIdx].map((c) => String(c ?? '').trim())
const col = {}
for (const [k, re] of Object.entries(COLS)) col[k] = header.findIndex((h) => re.test(h))

const pad = (n) => String(n).padStart(2, '0')
function toDay(v) {
  if (v instanceof Date) {
    // xlsx renvoie minuit local décalé : on arrondit à la journée la plus proche
    const d = new Date(v.getTime() + 12 * 3600 * 1000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const m = String(v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null
}
function toNum(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const n = Number(String(v).replace(/[€\s ]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const text = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const { data: delaysRow } = await db.from('ads_brand_settings').select('*').eq('brand', brand).maybeSingle()
const delays = delaysRow || { launch_days: 15, creas_days: 7, end_days: 1 }

const lines = []
for (const r of rows.slice(headerIdx + 1)) {
  const num = toNum(r[col.num])
  const day = toDay(r[col.date])
  const title = text(r[col.title])
  if (!num || !day || !title) continue
  const launch = col.launch >= 0 ? toDay(r[col.launch]) : null
  const creas = col.creas >= 0 ? toDay(r[col.creas]) : null
  const calcLaunch = addDays(day, -delays.launch_days)
  const effLaunch = launch || calcLaunch
  lines.push({
    brand,
    import_key: `n${num}`,
    num,
    title,
    event_date: day,
    event_time: text(r[col.event_time]),
    event_type: 'webinaire',
    pilier: text(r[col.pilier]),
    accroche: text(r[col.accroche]),
    cible: text(r[col.cible]),
    geo: text(r[col.geo]),
    funnel: text(r[col.funnel]),
    ref_diploma: text(r[col.ref_diploma]),
    cpl_ref: toNum(r[col.cpl_ref]),
    cpl_target: toNum(r[col.cpl_target]),
    budget_target: toNum(r[col.budget_target]),
    leads_expected: toNum(r[col.leads_expected]) != null ? Math.round(toNum(r[col.leads_expected])) : null,
    budget_logic: text(r[col.budget_logic]),
    intervenant: text(r[col.intervenant]),
    cta: text(r[col.cta]),
    why: text(r[col.why]),
    to_check: text(r[col.to_check]),
    status: text(r[col.status]),
    // Dates saisies seulement si elles s'écartent de la règle de la marque
    launch_date: launch && launch !== calcLaunch ? launch : null,
    creas_date: creas && creas !== addDays(effLaunch, -delays.creas_days) ? creas : null,
    end_date: null,
  })
}

console.log(`${sheetName} : ${lines.length} lignes (${brand}, délais ${delays.launch_days}/${delays.creas_days}/${delays.end_days})`)
for (const l of lines) {
  console.log(
    `  n${l.num} ${l.event_date} ${l.title.slice(0, 60)} | budget ${l.budget_target ?? '—'} € · CPL ${l.cpl_target ?? '—'} · leads ${l.leads_expected ?? '—'}` +
    (l.launch_date ? ` | allumage ${l.launch_date}` : '') + (l.creas_date ? ` | créas ${l.creas_date}` : '') ,
  )
}
if (dry) process.exit(0)

const { data: existing, error } = await db.from('ads_campaigns').select('id, import_key').eq('brand', brand).not('import_key', 'is', null)
if (error) throw error
const byKey = new Map(existing.map((e) => [e.import_key, e.id]))
let inserted = 0
let updated = 0
for (const l of lines) {
  const id = byKey.get(l.import_key)
  if (id) {
    const { error: e } = await db.from('ads_campaigns').update({ ...l, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) throw e
    updated++
  } else {
    const { error: e } = await db.from('ads_campaigns').insert(l)
    if (e) throw e
    inserted++
  }
}
console.log(`✅ ${inserted} créées, ${updated} mises à jour`)
