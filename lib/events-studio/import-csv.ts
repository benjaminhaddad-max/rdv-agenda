import type { EventBrand, EventTypeId } from '@/lib/events-studio/config'

/** Horaires par défaut si absents du CSV. */
export const IMPORT_SCHEDULE = {
  webinaire: { time_start: '19:00', time_end: '20:00' },
  presentiel: { time_start: '14:00', time_end: '18:00' },
} as const

/** Lieu présentiel par défaut (Diploma). */
export const IMPORT_DEFAULT_LOCATION = '100 quai de la Rapee, 75012 Paris'

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

/** "19:00", "19h", "19h00", "19.00" → "19:00" */
export function parseTime(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s/g, '')
  if (!t || t === '—' || t === '-') return null
  const m = t.match(/^(\d{1,2})(?:[:h.]?(\d{2}))?(?:h)?$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = m[2] != null ? parseInt(m[2], 10) : 0
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function mapPhysicalType(name: string): EventTypeId {
  const o = name.toLowerCase()
  if (/\bjpo\b/.test(o) || o.includes('portes ouvertes')) return 'jpo'
  if (o.includes('immersion') || o.includes("journée d'immersion") || o.includes('journee d')) return 'jpo'
  if (o.includes('salon') || o.includes('forum')) return 'salon'
  return 'salon'
}

function mapCsvType(typeRaw: string, name: string): EventTypeId | null {
  const t = typeRaw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!t || t === 'reserve' || t.includes('reserve')) return null
  if (t.includes('webinaire')) return 'webinaire'
  if (t === 'jpo' || t.includes('portes ouvertes')) return 'jpo'
  if (t === 'salon' || t.includes('salon') || t.includes('forum')) return 'salon'
  if (t.includes('physique') || t.includes('presentiel') || t.includes('evenement')) {
    return mapPhysicalType(name)
  }
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
 * CSV import événements.
 * Colonnes : Nom, Date, Heure début, Heure fin, Type, Lieu [, Zoom]
 * Horaires absents → webinaire 19h–20h / présentiel 14h–18h.
 * Lieu absent (présentiel) → 100 quai de la Rapée.
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

  const hasName = Object.keys(map).some(
    (k) => k === 'nom' || k.includes('operation') || k === 'name',
  )
  const hasDate = Object.keys(map).some((k) => k.includes('date'))
  const hasType = Object.keys(map).some((k) => k.includes('type'))
  if (!hasName || !hasDate || !hasType) {
    errors.push(
      `Colonnes attendues : Nom, Date, Type [, Heure début, Heure fin, Lieu] (trouvées : ${matrix[0].join(', ')})`,
    )
  }

  const drafts: ImportDraftEvent[] = []

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r]
    const rowNum = r + 1
    const typeRaw = col(map, row, 'type')
    const name = col(map, row, 'nom', 'operation', 'opération', 'name', 'evenement', 'événement')
    const dateRaw = col(map, row, 'date', 'date evenement', 'date événement', 'date de l evenement', "date de l'evenement")
    const timeStartRaw = col(
      map,
      row,
      'heure debut',
      'heure début',
      'heure de debut',
      'heure de début',
      'debut',
      'début',
      'time_start',
      'horaire debut',
      'horaire début',
    )
    const timeEndRaw = col(
      map,
      row,
      'heure fin',
      'heure de fin',
      'fin',
      'time_end',
      'horaire fin',
    )
    const lieuRaw = col(map, row, 'lieu', 'location', 'adresse', 'campus')
    const zoomRaw = col(map, row, 'zoom', 'lien zoom', 'zoom_join_url', 'visio')
    const geo = col(map, row, 'geo', 'géo') || null

    if (!name && !typeRaw && !dateRaw) continue

    const eventType = mapCsvType(typeRaw, name)
    if (!eventType) {
      drafts.push({
        row: rowNum,
        name: name || typeRaw || `Ligne ${rowNum}`,
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
        skip_reason:
          typeRaw.toLowerCase().includes('réserve') || typeRaw.toLowerCase().includes('reserve')
            ? 'Ligne réserve — ignorée'
            : `Type non importable : « ${typeRaw || 'vide'} » (Webinaire, Salon, JPO)`,
      })
      continue
    }

    const date = parseFrDate(dateRaw)
    if (!date) {
      drafts.push({
        row: rowNum,
        name: name || `Ligne ${rowNum}`,
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
    const defaults = isWebinar ? IMPORT_SCHEDULE.webinaire : IMPORT_SCHEDULE.presentiel
    const time_start = parseTime(timeStartRaw) || defaults.time_start
    const time_end = parseTime(timeEndRaw) || defaults.time_end

    const location = isWebinar
      ? 'Visioconference'
      : lieuRaw && lieuRaw !== '—' && lieuRaw !== '-'
        ? lieuRaw
        : IMPORT_DEFAULT_LOCATION

    drafts.push({
      row: rowNum,
      name,
      brand,
      event_type: eventType,
      date,
      time_start,
      time_end,
      location,
      zoom_join_url: zoomRaw || null,
      description: null,
      brief: null,
      source_type: typeRaw,
      source_geo: geo,
      skip: false,
    })
  }

  return { drafts, errors }
}
