/** Campagne Last Chance Médecine — événement CRM unifié pour toutes les marques. */

export const RECALIF_2026_FORM_EVENT = 'Recalif 2026'

/** Date de lancement campagne (filtre vue CRM). */
export const RECALIF_2026_CAMPAIGN_START = '2026-07-03'

const BRAND_FORM_HOSTS: Record<string, string> = {
  'afem-edu.fr': 'afem',
  'www.afem-edu.fr': 'afem',
  'numerusclub.fr': 'numerus',
  'www.numerusclub.fr': 'numerus',
  'prepamedecine.fr': 'prepamedecine',
  'www.prepamedecine.fr': 'prepamedecine',
  'orientation.hermione.co': 'hermione',
}

/** Marque source d'une soumission /form (null si hors parcours Recalif). */
export function recalifBrandFromSourceUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl?.trim()) return null
  try {
    const u = new URL(sourceUrl.trim())
    const path = u.pathname.replace(/\/+$/, '') || '/'
    if (path !== '/form') return null
    return BRAND_FORM_HOSTS[u.hostname] ?? null
  } catch {
    return null
  }
}

export type RecalifRequalHints = {
  sourceUrl?: string | null
  commencePassLas?: string | null
  meta?: Record<string, unknown> | null
}

/** Soumission page /form requalification (AFEM, Numerus, PrépaMédecine). */
export function isRecalifRequalificationSubmission(hints: RecalifRequalHints): boolean {
  if (hints.commencePassLas) return true
  const formId = hints.meta?.form_id
  if (typeof formId === 'string' && formId.trim() === 'requalification-prepa-idf') return true
  return recalifBrandFromSourceUrl(hints.sourceUrl) !== null
}

/** Soumission Hermione depuis un lien CRM signé (?t=) ou page /form campagne. */
export function isRecalifHermioneSubmission(hints: {
  hubspotContactId?: string | null
  sourceUrl?: string | null
}): boolean {
  if (hints.hubspotContactId?.trim()) return true
  return recalifBrandFromSourceUrl(hints.sourceUrl) === 'hermione'
}
