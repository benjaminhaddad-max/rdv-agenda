import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { collectAdAttribution, detectAdOrigine, ORIGINE_ADS_GOOGLE } from '@/lib/ad-attribution'
import {
  fetchGoogleCampaignInsights, googleAdsCustomerId, isGoogleAdsConfigured, presetRange, resolveGclidCampaigns,
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
 *   4. gclid seul → campagne retrouvée via click_view (mémorisée dans google_ads_gclid_campaigns).
 * Un gclid partagé par plusieurs contacts (cookie resté sur une tablette de
 * salon) ne compte que pour le premier contact. Les leads Google sans
 * campagne identifiable sont comptés à part.
 *
 * Cache mémoire 30 min (quota API : 2 880 opérations / jour, 2 par chargement).
 */

const PRESETS: GoogleDatePreset[] = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']
const CACHE_TTL_MS = 30 * 60_000

type ResponseData = {
  insights: GoogleCampaignInsight[]
  totals: { impressions: number; clicks: number; spend: number; leads: number; unattributed_leads: number; shared_device_excluded: number; ctr: number; cpc: number; cpl: number }
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
  const credit = (campaignId: string | null, contact: string) => {
    if (!campaignId) { unattributed.add(contact); return }
    if (!contactsByCampaign.has(campaignId)) contactsByCampaign.set(campaignId, new Set())
    contactsByCampaign.get(campaignId)!.add(contact)
  }
  // Leads dont le seul signal Google est le gclid : rattachés plus bas via click_view
  const gclidOnly: Array<{ contact: string; gclid: string }> = []

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
      const utm = { utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign }
      const urls = [r.source_url, r.referrer]
      const attr = collectAdAttribution({ clickIds: tracking, utm, urls })
      if (detectAdOrigine(attr) !== ORIGINE_ADS_GOOGLE) continue

      const contact = String(r.data?._contact_id || r.id)
      const utmCampaign = (r.utm_campaign || '').trim()
      const campaignId =
        [hsaCam(r.source_url), hsaCam(r.referrer)].find(id => id && byId.has(id))
        || (byId.has(utmCampaign) ? utmCampaign : null)
        || (utmCampaign ? byName.get(norm(utmCampaign)) : null)
        || null
      if (campaignId) { credit(campaignId, contact); continue }

      // Signal Google hors click ID (UTM / hsa_net) : lead Google, campagne inconnue
      const withoutClickIds = collectAdAttribution({ clickIds: {}, utm, urls })
      withoutClickIds.clickIds = {}
      const gclid = typeof tracking.gclid === 'string' ? tracking.gclid : null
      if (detectAdOrigine(withoutClickIds) === ORIGINE_ADS_GOOGLE || !gclid) { credit(null, contact); continue }
      gclidOnly.push({ contact, gclid })
    }
    if (rows.length < PAGE) break
  }

  // gclid seul. Le cookie de clic (90 j) reste sur l'appareil : sur une tablette
  // de salon, un même gclid se retrouve sur des dizaines de contacts. Seul le
  // premier contact à avoir soumis avec ce gclid (toutes dates confondues) est
  // un lead Google ; les suivants ne sont pas comptés.
  let sharedDeviceExcluded = 0
  const gclids = [...new Set(gclidOnly.map(g => g.gclid))]
  const firstByGclid = new Map<string, { contact: string; day: string }>()
  for (let i = 0; i < gclids.length; i += 100) {
    const chunk = gclids.slice(i, i + 100)
    const { data } = await db.from('form_submissions')
      .select('id, data, submitted_at')
      .in('data->_tracking->>gclid', chunk)
      .order('submitted_at', { ascending: true })
    for (const r of (data ?? []) as Array<{ id: string; data: Record<string, unknown> | null; submitted_at: string }>) {
      const g = (r.data?._tracking as Record<string, unknown> | undefined)?.gclid as string | undefined
      if (!g || firstByGclid.has(g)) continue
      firstByGclid.set(g, {
        contact: String(r.data?._contact_id || r.id),
        day: new Date(r.submitted_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
      })
    }
  }

  // Campagne de chaque gclid : table google_ads_gclid_campaigns, sinon click_view
  const known = new Map<string, { found: boolean; campaign_id: string | null; checked_at: string }>()
  for (let i = 0; i < gclids.length; i += 200) {
    const { data } = await db.from('google_ads_gclid_campaigns')
      .select('gclid, found, campaign_id, checked_at')
      .in('gclid', gclids.slice(i, i + 200))
    for (const r of (data ?? []) as Array<{ gclid: string; found: boolean; campaign_id: string | null; checked_at: string }>) known.set(r.gclid, r)
  }
  const pending = new Map<string, string>()
  for (const g of gclids) {
    const k = known.get(g)
    const retry = k && !k.found && Date.now() - new Date(k.checked_at).getTime() > 24 * 3600_000
    if ((!k || retry) && firstByGclid.has(g)) pending.set(g, firstByGclid.get(g)!.day)
  }
  if (pending.size > 0) {
    try {
      const resolved = await resolveGclidCampaigns(pending)
      if (resolved.length > 0) {
        const now = new Date().toISOString()
        await db.from('google_ads_gclid_campaigns').upsert(resolved.map(r => ({ ...r, checked_at: now })), { onConflict: 'gclid' })
        for (const r of resolved) known.set(r.gclid, { found: r.found, campaign_id: r.campaign_id, checked_at: now })
      }
    } catch (e) {
      // Quota ou erreur ponctuelle : ces leads restent « sans campagne » jusqu'au prochain chargement
      console.error('[google-ads] résolution gclid échouée :', e)
    }
  }

  for (const { contact, gclid } of gclidOnly) {
    const first = firstByGclid.get(gclid)
    if (first && first.contact !== contact) { sharedDeviceExcluded++; continue }
    const campaignId = known.get(gclid)?.campaign_id
    credit(campaignId && byId.has(campaignId) ? campaignId : null, contact)
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
      shared_device_excluded: sharedDeviceExcluded,
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
