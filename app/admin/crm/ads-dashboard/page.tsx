'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Facebook, RefreshCw, ExternalLink, Calendar, BarChart3, Users, TrendingUp, MousePointerClick, Building2 } from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Header, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page,
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

  // Charge la liste des ad accounts au mount
  useEffect(() => {
    fetch('/api/meta/ads/accounts')
      .then(r => r.json())
      .then(j => {
        const accs = j.accounts || []
        setAccounts(accs)
        if (accs.length > 0 && !selectedAccount) setSelectedAccount(accs[0].account_id)
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
  }, [data, level, search])

  const periodLabel = DATE_PRESETS.find(p => p.value === datePreset)?.label || ''
  const accountCount = `${accounts.length} compte${accounts.length > 1 ? 's' : ''} publicitaire${accounts.length > 1 ? 's' : ''} connecté${accounts.length > 1 ? 's' : ''}`
  const hasAccounts = !loadingAccounts && accounts.length > 0

  const actions = hasAccounts ? (
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
        onClick={() => loadInsights(true)}
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
        subtitle={`Performance des campagnes Meta · ${periodLabel}${!loadingAccounts ? ` · ${accountCount}` : ''}`}
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
            {/* Indicateurs */}
            {data && (
              <CrmV2KpiGrid>
                <CrmV2KpiCard
                  label="Dépensé"
                  value={fmtCurrency(data.totals.spend, data.currency)}
                  icon={<BarChart3 size={15} />}
                  color={crmV2.text}
                  detail={`CPC ${fmtCurrency(data.totals.cpc, data.currency)}`}
                />
                <CrmV2KpiCard
                  label="Leads CRM"
                  value={fmtNumber(data.totals.leads)}
                  icon={<Users size={15} />}
                  color={crmV2.success}
                  detail={data.account_name || periodLabel}
                />
                <CrmV2KpiCard
                  label="CPL"
                  value={data.totals.leads > 0 ? fmtCurrency(data.totals.cpl, data.currency) : '—'}
                  icon={<TrendingUp size={15} />}
                  color={crmV2.link}
                  detail="Coût par lead CRM"
                />
                <CrmV2KpiCard
                  label="CTR"
                  value={`${data.totals.ctr.toFixed(2).replace('.', ',')} %`}
                  icon={<MousePointerClick size={15} />}
                  color={crmV2.gold}
                  detail={`${fmtNumber(data.totals.impressions)} impressions · ${fmtNumber(data.totals.clicks)} clics`}
                />
              </CrmV2KpiGrid>
            )}

            {loading && !data && <CrmV2Card><CrmV2Spinner /></CrmV2Card>}

            {data && (
              <CrmV2TableCard
                toolbar={
                  <>
                    <CrmV2Search
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={`Rechercher (${LEVEL_LABELS[level].toLowerCase()})…`}
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
                    {rows.map(({ i, id, name }) => (
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
                      {rows.map(({ i, id, name }) => (
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
              </CrmV2TableCard>
            )}
          </>
        )}

        {/* Google Ads — bientôt */}
        <CrmV2Card style={{ padding: isMobile ? 14 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <AdsIconTile icon={<GoogleAdsIcon size={18} />} size={40} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Google Ads</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                  background: crmV2.goldSoft, color: crmV2.goldDark,
                }}>Bientôt disponible</span>
              </div>
              <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4, lineHeight: 1.5, maxWidth: 560 }}>
                L&apos;intégration Google Ads nécessite un Developer Token approuvé par Google.
                Cette section sera ajoutée dans un prochain chunk une fois le token obtenu.
              </div>
              <a
                href="https://developers.google.com/google-ads/api/docs/get-started/dev-token"
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 13, fontWeight: 600, color: crmV2.link, textDecoration: 'none' }}
              >
                Demander un Developer Token <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </CrmV2Card>
      </CrmV2Body>
    </CrmV2Page>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

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
