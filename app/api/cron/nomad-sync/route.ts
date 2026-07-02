import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { importNomadRows } from '@/app/api/crm/contacts/nomad-import/route'

export const maxDuration = 300

const DEFAULT_NOMAD_SHEET_ID = '1m_aBEpfPx42-i4jz1GLHZm_v8bTSzmhrGgZcVdjLkiI'
const DEFAULT_NOMAD_GID = '0'
// Clé utilisée par le script Apps Script partagé avec Nomad (cf. nomad-import).
const LEGACY_NOMAD_IMPORT_KEY = 'nomad_import_2026_05_30_9Kq7mP2Z'
type CsvRow = Record<string, string>

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) || []).length
  const semicolons = (headerLine.match(/;/g) || []).length
  return semicolons > commas ? ';' : ','
}

function parseCsv(text: string, delimiter: ',' | ';'): CsvRow[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]

    if (c === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (c === delimiter && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && next === '\n') i++
      row.push(field)
      field = ''
      if (row.some(v => String(v).trim() !== '')) rows.push(row)
      row = []
      continue
    }

    field += c
  }

  row.push(field)
  if (row.some(v => String(v).trim() !== '')) rows.push(row)
  if (rows.length === 0) return []

  const headers = rows[0].map(h => String(h || '').trim())
  const out: CsvRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i]
    const obj: CsvRow = {}
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j]
      if (!key) continue
      obj[key] = String(values[j] ?? '').trim()
    }
    out.push(obj)
  }
  return out
}

function getNomadCsvUrl(): string {
  const explicit = String(process.env.NOMAD_SHEET_CSV_URL || '').trim()
  if (explicit) {
    try {
      const url = new URL(explicit)
      if (
        url.hostname.includes('docs.google.com') &&
        url.pathname.includes('/spreadsheets/d/') &&
        url.pathname.includes('/edit')
      ) {
        const gid = url.searchParams.get('gid') || String(process.env.NOMAD_SHEET_GID || DEFAULT_NOMAD_GID).trim()
        const normalizedPath = url.pathname.replace('/edit', '/export')
        return `${url.origin}${normalizedPath}?format=csv&gid=${encodeURIComponent(gid)}`
      }
    } catch {
      // Keep original value when URL parsing fails.
    }
    return explicit
  }

  const sheetId = String(process.env.NOMAD_SHEET_ID || DEFAULT_NOMAD_SHEET_ID).trim()
  const gid = String(process.env.NOMAD_SHEET_GID || DEFAULT_NOMAD_GID).trim()
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
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
  return timingSafeEqual(value, LEGACY_NOMAD_IMPORT_KEY)
}

async function runSync(req: NextRequest, dryRun: boolean) {
  const csvUrl = getNomadCsvUrl()

  const res = await fetch(csvUrl, { method: 'GET', cache: 'no-store' })
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? 'Google Sheet non accessible depuis le serveur. Publie le Sheet en CSV (ou partage en lecture publique) puis configure NOMAD_SHEET_CSV_URL.'
        : undefined
    return NextResponse.json(
      { ok: false, error: `Nomad CSV fetch failed: ${res.status}`, hint },
      { status: 502 },
    )
  }

  const text = await res.text()
  if (!text.trim()) {
    return NextResponse.json({ ok: true, source_rows: 0, imported: null })
  }

  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = detectDelimiter(firstLine)
  const rows = parseCsv(text, delimiter)

  const imported = await importNomadRows(rows, { dryRun })
  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    csv_url: csvUrl,
    delimiter,
    source_rows: rows.length,
    imported,
  })
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
  return runSync(req, dryRun)
}

export async function POST(req: NextRequest) {
  if (!verifyNomadKey(req)) {
    return NextResponse.json({ error: 'Invalid NOMAD import key' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
  return runSync(req, dryRun)
}
