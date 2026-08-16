import type { EventBrand, EventTypeId } from '@/lib/events-studio/config'

/** Horaires métier planning Diploma / événements. */
export const IMPORT_SCHEDULE = {
  webinaire: { time_start: '19:00', time_end: '20:00' },
  presentiel: { time_start: '14:00', time_end: '18:00' },
} as const

export type ImportDraftEvent = {
  row: number
  name: string
  brand: EventBrand
  event_type: EventTypeId
  date: string
  time_start: string
  time_end: string
  location: string
  zoom_join_url: string | null
  description: string | null
  brief: string | null
  source_type: string
  source_geo: string | null
  skip: boolean
  skip_reason?: string
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Parse CSV (virgules, guillemets, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  let inQuotes = false
  const s = text.replace(/^\uFEFF/, '')

  while (i < s.length) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
      i++
      continue
    }
    cell += c
    i++
  }
  row.push(cell)
  if (row.some((v) => v.trim() !== '')) rows.push(row)
  return rows
}

/** JJ/MM/AAAA → YYYY-MM-DD */
export function parseFrDate(raw: string): string | null {
  const t = raw.trim()
  if (!t || t === '—' || t === '-') return null
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (!m) return null
  const d = m[1].padStart(2, '0')
  const mo = m[2].padStart(2, '0')
  const y = m[3]
  return `${y}-${mo}-${d}`
}

function mapPhysicalType(operation: string): EventTypeId {
  const o = operation.toLowerCase()
  if (/\bjpo\b/.test(o) || o.includes('portes ouvertes')) return 'jpo'
  if (o.includes('immersion') || o.includes("journée d'immersion") || o.includes('journee d')) return 'jpo'
  if (o.includes('salon') || o.includes('forum')) return 'salon'
  return 'salon'
}

function mapCsvType(typeRaw: string, operation: string): EventTypeId | null {
  const t = typeRaw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!t || t === 'reserve' || t.includes('reserve')) return null
  if (t.includes('webinaire')) return 'webinaire'
  if (t.includes('physique') || t.includes('presentiel') || t.includes('evenement')) {
    return mapPhysicalType(operation)
  }
  if (t === 'jpo') return 'jpo'
  if (t === 'salon') return 'salon'
  if (t === 'webinaire') return 'webinaire'
  return null
}

function col(map: Record<string, number>, row: string[], ...aliases: string[]): string {
  for (const a of aliases) {
    const idx = map[normalizeHeader(a)]
    if (idx != null && row[idx] != null) return String(row[idx]).trim()
  }
  return ''
}

/**
 * Transforme un CSV planning (ex. Diploma Sept–Déc) en brouillons d’événements.
 * Règles horaires : webinaire 19h–20h ; présentiel 14h–18h.
 */
export function planningCsvToDrafts(
  csvText: string,
  brand: EventBrand = 'diploma',
): { drafts: ImportDraftEvent[]; errors: string[] } {
  const matrix = parseCsv(csvText)
  const errors: string[] = []
  if (matrix.length < 2) {
    return { drafts: [], errors: ['CSV vide ou sans lignes de données'] }
  }

  const header = matrix[0].map(normalizeHeader)
  const map: Record<string, number> = {}
  header.forEach((h, i) => {
    if (h) map[h] = i
  })

  const requiredHints = ['type', 'operation', 'date']
  const hasType = Object.keys(map).some((k) => k.includes('type'))
  const hasOp = Object.keys(map).some((k) => k.includes('operation'))
  const hasDate = Object.keys(map).some((k) => k.includes('date'))
  if (!hasType || !hasOp || !hasDate) {
    errors.push(
      `Colonnes attendues : Type, Opération, Date événement (trouvées : ${matrix[0].join(', ')})`,
    )
  }
  void requiredHints

  const drafts: ImportDraftEvent[] = []

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r]
    const rowNum = r + 1
    const typeRaw = col(map, row, 'type')
    const operation = col(map, row, 'operation', 'opération', 'nom')
    const dateRaw = col(map, row, 'date evenement', 'date événement', 'date')
    const geo = col(map, row, 'geo', 'géo') || null
    const cible = col(map, row, 'cible')
    const budget = col(map, row, 'budget')
    const pourquoi = col(map, row, 'pourquoi / comment', 'pourquoi', 'comment')
    const statut = col(map, row, 'statut')

    if (!operation && !typeRaw && !dateRaw) continue

    const eventType = mapCsvType(typeRaw, operation)
    if (!eventType) {
      drafts.push({
        row: rowNum,
        name: operation || typeRaw || `Ligne ${rowNum}`,
        brand,
        event_type: 'autre',
        date: '',
        time_start: '',
        time_end: '',
        location: '',
        zoom_join_url: null,
        description: null,
        brief: null,
        source_type: typeRaw,
        source_geo: geo,
        skip: true,
        skip_reason: typeRaw.toLowerCase().includes('réserve') || typeRaw.toLowerCase().includes('reserve')
          ? 'Ligne réserve — ignorée'
          : `Type non importable : « ${typeRaw || 'vide'} »`,
      })
      continue
    }

    const date = parseFrDate(dateRaw)
    if (!date) {
      drafts.push({
        row: rowNum,
        name: operation || `Ligne ${rowNum}`,
        brand,
        event_type: eventType,
        date: '',
        time_start: '',
        time_end: '',
        location: '',
        zoom_join_url: null,
        description: null,
        brief: null,
        source_type: typeRaw,
        source_geo: geo,
        skip: true,
        skip_reason: `Date invalide ou manquante : « ${dateRaw || 'vide'} »`,
      })
      continue
    }

    const isWebinar = eventType === 'webinaire'
    const schedule = isWebinar ? IMPORT_SCHEDULE.webinaire : IMPORT_SCHEDULE.presentiel
    const location = isWebinar
      ? 'Visioconference'
      : geo && geo !== '—' && geo !== '-'
        ? geo
        : 'À confirmer'

    const descParts = [
      cible ? `Cible : ${cible}` : null,
      geo ? `Géo : ${geo}` : null,
      budget ? `Budget : ${budget}` : null,
      statut ? `Statut planning : ${statut}` : null,
    ].filter(Boolean)

    drafts.push({
      row: rowNum,
      name: operation,
      brand,
      event_type: eventType,
      date,
      time_start: schedule.time_start,
      time_end: schedule.time_end,
      location,
      zoom_join_url: null,
      description: descParts.length ? descParts.join(' · ') : null,
      brief: pourquoi && pourquoi !== '—' ? pourquoi : null,
      source_type: typeRaw,
      source_geo: geo,
      skip: false,
    })
  }

  return { drafts, errors }
}
