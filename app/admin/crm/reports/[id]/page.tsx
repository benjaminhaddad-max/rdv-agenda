'use client'

import { useEffect, useState, useCallback, use, type ReactNode } from 'react'
import {
  AlertCircle, BarChart3, Filter, Gauge, LineChart, PieChart, Plus, RefreshCw, Table2, TrendingDown, TrendingUp, X,
} from 'lucide-react'
import { usePageTitle } from '@/components/DocumentTitle'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Header, CrmV2Input, CrmV2KpiCard, CrmV2Page, CrmV2Pill,
  CrmV2SectionLabel, CrmV2Select, CrmV2Spinner, hexA,
} from '@/components/crm-v2/primitives'
import { CrmV2ReportModal } from '@/components/crm-v2/reports/ReportModal'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

// ─── Types ────────────────────────────────────────────────────────────────
interface Dashboard {
  id: string
  name: string
  description: string | null
  color: string
  is_default: boolean
  widgets: Widget[]
}

interface Widget {
  id: string
  title: string
  description: string | null
  widget_type: 'metric' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'funnel' | 'table'
  size: 'small' | 'medium' | 'large' | 'xlarge'
  height: 'normal' | 'tall'
  data_source: string
  metric: string
  group_by: string | null
  filters: Record<string, unknown>
  time_range: string
  color: string
  show_total: boolean
  show_trend: boolean
  options: Record<string, unknown>
  position: number
}

interface WidgetData {
  total: number
  breakdown: Array<{ key: string; label: string; value: number; color?: string }>
  trend?: { previous: number; delta: number; deltaPct: number }
}

const TIME_RANGE_LABELS: Record<string, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  last_7_days: '7 derniers jours',
  last_30_days: '30 derniers jours',
  this_month: 'Ce mois',
  last_month: 'Mois dernier',
  this_year: 'Cette année',
  all_time: 'Tout',
}

// ─── Page ────────────────────────────────────────────────────────────────
export default function DashboardViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(dashboard?.name)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboards/${id}`)
      const data = await res.json()
      setDashboard(data)
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const refresh = () => setRefreshKey(k => k + 1)

  const deleteWidget = async (w: Widget) => {
    if (!confirm(`Supprimer le widget "${w.title}" ?`)) return
    await fetch(`/api/dashboard-widgets/${w.id}`, { method: 'DELETE' })
    load()
  }

  if (loading || !dashboard) {
    return <CrmV2Page><CrmV2Spinner /></CrmV2Page>
  }

  const dashColor = safeColor(dashboard.color, crmV2.link)

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: '/admin/crm/reports', label: 'Dashboards & Rapports' }}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, borderRadius: 10, background: hexA(dashColor, 0.12), color: dashColor,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <BarChart3 size={16} />
            </span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{dashboard.name}</span>
          </span>
        }
        subtitle={dashboard.description || `${dashboard.widgets.length} widget${dashboard.widgets.length > 1 ? 's' : ''}`}
        actions={
          <>
            <CrmV2Button variant="secondary" icon={<RefreshCw size={14} />} onClick={refresh} title="Actualiser">
              {!isMobile && 'Actualiser'}
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowAddWidget(true)} title="Ajouter un widget">
              {isMobile ? 'Widget' : 'Ajouter un widget'}
            </CrmV2Button>
          </>
        }
      />

      <CrmV2Body style={isMobile ? undefined : { padding: '20px 28px 24px' }}>
        {dashboard.widgets.length === 0 ? (
          <CrmV2Card style={{ border: `1px dashed ${crmV2.borderStrong}`, boxShadow: 'none' }}>
            <CrmV2Empty
              icon={<BarChart3 size={28} />}
              title="Dashboard vide"
              description="Ajoute ton premier widget pour commencer à visualiser tes données."
              action={
                <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowAddWidget(true)}>
                  Ajouter un widget
                </CrmV2Button>
              }
            />
          </CrmV2Card>
        ) : (
          // Mobile : grille 2 colonnes — petits widgets côte à côte, les autres en pleine largeur
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: isMobile ? 8 : 16,
            gridAutoRows: isMobile ? 'minmax(110px, auto)' : 'minmax(150px, auto)',
          }}>
            {dashboard.widgets.map(w => (
              <WidgetContainer
                key={w.id + '-' + refreshKey}
                widget={w}
                onDelete={() => deleteWidget(w)}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
      </CrmV2Body>

      {showAddWidget && (
        <AddWidgetModal
          dashboardId={id}
          onClose={() => setShowAddWidget(false)}
          onAdded={() => { setShowAddWidget(false); load() }}
        />
      )}
    </CrmV2Page>
  )
}

/** Couleur stockée en base ramenée à un hex exploitable (sinon couleur de repli). */
function safeColor(c: string | null | undefined, fallback: string = crmV2.gold) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback
}

// ─── Widget container ────────────────────────────────────────────────────
function WidgetContainer({ widget, onDelete, isMobile }: { widget: Widget; onDelete: () => void; isMobile: boolean }) {
  const [data, setData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard-widgets/${widget.id}/data`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [widget.id])

  const sizeMap: Record<string, React.CSSProperties> = {
    small:  { gridColumn: 'span 1' },
    medium: { gridColumn: 'span 2' },
    large:  { gridColumn: 'span 3' },
    xlarge: { gridColumn: 'span 4' },
  }
  const heightMap: Record<string, React.CSSProperties> = {
    normal: { gridRow: 'span 1' },
    tall:   { gridRow: 'span 2' },
  }
  // Mobile : seuls les petits widgets (métriques) restent sur 1 colonne, le reste prend toute la largeur
  const mobileSpan: React.CSSProperties = { gridColumn: widget.size === 'small' ? 'span 1' : '1 / -1', gridRow: 'auto' }
  const placement = isMobile ? mobileSpan : { ...sizeMap[widget.size], ...heightMap[widget.height] }
  const rangeLabel = TIME_RANGE_LABELS[widget.time_range] || widget.time_range

  // Widget « métrique » une fois chargé : carte indicateur V2
  if (widget.widget_type === 'metric' && !loading && !error && data) {
    return (
      <div style={{ ...placement, position: 'relative', minWidth: 0 }}>
        <CrmV2KpiCard
          label={widget.title}
          value={data.total.toLocaleString('fr-FR')}
          icon={<Gauge size={15} />}
          color={safeColor(widget.color)}
          detail={<MetricDetail widget={widget} data={data} rangeLabel={rangeLabel} />}
          style={{ height: '100%', boxSizing: 'border-box', paddingRight: 40 }}
        />
        <div style={{ position: 'absolute', top: isMobile ? 8 : 12, right: isMobile ? 6 : 10 }}>
          <WidgetDeleteButton onClick={onDelete} />
        </div>
      </div>
    )
  }

  return (
    <div style={{
      ...placement,
      background: crmV2.bg,
      border: `1px solid ${crmV2.border}`,
      borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow,
      padding: isMobile ? 12 : 16,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      minHeight: isMobile ? 110 : 150,
      minWidth: 0,
      boxSizing: 'border-box',
    }}>
      {/* En-tête du widget */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8, flexWrap: isMobile && widget.size === 'small' ? 'wrap' : undefined }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <CrmV2SectionLabel>{widget.title}</CrmV2SectionLabel>
          {widget.description && (
            <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 2 }}>{widget.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <CrmV2Pill style={{ fontSize: 11, padding: '1px 8px', color: crmV2.textMuted }}>{rangeLabel}</CrmV2Pill>
          <WidgetDeleteButton onClick={onDelete} />
        </div>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: crmV2.textMuted, fontSize: 12 }}>Chargement…</div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#dc2626', fontSize: 12 }}>
            <AlertCircle size={14} /> {error}
          </div>
        ) : !data ? (
          <div style={{ textAlign: 'center', color: crmV2.textMuted, fontSize: 12 }}>Pas de données</div>
        ) : (
          <WidgetRenderer widget={widget} data={data} isMobile={isMobile} />
        )}
      </div>
    </div>
  )
}

function WidgetDeleteButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Supprimer"
      aria-label="Supprimer le widget"
      style={{
        width: 26, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: hover ? crmV2.dangerSoft : 'transparent', color: hover ? crmV2.danger : crmV2.textFaint,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <X size={14} />
    </button>
  )
}

// ─── Renderer selon le type de widget ─────────────────────────────────────
function WidgetRenderer({ widget, data, isMobile }: { widget: Widget; data: WidgetData; isMobile: boolean }) {
  switch (widget.widget_type) {
    case 'metric':
      // Normalement rendu en CrmV2KpiCard par WidgetContainer ; repli simple
      return (
        <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: safeColor(widget.color), letterSpacing: '-0.02em' }}>
          {data.total.toLocaleString('fr-FR')}
        </div>
      )
    case 'bar_chart':  return <BarChartWidget widget={widget} data={data} />
    case 'line_chart': return <LineChartWidget widget={widget} data={data} />
    case 'pie_chart':  return <PieChartWidget widget={widget} data={data} isMobile={isMobile} />
    case 'funnel':     return <FunnelWidget widget={widget} data={data} isMobile={isMobile} />
    case 'table':      return <TableWidget data={data} />
    default:           return <div style={{ color: crmV2.textMuted, fontSize: 12 }}>Type non supporté : {widget.widget_type}</div>
  }
}

function NoData() {
  return <div style={{ color: crmV2.textMuted, fontSize: 12, textAlign: 'center' }}>Aucune donnée</div>
}

// ─── Détail d'une métrique (tendance + période) ──────────────────────────
function MetricDetail({ widget, data, rangeLabel }: { widget: Widget; data: WidgetData; rangeLabel: string }) {
  const t = data.trend
  const up = (t?.delta || 0) > 0
  const down = (t?.delta || 0) < 0
  const showTrend = widget.show_trend && t && t.previous !== 0
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {showTrend && (
        <>
          {up && <TrendingUp size={12} style={{ color: crmV2.successStrong }} />}
          {down && <TrendingDown size={12} style={{ color: '#dc2626' }} />}
          <span style={{ color: up ? crmV2.successStrong : down ? '#dc2626' : crmV2.textMuted, fontWeight: 700 }}>
            {up ? '+' : ''}{t.deltaPct.toFixed(1)}%
          </span>
          <span>vs période précédente ·</span>
        </>
      )}
      <span>{rangeLabel}</span>
      {widget.description && <span style={{ color: crmV2.textFaint }}>· {widget.description}</span>}
    </span>
  )
}

// ─── Bar chart ───────────────────────────────────────────────────────────
function BarChartWidget({ widget, data }: { widget: Widget; data: WidgetData }) {
  const max = Math.max(1, ...data.breakdown.map(b => b.value))
  const color = safeColor(widget.color)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.breakdown.length === 0 && <NoData />}
      {data.breakdown.slice(0, 10).map(b => (
        <div key={b.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{b.label}</span>
            <span style={{ color: crmV2.text, fontWeight: 700 }}>{b.value.toLocaleString('fr-FR')}</span>
          </div>
          <div style={{ height: 8, background: crmV2.bgSoft, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              width: `${(b.value / max) * 100}%`,
              height: '100%',
              background: b.color || color,
              borderRadius: 999,
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Line chart (SVG inline) ─────────────────────────────────────────────
function LineChartWidget({ widget, data }: { widget: Widget; data: WidgetData }) {
  if (data.breakdown.length === 0) return <NoData />
  const color = safeColor(widget.color)
  const values = data.breakdown.map(b => b.value)
  const max = Math.max(1, ...values)
  const W = 600, H = 140, P = 20
  const step = (W - 2 * P) / Math.max(1, values.length - 1)
  const points = values.map((v, i) => {
    const x = P + i * step
    const y = H - P - (v / max) * (H - 2 * P)
    return `${x},${y}`
  }).join(' ')
  const area = `${P},${H - P} ${points} ${W - P},${H - P}`

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="140" preserveAspectRatio="none">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke={crmV2.border} strokeWidth="1" />
        <polygon points={area} fill={color} opacity="0.12" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {values.map((v, i) => {
          const x = P + i * step
          const y = H - P - (v / max) * (H - 2 * P)
          return <circle key={i} cx={x} cy={y} r="3" fill={color}><title>{`${data.breakdown[i]?.label} : ${v}`}</title></circle>
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: crmV2.textFaint, marginTop: 4 }}>
        <span>{data.breakdown[0]?.label}</span>
        <span>{data.breakdown[data.breakdown.length - 1]?.label}</span>
      </div>
    </div>
  )
}

// Palette des répartitions : or Diploma puis couleurs de la charte (étapes, issues)
const PIE_PALETTE = ['#C9A84C', '#0091ae', '#a855f7', '#22c55e', '#ef4444', '#4cabdb', '#06b6d4', '#b8963e', '#16a34a', '#7c98b6']

// ─── Pie chart (SVG inline) ──────────────────────────────────────────────
function PieChartWidget({ widget, data, isMobile }: { widget: Widget; data: WidgetData; isMobile: boolean }) {
  void widget
  if (data.breakdown.length === 0) return <NoData />
  const total = data.breakdown.reduce((s, b) => s + b.value, 0)
  if (total === 0) return <NoData />
  const R = 40, C = 2 * Math.PI * R
  // Début de chaque part sur le cercle (cumul des parts précédentes)
  const dashes = data.breakdown.map(b => (b.value / total) * C)
  const offsets = dashes.map((_, i) => dashes.slice(0, i).reduce((acc, d) => acc + d, 0))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 20 }}>
      <svg viewBox="0 0 100 100" width={isMobile ? 96 : 120} height={isMobile ? 96 : 120} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        {data.breakdown.map((b, i) => (
          <circle
            key={b.key}
            r={R} cx="50" cy="50"
            fill="transparent"
            stroke={b.color || PIE_PALETTE[i % PIE_PALETTE.length]}
            strokeWidth="20"
            strokeDasharray={`${dashes[i]} ${C}`}
            strokeDashoffset={-offsets[i]}
          />
        ))}
      </svg>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.breakdown.slice(0, 6).map((b, i) => {
          const col = b.color || PIE_PALETTE[i % PIE_PALETTE.length]
          const pct = ((b.value / total) * 100).toFixed(0)
          return (
            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
              <span style={{ flex: 1, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
              <span style={{ color: crmV2.textMuted, fontWeight: 700 }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Funnel (étapes successives) ──────────────────────────────────────────
function FunnelWidget({ widget, data, isMobile }: { widget: Widget; data: WidgetData; isMobile: boolean }) {
  void widget
  if (data.breakdown.length === 0) return <NoData />
  const max = Math.max(1, ...data.breakdown.map(b => b.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.breakdown.map(b => {
        const pct = (b.value / max) * 100
        const col = safeColor(b.color)
        return (
          <div key={b.key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: isMobile ? '8px 10px' : '9px 14px',
            background: hexA(col, 0.10),
            borderLeft: `3px solid ${col}`,
            borderRadius: 10,
            width: isMobile ? `${Math.max(55, pct)}%` : `${Math.max(40, pct)}%`,
            minWidth: isMobile ? 0 : 200,
            boxSizing: 'border-box',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: col }}>{b.value.toLocaleString('fr-FR')}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────
function TableWidget({ data }: { data: WidgetData }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {data.breakdown.slice(0, 15).map(b => (
          <tr key={b.key} style={{ height: 36 }}>
            <td style={{ padding: '0 2px', color: crmV2.text, borderBottom: `1px solid ${crmV2.borderLight}` }}>{b.label}</td>
            <td style={{ padding: '0 2px', textAlign: 'right', color: crmV2.text, fontWeight: 700, borderBottom: `1px solid ${crmV2.borderLight}` }}>{b.value.toLocaleString('fr-FR')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Modal ajout de widget ────────────────────────────────────────────────
const WIDGET_TYPES: { key: string; label: string; icon: ReactNode; description: string }[] = [
  { key: 'metric',     label: 'Métrique',  icon: <Gauge size={16} />,     description: 'Un grand nombre avec tendance' },
  { key: 'bar_chart',  label: 'Barres',    icon: <BarChart3 size={16} />, description: 'Comparaison par catégorie' },
  { key: 'line_chart', label: 'Courbe',    icon: <LineChart size={16} />, description: 'Évolution dans le temps' },
  { key: 'pie_chart',  label: 'Camembert', icon: <PieChart size={16} />,  description: 'Répartition en %' },
  { key: 'funnel',     label: 'Funnel',    icon: <Filter size={16} />,    description: 'Étapes successives' },
  { key: 'table',      label: 'Tableau',   icon: <Table2 size={16} />,    description: 'Liste triée' },
]

const DATA_SOURCES = [
  { key: 'contacts',         label: 'Contacts',       groupBys: ['day', 'week', 'month', 'origine', 'conversion_event', 'ns_forms', 'formation', 'classe', 'zone', 'owner'] },
  { key: 'deals',            label: 'Transactions',    groupBys: ['day', 'week', 'month', 'stage', 'owner'] },
  { key: 'appointments',     label: 'Rendez-vous',     groupBys: ['day', 'week', 'month', 'status', 'owner'] },
  { key: 'campaigns',        label: 'Campagnes email', groupBys: ['week', 'month', 'status'] },
  { key: 'forms',            label: 'Formulaires',     groupBys: ['status'] },
  { key: 'form_submissions', label: 'Soumissions',     groupBys: ['day', 'week', 'month', 'status'] },
  { key: 'hubspot_forms',    label: 'Formulaires (vrais counts)', groupBys: [] },
]

const GROUP_BY_LABELS: Record<string, string> = {
  day: 'Par jour',
  week: 'Par semaine',
  month: 'Par mois',
  origine: 'Par origine (OFFLINE, PAID_SOCIAL…)',
  source: 'Par origine / source',
  conversion_event: 'Par formulaire d\'acquisition',
  ns_forms:         'Par formulaire NS - (uniquement)',
  stage: 'Par étape',
  owner: 'Par propriétaire',
  formation: 'Par formation',
  classe: 'Par classe',
  zone: 'Par zone',
  status: 'Par statut',
}

function AddWidgetModal({ dashboardId, onClose, onAdded }: { dashboardId: string; onClose: () => void; onAdded: () => void }) {
  const isMobile = useIsMobile()
  const [widgetType, setWidgetType] = useState('metric')
  const [title, setTitle] = useState('')
  const [dataSource, setDataSource] = useState('contacts')
  const [groupBy, setGroupBy] = useState('')
  const [timeRange, setTimeRange] = useState('last_30_days')
  const [size, setSize] = useState('medium')
  const [color, setColor] = useState('#C9A84C')
  const [saving, setSaving] = useState(false)

  const currentSrc = DATA_SOURCES.find(s => s.key === dataSource)!

  // Un widget "metric" n'a pas de group_by
  const needsGroupBy = widgetType !== 'metric'

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          widget_type: widgetType,
          data_source: dataSource,
          group_by: needsGroupBy ? (groupBy || currentSrc.groupBys[0]) : null,
          time_range: timeRange,
          size,
          color,
        }),
      })
      if (res.ok) onAdded()
      else alert((await res.json()).error)
    } finally { setSaving(false) }
  }

  return (
    <CrmV2ReportModal
      title="Ajouter un widget"
      onClose={onClose}
      width={640}
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={submit} disabled={!title.trim() || saving}>
            {saving ? 'Ajout…' : 'Ajouter le widget'}
          </CrmV2Button>
        </>
      }
    >
      <Section title="1. Type de widget">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {WIDGET_TYPES.map(wt => {
            const active = widgetType === wt.key
            return (
              <button
                key={wt.key}
                type="button"
                onClick={() => setWidgetType(wt.key)}
                style={{
                  background: active ? crmV2.goldSoft : crmV2.bg,
                  border: `1px solid ${active ? crmV2.gold : crmV2.border}`,
                  borderRadius: 12, padding: '10px 10px', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit', minHeight: 44,
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 8, marginBottom: 6,
                  background: active ? 'rgba(201,168,76,0.22)' : crmV2.bgSoft, color: active ? crmV2.goldDark : crmV2.textMuted,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{wt.icon}</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>{wt.label}</div>
                <div style={{ fontSize: 11, color: crmV2.textMuted, marginTop: 2 }}>{wt.description}</div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="2. Titre">
        <CrmV2Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex : Contacts PASS ce mois"
        />
      </Section>

      <Section title="3. Source de données">
        <CrmV2Select value={dataSource} onChange={e => { setDataSource(e.target.value); setGroupBy('') }}>
          {DATA_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </CrmV2Select>
      </Section>

      {needsGroupBy && (
        <Section title="4. Regrouper par">
          <CrmV2Select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {currentSrc.groupBys.map(gb => (
              <option key={gb} value={gb}>{GROUP_BY_LABELS[gb] || gb}</option>
            ))}
          </CrmV2Select>
        </Section>
      )}

      <Section title={`${needsGroupBy ? '5' : '4'}. Période`}>
        <CrmV2Select value={timeRange} onChange={e => setTimeRange(e.target.value)}>
          {Object.entries(TIME_RANGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </CrmV2Select>
      </Section>

      <Section title={`${needsGroupBy ? '6' : '5'}. Taille & couleur`}>
        <div style={{ display: 'flex', gap: 8 }}>
          <CrmV2Select value={size} onChange={e => setSize(e.target.value)} style={{ flex: 1 }}>
            <option value="small">Petit (1 colonne)</option>
            <option value="medium">Moyen (2 colonnes)</option>
            <option value="large">Grand (3 colonnes)</option>
            <option value="xlarge">Pleine largeur</option>
          </CrmV2Select>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            aria-label="Couleur du widget"
            style={{ width: 50, height: 38, padding: 2, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, cursor: 'pointer', background: crmV2.bg, flexShrink: 0 }}
          />
        </div>
      </Section>
    </CrmV2ReportModal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <CrmV2SectionLabel style={{ marginBottom: 6 }}>{title}</CrmV2SectionLabel>
      {children}
    </div>
  )
}
