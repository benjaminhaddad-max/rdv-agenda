import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

const MAX_BYTES = 15 * 1024 * 1024

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

function cleanGuideText(raw: string) {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

export async function extractGuideFromFile(file: {
  filename: string
  mime: string
  bytes: Uint8Array
}): Promise<{ text: string; filename: string }> {
  if (file.bytes.byteLength > MAX_BYTES) {
    throw new Error('Fichier trop lourd (max 15 Mo).')
  }
  const kind = guideFileKind(file.filename, file.mime)
  if (!kind) {
    const ext = file.filename.split('.').pop()?.toLowerCase() || ''
    if (ext === 'doc') {
      throw new Error('Le .doc ancien n’est pas supporté. Enregistre-le en .docx ou en PDF.')
    }
    throw new Error('Format non supporté. Envoie un PDF, un Word (.docx) ou un fichier texte.')
  }

  let text = ''
  if (kind === 'txt') {
    text = new TextDecoder('utf-8', { fatal: false }).decode(file.bytes)
  } else if (kind === 'docx') {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) })
    text = result.value || ''
  } else {
    const pdf = await getDocumentProxy(file.bytes)
    const extracted = await extractText(pdf, { mergePages: true })
    text = typeof extracted.text === 'string' ? extracted.text : extracted.text.join('\n\n')
  }

  text = cleanGuideText(text)
  if (!text) {
    throw new Error('Aucun texte lisible dans ce fichier (PDF scanné ?). Essaie un Word ou un PDF avec du texte.')
  }
  return { text, filename: file.filename }
}
