import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { collectAdAttribution, detectAdOrigine, ORIGINE_ADS_GOOGLE } from '@/lib/ad-attribution'
import {
  fetchGoogleCampaignInsights, googleAdsCustomerId, isGoogleAdsConfigured, presetRange,
  type GoogleCampaignInsight, type GoogleDatePreset,
} from '@/lib/google-ads'

/**
 * GET /api/google-ads/insights?date_preset=last_30d[&force=1]
 *
 * Performances Google Ads par campagne (impressions, clics, CTR, coût, CPC)
 * pour le compte Diploma Santé, enrichies des leads CRM et du CPL.
 *
 * Leads CRM = soumissions de formulaire du CRM attribuées à Google Ads
 * (gclid / gbraid / wbraid, utm_source google/adwords, hsa_net=adwords),
 * dédupliquées par contact. Rattachement à la campagne :
 *   1. hsa_cam (ID de campagne, auto-tagging) dans l'URL de la page,
 *   2. utm_campaign = ID de campagne,
 *   3. utm_campaign = nom de campagne (casse / espaces ignorés).
 * Les leads Google sans campagne identifiable (gclid seul) sont comptés à part.
 *
 * Cache mémoire 30 min (quota API : 2 880 opérations / jour, 2 par chargement).
 */

const PRESETS: GoogleDatePreset[] = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']
const CACHE_TTL_MS = 30 * 60_000

type ResponseData = {
  insights: GoogleCampaignInsight[]
  totals: { impressions: number; clicks: number; spend: number; leads: number; unattributed_leads: number; ctr: number; cpc: number; cpl: number }
  currency: string
  account_name: string
  customer_id: string
  date_preset: GoogleDatePreset
  cached: boolean
  fetched_at: string
}

const cache = new Map<string, ResponseData>()

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function hsaCam(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/[?&]hsa_cam=(\d+)/)
  return m ? m[1] : null
}

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const sp = req.nextUrl.searchParams
  const datePreset = (sp.get('date_preset') || 'last_30d') as GoogleDatePreset
  if (!PRESETS.includes(datePreset)) return NextResponse.json({ error: 'date_preset invalide' }, { status: 400 })
  const force = sp.get('force') === '1'

  if (!isGoogleAdsConfigured()) {
    return NextResponse.json({ error: 'Google Ads non configuré (GOOGLE_ADS_SERVICE_ACCOUNT_JSON).', not_configured: true }, { status: 503 })
  }

  const customerId = googleAdsCustomerId()
  const key = `${customerId}|${datePreset}`
  const hit = cache.get(key)
  if (!force && hit && Date.now() - new Date(hit.fetched_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit, cached: true })
  }

  // 1. Google Ads API
  const range = presetRange(datePreset)
  let result: Awaited<ReturnType<typeof fetchGoogleCampaignInsights>>
  try {
    result = await fetchGoogleCampaignInsights(range)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  // 2. Leads CRM attribués à Google sur la même période
  const db = createServiceClient()
  const byId = new Map(result.campaigns.map(c => [c.campaign_id, c]))
  const byName = new Map(result.campaigns.map(c => [norm(c.campaign_name), c.campaign_id]))
  const contactsByCampaign = new Map<string, Set<string>>()
  const unattributed = new Set<string>()

  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from('form_submissions')
      .select('id, data, source_url, referrer, utm_source, utm_medium, utm_campaign, submitted_at')
      .order('submitted_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (range) q = q.gte('submitted_at', `${range.since}T00:00:00`).lte('submitted_at', `${range.until}T23:59:59.999`)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []) as Array<{
      id: string; data: Record<string, unknown> | null; source_url: string | null; referrer: string | null
      utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
    }>

    for (const r of rows) {
      const tracking = (r.data?._tracking ?? {}) as Record<string, unknown>
      const attr = collectAdAttribution({
        clickIds: tracking,
        utm: { utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign },
        urls: [r.source_url, r.referrer],
      })
      if (detectAdOrigine(attr) !== ORIGINE_ADS_GOOGLE) continue

      const contact = String(r.data?._contact_id || r.id)
      const utmCampaign = (r.utm_campaign || '').trim()
      const campaignId =
        [hsaCam(r.source_url), hsaCam(r.referrer)].find(id => id && byId.has(id))
        || (byId.has(utmCampaign) ? utmCampaign : null)
        || (utmCampaign ? byName.get(norm(utmCampaign)) : null)
        || null

      if (campaignId) {
        if (!contactsByCampaign.has(campaignId)) contactsByCampaign.set(campaignId, new Set())
        contactsByCampaign.get(campaignId)!.add(contact)
      } else {
        unattributed.add(contact)
      }
    }
    if (rows.length < PAGE) break
  }

  // Un contact rattaché à une campagne n'est pas compté en plus dans « sans campagne »
  for (const set of contactsByCampaign.values()) for (const c of set) unattributed.delete(c)

  const insights = result.campaigns.map(c => {
    const leads = contactsByCampaign.get(c.campaign_id)?.size ?? 0
    return { ...c, leads, cpl: leads > 0 ? Number((c.spend / leads).toFixed(2)) : 0 }
  }).sort((a, b) => b.spend - a.spend)

  // 3. Totaux (les leads sans campagne comptent dans le total et le CPL global)
  const sum = insights.reduce(
    (acc, i) => ({ impressions: acc.impressions + i.impressions, clicks: acc.clicks + i.clicks, spend: acc.spend + i.spend, leads: acc.leads + i.leads }),
    { impressions: 0, clicks: 0, spend: 0, leads: 0 },
  )
  const leads = sum.leads + unattributed.size

  const responseData: ResponseData = {
    insights,
    totals: {
      impressions: sum.impressions,
      clicks: sum.clicks,
      spend: Number(sum.spend.toFixed(2)),
      leads,
      unattributed_leads: unattributed.size,
      ctr: sum.impressions > 0 ? Number(((sum.clicks / sum.impressions) * 100).toFixed(2)) : 0,
      cpc: sum.clicks > 0 ? Number((sum.spend / sum.clicks).toFixed(2)) : 0,
      cpl: leads > 0 ? Number((sum.spend / leads).toFixed(2)) : 0,
    },
    currency: result.currency,
    account_name: result.account_name,
    customer_id: customerId,
    date_preset: datePreset,
    cached: false,
    fetched_at: new Date().toISOString(),
  }
  cache.set(key, responseData)

  return NextResponse.json(responseData)
}
