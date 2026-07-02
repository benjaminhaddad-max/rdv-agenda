import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { memoryRateLimit } from '@/lib/rate-limit'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'

const ORIGINE_NOMAD = 'Nomad Education (Partenaire)'
const MAX_ROWS = 5000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Clé utilisée par le script Apps Script partagé avec Nomad. À retirer le jour
// où leur script passera sur NOMAD_IMPORT_KEY (prévoir la rotation avec eux).
const LEGACY_NOMAD_IMPORT_KEY = 'nomad_import_2026_05_30_9Kq7mP2Z'
function normalizeDepartement(value: string): string {
  const compact = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!compact) return ''
  const pref = compact.match(/^(2A|2B|[0-9]{2,3})/)
  if (pref?.[1]) return pref[1]
  if (/^[0-9]{5}$/.test(compact)) return compact.slice(0, 2)
  if (/^[1-9]$/.test(compact)) return `0${compact}`
  if (/^[0-9]{2}$/.test(compact)) return compact
  if (/^2[AB]$/.test(compact)) return compact
  if (/^9[0-9]{2}$/.test(compact)) return compact
  return compact
}

function computeZoneFromDepartement(value: string): string | null {
  const code = normalizeDepartement(value)
  if (!code) return null
  if (['75', '77', '78', '91', '92', '93', '94', '95'].includes(code)) return 'IDF'
  if (['10', '27', '28', '45', '51', '60', '89'].includes(code)) return 'Proche IDF'
  if (['04', '05', '06', '13', '83', '84'].includes(code)) return 'Aix / Marseille'
  if (['16', '17', '24', '33', '40', '47', '64'].includes(code)) return 'Bordeaux / Pau'
  if (['09', '11', '12', '30', '34', '48', '66', '81'].includes(code)) return 'Montpellier / Nimes'
  if (['02', '59', '62'].includes(code)) return 'Lille'
  if (/^[0-9]{2}$/.test(code) || /^2[AB]$/.test(code) || /^9[0-9]{2}$/.test(code)) return 'Autre'
  return null
}

type NomadInputRow = Record<string, unknown>
export type NomadImportStats = {
  total_received: number
  total_valid_email: number
  invalid_email_rows: number
  created: number
  updated: number
  errors: Array<{ email?: string; error: string }>
  error_count: number
}

type ParsedRow = {
  email: string
  firstname: string | null
  lastname: string | null
  phone: string | null
  classe_actuelle: string | null
  departement: string | null
  zone_localite: string | null
  contact_createdate: string | null
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function verifyNomadKey(req: NextRequest): boolean {
  const expected = process.env.NOMAD_IMPORT_KEY || ''
  const provided =
    req.headers.get('x-nomad-key') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const value = provided || ''
  if (!value) return false
  if (expected && timingSafeEqual(value, expected)) return true
  // Compat pour le script Apps Script déjà partagé avec Nomad.
  return timingSafeEqual(value, LEGACY_NOMAD_IMPORT_KEY)
}

function asTrimmedString(v: unknown): string {
  return String(v ?? '').trim()
}

function normalizeFieldKey(key: string): string {
  return String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function buildNormalizedRow(row: NomadInputRow): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeFieldKey(k)
    if (!nk) continue
    // Keep first non-empty value for duplicated/near-duplicated columns.
    if (!(nk in normalized) || !normalized[nk]) {
      normalized[nk] = asTrimmedString(v)
    }
  }
  return normalized
}

function pickFirst(normalizedRow: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizedRow[normalizeFieldKey(key)]
    if (value) return value
  }
  return ''
}

function parseDateToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

function parseNomadRow(row: NomadInputRow): ParsedRow | null {
  const normalizedRow = buildNormalizedRow(row)
  const email = pickFirst(normalizedRow, ['email']).toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return null

  const firstnameRaw = pickFirst(normalizedRow, ['firstname', 'prenom', 'prenomcontact', 'first_name'])
  const lastnameRaw = pickFirst(normalizedRow, ['lastname', 'nom', 'nomcontact', 'last_name'])
  const phoneRaw = pickFirst(normalizedRow, ['phone', 'telephone', 'tel', 'mobile', 'numero', 'numeroportable'])
  const classeRaw = pickFirst(normalizedRow, ['classe_actuelle', 'niveau', 'niveauactuel', 'classe'])
  const departementRaw = pickFirst(normalizedRow, [
    'departement',
    'departementduform',
    'departementform',
    'departementdulead',
    'departementlead',
    'dept',
  ])
  const zoneRaw = pickFirst(normalizedRow, ['zone_localite', 'zone', 'localite'])
  const dateRaw = pickFirst(normalizedRow, ['contact_createdate', 'date', 'createdat'])
  const departement = normalizeDepartement(departementRaw)
  const computedZone = computeZoneFromDepartement(departement)
  const zoneLocalite = zoneRaw || computedZone || null

  return {
    email,
    firstname: firstnameRaw || null,
    lastname: lastnameRaw || null,
    phone: phoneRaw ? phoneRaw.replace(/\s+/g, '') : null,
    classe_actuelle: normalizeClasseActuelle(classeRaw) ?? (classeRaw || null),
    departement: departement || null,
    zone_localite: zoneLocalite,
    contact_createdate: parseDateToIso(dateRaw),
  }
}

export async function POST(req: NextRequest) {
  if (!verifyNomadKey(req)) {
    return NextResponse.json({ error: 'Invalid NOMAD import key' }, { status: 401 })
  }

  const limiter = memoryRateLimit('crm:nomad-import', {
    windowMs: 60_000,
    limit: 20,
  })
  if (!limiter.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: { rows?: NomadInputRow[]; options?: { dry_run?: boolean } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const incomingRows = Array.isArray(body.rows) ? body.rows : []
  const dryRun = body.options?.dry_run === true
  if (incomingRows.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne reçue' }, { status: 400 })
  }
  if (incomingRows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ROWS} lignes par import (reçu ${incomingRows.length})` },
      { status: 400 }
    )
  }

  const result = await importNomadRows(incomingRows, { dryRun })

  return NextResponse.json({
    ...(dryRun ? { dry_run: true } : {}),
    ...result,
  })
}

export async function importNomadRows(
  incomingRows: NomadInputRow[],
  options?: { dryRun?: boolean },
): Promise<NomadImportStats & { to_create?: number; to_update?: number }> {
  const dryRun = options?.dryRun === true
  const latestByEmail = new Map<string, ParsedRow>()
  let invalidEmailRows = 0
  for (const row of incomingRows) {
    const parsed = parseNomadRow(row)
    if (!parsed) {
      invalidEmailRows++
      continue
    }
    latestByEmail.set(parsed.email, parsed)
  }

  const parsedRows = [...latestByEmail.values()]
  if (parsedRows.length === 0) {
    return {
      total_received: incomingRows.length,
      total_valid_email: 0,
      invalid_email_rows: invalidEmailRows,
      created: 0,
      updated: 0,
      errors: [],
      error_count: 0,
      ...(dryRun ? { to_create: 0, to_update: 0 } : {}),
    }
  }

  const db = createServiceClient()
  const emails = parsedRows.map((r) => r.email)
  const existingByEmail = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 1000) {
    const chunk = emails.slice(i, i + 1000)
    const { data } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, email')
      .in('email', chunk)
    for (const row of data ?? []) {
      const email = String(row.email ?? '').toLowerCase().trim()
      const id = String(row.hubspot_contact_id ?? '')
      if (email && id) existingByEmail.set(email, id)
    }
  }

  const nowIso = new Date().toISOString()
  const toInsert: Array<Record<string, unknown>> = []
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = []
  for (const row of parsedRows) {
    const existingId = existingByEmail.get(row.email)
    if (existingId) {
      const updateData: Record<string, unknown> = {
        classe_actuelle: row.classe_actuelle,
        origine: ORIGINE_NOMAD,
        synced_at: nowIso,
      }
      if (row.departement) updateData.departement = row.departement
      if (row.zone_localite) updateData.zone_localite = row.zone_localite
      toUpdate.push({
        id: existingId,
        data: updateData,
      })
      continue
    }

    toInsert.push({
      hubspot_contact_id: `NATIVE_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      firstname: row.firstname,
      lastname: row.lastname,
      email: row.email,
      phone: row.phone,
      classe_actuelle: row.classe_actuelle,
      departement: row.departement,
      zone_localite: row.zone_localite,
      origine: ORIGINE_NOMAD,
      hs_lead_status: 'Nouveau',
      contact_createdate: row.contact_createdate || nowIso,
      synced_at: nowIso,
    })
  }

  if (dryRun) {
    return {
      total_received: incomingRows.length,
      total_valid_email: parsedRows.length,
      invalid_email_rows: invalidEmailRows,
      created: 0,
      updated: 0,
      errors: [],
      error_count: 0,
      to_create: toInsert.length,
      to_update: toUpdate.length,
    }
  }

  const errors: Array<{ email?: string; error: string }> = []
  let created = 0
  let updated = 0

  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500)
    const { error } = await db.from('crm_contacts').insert(chunk)
    if (error) {
      errors.push({ error: `Insert chunk ${i}-${i + chunk.length}: ${error.message}` })
    } else {
      created += chunk.length
    }
  }

  for (const u of toUpdate) {
    const { error } = await db
      .from('crm_contacts')
      .update(u.data)
      .eq('hubspot_contact_id', u.id)
    if (error) {
      errors.push({ email: undefined, error: error.message })
    } else {
      updated++
    }
  }

  return {
    total_received: incomingRows.length,
    total_valid_email: parsedRows.length,
    invalid_email_rows: invalidEmailRows,
    created,
    updated,
    errors: errors.slice(0, 50),
    error_count: errors.length,
  }
}
