import { MAX_GUIDE_BYTES, cleanGuideText, guideFileKind, unsupportedGuideMessage } from '@/lib/webinar-guide-shared'

export async function extractGuideInBrowser(file: File): Promise<{ text: string; filename: string }> {
  if (file.size > MAX_GUIDE_BYTES) {
    throw new Error('Fichier trop lourd (max 40 Mo).')
  }
  const kind = guideFileKind(file.name, file.type)
  if (!kind) throw new Error(unsupportedGuideMessage(file.name))

  let text = ''
  if (kind === 'txt') {
    text = await file.text()
  } else if (kind === 'docx') {
    const mammothMod = await import('mammoth')
    const mammoth = mammothMod.default ?? mammothMod
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    text = result.value || ''
  } else {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocumentProxy(bytes)
    const extracted = await extractText(pdf, { mergePages: true })
    text = extracted.text
  }

  text = cleanGuideText(text)
  if (!text) {
    throw new Error('Aucun texte lisible dans ce fichier (PDF scanné ?). Essaie un Word, ou copie le texte.')
  }
  return { text, filename: file.name }
}
