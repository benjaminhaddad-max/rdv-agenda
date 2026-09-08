export const FORM_DOWNLOADS_BUCKET = 'form-downloads'
export const FORM_PDF_MAX_BYTES = 10 * 1024 * 1024

export function looksLikeFileUrl(value: string | null | undefined): boolean {
  const v = String(value || '').trim().toLowerCase()
  if (!v) return false
  if (isFormStoragePath(value)) return true
  if (v.includes('/storage/v1/object/') && v.includes('form-downloads')) return true
  if (/\/api\/forms\/[^/]+\/file(\?|#|$)/.test(v)) return true
  return /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)(\?|#|$)/.test(v)
}

/** Chemin interne bucket (pas une URL http). */
export function isFormStoragePath(value: string | null | undefined): boolean {
  const v = String(value || '').trim()
  if (!v) return false
  if (/^https?:\/\//i.test(v) || v.startsWith('/')) return false
  return v.includes('/')
}

export function fileNameFromUrl(value: string | null | undefined): string {
  const raw = String(value || '').trim()
  if (!raw) return 'document.pdf'
  try {
    const path = /^https?:\/\//i.test(raw)
      ? new URL(raw).pathname
      : raw.split('?')[0]
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() || '')
    const withoutTs = last.replace(/^\d+_/, '')
    return withoutTs || 'document.pdf'
  } catch {
    return 'document.pdf'
  }
}

export function sanitizeDownloadFilename(name: string): string {
  const base = String(name || 'document.pdf').replace(/[/\\?%*:|"<>]/g, '_').trim()
  const ascii = base.replace(/[^\x20-\x7E]/g, '_') || 'document.pdf'
  return ascii.toLowerCase().endsWith('.pdf') ? ascii : `${ascii}.pdf`
}

export function isPdfFile(file: { name?: string; type?: string }): boolean {
  const type = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  return type === 'application/pdf' || name.endsWith('.pdf')
}

export function isPdfMagicBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
}
