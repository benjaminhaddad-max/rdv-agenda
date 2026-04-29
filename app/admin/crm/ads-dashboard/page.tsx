'use client'

import { useEffect, useState, useCallback } from 'react'
import { Facebook, Loader2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'

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

export default function AdsDashboardPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [level, setLevel] = useState<Level>('campaign')
  const [datePreset, setDatePreset] = useState<DatePreset>('last_30d')
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>Ads Dashboard</h1>
          <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
            Performances de tes campagnes Meta et Google Ads en temps réel.
          </p>
        </div>

        {error && (
          <div style={banner('error')}><AlertCircle size={16} /> {error}</div>
        )}

        {/* ─── META ───────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Facebook size={18} style={{ color: '#1877F2' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Meta Ads</h2>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {accounts.length} compte{accounts.length > 1 ? 's' : ''} publicitaire{accounts.length > 1 ? 's' : ''} connecté{accounts.length > 1 ? 's' : ''}
            </span>
          </div>

          {loadingAccounts ? (
            <div style={card({ padding: 40, textAlign: 'center' })}>
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div style={card({ padding: 40, textAlign: 'center' })}>
              <Facebook size={36} style={{ color: '#1877F2', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Aucun compte publicitaire connecté</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                Reconnecte-toi à Facebook depuis la page <a href="/admin/crm/meta-ads" style={{ color: '#2ea3f2' }}>Meta Lead Ads</a> pour autoriser l&apos;accès aux ad accounts.
              </div>
              <a href="/api/meta/oauth/start" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 8, background: '#1877F2', color: '#fff',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>
                <Facebook size={16} /> Reconnecter Facebook
              </a>
            </div>
          ) : (
            <>
              {/* Filtres */}
              <div style={card({ padding: 12, marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' })}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Compte</label>
                  <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} style={selectStyle}>
                    {accounts.map(a => (
                      <option key={a.account_id} value={a.account_id}>
                        {a.name} {a.currency ? `(${a.currency})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Niveau</label>
                  <select value={level} onChange={e => setLevel(e.target.value as Level)} style={selectStyle}>
                    <option value="campaign">Campagne</option>
                    <option value="adset">Adset</option>
                    <option value="ad">Ad</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Période</label>
                  <select value={datePreset} onChange={e => setDatePreset(e.target.value as DatePreset)} style={selectStyle}>
                    {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <button onClick={() => loadInsights(true)} disabled={loading} style={{
                  marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd6e2',
                  background: '#fff', color: '#516f90', fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                  Rafraîchir
                </button>
              </div>

              {/* Cards KPI */}
              {data && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12,
                }}>
                  <KpiCard label="Dépensé" value={fmtCurrency(data.totals.spend, data.currency)} highlight />
                  <KpiCard label="Impressions" value={fmtNumber(data.totals.impressions)} />
                  <KpiCard label="Clics" value={fmtNumber(data.totals.clicks)} sub={`CTR ${data.totals.ctr.toFixed(2)}%`} />
                  <KpiCard label="Leads CRM" value={fmtNumber(data.totals.leads)} sub={data.totals.leads > 0 ? `CPL ${fmtCurrency(data.totals.cpl, data.currency)}` : ''} />
                  <KpiCard label="CPC" value={fmtCurrency(data.totals.cpc, data.currency)} />
                </div>
              )}

              {/* Table */}
              {loading && !data && (
                <div style={card({ padding: 40, textAlign: 'center' })}>
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}
              {data && (
                <div style={card({ padding: 0, overflow: 'hidden' })}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={th}>{level === 'campaign' ? 'Campagne' : level === 'adset' ? 'Adset' : 'Ad'}</th>
                          <th style={thNum}>Impressions</th>
                          <th style={thNum}>Clics</th>
                          <th style={thNum}>CTR</th>
                          <th style={thNum}>Dépensé</th>
                          <th style={thNum}>CPC</th>
                          <th style={thNum}>Leads CRM</th>
                          <th style={thNum}>CPL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.insights.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                              Aucune donnée pour cette période.
                            </td>
                          </tr>
                        ) : data.insights.map(i => {
                          const id = level === 'campaign' ? i.campaign_id : level === 'adset' ? i.adset_id : i.ad_id
                          const name = level === 'campaign' ? i.campaign_name : level === 'adset' ? i.adset_name : i.ad_name
                          return (
                            <tr key={id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={td}>
                                <div style={{ fontWeight: 600 }}>{name || '(sans nom)'}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{id}</div>
                              </td>
                              <td style={tdNum}>{fmtNumber(i.impressions)}</td>
                              <td style={tdNum}>{fmtNumber(i.clicks)}</td>
                              <td style={tdNum}>{i.ctr.toFixed(2)}%</td>
                              <td style={tdNum}><strong>{fmtCurrency(i.spend, data.currency)}</strong></td>
                              <td style={tdNum}>{fmtCurrency(i.cpc, data.currency)}</td>
                              <td style={tdNum}>
                                <span style={{
                                  fontWeight: 600,
                                  color: (i.leads || 0) > 0 ? '#0038f0' : '#94a3b8',
                                }}>
                                  {fmtNumber(i.leads || 0)}
                                </span>
                              </td>
                              <td style={tdNum}>
                                {(i.leads || 0) > 0 ? fmtCurrency(i.cpl || 0, data.currency) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data?.cached && (
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, textAlign: 'right' }}>
                  Données en cache · récupérées {data.fetched_at ? new Date(data.fetched_at).toLocaleString('fr-FR') : ''}
                  {' · '}
                  <button onClick={() => loadInsights(true)} style={{ background: 'none', border: 'none', color: '#2ea3f2', cursor: 'pointer', padding: 0, fontSize: 10 }}>
                    Forcer le refresh
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ─── GOOGLE ─────────────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <GoogleAdsIcon />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Google Ads</h2>
          </div>
          <div style={card({ padding: 32, textAlign: 'center' })}>
            <GoogleAdsIcon size={36} style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Bientôt disponible</div>
            <div style={{ fontSize: 13, color: '#64748b', maxWidth: 480, margin: '0 auto' }}>
              L&apos;intégration Google Ads nécessite un Developer Token approuvé par Google.
              Cette section sera ajoutée dans un prochain chunk une fois le token obtenu.
            </div>
            <a
              href="https://developers.google.com/google-ads/api/docs/get-started/dev-token"
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, color: '#2ea3f2', textDecoration: 'none' }}
            >
              Demander un Developer Token <ExternalLink size={12} />
            </a>
          </div>
        </section>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #2ea3f2, #0038f0)' : '#fff',
      color: highlight ? '#fff' : '#1a2f4b',
      border: highlight ? 'none' : '1px solid #cbd6e2',
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', opacity: highlight ? 0.85 : 0.65, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: highlight ? 0.85 : 0.65, marginTop: 4 }}>{sub}</div>}
    </div>
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

function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12, ...extra }
}
function banner(kind: 'error' | 'success'): React.CSSProperties {
  return {
    padding: '10px 14px',
    background: kind === 'error' ? '#fef2f2' : '#f0fdf4',
    border: `1px solid ${kind === 'error' ? '#fecaca' : '#bbf7d0'}`,
    borderRadius: 8,
    color: kind === 'error' ? '#dc2626' : '#166534',
    fontSize: 13, marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 8,
  }
}
const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }
const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 12, background: '#fff', minWidth: 160,
}
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }
const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
