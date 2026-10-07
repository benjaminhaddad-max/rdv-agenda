#!/usr/bin/env bun
/**
 * Importe les exports CSV Nomad Education (campagne MEDIBOX) dans le CRM.
 * Ne crée que les leads absents (email) — les contacts existants ne sont pas touchés.
 * Même structure de fiche que le webhook Nomad (hubspot_raw = source de vérité).
 *
 *   bun run scripts/import-nomad-medibox-csv.mjs "<fichier1.csv>" "<fichier2.csv>" ...          # dry-run
 *   bun run scripts/import-nomad-medibox-csv.mjs "<fichier1.csv>" ... --apply
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'
import {
  computeZoneFromDepartement,
  normalizeDepartement,
} from '@/app/api/crm/contacts/nomad-import/route'

const ORIGINE_NOMAD = 'Nomad Education (Partenaire)'
const APPLY = process.argv.includes('--apply')
const FILES = process.argv.slice(2).filter((a) => !a.startsWith('--'))

function loadEnv() {
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    let value = line.slice(i + 1).trim()
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1)
    process.env[line.slice(0, i).trim()] ??= value
  }
}

/** Export Nomad : TSV en UTF-16 LE (BOM FF FE), champs parfois entre guillemets. */
function readNomadTsv(path) {
  const buf = readFileSync(path)
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8')
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const unquote = (s) => s.replace(/^"|"$/g, '').trim()
  const headers = lines[0].split('\t').map(unquote)
  return lines.slice(1).map((l) => {
    const cols = l.split('\t').map(unquote)
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  })
}

/** "28/09/2026 12:15:17" (heure de Paris) → ISO. */
function parseNomadDate(v) {
  const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const pad = (n) => String(n ?? 0).padStart(2, '0')
  const local = `${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] ?? 12)}:${pad(m[5])}:${pad(m[6])}`
  // Offset Paris du jour (CET/CEST).
  const probe = new Date(`${local}Z`)
  const parisHour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(probe),
  )
  const offset = (parisHour - probe.getUTCHours() + 24) % 24
  const d = new Date(probe.getTime() - offset * 3600_000)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function normalizePhone(v) {
  const digits = String(v || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('33') && digits.length === 11) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+33${digits.slice(1)}`
  return digits.length >= 8 ? `+${digits}` : null
}

function normalizeCivilite(v) {
  if (!v) return null
  if (/^(mme|madame|mlle|mademoiselle)/i.test(v)) return 'Mme'
  if (/^(m|mr|m\.|monsieur)$/i.test(v)) return 'Mr'
  return v
}

async function main() {
  if (FILES.length === 0) throw new Error('Usage: import-nomad-medibox-csv.mjs <fichier.csv>... [--apply]')
  loadEnv()
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const allRows = FILES.flatMap(readNomadTsv)
  // Doublon dans les fichiers : on garde la demande la plus récente.
  const byEmail = new Map()
  for (const r of allRows) {
    const email = r.Email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
    const prev = byEmail.get(email)
    if (!prev || (parseNomadDate(r.Date) ?? '') > (parseNomadDate(prev.Date) ?? '')) byEmail.set(email, r)
  }

  const emails = [...byEmail.keys()]
  const existing = []
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, email, origine, contact_createdate, source')
      .in('email', emails.slice(i, i + 200))
    if (error) throw error
    existing.push(...(data ?? []))
  }
  const existingEmails = new Set(existing.map((c) => String(c.email).trim().toLowerCase()))
  const toCreate = [...byEmail.entries()].filter(([e]) => !existingEmails.has(e))

  console.log(`Lignes: ${allRows.length} — emails uniques: ${byEmail.size}`)
  console.log(`Déjà en CRM: ${existing.length} — à créer: ${toCreate.length}`)

  // Leads Nomad déjà présents : date de création par mois.
  const nomadExisting = existing.filter((c) => /nomad/i.test(c.origine || ''))
  const byMonth = {}
  for (const c of nomadExisting) {
    const k = `${c.origine} | ${(c.contact_createdate || 'sans date').slice(0, 7)}`
    byMonth[k] = (byMonth[k] || 0) + 1
  }
  console.log(`\nDéjà en CRM avec origine Nomad: ${nomadExisting.length}`)
  for (const k of Object.keys(byMonth).sort()) console.log(`  ${k}: ${byMonth[k]}`)

  // Téléphones déjà présents sur un autre contact (email différent).
  const phones = toCreate.map(([, r]) => normalizePhone(r['Téléphone'])).filter(Boolean)
  const phoneVariants = phones.flatMap((p) => [p, p.replace(/^\+33/, '0'), p.slice(1)])
  const phoneHits = new Set()
  for (let i = 0; i < phoneVariants.length; i += 300) {
    const { data, error } = await db.from('crm_contacts').select('phone').in('phone', phoneVariants.slice(i, i + 300))
    if (error) throw error
    for (const c of data ?? []) phoneHits.add(normalizePhone(c.phone))
  }
  console.log(`\nParmi les ${toCreate.length} à créer, téléphone déjà présent sur un autre contact: ${phoneHits.size}`)

  const nowIso = new Date().toISOString()
  const inserts = toCreate.map(([email, r], i) => {
    const conversionDate = parseNomadDate(r.Date) ?? nowIso
    const souhait = r.Engagements || null
    const eventName = souhait ? `Nomad Education - ${souhait}` : 'Nomad Education - MEDIBOX'
    const conversionMeta = buildConversionFieldsForSubmission(conversionDate, eventName, null)
    const departement = normalizeDepartement(r['Département']) || normalizeDepartement(r['Code postal']) || null
    const zone = departement ? computeZoneFromDepartement(departement) : null
    const classe = r.Niveau ? (normalizeClasseActuelle(r.Niveau) ?? r.Niveau) : null
    const phone = normalizePhone(r['Téléphone'])
    const civilite = normalizeCivilite(r['Civilité'])
    const firstname = r['Prénom'] || null
    const lastname = r.Nom || null
    const specialite = r['Spécialité(s) (Nouveau Bac)'] || null

    const hubspotRaw = {
      email,
      ...(firstname ? { firstname } : {}),
      ...(lastname ? { lastname } : {}),
      ...(phone ? { phone } : {}),
      ...(classe ? { classe_actuelle: classe } : {}),
      ...(departement ? { departement } : {}),
      ...(zone ? { zone_localite: zone } : {}),
      ...(civilite ? { civilite } : {}),
      ...(r['Code postal'] ? { zip: r['Code postal'] } : {}),
      ...(r.Pays ? { country: r.Pays } : {}),
      ...(r['Diplôme en cours'] ? { dernier_diplome_obtenu___niveau_d_etude: r['Diplôme en cours'] } : {}),
      ...(specialite ? { specialites_terminale: specialite } : {}),
      hs_lead_status: 'Nouveau',
      origine: ORIGINE_NOMAD,
      source: 'Nomad Education',
      createdate: conversionDate,
      ...conversionMeta,
      nomad_received_at: nowIso,
      nomad_csv_import: true,
      nomad_campagne: r.Campagne || 'MEDIBOX',
      nomad_souhait: souhait,
      nomad_civilite: civilite,
      nomad_code_postal: r['Code postal'] || null,
      nomad_pays: r.Pays || null,
      nomad_diplome: r['Diplôme en cours'] || null,
      nomad_niveau: r.Niveau || null,
      nomad_filiere: r['Filière'] || null,
      nomad_domaine: r["Domaine(s) d'étude souhaité(s)"] || null,
      nomad_specialite: specialite,
      nomad_option: r['Enseignement(s) optionnel(s)'] || null,
      nomad_langues: r['Langue(s)'] || null,
      nomad_payload: r,
    }

    return {
      hubspot_contact_id: `NOMAD_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      firstname,
      lastname,
      email,
      phone,
      classe_actuelle: classe,
      departement,
      zone_localite: zone,
      origine: ORIGINE_NOMAD,
      source: 'Nomad Education',
      hs_lead_status: 'Nouveau',
      contact_createdate: conversionDate,
      synced_at: nowIso,
      ...conversionMeta,
      hubspot_raw: hubspotRaw,
    }
  })

  const count = (k) => inserts.reduce((m, x) => ((m[x[k] ?? 'null'] = (m[x[k] ?? 'null'] || 0) + 1), m), {})
  console.log('\nClasse:', count('classe_actuelle'))
  console.log('Zone:', count('zone_localite'))
  console.log('Exemple:', JSON.stringify({ ...inserts[0], hubspot_raw: undefined }, null, 2))

  if (!APPLY) {
    console.log('\nDry-run — relancer avec --apply pour créer les contacts.')
    return
  }

  const backupPath = join(process.cwd(), 'scripts', `_backup-nomad-medibox-import-${Date.now()}.json`)
  writeFileSync(backupPath, JSON.stringify({ created_ids: inserts.map((x) => x.hubspot_contact_id), emails: inserts.map((x) => x.email) }, null, 2))
  console.log(`\nBackup (ids à créer): ${backupPath}`)

  let created = 0
  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100)
    const { error } = await db.from('crm_contacts').insert(chunk)
    if (error) {
      console.error(`Erreur chunk ${i}:`, error.message)
      continue
    }
    created += chunk.length
    const { error: actErr } = await db.from('crm_activities').insert(
      chunk.map((c) => ({
        activity_type: 'note',
        hubspot_contact_id: c.hubspot_contact_id,
        subject: 'Lead reçu de Nomad Education (import CSV MEDIBOX)',
        body: [
          `Souhait : ${c.hubspot_raw.nomad_souhait ?? 'n/a'}`,
          `Niveau : ${c.hubspot_raw.nomad_niveau ?? 'n/a'}${c.hubspot_raw.nomad_filiere ? ` (${c.hubspot_raw.nomad_filiere})` : ''}`,
          `Domaine : ${c.hubspot_raw.nomad_domaine ?? 'n/a'}`,
          `Spécialités : ${c.hubspot_raw.nomad_specialite ?? 'n/a'}`,
          `Département : ${c.departement ?? 'n/a'}${c.hubspot_raw.nomad_code_postal ? ` — CP ${c.hubspot_raw.nomad_code_postal}` : ''}`,
        ].join('\n'),
        metadata: { source: 'nomad_csv_import', campagne: 'MEDIBOX' },
        occurred_at: c.contact_createdate,
      })),
    )
    if (actErr) console.error(`Erreur notes chunk ${i}:`, actErr.message)
    console.log(`Créés ${created}/${inserts.length}`)
  }
  console.log(`\nTerminé — ${created} contacts créés.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
