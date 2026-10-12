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
             metrics.impressions, metrics.clicks, metrics.cost_micros
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
      impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0,
    }
    cur.impressions += Number(r.metrics?.impressions ?? 0)
    cur.clicks += Number(r.metrics?.clicks ?? 0)
    cur.spend += Number(r.metrics?.costMicros ?? 0) / 1_000_000
    byId.set(id, cur)
  }

  const campaigns = [...byId.values()]
    .filter(c => c.impressions > 0 || c.spend > 0)
    .map(c => ({
      ...c,
      spend: Number(c.spend.toFixed(2)),
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
