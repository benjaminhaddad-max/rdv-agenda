import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchAdInsights, type InsightsLevel, type DatePreset, type MetaAdInsight } from '@/lib/meta'
import { createHash } from 'crypto'

/**
 * GET /api/meta/ads/insights?account_id=...&level=campaign&date_preset=last_30d
 *
 * Récupère les insights Meta Ads (impressions, clicks, spend, CTR, CPC, etc.)
 * pour un ad account donné, à un niveau de granularité donné.
 *
 * Merge ensuite avec meta_lead_events pour calculer le nombre de leads CRM
 * réels reçus par cette campagne/adset/ad et le CPL.
 *
 * Cache : 1h dans meta_ad_insights_cache (sauf force=1).
 */

function cacheKey(accountId: string, level: string, datePreset: string, since?: string, until?: string): string {
  const raw = `${accountId}|${level}|${datePreset}|${since || ''}|${until || ''}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const accountId = sp.get('account_id')
  const level = (sp.get('level') || 'campaign') as InsightsLevel
  const datePreset = (sp.get('date_preset') || 'last_30d') as DatePreset | 'custom'
  const since = sp.get('since') || undefined
  const until = sp.get('until') || undefined
  const force = sp.get('force') === '1'

  if (!accountId) return NextResponse.json({ error: 'account_id requis' }, { status: 400 })
  if (!['account', 'campaign', 'adset', 'ad'].includes(level)) {
    return NextResponse.json({ error: 'level invalide' }, { status: 400 })
  }

  const db = createServiceClient()

  // 1. Récupère le token de l'ad account
  const { data: account, error: accErr } = await db.from('meta_ad_accounts')
    .select('account_id, access_token, currency, name')
    .eq('account_id', accountId)
    .maybeSingle()
  if (accErr || !account) {
    return NextResponse.json({ error: 'Ad account introuvable. Reconnecte-toi à Facebook.' }, { status: 404 })
  }

  // 2. Cache lookup
  const key = cacheKey(accountId, level, datePreset, since, until)
  if (!force) {
    const { data: cached } = await db.from('meta_ad_insights_cache')
      .select('data, fetched_at, expires_at')
      .eq('cache_key', key)
      .maybeSingle()
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return NextResponse.json({
        ...cached.data,
        cached: true,
        fetched_at: cached.fetched_at,
        currency: account.currency,
      })
    }
  }

  // 3. Fetch depuis Meta API
  let insights: MetaAdInsight[]
  try {
    insights = await fetchAdInsights(
      accountId,
      account.access_token,
      level,
      datePreset === 'custom' ? 'custom' : datePreset,
      since && until ? { since, until } : undefined,
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  // 4. Merge avec meta_lead_events pour le compte de leads CRM
  // On agrège par campaign_id / adset_id / ad_id selon le level
  const groupCol = level === 'campaign' ? 'campaign_id' : level === 'adset' ? 'adset_id' : level === 'ad' ? 'ad_id' : null
  const leadCounts = new Map<string, number>()
  if (groupCol) {
    // Construit la fenêtre de dates pour matcher la query
    let dateFrom: Date | null = null
    let dateTo: Date | null = null
    if (datePreset === 'custom' && since && until) {
      dateFrom = new Date(since)
      dateTo = new Date(until + 'T23:59:59')
    } else {
      const presetDays: Record<string, number> = {
        today: 0, yesterday: 1, last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90,
      }
      const days = presetDays[datePreset]
      if (days !== undefined) {
        dateTo = new Date()
        dateFrom = new Date(Date.now() - days * 86400_000)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from('meta_lead_events').select(`${groupCol}, status`)
      .not(groupCol, 'is', null)
    if (dateFrom) q = q.gte('received_at', dateFrom.toISOString())
    if (dateTo) q = q.lte('received_at', dateTo.toISOString())
    const { data: events } = await q
    for (const e of (events ?? []) as Array<Record<string, string>>) {
      const id = e[groupCol] as string
      if (!id) continue
      leadCounts.set(id, (leadCounts.get(id) || 0) + 1)
    }
  }

  // Enrichit chaque insight avec le lead count + CPL
  const enriched: MetaAdInsight[] = insights.map(i => {
    const id = level === 'campaign' ? i.campaign_id : level === 'adset' ? i.adset_id : level === 'ad' ? i.ad_id : null
    const leads = id ? (leadCounts.get(id) || 0) : 0
    const cpl = leads > 0 ? Number((i.spend / leads).toFixed(2)) : 0
    return { ...i, leads, cpl }
  })

  // Tri par spend desc
  enriched.sort((a, b) => b.spend - a.spend)

  // 5. Totaux
  const totals = enriched.reduce(
    (acc, i) => ({
      impressions: acc.impressions + i.impressions,
      clicks: acc.clicks + i.clicks,
      spend: acc.spend + i.spend,
      leads: acc.leads + (i.leads || 0),
    }),
    { impressions: 0, clicks: 0, spend: 0, leads: 0 },
  )
  const totalCtr = totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0
  const totalCpl = totals.leads > 0 ? Number((totals.spend / totals.leads).toFixed(2)) : 0
  const totalCpc = totals.clicks > 0 ? Number((totals.spend / totals.clicks).toFixed(2)) : 0

  const responseData = {
    insights: enriched,
    totals: {
      ...totals,
      spend: Number(totals.spend.toFixed(2)),
      ctr: totalCtr,
      cpc: totalCpc,
      cpl: totalCpl,
    },
    currency: account.currency || 'EUR',
    account_name: account.name,
    level,
    date_preset: datePreset,
    cached: false,
  }

  // 6. Stocke en cache (1h)
  try {
    await db.from('meta_ad_insights_cache').upsert({
      cache_key: key,
      account_id: accountId,
      level,
      date_preset: datePreset === 'custom' ? null : datePreset,
      date_start: since || null,
      date_stop: until || null,
      data: responseData,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    }, { onConflict: 'cache_key' })
    await db.from('meta_ad_accounts').update({ last_sync_at: new Date().toISOString() }).eq('account_id', accountId)
  } catch (e) {
    console.error('[meta-insights] cache upsert failed:', e)
  }

  return NextResponse.json(responseData)
}
