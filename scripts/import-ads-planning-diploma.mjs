#!/usr/bin/env bun
/**
 * Importe les plannings Ads Diploma Santé (exports CSV du Google Sheet
 * « Diploma Santé - Planning Événement ») dans ads_campaigns (marque diploma).
 *
 * Usage :
 *   bun --env-file=.env.local run scripts/import-ads-planning-diploma.mjs <fichier.csv> [<fichier2.csv>…] [--dry]
 *
 * Reconnaît les onglets « 1. Planning + brief créa » (sept.-déc., avec le brief créatif et
 * les campagnes continues) et « 1b. Planning Jan-Mai ».
 *  - Webinaire / Événement physique → sous-onglet Webinaires & JPO. Une ligne se rattache à la
 *    campagne déjà créée depuis l'onglet Événements à la même date (pas de doublon).
 *  - Guide, et campagnes continues du bloc « Contenu » (Guide Parcoursup, Kit PASS/LAS) → Guides.
 *  - Campagnes continues du bloc « Offre » (prépas, AFEM…) et lignes « Réserve » : ignorées.
 *  - Extinction des événements ignorée : la campagne s'éteint le jour de l'événement.
 *  - Statut de production : « Annulé » → pas de campagne ; « En ligne » / « Terminé » → coché en ligne.
 *  - Relançable : le titre n'est fixé qu'à la création, les dépôts de créas ne sont pas touchés.
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
const dry = args.includes('--dry')
if (files.length === 0) {
  console.error('Usage : bun run scripts/import-ads-planning-diploma.mjs <fichier.csv> [...] [--dry]')
  process.exit(1)
}
const BRAND = 'diploma'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** CSV RFC 4180 (guillemets, retours à la ligne dans les cellules). */
function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const pad = (n) => String(n).padStart(2, '0')
const toDay = (v) => {
  const m = String(v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null
}
const toNum = (v) => {
  const s = String(v ?? '').replace(/[€\s  ]/g, '').replace(',', '.')
  if (!s || !/^-?\d/.test(s)) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
const text = (v) => {
  const s = String(v ?? '').trim()
  return s && s !== '—' ? s : null
}
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28)
const join = (...parts) => parts.filter(Boolean).join(' · ') || null

const { data: delaysRow } = await db.from('ads_brand_settings').select('*').eq('brand', BRAND).maybeSingle()
const delays = { launch_days: 21, creas_days: 5, end_days: 0, guide_creas_days: 5, ...(delaysRow || {}) }

const lines = []
const seen = new Set()

for (const file of files) {
  const rows = parseCsv(readFileSync(file, 'utf8'))
  let header = null
  let continuous = false
  for (const r of rows) {
    const c0 = (r[0] || '').trim()
    if (c0 === 'N°') {
      // En-tête : on mémorise l'index de chaque colonne (2 colonnes « Statut »)
      header = {}
      r.forEach((h, i) => {
        const k = h.trim()
        if (!k) return
        if (k === 'Statut') header[header.statut1 == null ? 'statut1' : 'statut2'] = i
        else if (header[k] == null) header[k] = i
      })
      continuous = header['Campagne'] != null
      continue
    }
    if (!header || /^TOTAL|^ENVELOPPE|^CAMPAGNES CONTINUES/i.test(c0)) {
      if (/^TOTAL/i.test(c0)) header = null
      continue
    }
    const get = (k) => (header[k] != null ? r[header[k]] : undefined)
    const typeCell = String(get('Type') || '').trim()
    const [typeLine, ...addrLines] = typeCell.split('\n').map((s) => s.trim()).filter(Boolean)
    const title = text(get('Opération') ?? get('Campagne'))
    if (!title) continue

    let kind
    let eventType = null
    if (continuous) {
      if (String(get('Bloc') || '').trim() !== 'Contenu') continue // offres : hors périmètre créas guides
      kind = 'guide'
    } else if (/^webinaire/i.test(typeLine || '')) { kind = 'event'; eventType = 'webinaire' }
    else if (/^[ée]v[ée]nement physique/i.test(typeLine || '')) { kind = 'event'; eventType = 'presentiel' }
    else if (/^guide/i.test(typeLine || '')) kind = 'guide'
    else continue // Réserve, lignes vides

    const prodStatus = text(get('statut1'))
    const reco = text(get('statut2'))
    const ref = text(get('Référence 2025') ?? get('Référence 2026'))
    const allumage = toDay(get('Allumage'))
    const extinction = toDay(get('Extinction'))
    const livraison = toDay(get('Livraison créa'))
    const day = kind === 'guide' ? allumage : toDay(get('Date événement'))
    if (!day) continue

    const key = `${kind}|${day}|${slug(title)}`
    if (seen.has(key)) continue // doublon dans le fichier (ex. Forum du 18/10 recopié)
    seen.add(key)

    const assets = text(get('Assets'))
    const formats = text(get('Formats à produire'))
    const declis = text(get('Déclinaisons'))
    const creaRef = text(get('Créa de référence 2025'))
    const reelBudget = text(get('Budget Réel'))
    const dateNote = prodStatus && /confirmer/i.test(prodStatus) ? 'Date à confirmer avec le campus.' : null
    const status = prodStatus && !toDay(prodStatus) && !/confirmer/i.test(prodStatus) ? prodStatus : 'À valider'
    const launchRule = kind === 'event' ? addDays(day, -delays.launch_days) : day
    const effLaunch = kind === 'event' ? allumage || launchRule : day
    const creasRule = addDays(effLaunch, -(kind === 'guide' ? delays.guide_creas_days : delays.creas_days))

    lines.push({
      brand: BRAND,
      kind,
      import_key: `d-${kind}-${day}-${slug(title)}`,
      num: toNum(get('N°')),
      title,
      event_date: day,
      event_type: kind === 'guide' ? 'guide' : eventType,
      cible: text(get('Cible')),
      geo: join(text(get('Géo')), addrLines.join(' ')),
      budget_target: toNum(get('Budget')),
      cpl_target: toNum(get('CPL cible') ?? get('CPL 2025')),
      leads_expected: toNum(get('Leads attendus') ?? get('Leads')),
      ref_diploma: join(reco, ref ? `Référence : ${ref}` : null, creaRef ? `Créa de référence : ${creaRef}` : null),
      cpl_ref: toNum(ref),
      budget_logic: reelBudget
        ? `Réalisé : ${reelBudget}${text(get('CPL')) ? ` · CPL ${text(get('CPL'))}` : ''}${text(r[header['Leads'] ?? -1]) ? '' : ''}`
        : null,
      why: text(get('Pourquoi / comment')),
      accroche: text(get('Message / accroche')),
      direction_crea: text(get('Direction visuelle & à éviter')),
      format_contenu: join(assets ? `${assets} assets` : null, formats) && [join(assets ? `${assets} assets` : null, formats), declis ? `Déclinaisons : ${declis}` : null].filter(Boolean).join('\n'),
      to_check: dateNote,
      status,
      launch_date: kind === 'event' && allumage && allumage !== launchRule ? allumage : null,
      creas_date: livraison && livraison !== creasRule ? livraison : null,
      end_date: kind === 'guide' ? extinction : null,
      _prod: prodStatus,
    })
  }
}

lines.sort((a, b) => a.event_date.localeCompare(b.event_date))
console.log(`Diploma : ${lines.length} lignes (${lines.filter((l) => l.kind === 'event').length} événements, ${lines.filter((l) => l.kind === 'guide').length} guides) · délais ${delays.launch_days}/${delays.creas_days}, guides ${delays.guide_creas_days}`)
for (const l of lines) {
  console.log(
    `  ${l.kind === 'guide' ? 'GUIDE' : l.event_type === 'presentiel' ? 'PRÉS.' : 'WEBI.'} ${l.event_date}${l.end_date ? ` → ${l.end_date}` : ''} ${l.title.slice(0, 58)}` +
    ` | ${l.budget_target ?? '—'} € · ${l._prod || '—'}` +
    (l.launch_date ? ` | allumage ${l.launch_date}` : '') + (l.creas_date ? ` | créas ${l.creas_date}` : ''),
  )
}
if (dry) process.exit(0)

const { data: existing, error } = await db.from('ads_campaigns').select('id, kind, event_id, event_date, import_key, launched_at').eq('brand', BRAND)
if (error) throw error
const byKey = new Map(existing.filter((e) => e.import_key).map((e) => [e.import_key, e]))
const used = new Set()
let inserted = 0
let updated = 0
for (const { _prod, ...l } of lines) {
  // Ligne déjà importée, sinon campagne créée depuis Événements le même jour
  let row = byKey.get(l.import_key)
  if (!row && l.kind === 'event') {
    row = existing.find((e) => (e.kind || 'event') === 'event' && !e.import_key && e.event_date === l.event_date && !used.has(e.id))
  }
  const extra = {}
  if (_prod === 'Annulé') extra.no_campaign = true
  if ((_prod === 'En ligne' || _prod === 'Terminé') && !row?.launched_at) {
    extra.launched_at = new Date().toISOString()
    extra.launched_by = 'Planning Diploma'
  }
  if (row) {
    used.add(row.id)
    const fields = { ...l, ...extra, updated_at: new Date().toISOString() }
    delete fields.title // le titre n'est fixé qu'à la création
    const { error: e } = await db.from('ads_campaigns').update(fields).eq('id', row.id)
    if (e) throw e
    updated++
  } else {
    const { error: e } = await db.from('ads_campaigns').insert({ ...l, ...extra })
    if (e) throw e
    inserted++
  }
}
console.log(`✅ ${inserted} créées, ${updated} mises à jour`)
