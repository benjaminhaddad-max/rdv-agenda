export const MAX_GUIDE_BYTES = 40 * 1024 * 1024

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'csv'])
const DOCX_EXTS = new Set(['docx'])
const PDF_EXTS = new Set(['pdf'])

export function guideFileKind(filename: string, mime = ''): 'txt' | 'docx' | 'pdf' | null {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const m = mime.toLowerCase()
  if (PDF_EXTS.has(ext) || m.includes('pdf')) return 'pdf'
  if (DOCX_EXTS.has(ext) || m.includes('wordprocessingml') || m.includes('officedocument.word')) return 'docx'
  if (TEXT_EXTS.has(ext) || m.startsWith('text/')) return 'txt'
  return null
}

export function cleanGuideText(raw: string) {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export function unsupportedGuideMessage(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'doc') {
    return 'Le .doc ancien n’est pas supporté. Enregistre-le en .docx ou en PDF.'
  }
  return 'Format non supporté. Envoie un PDF, un Word (.docx) ou un fichier texte.'
}
