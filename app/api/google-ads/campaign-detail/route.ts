import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRoleOrPage } from '@/lib/api-auth'
import {
  fetchGoogleCampaignDetail, googleAdsCustomerId, isGoogleAdsConfigured, presetRange,
  type GoogleCampaignDetail, type GoogleDatePreset,
} from '@/lib/google-ads'

/**
 * GET /api/google-ads/campaign-detail?campaign_id=123&channel=SEARCH&date_preset=last_30d[&force=1]
 *
 * Détail d'une campagne Google Ads (déplié depuis le Dashboard Ads) :
 * groupes d'annonces (groupes d'assets pour PMax), mots-clés, termes de
 * recherche, annonces et courbe jour par jour.
 *
 * Leads CRM : soumissions dont l'URL porte les paramètres auto-taggés de la
 * campagne (hsa_cam). hsa_grp → groupe, hsa_tgt=kwd-<id> → mot-clé,
 * hsa_ad → annonce, dédupliqués par contact. Ce sont les leads « tracés »
 * jusqu'au groupe : ceux rattachés à la campagne autrement (gclid seul,
 * utm_campaign) n'apparaissent que dans le total de la campagne.
 *
 * Cache mémoire 30 min (≈ 5 opérations API par campagne dépliée).
 */

const PRESETS: GoogleDatePreset[] = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']
const CACHE_TTL_MS = 30 * 60_000

type LeadCounts = Record<string, number>
type ResponseData = GoogleCampaignDetail & {
  leads: { traced: number; by_ad_group: LeadCounts; by_keyword: LeadCounts; by_ad: LeadCounts; by_day: LeadCounts }
  cached: boolean
  fetched_at: string
}

const cache = new Map<string, ResponseData>()

const param = (url: string | null, name: string): string | null => {
  if (!url) return null
  const m = url.match(new RegExp(`[?&]${name}=([^&#]*)`))
  if (!m) return null
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')) } catch { return m[1] }
}

export async function GET(req: NextRequest) {
  const authz = await requireApiRoleOrPage(['admin'], 'ads-dashboard')
  if (!authz.ok) return authz.response

  const sp = req.nextUrl.searchParams
  const campaignId = (sp.get('campaign_id') || '').replace(/\D/g, '')
  const channel = sp.get('channel') || ''
  const datePreset = (sp.get('date_preset') || 'last_30d') as GoogleDatePreset
  if (!campaignId) return NextResponse.json({ error: 'campaign_id manquant' }, { status: 400 })
  if (!PRESETS.includes(datePreset)) return NextResponse.json({ error: 'date_preset invalide' }, { status: 400 })
  if (!isGoogleAdsConfigured()) {
    return NextResponse.json({ error: 'Google Ads non configuré (GOOGLE_ADS_SERVICE_ACCOUNT_JSON).', not_configured: true }, { status: 503 })
  }

  const key = `${googleAdsCustomerId()}|${campaignId}|${channel}|${datePreset}`
  const hit = cache.get(key)
  if (sp.get('force') !== '1' && hit && Date.now() - new Date(hit.fetched_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit, cached: true })
  }

  const range = presetRange(datePreset)
  let detail: GoogleCampaignDetail
  try {
    detail = await fetchGoogleCampaignDetail(campaignId, range, channel)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  // Leads CRM tracés par l'URL (hsa_*) — même période que les données Google ;
  // la courbe jour par jour couvre 90 j pour « Tout ».
  const db = createServiceClient()
  const leadRange = range ?? presetRange('last_90d')!
  const buckets = { by_ad_group: new Map<string, Set<string>>(), by_keyword: new Map<string, Set<string>>(), by_ad: new Map<string, Set<string>>(), by_day: new Map<string, Set<string>>() }
  const add = (m: Map<string, Set<string>>, k: string | null, contact: string) => {
    if (!k) return
    if (!m.has(k)) m.set(k, new Set())
    m.get(k)!.add(contact)
  }
  const traced = new Set<string>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from('form_submissions')
      .select('id, data, source_url, referrer, submitted_at')
      .or(`source_url.ilike.%hsa_cam=${campaignId}%,referrer.ilike.%hsa_cam=${campaignId}%`)
      .order('submitted_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (range) q = q.gte('submitted_at', `${range.since}T00:00:00`).lte('submitted_at', `${range.until}T23:59:59.999`)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []) as Array<{ id: string; data: Record<string, unknown> | null; source_url: string | null; referrer: string | null; submitted_at: string }>
    for (const r of rows) {
      const url = param(r.source_url, 'hsa_cam') === campaignId ? r.source_url : r.referrer
      if (param(url, 'hsa_cam') !== campaignId) continue
      const contact = String(r.data?._contact_id || r.id)
      traced.add(contact)
      add(buckets.by_ad_group, param(url, 'hsa_grp'), contact)
      add(buckets.by_ad, param(url, 'hsa_ad'), contact)
      const tgt = param(url, 'hsa_tgt') || ''
      const kw = tgt.match(/kwd-(\d+)/)
      add(buckets.by_keyword, kw ? `${param(url, 'hsa_grp')}~${kw[1]}` : null, contact)
      const day = new Date(r.submitted_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
      if (day >= leadRange.since && day <= leadRange.until) add(buckets.by_day, day, contact)
    }
    if (rows.length < PAGE) break
  }
  const counts = (m: Map<string, Set<string>>) => Object.fromEntries([...m].map(([k, s]) => [k, s.size]))

  const responseData: ResponseData = {
    ...detail,
    leads: {
      traced: traced.size,
      by_ad_group: counts(buckets.by_ad_group),
      by_keyword: counts(buckets.by_keyword),
      by_ad: counts(buckets.by_ad),
      by_day: counts(buckets.by_day),
    },
    cached: false,
    fetched_at: new Date().toISOString(),
  }
  // Ne pas mettre en cache une réponse incomplète (quota, erreur ponctuelle)
  if (Object.keys(detail.errors).length === 0) cache.set(key, responseData)

  return NextResponse.json(responseData)
}
