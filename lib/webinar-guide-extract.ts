import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'
import { MAX_GUIDE_BYTES, cleanGuideText, guideFileKind, unsupportedGuideMessage } from '@/lib/webinar-guide-shared'

export async function extractGuideFromFile(file: {
  filename: string
  mime: string
  bytes: Uint8Array
}): Promise<{ text: string; filename: string }> {
  if (file.bytes.byteLength > MAX_GUIDE_BYTES) {
    throw new Error('Fichier trop lourd (max 40 Mo).')
  }
  const kind = guideFileKind(file.filename, file.mime)
  if (!kind) {
    throw new Error(unsupportedGuideMessage(file.filename))
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
    text = extracted.text
  }

  text = cleanGuideText(text)
  if (!text) {
    throw new Error('Aucun texte lisible dans ce fichier (PDF scanné ?). Essaie un Word ou un PDF avec du texte.')
  }
  return { text, filename: file.filename }
}
