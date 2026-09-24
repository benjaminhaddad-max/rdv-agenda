/**
 * Attribution publicitaire des leads web → origine CRM.
 *
 * Règle métier : un lead qui arrive d'une campagne payante doit porter
 * l'origine de la campagne, pour mesurer la performance des campagnes.
 *   - Google : click ID (gclid / gbraid / wbraid), utm_source google/adwords,
 *     ou hsa_net=adwords (auto-tagging HubSpot Ads).
 *   - Meta : fbclid, utm_source facebook/instagram/fb/ig/meta (hors trafic
 *     organique), ou hsa_net=facebook/instagram.
 * Google prime sur Meta si les deux signaux sont présents.
 */

export const ORIGINE_ADS_GOOGLE = 'Campagne ADS Google'
export const ORIGINE_ADS_META = 'Campagne ADS META'

export const AD_CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'sccid'] as const
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export type AdClickIds = Partial<Record<(typeof AD_CLICK_ID_KEYS)[number], string>>
export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>

export type AdAttribution = {
  clickIds: AdClickIds
  utm: UtmParams
  hsaNet: string | null
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, 500) : null
}

function searchParamsOf(url: unknown): URLSearchParams | null {
  const s = clean(url)
  if (!s) return null
  try {
    return new URL(s).searchParams
  } catch {
    const q = s.indexOf('?')
    return q >= 0 ? new URLSearchParams(s.slice(q + 1)) : null
  }
}

/**
 * Fusionne les signaux envoyés explicitement par le client (prioritaires)
 * avec ceux présents dans l'URL de la page de soumission.
 */
export function collectAdAttribution(input: {
  clickIds?: Record<string, unknown> | null
  utm?: Record<string, unknown> | null
  urls?: Array<unknown>
}): AdAttribution {
  const clickIds: AdClickIds = {}
  const utm: UtmParams = {}
  let hsaNet: string | null = null

  for (const k of AD_CLICK_ID_KEYS) {
    const v = clean(input.clickIds?.[k])
    if (v) clickIds[k] = v
  }
  for (const k of UTM_KEYS) {
    const v = clean(input.utm?.[k])
    if (v) utm[k] = v
  }

  for (const url of input.urls ?? []) {
    const params = searchParamsOf(url)
    if (!params) continue
    for (const k of AD_CLICK_ID_KEYS) {
      if (!clickIds[k]) {
        const v = clean(params.get(k))
        if (v) clickIds[k] = v
      }
    }
    for (const k of UTM_KEYS) {
      if (!utm[k]) {
        const v = clean(params.get(k))
        if (v) utm[k] = v
      }
    }
    if (!hsaNet) hsaNet = clean(params.get('hsa_net'))
  }

  return { clickIds, utm, hsaNet }
}

const GOOGLE_SOURCES = /^(google|adwords|googleads|google_ads|google-ads|gads)$/
const META_SOURCES = /^(facebook|fb|instagram|ig|meta|facebook_ads|facebookads|meta_ads)$/
const ORGANIC_MEDIUMS = /^(organic|referral|social|email|newsletter)$/

export function detectAdOrigine(attr: AdAttribution): string | null {
  const { clickIds, utm } = attr
  const source = (utm.utm_source || '').toLowerCase()
  const medium = (utm.utm_medium || '').toLowerCase()
  const hsaNet = (attr.hsaNet || '').toLowerCase()
  const organic = ORGANIC_MEDIUMS.test(medium)

  if (clickIds.gclid || clickIds.gbraid || clickIds.wbraid) return ORIGINE_ADS_GOOGLE
  if (hsaNet === 'adwords' || hsaNet === 'google') return ORIGINE_ADS_GOOGLE
  if (GOOGLE_SOURCES.test(source) && !organic) return ORIGINE_ADS_GOOGLE

  if (clickIds.fbclid) return ORIGINE_ADS_META
  if (hsaNet === 'facebook' || hsaNet === 'instagram') return ORIGINE_ADS_META
  if (META_SOURCES.test(source) && !organic) return ORIGINE_ADS_META

  return null
}

/**
 * Origines qu'un signal publicitaire peut remplacer sur une fiche existante.
 * Les origines partenaires / salons / imports sont conservées : le lead a été
 * acquis par ce canal avant de cliquer sur une pub.
 */
const OVERRIDABLE_ORIGINES = new Set([
  'formulaire web',
  'site diploma sante',
  'site afem',
  'prise de rdv - site web',
  'reseaux sociaux',
  'campagne ads',
  'autre',
])

function originKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function canOverrideOrigine(current: unknown): boolean {
  const s = clean(current)
  if (!s) return true
  return OVERRIDABLE_ORIGINES.has(originKey(s))
}
