/**
 * Google Ads API (lecture seule) — Dashboard Ads.
 *
 * Auth : compte de service Google Cloud (projet hub-diploma-ads), sans
 * Developer Token ni OAuth utilisateur. On signe un JWT avec la clé du compte
 * de service, on l'échange contre un access token (scope adwords), puis on
 * appelle googleAds:searchStream en passant par le compte administrateur
 * (header login-customer-id).
 *
 * Variables d'environnement :
 *   GOOGLE_ADS_SERVICE_ACCOUNT_JSON  clé JSON du compte de service (brute ou en base64)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID     compte administrateur (défaut 2007374691)
 *   GOOGLE_ADS_CUSTOMER_ID           compte client lu (défaut 2052726146 — Diploma Santé)
 *   GOOGLE_ADS_DEVELOPER_TOKEN       facultatif, envoyé seulement s'il est défini
 */

import { createSign } from 'crypto'

const API_VERSION = 'v25'
const SCOPE = 'https://www.googleapis.com/auth/adwords'
const DEFAULT_LOGIN_CUSTOMER_ID = '2007374691'
const DEFAULT_CUSTOMER_ID = '2052726146'

type ServiceAccountKey = { client_email: string; private_key: string; token_uri?: string }

const digits = (s: string) => s.replace(/\D/g, '')

export function googleAdsLoginCustomerId(): string {
  return digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || DEFAULT_LOGIN_CUSTOMER_ID)
}

export function googleAdsCustomerId(): string {
  return digits(process.env.GOOGLE_ADS_CUSTOMER_ID || DEFAULT_CUSTOMER_ID)
}

function readServiceAccount(): ServiceAccountKey {
  const raw = (process.env.GOOGLE_ADS_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) throw new Error('Google Ads non configuré : variable GOOGLE_ADS_SERVICE_ACCOUNT_JSON absente.')
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  let key: ServiceAccountKey
  try {
    key = JSON.parse(json)
  } catch {
    throw new Error('GOOGLE_ADS_SERVICE_ACCOUNT_JSON illisible (JSON ou base64 attendu).')
  }
  if (!key.client_email || !key.private_key) throw new Error('Clé du compte de service Google Ads incomplète.')
  // Les retours à la ligne de la clé sont parfois échappés une fois de trop dans les variables d'env
  return { ...key, private_key: key.private_key.replace(/\\n/g, '\n') }
}

export function isGoogleAdsConfigured(): boolean {
  try {
    readServiceAccount()
    return true
  } catch {
    return false
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

let tokenCache: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token
  const key = readServiceAccount()
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: key.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600,
  }))}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key)
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) {
    throw new Error(`Authentification Google refusée : ${j.error_description || j.error || `HTTP ${res.status}`}`)
  }
  tokenCache = { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 }
  return j.access_token
}

/** Exécute une requête GAQL et renvoie toutes les lignes (searchStream concatène les lots). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function googleAdsSearch(query: string, customerId = googleAdsCustomerId()): Promise<any[]> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'login-customer-id': googleAdsLoginCustomerId(),
  }
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()
  if (devToken) headers['developer-token'] = devToken

  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${digits(customerId)}/googleAds:searchStream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  const j = await res.json().catch(() => null)
  if (!res.ok) {
    const err = Array.isArray(j) ? j[0]?.error : j?.error
    const detail = err?.details?.[0]?.errors?.[0]?.message
    throw new Error(`Google Ads API : ${detail || err?.message || `HTTP ${res.status}`}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(j) ? j : [j]).flatMap((batch: any) => batch?.results ?? [])
}

// ─── Périodes ──────────────────────────────────────────────────────────────

export type GoogleDatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'this_month' | 'last_month' | 'maximum'

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Fenêtre de dates (YYYY-MM-DD, bornes incluses) correspondant au preset,
 * avec les mêmes conventions que le bloc Meta (last_Nd = N jours avant aujourd'hui exclu).
 * `null` pour « Tout ».
 */
export function presetRange(preset: GoogleDatePreset, now = new Date()): { since: string; until: string } | null {
  const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() - offset); return ymd(d) }
  switch (preset) {
    case 'today': return { since: day(0), until: day(0) }
    case 'yesterday': return { since: day(1), until: day(1) }
    case 'last_7d': return { since: day(7), until: day(1) }
    case 'last_14d': return { since: day(14), until: day(1) }
    case 'last_30d': return { since: day(30), until: day(1) }
    case 'last_90d': return { since: day(90), until: day(1) }
    case 'this_month': return { since: ymd(new Date(now.getFullYear(), now.getMonth(), 1, 12)), until: day(0) }
    case 'last_month': return {
      since: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)),
      until: ymd(new Date(now.getFullYear(), now.getMonth(), 0, 12)),
    }
    default: return null
  }
}

// ─── Campagnes ─────────────────────────────────────────────────────────────

export type GoogleCampaignInsight = {
  campaign_id: string
  campaign_name: string
  status: string
  channel: string
  impressions: number
  clicks: number
  spend: number
  ctr: number
  cpc: number
  leads?: number
  platform_leads?: number // conversions déclarées par Google Ads, dispo sur tout l'historique
  new_leads?: number // leads dont le contact a été créé par cette soumission (absent du CRM avant)
  cpl?: number
}

/** Impressions, clics, CTR, coût, CPC par campagne sur la période. */
export async function fetchGoogleCampaignInsights(range: { since: string; until: string } | null): Promise<{
  campaigns: GoogleCampaignInsight[]
  currency: string
  account_name: string
}> {
  const where = range ? `segments.date BETWEEN '${range.since}' AND '${range.until}'` : 'metrics.impressions > 0'
  const [rows, accountRows] = await Promise.all([
    googleAdsSearch(`
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
             metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
      FROM campaign
      WHERE ${where}
    `),
    googleAdsSearch('SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1'),
  ])

  // Avec segments.date, l'API renvoie une ligne par campagne et par jour : on agrège.
  const byId = new Map<string, GoogleCampaignInsight>()
  for (const r of rows) {
    const id = String(r.campaign?.id ?? '')
    if (!id) continue
    const cur = byId.get(id) ?? {
      campaign_id: id,
      campaign_name: r.campaign?.name ?? '',
      status: r.campaign?.status ?? '',
      channel: r.campaign?.advertisingChannelType ?? '',
      impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0, platform_leads: 0,
    }
    cur.impressions += Number(r.metrics?.impressions ?? 0)
    cur.clicks += Number(r.metrics?.clicks ?? 0)
    cur.spend += Number(r.metrics?.costMicros ?? 0) / 1_000_000
    cur.platform_leads = (cur.platform_leads ?? 0) + Number(r.metrics?.conversions ?? 0)
    byId.set(id, cur)
  }

  const campaigns = [...byId.values()]
    .filter(c => c.impressions > 0 || c.spend > 0)
    .map(c => ({
      ...c,
      spend: Number(c.spend.toFixed(2)),
      platform_leads: Math.round(c.platform_leads ?? 0),
      ctr: c.impressions > 0 ? Number(((c.clicks / c.impressions) * 100).toFixed(2)) : 0,
      cpc: c.clicks > 0 ? Number((c.spend / c.clicks).toFixed(2)) : 0,
    }))

  const customer = accountRows[0]?.customer
  return {
    campaigns,
    currency: customer?.currencyCode || 'EUR',
    account_name: customer?.descriptiveName || 'Google Ads',
  }
}

// ─── gclid → campagne ──────────────────────────────────────────────────────

export type GclidResolution = { gclid: string; found: boolean; campaign_id: string | null; campaign_name: string | null; click_date: string | null }

/**
 * Retrouve la campagne de chaque gclid via click_view (filtre obligatoire sur
 * un seul jour : une requête par jour). On remonte jour par jour depuis la date
 * de soumission la plus récente, sur `lookbackDays` jours avant la plus
 * ancienne (le clic précède la soumission), en s'arrêtant dès que tout est
 * trouvé ou que `maxQueries` est atteint. click_view ne couvre que 90 jours.
 *
 * `pending` : gclid → date de soumission (YYYY-MM-DD).
 * Renvoie les gclids trouvés et, si la recherche est allée au bout, les
 * introuvables (found=false). Les autres restent à chercher plus tard.
 */
export async function resolveGclidCampaigns(
  pending: Map<string, string>,
  { lookbackDays = 30, maxQueries = 40 } = {},
): Promise<GclidResolution[]> {
  const out: GclidResolution[] = []
  if (pending.size === 0) return out
  const remaining = new Map(pending)
  const oldestAllowed = new Date(Date.now() - 89 * 86400_000).toISOString().slice(0, 10)
  const dates = [...pending.values()].sort()
  const start = new Date(`${dates[dates.length - 1]}T12:00:00Z`)
  const minDay = new Date(`${dates[0]}T12:00:00Z`)
  minDay.setUTCDate(minDay.getUTCDate() - lookbackDays)

  let queries = 0
  let exhausted = true
  for (const d = new Date(start); d >= minDay && remaining.size > 0; d.setUTCDate(d.getUTCDate() - 1)) {
    const day = ymd(d)
    if (day < oldestAllowed) break
    // Un clic ne peut pas être postérieur à la soumission, ni bien plus ancien
    const candidates = [...remaining].filter(([, sub]) => sub >= day && new Date(`${sub}T12:00:00Z`).getTime() - d.getTime() <= lookbackDays * 86400_000)
    if (candidates.length === 0) continue
    if (queries >= maxQueries) { exhausted = false; break }
    queries++
    const list = candidates.map(([g]) => `'${g.replace(/'/g, '')}'`).join(',')
    const rows = await googleAdsSearch(
      `SELECT click_view.gclid, campaign.id, campaign.name FROM click_view WHERE segments.date = '${day}' AND click_view.gclid IN (${list})`,
    )
    for (const r of rows) {
      const g = r.clickView?.gclid
      if (!g || !remaining.has(g)) continue
      remaining.delete(g)
      out.push({ gclid: g, found: true, campaign_id: String(r.campaign?.id ?? ''), campaign_name: r.campaign?.name ?? null, click_date: day })
    }
  }
  if (exhausted) {
    for (const g of remaining.keys()) out.push({ gclid: g, found: false, campaign_id: null, campaign_name: null, click_date: null })
  }
  return out
}

// ─── Détail d'une campagne ─────────────────────────────────────────────────

export type GoogleDetailMetrics = {
  impressions: number
  clicks: number
  spend: number
  ctr: number
  cpc: number
  platform_leads: number // conversions déclarées par Google Ads
}

export type GoogleAdGroupDetail = GoogleDetailMetrics & { id: string; name: string; status: string; kind: 'ad_group' | 'asset_group' }
export type GoogleKeywordDetail = GoogleDetailMetrics & {
  criterion_id: string; ad_group_id: string; ad_group_name: string; text: string; match_type: string; status: string; quality_score: number | null
}
export type GoogleSearchTermDetail = GoogleDetailMetrics & { term: string; status: string }
export type GoogleAdDetail = GoogleDetailMetrics & {
  id: string; ad_group_id: string; ad_group_name: string; type: string; status: string; headlines: string[]; descriptions: string[]; final_url: string | null
}
export type GoogleDailyPoint = { date: string; impressions: number; clicks: number; spend: number; platform_leads: number }

export type GoogleCampaignDetail = {
  ad_groups: GoogleAdGroupDetail[]
  keywords: GoogleKeywordDetail[]
  search_terms: GoogleSearchTermDetail[]
  ads: GoogleAdDetail[]
  daily: GoogleDailyPoint[]
  errors: Record<string, string>
}

const METRICS_SQL = 'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions'

type RawSum = { impressions: number; clicks: number; spend: number; platform_leads: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addMetrics = (acc: RawSum, r: any) => {
  acc.impressions += Number(r.metrics?.impressions ?? 0)
  acc.clicks += Number(r.metrics?.clicks ?? 0)
  acc.spend += Number(r.metrics?.costMicros ?? 0) / 1_000_000
  acc.platform_leads += Number(r.metrics?.conversions ?? 0)
}
const finishMetrics = <T extends RawSum>(m: T): T & GoogleDetailMetrics => ({
  ...m,
  spend: Number(m.spend.toFixed(2)),
  platform_leads: Math.round(m.platform_leads),
  ctr: m.impressions > 0 ? Number(((m.clicks / m.impressions) * 100).toFixed(2)) : 0,
  cpc: m.clicks > 0 ? Number((m.spend / m.clicks).toFixed(2)) : 0,
})

/**
 * Agrège des lignes GAQL par clé (l'API peut renvoyer une ligne par jour
 * quand la période filtre sur segments.date).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aggregate<T extends object>(rows: any[], keyOf: (r: any) => string, init: (r: any) => T): Array<T & GoogleDetailMetrics> {
  const map = new Map<string, T & RawSum>()
  for (const r of rows) {
    const k = keyOf(r)
    if (!k) continue
    const cur = map.get(k) ?? { ...init(r), impressions: 0, clicks: 0, spend: 0, platform_leads: 0 }
    addMetrics(cur, r)
    map.set(k, cur)
  }
  return [...map.values()].map(finishMetrics).sort((a, b) => b.spend - a.spend || b.clicks - a.clicks)
}

/**
 * Détail d'une campagne : groupes d'annonces (ou groupes d'assets pour PMax),
 * mots-clés, termes de recherche, annonces et évolution jour par jour.
 * Une requête par onglet (≈ 5 opérations API) ; une requête en échec n'empêche
 * pas les autres (message dans `errors`).
 */
export async function fetchGoogleCampaignDetail(
  campaignId: string,
  range: { since: string; until: string } | null,
  channel: string,
): Promise<GoogleCampaignDetail> {
  const id = digits(campaignId)
  const date = range ? `AND segments.date BETWEEN '${range.since}' AND '${range.until}'` : 'AND metrics.impressions > 0'
  // Courbe jour par jour : 90 jours max pour « Tout »
  const dailyRange = range ?? presetRange('last_90d')!
  const isPmax = channel === 'PERFORMANCE_MAX'
  const errors: Record<string, string> = {}
  const run = async (name: string, query: string) => {
    try {
      return await googleAdsSearch(query)
    } catch (e) {
      errors[name] = e instanceof Error ? e.message : String(e)
      return []
    }
  }

  const [groupRows, keywordRows, termRows, adRows, dailyRows] = await Promise.all([
    isPmax
      ? run('ad_groups', `SELECT asset_group.id, asset_group.name, asset_group.status, ${METRICS_SQL} FROM asset_group WHERE campaign.id = ${id} ${date}`)
      : run('ad_groups', `SELECT ad_group.id, ad_group.name, ad_group.status, ${METRICS_SQL} FROM ad_group WHERE campaign.id = ${id} ${date}`),
    isPmax ? Promise.resolve([]) : run('keywords', `
      SELECT ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
             ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, ${METRICS_SQL}
      FROM keyword_view WHERE campaign.id = ${id} ${date}`),
    isPmax ? Promise.resolve([]) : run('search_terms', `
      SELECT search_term_view.search_term, search_term_view.status, ${METRICS_SQL}
      FROM search_term_view WHERE campaign.id = ${id} ${date}`),
    isPmax ? Promise.resolve([]) : run('ads', `
      SELECT ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls,
             ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ${METRICS_SQL}
      FROM ad_group_ad WHERE campaign.id = ${id} ${date}`),
    run('daily', `SELECT segments.date, ${METRICS_SQL} FROM campaign WHERE campaign.id = ${id} AND segments.date BETWEEN '${dailyRange.since}' AND '${dailyRange.until}'`),
  ])

  const ad_groups = isPmax
    ? aggregate(groupRows, r => String(r.assetGroup?.id ?? ''), r => ({
      id: String(r.assetGroup?.id ?? ''), name: r.assetGroup?.name ?? '', status: r.assetGroup?.status ?? '', kind: 'asset_group' as const,
    }))
    : aggregate(groupRows, r => String(r.adGroup?.id ?? ''), r => ({
      id: String(r.adGroup?.id ?? ''), name: r.adGroup?.name ?? '', status: r.adGroup?.status ?? '', kind: 'ad_group' as const,
    }))

  const keywords = aggregate(
    keywordRows,
    r => `${r.adGroup?.id}~${r.adGroupCriterion?.criterionId}`,
    r => ({
      criterion_id: String(r.adGroupCriterion?.criterionId ?? ''),
      ad_group_id: String(r.adGroup?.id ?? ''),
      ad_group_name: r.adGroup?.name ?? '',
      text: r.adGroupCriterion?.keyword?.text ?? '',
      match_type: r.adGroupCriterion?.keyword?.matchType ?? '',
      status: r.adGroupCriterion?.status ?? '',
      quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
    }),
  )

  // Les termes de recherche peuvent être très nombreux : on garde les 150 plus coûteux
  const search_terms = aggregate(
    termRows,
    r => r.searchTermView?.searchTerm ?? '',
    r => ({ term: r.searchTermView?.searchTerm ?? '', status: r.searchTermView?.status ?? '' }),
  ).slice(0, 150)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const texts = (arr: any) => (Array.isArray(arr) ? arr.map((a: { text?: string }) => a.text || '').filter(Boolean) : [])
  const ads = aggregate(
    adRows,
    r => `${r.adGroup?.id}~${r.adGroupAd?.ad?.id}`,
    r => ({
      id: String(r.adGroupAd?.ad?.id ?? ''),
      ad_group_id: String(r.adGroup?.id ?? ''),
      ad_group_name: r.adGroup?.name ?? '',
      type: r.adGroupAd?.ad?.type ?? '',
      status: r.adGroupAd?.status ?? '',
      headlines: texts(r.adGroupAd?.ad?.responsiveSearchAd?.headlines),
      descriptions: texts(r.adGroupAd?.ad?.responsiveSearchAd?.descriptions),
      final_url: r.adGroupAd?.ad?.finalUrls?.[0] ?? null,
    }),
  )

  const dailyMap = new Map<string, GoogleDailyPoint>()
  for (const r of dailyRows) {
    const d = r.segments?.date
    if (!d) continue
    const cur = dailyMap.get(d) ?? { date: d, impressions: 0, clicks: 0, spend: 0, platform_leads: 0 }
    addMetrics(cur, r)
    dailyMap.set(d, cur)
  }
  const daily = [...dailyMap.values()]
    .map(p => ({ ...p, spend: Number(p.spend.toFixed(2)), platform_leads: Math.round(p.platform_leads) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { ad_groups, keywords, search_terms, ads, daily, errors }
}
