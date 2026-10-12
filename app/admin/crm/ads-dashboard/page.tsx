'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Facebook, RefreshCw, Calendar, BarChart3, Building2, ChevronDown, ChevronUp } from 'lucide-react'
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
        <AdsOverview meta={hasAccounts ? data : null} google={googleData} periodLabel={periodLabel} isMobile={isMobile} />

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
                        subtitle={`${fmtNumber(i.impressions)} imp. · CTR ${i.ctr.toFixed(2)}% · ${(i.leads || 0) > 0 ? `CPL ${fmtCurrency(i.cpl || 0, data.currency)}` : 'CPL —'}`}
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

        <GoogleAdsSection datePreset={datePreset} periodLabel={periodLabel} refreshToken={refreshToken} isMobile={isMobile} onData={setGoogleData} />
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

function GoogleAdsSection({ datePreset, periodLabel, refreshToken, isMobile, onData }: {
  datePreset: DatePreset
  periodLabel: string
  refreshToken: number
  isMobile: boolean
  onData: (d: GoogleInsightsResponse | null) => void
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
                    subtitle={`${fmtNumber(i.impressions)} imp. · CTR ${i.ctr.toFixed(2)}% · ${i.leads > 0 ? `CPL ${fmtCurrency(i.cpl, data.currency)}` : 'CPL —'}`}
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

/** Overview macro : Meta (compte sélectionné) + Google cumulés, avec la répartition par plateforme. */
function AdsOverview({ meta, google, periodLabel, isMobile }: {
  meta: InsightsResponse | null
  google: GoogleInsightsResponse | null
  periodLabel: string
  isMobile: boolean
}) {
  if (!meta && !google) return null
  const currency = meta?.currency || google?.currency || 'EUR'
  const m = meta?.totals
  const g = google?.totals
  const spend = (m?.spend || 0) + (g?.spend || 0)
  const leads = (m?.leads || 0) + (g?.leads || 0)
  const clicks = (m?.clicks || 0) + (g?.clicks || 0)
  const impressions = (m?.impressions || 0) + (g?.impressions || 0)
  const cpl = leads > 0 ? spend / leads : 0
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
  const pct = (n: number) => `${n.toFixed(2).replace('.', ',')} %`
  const cur = (n: number) => fmtCurrency(n, currency)

  const stats: Array<{ label: string; value: string; meta: string; google: string }> = [
    { label: 'Dépenses', value: cur(spend), meta: m ? cur(m.spend) : '—', google: g ? cur(g.spend) : '—' },
    { label: 'Leads', value: fmtNumber(leads), meta: m ? fmtNumber(m.leads) : '—', google: g ? fmtNumber(g.leads) : '—' },
    { label: 'CPL moyen', value: leads > 0 ? cur(cpl) : '—', meta: m && m.leads > 0 ? cur(m.cpl) : '—', google: g && g.leads > 0 ? cur(g.cpl) : '—' },
    { label: 'CTR', value: pct(ctr), meta: m ? pct(m.ctr) : '—', google: g ? pct(g.ctr) : '—' },
  ]

  return (
    <CrmV2Card style={{ padding: isMobile ? 14 : 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: isMobile ? 12 : 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Vue d&apos;ensemble · Meta + Google
        </div>
        <div style={{ fontSize: 12, color: crmV2.textFaint }}>
          {periodLabel}{meta ? ` · Meta : ${meta.account_name}` : ''}{!google ? ' · Google en chargement…' : ''}
        </div>
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
            <div style={{ fontSize: isMobile ? 26 : 36, fontWeight: 800, color: crmV2.text, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {st.value}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10, fontSize: 12, color: crmV2.textMuted }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Facebook size={12} color="#1877F2" /> Meta <b style={{ color: crmV2.text, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{st.meta}</b>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GoogleAdsIcon size={12} /> Google <b style={{ color: crmV2.text, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{st.google}</b>
              </span>
            </div>
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
