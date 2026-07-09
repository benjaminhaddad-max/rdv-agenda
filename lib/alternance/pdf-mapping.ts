import type {
  AlternanceCompany,
  AlternanceContract,
  AlternanceStudent,
  PdfFieldMapping,
} from '@/lib/alternance/types'

type MappingSource = {
  company?: AlternanceCompany | null
  student?: AlternanceStudent | null
  contract?: AlternanceContract | null
}

/** Résout un chemin db (ex: "company.siret") vers une valeur */
function resolveDbPath(source: MappingSource, path: string): unknown {
  const [root, ...rest] = path.split('.')
  let obj: Record<string, unknown> | null = null
  if (root === 'company') obj = (source.company ?? null) as Record<string, unknown> | null
  else if (root === 'student') obj = (source.student ?? null) as Record<string, unknown> | null
  else if (root === 'contract') obj = (source.contract ?? null) as Record<string, unknown> | null
  if (!obj) return null

  let cur: unknown = obj
  for (const key of rest) {
    if (cur == null || typeof cur !== 'object') return null
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur ?? null
}

function formatValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  if (typeof value === 'number') return String(value)
  return String(value)
}

/**
 * Applique un mapping DB → champs PDF.
 * V2 : alimentera pdf-lib / AcroForm avec le modèle CERFA fourni.
 */
export function applyPdfMapping(
  mappings: PdfFieldMapping[],
  source: MappingSource,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of mappings) {
    out[m.pdf] = formatValue(resolveDbPath(source, m.db))
  }
  return out
}

/** Construit la source complète pour génération document */
export function buildDocumentSource(
  contract: AlternanceContract,
  company: AlternanceCompany,
  student: AlternanceStudent,
): MappingSource {
  return { company, student, contract }
}
