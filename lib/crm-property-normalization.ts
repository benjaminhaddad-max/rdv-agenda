type PropertyMeta = {
  type?: string | null
  field_type?: string | null
}

function toLower(value: unknown): string {
  return String(value ?? '').toLowerCase()
}

function toDateInput(raw: string): Date | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isNaN(n) && n > 1e11) {
    const d = new Date(n)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isReadOnlyProperty(meta?: PropertyMeta | null): boolean {
  if (!meta) return false
  const type = toLower(meta.type)
  const fieldType = toLower(meta.field_type)
  return (
    type.includes('calculation') ||
    fieldType.includes('calculation') ||
    type === 'file' ||
    fieldType === 'file'
  )
}

export function normalizePropertyValueForHubSpot(rawValue: unknown, meta?: PropertyMeta | null): string | null {
  if (rawValue === null || rawValue === undefined) return null

  const type = toLower(meta?.type)
  const fieldType = toLower(meta?.field_type)

  // Multi-select may arrive as array from non-UI clients.
  if (Array.isArray(rawValue)) {
    const parts = rawValue.map(v => String(v).trim()).filter(Boolean)
    return parts.length ? parts.join(';') : null
  }

  const raw = String(rawValue).trim()
  if (!raw) return null

  if (type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (m) {
      const y = Number(m[1])
      const month = Number(m[2])
      const day = Number(m[3])
      return String(Date.UTC(y, month - 1, day))
    }
    const d = toDateInput(raw)
    return d ? String(d.getTime()) : raw
  }

  if (type === 'datetime') {
    const d = toDateInput(raw)
    return d ? String(d.getTime()) : raw
  }

  if (type === 'bool' || fieldType === 'booleancheckbox') {
    const lower = raw.toLowerCase()
    if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'oui') return 'true'
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'non') return 'false'
    return raw
  }

  if (type === 'number') {
    const n = Number(raw.replace(',', '.'))
    return Number.isNaN(n) ? raw : String(n)
  }

  return raw
}

export function normalizePropertyValueForDbColumn(
  normalizedHubspotValue: string | null,
  meta?: PropertyMeta | null
): string | null {
  if (normalizedHubspotValue === null) return null
  const type = toLower(meta?.type)
  if (type === 'date' || type === 'datetime') {
    const d = toDateInput(normalizedHubspotValue)
    return d ? d.toISOString() : normalizedHubspotValue
  }
  return normalizedHubspotValue
}
