'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { AdsBanner, AdsFaint, adsSpin } from './ui'

/**
 * Détail d'une campagne Google Ads, déplié sous sa ligne dans le Dashboard Ads :
 * courbe jour par jour, puis onglets Groupes d'annonces / Mots-clés /
 * Termes de recherche / Annonces (Groupes d'assets seulement pour PMax).
 */

type Metrics = { impressions: number; clicks: number; spend: number; ctr: number; cpc: number; platform_leads: number }
type AdGroup = Metrics & { id: string; name: string; status: string; kind: 'ad_group' | 'asset_group' }
type Keyword = Metrics & { criterion_id: string; ad_group_id: string; ad_group_name: string; text: string; match_type: string; status: string; quality_score: number | null }
type SearchTerm = Metrics & { term: string; status: string }
type Ad = Metrics & { id: string; ad_group_id: string; ad_group_name: string; type: string; status: string; headlines: string[]; descriptions: string[]; final_url: string | null }
type Daily = { date: string; impressions: number; clicks: number; spend: number; platform_leads: number }

type DetailResponse = {
  ad_groups: AdGroup[]
  keywords: Keyword[]
  search_terms: SearchTerm[]
  ads: Ad[]
  daily: Daily[]
  errors: Record<string, string>
  leads: { traced: number; by_ad_group: Record<string, number>; by_keyword: Record<string, number>; by_ad: Record<string, number>; by_day: Record<string, number> }
  cached: boolean
  fetched_at: string
}

type Tab = 'ad_groups' | 'keywords' | 'search_terms' | 'ads'

const MATCH_TYPES: Record<string, string> = { EXACT: 'Exact', PHRASE: 'Expression', BROAD: 'Large' }
const TERM_STATUS: Record<string, string> = { ADDED: 'ajouté en mot-clé', EXCLUDED: 'exclu', ADDED_EXCLUDED: 'ajouté et exclu' }
const AD_TYPES: Record<string, string> = { RESPONSIVE_SEARCH_AD: 'Annonce responsive', EXPANDED_TEXT_AD: 'Annonce texte', RESPONSIVE_DISPLAY_AD: 'Display responsive' }
const ROWS_PREVIEW = 10

export function GoogleCampaignDetail({ campaignId, channel, datePreset, refreshToken, campaignLeads, currency }: {
  campaignId: string
  channel: string
  datePreset: string
  refreshToken: number
  /** Leads CRM de la campagne (toutes méthodes de rattachement), pour situer les leads tracés */
  campaignLeads: number
  currency: string
}) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const isPmax = channel === 'PERFORMANCE_MAX'
  const [tab, setTab] = useState<Tab>(isPmax ? 'ad_groups' : 'keywords')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null) // eslint-disable-line react-hooks/set-state-in-effect
    const params = new URLSearchParams({ campaign_id: campaignId, channel, date_preset: datePreset })
    if (refreshToken > 0) params.set('force', '1')
    fetch(`/api/google-ads/campaign-detail?${params.toString()}`)
      .then(async res => {
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
        if (!cancelled) setData(j)
      })
      .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setData(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [campaignId, channel, datePreset, refreshToken])

  if (loading && !data) {
    return <div style={infoLine}><RefreshCw size={13} style={adsSpin} /> Chargement du détail de la campagne…</div>
  }
  if (error) return <div style={{ padding: 12 }}><AdsBanner kind="error">Détail de la campagne — {error}</AdsBanner></div>
  if (!data) return null

  const fmtCur = (n: number) => fmtCurrency(n, currency)
  const tabs: Array<{ id: Tab; label: string; count: number }> = isPmax
    ? [{ id: 'ad_groups', label: "Groupes d'assets", count: data.ad_groups.length }]
    : [
      { id: 'keywords', label: 'Mots-clés', count: data.keywords.length },
      { id: 'search_terms', label: 'Termes de recherche', count: data.search_terms.length },
      { id: 'ad_groups', label: "Groupes d'annonces", count: data.ad_groups.length },
      { id: 'ads', label: 'Annonces', count: data.ads.length },
    ]
  const errorFor = data.errors[tab === 'ad_groups' ? 'ad_groups' : tab]

  return (
    <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14, background: crmV2.bgHover }}>
      <DailyChart daily={data.daily} leadsByDay={data.leads.by_day} currency={currency} isAllTime={datePreset === 'maximum'} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} style={pill(tab === t.id)}>
            {t.label} <span style={{ opacity: 0.7, fontWeight: 600 }}>{t.count}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <AdsFaint style={{ fontSize: 12 }} >
          <span title="Leads CRM dont l'URL de la page porte l'identifiant de la campagne (hsa_cam), ce qui permet de les rattacher au groupe, au mot-clé et à l'annonce. Les leads rattachés autrement (gclid seul, utm_campaign) comptent seulement dans le total de la campagne.">
            {fmtNumber(data.leads.traced)} lead{data.leads.traced > 1 ? 's' : ''} CRM tracé{data.leads.traced > 1 ? 's' : ''} jusqu&apos;au mot-clé
            {campaignLeads > 0 ? ` sur ${fmtNumber(campaignLeads)}` : ''} · {data.cached ? 'cache' : 'à jour'} {new Date(data.fetched_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </AdsFaint>
        {loading && <RefreshCw size={13} color={crmV2.textFaint} style={adsSpin} />}
      </div>

      {errorFor && <AdsBanner kind="warning">Données indisponibles pour cet onglet — {errorFor}</AdsBanner>}

      {tab === 'ad_groups' && (
        <DetailTable
          rows={data.ad_groups}
          keyOf={g => g.id}
          firstHeader={isPmax ? "Groupe d'assets" : "Groupe d'annonces"}
          first={g => <NameCell name={g.name} sub={statusLabel(g.status)} />}
          leadsOf={isPmax ? undefined : g => data.leads.by_ad_group[g.id] || 0}
          fmtCur={fmtCur}
          empty="Aucun groupe avec de l'activité sur la période."
        />
      )}
      {tab === 'keywords' && (
        <DetailTable
          rows={data.keywords}
          keyOf={k => `${k.ad_group_id}~${k.criterion_id}`}
          firstHeader="Mot-clé"
          first={k => (
            <NameCell
              name={k.text}
              badges={[MATCH_TYPES[k.match_type] || k.match_type, k.quality_score != null ? `QS ${k.quality_score}/10` : null]}
              sub={[k.ad_group_name, statusLabel(k.status)].filter(Boolean).join(' · ')}
            />
          )}
          leadsOf={k => data.leads.by_keyword[`${k.ad_group_id}~${k.criterion_id}`] || 0}
          fmtCur={fmtCur}
          empty="Aucun mot-clé avec de l'activité sur la période."
        />
      )}
      {tab === 'search_terms' && (
        <DetailTable
          rows={data.search_terms}
          keyOf={t => t.term}
          firstHeader="Terme recherché"
          first={t => <NameCell name={t.term} sub={TERM_STATUS[t.status]} />}
          fmtCur={fmtCur}
          note={data.search_terms.length >= 150 ? 'Les 150 termes les plus coûteux.' : undefined}
          empty="Aucun terme de recherche sur la période."
        />
      )}
      {tab === 'ads' && (
        <DetailTable
          rows={data.ads}
          keyOf={a => `${a.ad_group_id}~${a.id}`}
          firstHeader="Annonce"
          first={a => <AdCell ad={a} />}
          leadsOf={a => data.leads.by_ad[a.id] || 0}
          fmtCur={fmtCur}
          empty="Aucune annonce avec de l'activité sur la période."
        />
      )}
    </div>
  )
}

// ─── Tableau générique ─────────────────────────────────────────────────────

function DetailTable<T extends Metrics>({ rows, keyOf, firstHeader, first, leadsOf, fmtCur, empty, note }: {
  rows: T[]
  keyOf: (r: T) => string
  firstHeader: string
  first: (r: T) => ReactNode
  /** Leads CRM tracés ; absent = colonne masquée (termes de recherche, PMax) */
  leadsOf?: (r: T) => number
  fmtCur: (n: number) => string
  empty: string
  note?: string
}) {
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 })
  const sorted = useMemo(() => {
    const val = (r: T) => sort.key === 'leads' ? (leadsOf?.(r) ?? 0) : sort.key === 'cpl' ? cplOf(r, leadsOf) : r[sort.key]
    return [...rows].sort((a, b) => (val(a) - val(b)) * sort.dir)
  }, [rows, sort, leadsOf])
  if (rows.length === 0) return <div style={{ fontSize: 12, color: crmV2.textMuted, padding: '4px 2px' }}>{empty}</div>
  const visible = showAll ? sorted : sorted.slice(0, ROWS_PREVIEW)

  const th = (key: SortKey, label: string, title?: string) => (
    <th
      onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
      title={title}
      style={{ ...thStyle, ...numStyle, cursor: 'pointer', color: sort.key === key ? crmV2.text : crmV2.textMuted }}
    >
      {label}{sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>{firstHeader}</th>
              {th('impressions', 'Impr.')}
              {th('clicks', 'Clics')}
              {th('ctr', 'CTR')}
              {th('spend', 'Dépensé')}
              {th('cpc', 'CPC')}
              {th('platform_leads', 'Conv. Google', 'Conversions déclarées par Google Ads')}
              {leadsOf && th('leads', 'Leads CRM', "Leads CRM tracés par l'URL de la page (hsa_*)")}
              {leadsOf && th('cpl', 'CPL')}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const leads = leadsOf?.(r) ?? 0
              return (
                <tr key={keyOf(r)} style={{ borderTop: `1px solid ${crmV2.borderLight}` }}>
                  <td style={{ ...tdStyle, minWidth: 220 }}>{first(r)}</td>
                  <td style={{ ...tdStyle, ...numStyle }}>{fmtNumber(r.impressions)}</td>
                  <td style={{ ...tdStyle, ...numStyle }}>{fmtNumber(r.clicks)}</td>
                  <td style={{ ...tdStyle, ...numStyle }}>{r.ctr.toFixed(2)}%</td>
                  <td style={{ ...tdStyle, ...numStyle, fontWeight: 700 }}>{fmtCur(r.spend)}</td>
                  <td style={{ ...tdStyle, ...numStyle }}>{r.clicks > 0 ? fmtCur(r.cpc) : '—'}</td>
                  <td style={{ ...tdStyle, ...numStyle, color: r.platform_leads > 0 ? crmV2.text : crmV2.textFaint }}>{fmtNumber(r.platform_leads)}</td>
                  {leadsOf && (
                    <td style={{ ...tdStyle, ...numStyle, fontWeight: 600, color: leads > 0 ? crmV2.success : crmV2.textFaint }}>{fmtNumber(leads)}</td>
                  )}
                  {leadsOf && <td style={{ ...tdStyle, ...numStyle }}>{leads > 0 ? fmtCur(r.spend / leads) : '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {(rows.length > ROWS_PREVIEW || note) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: `1px solid ${crmV2.borderLight}`, fontSize: 12 }}>
          {rows.length > ROWS_PREVIEW && (
            <button type="button" onClick={() => setShowAll(v => !v)} style={linkBtn}>
              {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showAll ? 'Réduire' : `Voir les ${rows.length - ROWS_PREVIEW} autres`}
            </button>
          )}
          {note && <span style={{ color: crmV2.textFaint }}>{note}</span>}
        </div>
      )}
    </div>
  )
}

type SortKey = keyof Metrics | 'leads' | 'cpl'
// CPL pour le tri : sans lead, en fin de liste quel que soit le sens
const cplOf = <T extends Metrics>(r: T, leadsOf?: (r: T) => number) => {
  const l = leadsOf?.(r) ?? 0
  return l > 0 ? r.spend / l : Number.MAX_SAFE_INTEGER
}

function NameCell({ name, sub, badges }: { name: string; sub?: string; badges?: Array<string | null> }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }} title={name}>
          {name || '(sans nom)'}
        </span>
        {badges?.filter(Boolean).map(b => <span key={b} style={chip}>{b}</span>)}
      </div>
      {sub && <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function AdCell({ ad }: { ad: Ad }) {
  const [open, setOpen] = useState(false)
  const title = ad.headlines.slice(0, 3).join(' | ') || AD_TYPES[ad.type] || ad.type
  return (
    <div style={{ minWidth: 0, maxWidth: 460 }}>
      <div style={{ fontWeight: 600, color: crmV2.link, whiteSpace: open ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>
        {title}
      </div>
      {ad.descriptions[0] && (
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, whiteSpace: open ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {ad.descriptions[0]}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: crmV2.textFaint, flexWrap: 'wrap' }}>
        <span>{[ad.ad_group_name, statusLabel(ad.status)].filter(Boolean).join(' · ')}</span>
        {ad.final_url && (
          <a href={ad.final_url} target="_blank" rel="noreferrer" style={{ color: crmV2.textFaint, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {ad.final_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} <ExternalLink size={10} />
          </a>
        )}
        {(ad.headlines.length > 3 || ad.descriptions.length > 1) && (
          <button type="button" onClick={() => setOpen(v => !v)} style={{ ...linkBtn, fontSize: 11 }}>
            {open ? 'Masquer les textes' : `${ad.headlines.length} titres · ${ad.descriptions.length} descriptions`}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ad.headlines.map((h, i) => <span key={i} style={chip}>{h}</span>)}
          </div>
          {ad.descriptions.map((d, i) => <div key={i} style={{ color: crmV2.textMuted }}>• {d}</div>)}
        </div>
      )}
    </div>
  )
}

// ─── Courbe jour par jour ──────────────────────────────────────────────────

function DailyChart({ daily, leadsByDay, currency, isAllTime }: { daily: Daily[]; leadsByDay: Record<string, number>; currency: string; isAllTime: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  if (daily.length < 2) return null
  const maxSpend = Math.max(...daily.map(d => d.spend), 1)
  const maxLeads = Math.max(...daily.map(d => leadsByDay[d.date] || 0), 1)
  const H = 64
  const cur = hover != null ? daily[hover] : null
  const fmtDay = (s: string) => { const [, m, d] = s.split('-'); return `${d}/${m}` }
  const totLeads = daily.reduce((n, d) => n + (leadsByDay[d.date] || 0), 0)
  return (
    <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', fontSize: 12, color: crmV2.textMuted, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: crmV2.text }}>Jour par jour{isAllTime ? ' (90 derniers jours)' : ''}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: crmV2.link, opacity: 0.55 }} /> Dépensé</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: crmV2.success }} /> Leads CRM tracés ({fmtNumber(totLeads)})</span>
        <span style={{ flex: 1 }} />
        {cur ? (
          <span style={{ color: crmV2.text }}>
            <strong>{fmtDay(cur.date)}</strong> · {fmtCurrency(cur.spend, currency)} · {fmtNumber(cur.clicks)} clic{cur.clicks > 1 ? 's' : ''} · {fmtNumber(cur.platform_leads)} conv. · {fmtNumber(leadsByDay[cur.date] || 0)} lead{(leadsByDay[cur.date] || 0) > 1 ? 's' : ''} CRM
          </span>
        ) : (
          <span style={{ color: crmV2.textFaint }}>Survoler une barre pour le détail</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: daily.length > 60 ? 1 : 2, height: H }} onMouseLeave={() => setHover(null)}>
        {daily.map((d, i) => {
          const l = leadsByDay[d.date] || 0
          return (
            <div key={d.date} onMouseEnter={() => setHover(i)} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', cursor: 'default' }}>
              {l > 0 && (
                <span style={{
                  position: 'absolute', bottom: `${Math.max(8, (l / maxLeads) * (H - 8))}px`, width: 6, height: 6, borderRadius: 3,
                  background: crmV2.success, boxShadow: `0 0 0 1.5px ${crmV2.bg}`,
                }} />
              )}
              <span style={{
                width: '100%', height: `${Math.max(2, (d.spend / maxSpend) * H)}px`, borderRadius: '2px 2px 0 0',
                background: crmV2.link, opacity: hover === i ? 0.9 : 0.45,
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: crmV2.textFaint, marginTop: 4 }}>
        <span>{fmtDay(daily[0].date)}</span>
        <span>{fmtDay(daily[daily.length - 1].date)}</span>
      </div>
    </div>
  )
}

// ─── Utilitaires ───────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  return s === 'PAUSED' ? 'en pause' : s === 'REMOVED' ? 'supprimé' : ''
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

const infoLine: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 10px 54px', fontSize: 12, color: crmV2.textMuted, background: crmV2.bgHover }
const thStyle: CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', background: crmV2.thBg, whiteSpace: 'nowrap', userSelect: 'none' }
const tdStyle: CSSProperties = { padding: '8px 12px', verticalAlign: 'top', color: crmV2.text }
const numStyle: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const chip: CSSProperties = { fontSize: 11, fontWeight: 600, color: crmV2.textMuted, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0 }
const linkBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: crmV2.link, fontWeight: 600, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }
const pill = (active: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: crmV2.radiusPill,
  border: `1px solid ${active ? crmV2.primary : crmV2.borderStrong}`, background: active ? crmV2.primary : crmV2.bg,
  color: active ? '#fff' : crmV2.text, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
})
