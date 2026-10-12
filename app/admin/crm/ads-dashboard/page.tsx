'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Facebook, RefreshCw, Calendar, BarChart3, Building2, ChevronDown, ChevronUp, Layers } from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Header, CrmV2Page,
  CrmV2Search, CrmV2Spinner, CrmV2Table, CrmV2TableCard, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { AdsBanner, AdsFaint, AdsIconTile, AdsMobileRow, AdsPillSelect, adsSpin } from '@/components/crm-v2/marketing2/ads/ui'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

type AdAccount = {
  account_id: string
  name: string
  currency: string | null
  business_name: string | null
  user_name: string | null
  active: boolean
  last_sync_at: string | null
}

type Insight = {
  level: string
  account_id?: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  impressions: number
  clicks: number
  spend: number
  ctr: number
  cpc: number
  cpm: number
  reach?: number
  frequency?: number
  leads?: number
  new_leads?: number
  cpl?: number
}

type InsightsResponse = {
  insights: Insight[]
  totals: { impressions: number; clicks: number; spend: number; leads: number; ctr: number; cpc: number; cpl: number }
  currency: string
  account_name: string
  level: string
  date_preset: string
  cached: boolean
  fetched_at?: string
}

type Level = 'campaign' | 'adset' | 'ad'
type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'this_month' | 'last_month' | 'maximum'

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'last_7d', label: '7 derniers jours' },
  { value: 'last_14d', label: '14 derniers jours' },
  { value: 'last_30d', label: '30 derniers jours' },
  { value: 'last_90d', label: '90 derniers jours' },
  { value: 'this_month', label: 'Ce mois-ci' },
  { value: 'last_month', label: 'Mois dernier' },
  { value: 'maximum', label: 'Tout' },
]

const LEVEL_LABELS: Record<Level, string> = { campaign: 'Campagne', adset: 'Adset', ad: 'Ad' }

// Nombre de lignes affichées avant « Voir les N autres » (Meta et Google)
const PREVIEW_COUNT = 8

export default function AdsDashboardPage() {
  const isMobile = useIsMobile()
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [level, setLevel] = useState<Level>('campaign')
  const [datePreset, setDatePreset] = useState<DatePreset>('last_30d')
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Incrémenté par « Actualiser » : force aussi le rechargement du bloc Google Ads
  const [refreshToken, setRefreshToken] = useState(0)
  const [showAllMeta, setShowAllMeta] = useState(false)
  // Données Google remontées par la section Google, pour l'overview
  const [googleData, setGoogleData] = useState<GoogleInsightsResponse | null>(null)
  // Comparatifs : période précédente et même période l'an dernier
  const ranges = useMemo(() => compareRanges(datePreset), [datePreset])
  const [metaCmp, setMetaCmp] = useState<Comparison>(EMPTY_CMP)
  const [googleCmp, setGoogleCmp] = useState<Comparison>(EMPTY_CMP)

  useEffect(() => {
    if (!ranges || !selectedAccount) { setMetaCmp(NO_CMP); return }
    setMetaCmp(EMPTY_CMP)
    let cancelled = false
    const get = (r: DayRange) => {
      const params = new URLSearchParams({ account_id: selectedAccount, level: 'campaign', date_preset: 'custom', since: r.since, until: r.until })
      if (refreshToken > 0) params.set('force', '1')
      return fetchTotals(`/api/meta/ads/insights?${params.toString()}`)
    }
    Promise.all([get(ranges.prev), get(ranges.yoy)]).then(([prev, yoy]) => { if (!cancelled) setMetaCmp({ prev, yoy }) })
    return () => { cancelled = true }
  }, [ranges, selectedAccount, refreshToken])

  useEffect(() => {
    if (!ranges) { setGoogleCmp(NO_CMP); return }
    setGoogleCmp(EMPTY_CMP)
    let cancelled = false
    const get = (r: DayRange) => {
      const params = new URLSearchParams({ date_preset: 'custom', since: r.since, until: r.until })
      if (refreshToken > 0) params.set('force', '1')
      return fetchTotals(`/api/google-ads/insights?${params.toString()}`)
    }
    Promise.all([get(ranges.prev), get(ranges.yoy)]).then(([prev, yoy]) => { if (!cancelled) setGoogleCmp({ prev, yoy }) })
    return () => { cancelled = true }
  }, [ranges, refreshToken])

  useEffect(() => { setShowAllMeta(false) }, [selectedAccount, level])

  // Charge la liste des ad accounts au mount
  useEffect(() => {
    fetch('/api/meta/ads/accounts')
      .then(r => r.json())
      .then(j => {
        const accs = j.accounts || []
        setAccounts(accs)
        // Par défaut : le compte Diploma Médecine (sinon le premier)
        const norm = (v?: string) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        const medecine = accs.find((a: AdAccount) => norm(a.name).includes('medecine'))
        if (accs.length > 0 && !selectedAccount) setSelectedAccount((medecine ?? accs[0]).account_id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingAccounts(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadInsights = useCallback(async (force = false) => {
    if (!selectedAccount) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        account_id: selectedAccount,
        level,
        date_preset: datePreset,
      })
      if (force) params.set('force', '1')
      const res = await fetch(`/api/meta/ads/insights?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [selectedAccount, level, datePreset])

  useEffect(() => {
    if (selectedAccount) loadInsights(false)
  }, [selectedAccount, level, datePreset, loadInsights])

  // Recherche locale sur le nom / l'identifiant
  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.insights.map(i => ({
      i,
      id: level === 'campaign' ? i.campaign_id : level === 'adset' ? i.adset_id : i.ad_id,
      name: level === 'campaign' ? i.campaign_name : level === 'adset' ? i.adset_name : i.ad_name,
    })).filter(r => !q || (r.name || '').toLowerCase().includes(q) || (r.id || '').includes(q))
      .sort((a, b) => b.i.spend - a.i.spend)
  }, [data, level, search])
  // Les plus gros budgets d'abord ; le reste se déplie (tout s'affiche pendant une recherche)
  const visibleRows = search.trim() || showAllMeta ? rows : rows.slice(0, PREVIEW_COUNT)

  const periodLabel = DATE_PRESETS.find(p => p.value === datePreset)?.label || ''
  const accountCount = `${accounts.length} compte${accounts.length > 1 ? 's' : ''} publicitaire${accounts.length > 1 ? 's' : ''} connecté${accounts.length > 1 ? 's' : ''}`
  const hasAccounts = !loadingAccounts && accounts.length > 0

  const actions = !loadingAccounts ? (
    <>
      <AdsPillSelect
        icon={<Calendar size={14} />}
        value={datePreset}
        onChange={e => setDatePreset(e.target.value as DatePreset)}
        aria-label="Période"
      >
        {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </AdsPillSelect>
      <CrmV2Button
        variant="secondary"
        onClick={() => { if (hasAccounts) loadInsights(true); setRefreshToken(t => t + 1) }}
        disabled={loading}
        icon={<RefreshCw size={14} style={loading ? adsSpin : undefined} />}
      >
        Actualiser
      </CrmV2Button>
    </>
  ) : undefined

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Ads Dashboard"
        subtitle={`Performance des campagnes Meta & Google · ${periodLabel}${!loadingAccounts ? ` · ${accountCount}` : ''}`}
        actions={actions}
      >
        {hasAccounts && (
          <CrmV2Tabs
            bordered={false}
            value={level}
            onChange={id => setLevel(id as Level)}
            items={[
              { id: 'campaign', label: 'Campagnes' },
              { id: 'adset', label: 'Adsets' },
              { id: 'ad', label: 'Ads' },
            ]}
          />
        )}
      </CrmV2Header>

      <CrmV2Body>
        {(data || googleData) && (
          <AdsOverview
            title="Vue d'ensemble · Meta + Google"
            icon={<Layers size={16} />}
            note={[periodLabel, data ? `Meta : ${data.account_name}` : null, !googleData ? 'Google en chargement…' : null].filter(Boolean).join(' · ')}
            current={sumTotals(hasAccounts ? data?.totals : null, googleData?.totals)}
            prev={sumCmp(metaCmp.prev, googleCmp.prev)}
            yoy={sumCmp(metaCmp.yoy, googleCmp.yoy)}
            ranges={ranges}
            currency={data?.currency || googleData?.currency || 'EUR'}
            isMobile={isMobile}
            macro
          />
        )}

        {error && <AdsBanner kind="error">{error}</AdsBanner>}

        {loadingAccounts ? (
          <CrmV2Card><CrmV2Spinner /></CrmV2Card>
        ) : accounts.length === 0 ? (
          <CrmV2Card>
            <CrmV2Empty
              icon={<Facebook size={22} />}
              title="Aucun compte publicitaire connecté"
              description="Reconnecte-toi à Facebook depuis la page Meta Lead Ads pour autoriser l'accès aux ad accounts."
              action={
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <CrmV2Button variant="secondary" onClick={() => { window.location.href = '/admin/crm/meta-ads' }}>
                    Meta Lead Ads
                  </CrmV2Button>
                  <CrmV2Button
                    variant="primary"
                    icon={<Facebook size={14} />}
                    onClick={() => { window.location.href = '/api/meta/oauth/start' }}
                  >
                    Reconnecter Facebook
                  </CrmV2Button>
                </div>
              }
            />
          </CrmV2Card>
        ) : (
          <>
            <AdsSectionHeader
              icon={<Facebook size={18} />}
              color="#1877F2"
              title="Meta Ads"
              subtitle={data ? `${data.account_name} · ${periodLabel}` : periodLabel}
              loading={loading}
              isMobile={isMobile}
            />

            {data && (
              <AdsOverview
                title="Overview Meta"
                icon={<Facebook size={16} color="#1877F2" />}
                current={data.totals}
                prev={metaCmp.prev}
                yoy={metaCmp.yoy}
                ranges={ranges}
                currency={data.currency}
                isMobile={isMobile}
              />
            )}

            {loading && !data && <CrmV2Card><CrmV2Spinner /></CrmV2Card>}

            {data && (
              <CrmV2TableCard
                toolbar={
                  <>
                    <CrmV2Search
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={`Rechercher (${LEVEL_LABELS[level].toLowerCase()} Meta)…`}
                      style={{ flex: isMobile ? '1 1 100%' : '0 1 280px' }}
                    />
                    <AdsPillSelect
                      icon={<Building2 size={14} />}
                      value={selectedAccount}
                      onChange={e => setSelectedAccount(e.target.value)}
                      aria-label="Compte"
                      style={isMobile ? { flex: '1 1 100%' } : undefined}
                    >
                      {accounts.map(a => (
                        <option key={a.account_id} value={a.account_id}>
                          {a.name} {a.currency ? `(${a.currency})` : ''}
                        </option>
                      ))}
                    </AdsPillSelect>
                    {loading && <RefreshCw size={14} color={crmV2.textFaint} style={adsSpin} />}
                  </>
                }
                footer={
                  <>
                    <span>{rows.length} {LEVEL_LABELS[level].toLowerCase()}{rows.length > 1 ? 's' : ''}</span>
                    {data.cached && (
                      <span style={{ fontSize: 12, color: crmV2.textFaint }}>
                        Données en cache · récupérées {data.fetched_at ? new Date(data.fetched_at).toLocaleString('fr-FR') : ''}
                        {' · '}
                        <button
                          type="button"
                          onClick={() => loadInsights(true)}
                          style={{ background: 'none', border: 'none', color: crmV2.link, cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                        >
                          Forcer le refresh
                        </button>
                      </span>
                    )}
                  </>
                }
              >
                {rows.length === 0 ? (
                  <CrmV2Empty
                    icon={<BarChart3 size={22} />}
                    title={data.insights.length === 0 ? 'Aucune donnée pour cette période.' : 'Aucun résultat pour cette recherche.'}
                  />
                ) : isMobile ? (
                  // Mobile : une ligne par objet, dépense et leads à droite
                  <div>
                    {visibleRows.map(({ i, id, name }) => (
                      <AdsMobileRow
                        key={id}
                        icon={<AdsIconTile icon={<Facebook size={15} />} color="#1877F2" />}
                        title={name || '(sans nom)'}
                        subtitle={`${fmtNumber(i.impressions)} imp. · CTR ${i.ctr.toFixed(2)}% · ${(i.leads || 0) > 0 ? `CPL ${fmtCurrency(i.cpl || 0, data.currency)}${newLeadsPctLabel(i.leads || 0, i.new_leads)}` : 'CPL —'}`}
                        right={
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>{fmtCurrency(i.spend, data.currency)}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: (i.leads || 0) > 0 ? crmV2.success : crmV2.textFaint }}>
                              {fmtNumber(i.leads || 0)} lead{(i.leads || 0) > 1 ? 's' : ''}
                            </div>
                          </div>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <CrmV2Table>
                    <thead>
                      <tr>
                        <CrmV2Th>{LEVEL_LABELS[level]}</CrmV2Th>
                        <CrmV2Th style={num}>Impressions</CrmV2Th>
                        <CrmV2Th style={num}>Clics</CrmV2Th>
                        <CrmV2Th style={num}>CTR</CrmV2Th>
                        <CrmV2Th style={num}>Dépensé</CrmV2Th>
                        <CrmV2Th style={num}>CPC</CrmV2Th>
                        <CrmV2Th style={num}>Leads CRM</CrmV2Th>
                        <CrmV2Th style={num}><span title={NEW_LEADS_HELP}>% nouveaux</span></CrmV2Th>
                        <CrmV2Th style={num}>CPL</CrmV2Th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(({ i, id, name }) => (
                        <CrmV2Tr key={id}>
                          <CrmV2Td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <AdsIconTile icon={<Facebook size={15} />} color="#1877F2" />
                              <span style={{ fontWeight: 600, color: crmV2.link, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>
                                {name || '(sans nom)'}
                              </span>
                              <AdsFaint>{id}</AdsFaint>
                            </div>
                          </CrmV2Td>
                          <CrmV2Td style={num}>{fmtNumber(i.impressions)}</CrmV2Td>
                          <CrmV2Td style={num}>{fmtNumber(i.clicks)}</CrmV2Td>
                          <CrmV2Td style={num}>{i.ctr.toFixed(2)}%</CrmV2Td>
                          <CrmV2Td style={{ ...num, fontWeight: 700 }}>{fmtCurrency(i.spend, data.currency)}</CrmV2Td>
                          <CrmV2Td style={num}>{fmtCurrency(i.cpc, data.currency)}</CrmV2Td>
                          <CrmV2Td style={num}>
                            <span style={{ fontWeight: 600, color: (i.leads || 0) > 0 ? crmV2.success : crmV2.textFaint }}>
                              {fmtNumber(i.leads || 0)}
                            </span>
                          </CrmV2Td>
                          <CrmV2Td style={num}><NewLeadsPct leads={i.leads || 0} newLeads={i.new_leads} /></CrmV2Td>
                          <CrmV2Td style={num}>
                            {(i.leads || 0) > 0 ? fmtCurrency(i.cpl || 0, data.currency) : '—'}
                          </CrmV2Td>
                        </CrmV2Tr>
                      ))}
                    </tbody>
                  </CrmV2Table>
                )}
                {!search.trim() && (
                  <ShowMoreToggle total={rows.length} expanded={showAllMeta} onToggle={() => setShowAllMeta(v => !v)} />
                )}
              </CrmV2TableCard>
            )}
          </>
        )}

        <GoogleAdsSection
          datePreset={datePreset}
          periodLabel={periodLabel}
          refreshToken={refreshToken}
          isMobile={isMobile}
          onData={setGoogleData}
          overview={googleData && (
            <AdsOverview
              title="Overview Google"
              icon={<GoogleAdsIcon size={16} />}
              current={googleData.totals}
              prev={googleCmp.prev}
              yoy={googleCmp.yoy}
              ranges={ranges}
              currency={googleData.currency}
              isMobile={isMobile}
            />
          )}
        />
      </CrmV2Body>
    </CrmV2Page>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

type GoogleInsight = {
  campaign_id: string
  campaign_name: string
  status: string
  channel: string
  impressions: number
  clicks: number
  spend: number
  ctr: number
  cpc: number
  leads: number
  new_leads?: number
  cpl: number
}

type GoogleInsightsResponse = {
  insights: GoogleInsight[]
  totals: { impressions: number; clicks: number; spend: number; leads: number; unattributed_leads: number; shared_device_excluded: number; ctr: number; cpc: number; cpl: number }
  currency: string
  account_name: string
  cached: boolean
  fetched_at: string
}

const GOOGLE_CHANNELS: Record<string, string> = {
  SEARCH: 'Search', PERFORMANCE_MAX: 'PMax', DISPLAY: 'Display', VIDEO: 'Vidéo', DEMAND_GEN: 'Demand Gen', SHOPPING: 'Shopping',
}

function GoogleAdsSection({ datePreset, periodLabel, refreshToken, isMobile, onData, overview }: {
  datePreset: DatePreset
  periodLabel: string
  refreshToken: number
  isMobile: boolean
  onData: (d: GoogleInsightsResponse | null) => void
  overview?: React.ReactNode
}) {
  const [data, setDataState] = useState<GoogleInsightsResponse | null>(null)
  const setData = useCallback((d: GoogleInsightsResponse | null) => { setDataState(d); onData(d) }, [onData])
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  const load = useCallback(async (force: boolean) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ date_preset: datePreset })
      if (force) params.set('force', '1')
      const res = await fetch(`/api/google-ads/insights?${params.toString()}`)
      const j = await res.json()
      if (j.not_configured) { setNotConfigured(true); setData(null); return }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setNotConfigured(false)
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [datePreset, setData])

  useEffect(() => { load(false) }, [load])
  useEffect(() => { if (refreshToken > 0) load(true) }, [refreshToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = data?.totals
  const leadNotes = t ? [
    t.unattributed_leads > 0 ? `dont ${fmtNumber(t.unattributed_leads)} lead${t.unattributed_leads > 1 ? 's' : ''} sans campagne identifiée` : null,
    t.shared_device_excluded > 0 ? `${fmtNumber(t.shared_device_excluded)} exclus (appareil partagé, ex. salon)` : null,
  ].filter(Boolean).join(' · ') : ''

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.insights
      .filter(i => !q || (i.campaign_name || '').toLowerCase().includes(q) || i.campaign_id.includes(q))
      .sort((a, b) => b.spend - a.spend)
  }, [data, search])
  const visibleRows = search.trim() || showAll ? rows : rows.slice(0, PREVIEW_COUNT)

  const header = (
    <AdsSectionHeader
      icon={<GoogleAdsIcon size={18} />}
      title="Google Ads"
      subtitle={[data ? `${data.account_name} · ${periodLabel}` : periodLabel, leadNotes].filter(Boolean).join(' · ')}
      loading={loading}
      isMobile={isMobile}
    />
  )

  if (notConfigured) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {header}
        <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 10, lineHeight: 1.5 }}>
          Clé du compte de service absente : ajoute la variable <code>GOOGLE_ADS_SERVICE_ACCOUNT_JSON</code> sur le serveur
          (Paramètres › Intégrations › Google Ads).
        </div>
        </CrmV2Card>
      </div>
    )
  }

  return (
    <>
      {header}
      {overview}
      {error && <AdsBanner kind="error">Google Ads — {error}</AdsBanner>}
      {loading && !data && <CrmV2Card><CrmV2Spinner /></CrmV2Card>}

      {data && (
        <>
          <CrmV2TableCard
            toolbar={
              <CrmV2Search
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher (campagne Google)…"
                style={{ flex: isMobile ? '1 1 100%' : '0 1 280px' }}
              />
            }
            footer={
              <>
                <span>{rows.length} campagne{rows.length > 1 ? 's' : ''}</span>
                <span style={{ fontSize: 12, color: crmV2.textFaint }}>
                  {data.cached ? 'Données en cache · ' : 'Récupérées '}
                  {new Date(data.fetched_at).toLocaleString('fr-FR')}
                </span>
              </>
            }
          >
            {rows.length === 0 ? (
              <CrmV2Empty icon={<BarChart3 size={22} />} title={data.insights.length === 0 ? 'Aucune donnée pour cette période.' : 'Aucun résultat pour cette recherche.'} />
            ) : isMobile ? (
              <div>
                {visibleRows.map(i => (
                  <AdsMobileRow
                    key={i.campaign_id}
                    icon={<AdsIconTile icon={<GoogleAdsIcon size={15} />} />}
                    title={i.campaign_name || '(sans nom)'}
                    subtitle={`${fmtNumber(i.impressions)} imp. · CTR ${i.ctr.toFixed(2)}% · ${i.leads > 0 ? `CPL ${fmtCurrency(i.cpl, data.currency)}${newLeadsPctLabel(i.leads, i.new_leads)}` : 'CPL —'}`}
                    right={
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>{fmtCurrency(i.spend, data.currency)}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: i.leads > 0 ? crmV2.success : crmV2.textFaint }}>
                          {fmtNumber(i.leads)} lead{i.leads > 1 ? 's' : ''}
                        </div>
                      </div>
                    }
                  />
                ))}
              </div>
            ) : (
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th>Campagne</CrmV2Th>
                    <CrmV2Th style={num}>Impressions</CrmV2Th>
                    <CrmV2Th style={num}>Clics</CrmV2Th>
                    <CrmV2Th style={num}>CTR</CrmV2Th>
                    <CrmV2Th style={num}>Dépensé</CrmV2Th>
                    <CrmV2Th style={num}>CPC</CrmV2Th>
                    <CrmV2Th style={num}>Leads CRM</CrmV2Th>
                    <CrmV2Th style={num}><span title={NEW_LEADS_HELP}>% nouveaux</span></CrmV2Th>
                    <CrmV2Th style={num}>CPL</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(i => (
                    <CrmV2Tr key={i.campaign_id}>
                      <CrmV2Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <AdsIconTile icon={<GoogleAdsIcon size={15} />} />
                          <span style={{ fontWeight: 600, color: crmV2.link, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>
                            {i.campaign_name || '(sans nom)'}
                          </span>
                          <AdsFaint>
                            {GOOGLE_CHANNELS[i.channel] || i.channel}{i.status === 'PAUSED' ? ' · en pause' : ''}
                          </AdsFaint>
                        </div>
                      </CrmV2Td>
                      <CrmV2Td style={num}>{fmtNumber(i.impressions)}</CrmV2Td>
                      <CrmV2Td style={num}>{fmtNumber(i.clicks)}</CrmV2Td>
                      <CrmV2Td style={num}>{i.ctr.toFixed(2)}%</CrmV2Td>
                      <CrmV2Td style={{ ...num, fontWeight: 700 }}>{fmtCurrency(i.spend, data.currency)}</CrmV2Td>
                      <CrmV2Td style={num}>{fmtCurrency(i.cpc, data.currency)}</CrmV2Td>
                      <CrmV2Td style={num}>
                        <span style={{ fontWeight: 600, color: i.leads > 0 ? crmV2.success : crmV2.textFaint }}>{fmtNumber(i.leads)}</span>
                      </CrmV2Td>
                      <CrmV2Td style={num}><NewLeadsPct leads={i.leads} newLeads={i.new_leads} /></CrmV2Td>
                      <CrmV2Td style={num}>{i.leads > 0 ? fmtCurrency(i.cpl, data.currency) : '—'}</CrmV2Td>
                    </CrmV2Tr>
                  ))}
                </tbody>
              </CrmV2Table>
            )}
            {!search.trim() && (
              <ShowMoreToggle total={rows.length} expanded={showAll} onToggle={() => setShowAll(v => !v)} />
            )}
          </CrmV2TableCard>
        </>
      )}
    </>
  )
}

function AdsSectionHeader({ icon, color, title, subtitle, loading, isMobile }: {
  icon: React.ReactNode
  color?: string
  title: string
  subtitle: string
  loading: boolean
  isMobile: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: isMobile ? 8 : 14 }}>
      <AdsIconTile icon={icon} color={color} size={40} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: crmV2.text }}>{title}</div>
        <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>{subtitle}</div>
      </div>
      {loading && <RefreshCw size={14} color={crmV2.textFaint} style={adsSpin} />}
    </div>
  )
}

/** Bouton « Voir les N autres » / « Réduire » en bas d'une liste de campagnes. */
function ShowMoreToggle({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  if (total <= PREVIEW_COUNT) return null
  const hidden = total - PREVIEW_COUNT
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
        padding: '10px 12px', background: crmV2.bgHover, border: 'none', borderTop: `1px solid ${crmV2.borderLight}`,
        color: crmV2.link, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
      }}
    >
      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      {expanded ? 'Réduire' : `Voir les ${hidden} autre${hidden > 1 ? 's' : ''}`}
    </button>
  )
}

// ─── Overview + comparatifs ────────────────────────────────────────────────

type Totals = { spend: number; leads: number; clicks: number; impressions: number }
type DayRange = { since: string; until: string }
// undefined = en chargement, null = indisponible
type CmpValue = Totals | null | undefined
type Comparison = { prev: CmpValue; yoy: CmpValue }
const EMPTY_CMP: Comparison = { prev: undefined, yoy: undefined }
const NO_CMP: Comparison = { prev: null, yoy: null }

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Plage du preset (mêmes conventions que l'API : last_Nd = N jours, aujourd'hui exclu). */
function presetDayRange(preset: DatePreset, now = new Date()): DayRange | null {
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

/**
 * Période précédente et même période l'an dernier.
 * Mois en cours → même nombre de jours au début du mois précédent ; mois dernier → mois d'avant ;
 * autres presets → plage de même durée juste avant. `null` pour « Tout ».
 */
function compareRanges(preset: DatePreset): { prev: DayRange; yoy: DayRange } | null {
  const cur = presetDayRange(preset)
  if (!cur) return null
  const parse = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 12) }
  const since = parse(cur.since)
  const until = parse(cur.until)
  let prev: DayRange
  if (preset === 'this_month') {
    const lastDayPrevMonth = new Date(since.getFullYear(), since.getMonth(), 0, 12).getDate()
    prev = {
      since: ymd(new Date(since.getFullYear(), since.getMonth() - 1, 1, 12)),
      until: ymd(new Date(since.getFullYear(), since.getMonth() - 1, Math.min(until.getDate(), lastDayPrevMonth), 12)),
    }
  } else if (preset === 'last_month') {
    prev = {
      since: ymd(new Date(since.getFullYear(), since.getMonth() - 1, 1, 12)),
      until: ymd(new Date(since.getFullYear(), since.getMonth(), 0, 12)),
    }
  } else {
    const days = Math.round((until.getTime() - since.getTime()) / 86400_000) + 1
    const pUntil = new Date(since); pUntil.setDate(pUntil.getDate() - 1)
    const pSince = new Date(pUntil); pSince.setDate(pSince.getDate() - (days - 1))
    prev = { since: ymd(pSince), until: ymd(pUntil) }
  }
  // N-1 : mêmes dates (29 février → 28)
  const minusYear = (d: Date) => {
    const lastDay = new Date(d.getFullYear() - 1, d.getMonth() + 1, 0, 12).getDate()
    return ymd(new Date(d.getFullYear() - 1, d.getMonth(), Math.min(d.getDate(), lastDay), 12))
  }
  return { prev, yoy: { since: minusYear(since), until: minusYear(until) } }
}

async function fetchTotals(url: string): Promise<Totals | null> {
  try {
    const res = await fetch(url)
    const j = await res.json()
    if (!res.ok || !j.totals) return null
    const t = j.totals
    return { spend: t.spend || 0, leads: t.leads || 0, clicks: t.clicks || 0, impressions: t.impressions || 0 }
  } catch {
    return null
  }
}

/** Somme Meta + Google ; `null` tant qu'aucune des deux n'est disponible. */
function sumTotals(a?: Totals | null, b?: Totals | null): Totals | null {
  if (!a && !b) return null
  return {
    spend: (a?.spend || 0) + (b?.spend || 0),
    leads: (a?.leads || 0) + (b?.leads || 0),
    clicks: (a?.clicks || 0) + (b?.clicks || 0),
    impressions: (a?.impressions || 0) + (b?.impressions || 0),
  }
}

/** Somme des comparatifs : en chargement tant que l'un des deux l'est. */
function sumCmp(a: CmpValue, b: CmpValue): CmpValue {
  if (a === undefined || b === undefined) return undefined
  return sumTotals(a, b)
}

const cplOf = (t: Totals) => (t.leads > 0 ? t.spend / t.leads : null)
const ctrOf = (t: Totals) => (t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null)

function fmtDayRange(r: DayRange): string {
  const f = (v: string) => { const [y, m, d] = v.split('-'); return `${d}/${m}/${y.slice(2)}` }
  return r.since === r.until ? f(r.since) : `${f(r.since)} → ${f(r.until)}`
}

/** Variation en % ; `good` = sens favorable (hausse pour leads/CTR, baisse pour CPL, neutre pour dépenses). */
function DeltaLine({ label, cur, prev, good, prevLabel, title, emptyText = '—' }: {
  label: string
  emptyText?: string
  cur: number | null
  prev: number | null | undefined
  good: 'up' | 'down' | 'neutral'
  prevLabel: string
  title: string
}) {
  let text = emptyText
  let color: string = crmV2.textFaint
  if (prev === undefined) text = '…'
  else if (cur !== null && prev !== null && prev > 0) {
    const pct = ((cur - prev) / prev) * 100
    const rounded = Math.abs(pct) < 10 ? pct.toFixed(1).replace('.', ',') : Math.round(pct).toString()
    text = `${pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : ''}${rounded} %`
    if (good !== 'neutral' && Math.abs(pct) >= 0.5) {
      color = (pct > 0) === (good === 'up') ? crmV2.successStrong : crmV2.danger
    } else color = crmV2.textMuted
  }
  return (
    <span title={`${title} : ${prevLabel}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted }}>
      {label}
      <b style={{ color, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{text}</b>
    </span>
  )
}

/** Overview : dépenses, leads, CPL moyen, CTR + variation vs période précédente et vs N-1. */
function AdsOverview({ title, icon, note, current, prev, yoy, ranges, currency, isMobile, macro }: {
  title: string
  icon: React.ReactNode
  note?: string
  current: Totals | null
  prev: CmpValue
  yoy: CmpValue
  ranges: { prev: DayRange; yoy: DayRange } | null
  currency: string
  isMobile: boolean
  macro?: boolean
}) {
  if (!current) return null
  const cur = (n: number) => fmtCurrency(n, currency)
  const pct = (n: number) => `${n.toFixed(2).replace('.', ',')} %`
  const loadedPrev = ranges ? prev : null
  const loadedYoy = ranges ? yoy : null
  const pick = <T,>(t: Totals | null | undefined, f: (t: Totals) => T): T | null | undefined => (t === undefined ? undefined : t === null ? null : f(t))

  // Leads CRM suivis seulement depuis avril-mai 2026 : dépenses sans aucun lead = période non suivie
  const untracked = (t: CmpValue) => !!t && t.leads === 0 && t.spend > 0
  const stats: Array<{ label: string; leadBased?: boolean; value: string; cur: number | null; prev: number | null | undefined; yoy: number | null | undefined; good: 'up' | 'down' | 'neutral'; fmt: (n: number) => string }> = [
    { label: 'Dépenses', value: cur(current.spend), cur: current.spend, prev: pick(loadedPrev, t => t.spend), yoy: pick(loadedYoy, t => t.spend), good: 'neutral', fmt: cur },
    { label: 'Leads', leadBased: true, value: fmtNumber(current.leads), cur: current.leads, prev: pick(loadedPrev, t => t.leads), yoy: pick(loadedYoy, t => t.leads), good: 'up', fmt: fmtNumber },
    { label: 'CPL moyen', leadBased: true, value: cplOf(current) !== null ? cur(cplOf(current)!) : '—', cur: cplOf(current), prev: pick(loadedPrev, cplOf), yoy: pick(loadedYoy, cplOf), good: 'down', fmt: cur },
    { label: 'CTR', value: ctrOf(current) !== null ? pct(ctrOf(current)!) : '—', cur: ctrOf(current), prev: pick(loadedPrev, ctrOf), yoy: pick(loadedYoy, ctrOf), good: 'up', fmt: pct },
  ]

  return (
    <CrmV2Card style={{ padding: isMobile ? 14 : macro ? 22 : 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: isMobile ? 12 : macro ? 18 : 14 }}>
        <span style={{ display: 'inline-flex', color: crmV2.textMuted }}>{icon}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
        {note && <div style={{ fontSize: 12, color: crmV2.textFaint, marginLeft: 'auto' }}>{note}</div>}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
        gap: isMobile ? 16 : 24,
      }}>
        {stats.map((st, idx) => (
          <div key={st.label} style={{
            minWidth: 0,
            paddingLeft: !isMobile && idx > 0 ? 24 : 0,
            borderLeft: !isMobile && idx > 0 ? `1px solid ${crmV2.borderLight}` : 'none',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{st.label}</div>
            <div style={{
              fontSize: macro ? (isMobile ? 26 : 36) : (isMobile ? 20 : 26), fontWeight: macro ? 800 : 700, color: crmV2.text,
              letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums',
            }}>
              {st.value}
            </div>
            {ranges && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10 }}>
                <DeltaLine
                  label="vs période préc."
                  cur={st.cur} prev={st.prev} good={st.good}
                  title={`Période précédente (${fmtDayRange(ranges.prev)})`}
                  emptyText={st.leadBased && untracked(loadedPrev) ? 'non suivi' : undefined}
                  prevLabel={st.prev === undefined ? 'chargement…' : st.prev === null ? 'indisponible' : st.fmt(st.prev)}
                />
                <DeltaLine
                  label="vs N-1"
                  cur={st.cur} prev={st.yoy} good={st.good}
                  title={`Même période N-1 (${fmtDayRange(ranges.yoy)})`}
                  emptyText={st.leadBased && untracked(loadedYoy) ? 'non suivi' : undefined}
                  prevLabel={st.yoy === undefined ? 'chargement…' : st.yoy === null ? 'indisponible' : st.fmt(st.yoy)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </CrmV2Card>
  )
}

function GoogleAdsIcon({ size = 18, style }: { size?: number; style?: React.CSSProperties }) {
  // Icône SVG simple (pas dans lucide)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <path d="M9.62 4.07L4.95 12.16a3 3 0 0 0 0 3l4.67 8.09a3 3 0 0 0 5.2 0l4.67-8.09a3 3 0 0 0 0-3l-4.67-8.09a3 3 0 0 0-5.2 0z" fill="#FBBC04"/>
      <circle cx="6.55" cy="18.78" r="3.07" fill="#34A853"/>
      <path d="M14.82 4.07a3 3 0 0 1 1.1 4.1l-4.67 8.08a3 3 0 0 1-5.2-3l4.67-8.08a3 3 0 0 1 4.1-1.1z" fill="#4285F4"/>
    </svg>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const NEW_LEADS_HELP = "Part des leads de la campagne qui n'étaient pas dans le CRM avant : le contact a été créé par ce lead."

/** % de nouveaux leads (contact créé par la campagne) ; — sans lead ou avant que l'API ne renvoie new_leads. */
function NewLeadsPct({ leads, newLeads }: { leads: number; newLeads?: number }) {
  if (leads <= 0 || newLeads == null) return <span style={{ color: crmV2.textFaint }}>—</span>
  return (
    <span title={`${fmtNumber(newLeads)} nouveau${newLeads > 1 ? 'x' : ''} sur ${fmtNumber(leads)} lead${leads > 1 ? 's' : ''}`}>
      {Math.round((newLeads / leads) * 100)}%
    </span>
  )
}

function newLeadsPctLabel(leads: number, newLeads?: number): string {
  return leads > 0 && newLeads != null ? ` · ${Math.round((newLeads / leads) * 100)}% nouveaux` : ''
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' M'
  if (n >= 10_000) return (n / 1_000).toFixed(1).replace('.0', '') + ' k'
  return n.toLocaleString('fr-FR')
}

function fmtCurrency(n: number, currency: string): string {
  try {
    return n.toLocaleString('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 })
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────

const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
