import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchAdInsights, type InsightsLevel, type DatePreset, type MetaAdInsight } from '@/lib/meta'
import { createHash } from 'crypto'
import { presetRange, type GoogleDatePreset } from '@/lib/google-ads'

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
  // v2 : ajout de new_leads (les entrées en cache antérieures ne l'ont pas)
  const raw = `v4|${accountId}|${level}|${datePreset}|${since || ''}|${until || ''}`
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
  // Nouveaux leads = contact créé dans le CRM par ce lead (il n'y était pas avant)
  const newLeadCounts = new Map<string, number>()
  // Formulaires Meta (webinaire / événement) par campagne / adset / ad : form_id → nb de leads
  const formsByGroup = new Map<string, Map<string, number>>()
  const addForm = (id: string, formId: string | null, n = 1) => {
    if (!formId) return
    if (!formsByGroup.has(id)) formsByGroup.set(id, new Map())
    const m = formsByGroup.get(id)!
    m.set(formId, (m.get(formId) || 0) + n)
  }
  if (groupCol) {
    // Construit la fenêtre de dates pour matcher la query
    let dateFrom: Date | null = null
    let dateTo: Date | null = null
    if (datePreset === 'custom' && since && until) {
      dateFrom = new Date(since)
      dateTo = new Date(until + 'T23:59:59')
    } else {
      // Mêmes jours calendaires que le preset Meta (last_Nd = N jours, aujourd'hui exclu),
      // pour que les comparatifs (plages custom) soient comparables au preset
      const range = presetRange(datePreset as GoogleDatePreset)
      if (range) {
        dateFrom = new Date(range.since)
        dateTo = new Date(range.until + 'T23:59:59')
      }
    }

    // Paginé : PostgREST plafonne à 1 000 lignes par requête
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from('meta_lead_events').select(`${groupCol}, status, contact_created, form_id`)
        .not(groupCol, 'is', null)
        .order('received_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (dateFrom) q = q.gte('received_at', dateFrom.toISOString())
      if (dateTo) q = q.lte('received_at', dateTo.toISOString())
      const { data: events } = await q
      const rows = (events ?? []) as Array<Record<string, string | boolean | null>>
      for (const e of rows) {
        const id = e[groupCol] as string
        if (!id) continue
        leadCounts.set(id, (leadCounts.get(id) || 0) + 1)
        if (e.contact_created === true) newLeadCounts.set(id, (newLeadCounts.get(id) || 0) + 1)
        addForm(id, e.form_id as string | null)
      }
      if (rows.length < PAGE) break
    }

    // Lignes sans lead sur la période : formulaire retrouvé via leurs leads toutes dates confondues
    const groupId = (i: MetaAdInsight) => (level === 'campaign' ? i.campaign_id : level === 'adset' ? i.adset_id : i.ad_id)
    const missing = [...new Set(insights.map(groupId).filter((id): id is string => !!id && !formsByGroup.has(id)))]
    for (let k = 0; k < missing.length; k += 100) {
      const { data } = await db.from('meta_lead_events').select(`${groupCol}, form_id`)
        .in(groupCol, missing.slice(k, k + 100))
        .order('received_at', { ascending: false })
        .limit(1000)
      // Compte 0 lead sur la période : seul le lien formulaire est utile
      const seen = new Set<string>()
      for (const e of (data ?? []) as Array<Record<string, string | null>>) {
        const id = e[groupCol]
        const formId = e.form_id
        if (!id || !formId || seen.has(`${id}|${formId}`)) continue
        seen.add(`${id}|${formId}`)
        addForm(id, formId, 0)
      }
    }
  }

  // Noms des formulaires
  const allFormIds = [...new Set([...formsByGroup.values()].flatMap(m => [...m.keys()]))]
  const formNames = new Map<string, string>()
  for (let k = 0; k < allFormIds.length; k += 200) {
    const { data } = await db.from('meta_lead_forms').select('form_id, name').in('form_id', allFormIds.slice(k, k + 200))
    for (const f of (data ?? []) as Array<{ form_id: string; name: string | null }>) formNames.set(f.form_id, f.name || f.form_id)
  }

  // Enrichit chaque insight avec le lead count + CPL
  const enriched: MetaAdInsight[] = insights.map(i => {
    const id = level === 'campaign' ? i.campaign_id : level === 'adset' ? i.adset_id : level === 'ad' ? i.ad_id : null
    const leads = id ? (leadCounts.get(id) || 0) : 0
    const new_leads = id ? (newLeadCounts.get(id) || 0) : 0
    const cpl = leads > 0 ? Number((i.spend / leads).toFixed(2)) : 0
    const forms = id && formsByGroup.has(id)
      ? [...formsByGroup.get(id)!.entries()]
        .map(([form_id, n]) => ({ form_id, name: formNames.get(form_id) || form_id, leads: n }))
        .sort((a, b) => b.leads - a.leads)
      : []
    return { ...i, leads, new_leads, cpl, forms }
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
      new_leads: acc.new_leads + (i.new_leads || 0),
      platform_leads: acc.platform_leads + (i.platform_leads || 0),
    }),
    { impressions: 0, clicks: 0, spend: 0, leads: 0, new_leads: 0, platform_leads: 0 },
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
