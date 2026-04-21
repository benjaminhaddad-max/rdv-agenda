'use client'

import { useEffect, useState, useCallback, use } from 'react'
import {
  BarChart3, ChevronLeft, Plus, Trash2, Edit3, TrendingUp, TrendingDown,
  RefreshCw, X,
} from 'lucide-react'

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
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
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
    return <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#516f90', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Chargement…</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#33475b', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Topbar */}
      <div style={{ padding: '0 24px', height: 52, background: '#ffffff', borderBottom: '1px solid #cbd6e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/admin/crm/reports" style={{ color: '#516f90', textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={14} /> Dashboards
          </a>
          <div style={{ width: 1, height: 22, background: '#cbd6e2' }} />
          <BarChart3 size={16} style={{ color: dashboard.color }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{dashboard.name}</span>
          {dashboard.description && (
            <span style={{ fontSize: 11, color: '#516f90', marginLeft: 4 }}>· {dashboard.description}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={refresh}
            style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8, padding: '6px 12px', color: '#516f90', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
          >
            <RefreshCw size={12} /> Actualiser
          </button>
          <button
            onClick={() => setShowAddWidget(true)}
            style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '6px 14px', color: '#ccac71', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <Plus size={14} /> Ajouter un widget
          </button>
        </div>
      </div>

      {/* Grid widgets */}
      <div style={{ padding: 20, maxWidth: 1600, margin: '0 auto' }}>
        {dashboard.widgets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, background: '#ffffff', border: '1px dashed #cbd6e2', borderRadius: 12 }}>
            <BarChart3 size={48} style={{ color: '#cbd6e2', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Dashboard vide</div>
            <div style={{ fontSize: 13, color: '#516f90', marginBottom: 20 }}>
              Ajoute ton premier widget pour commencer à visualiser tes données.
            </div>
            <button onClick={() => setShowAddWidget(true)} style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '10px 20px', color: '#ccac71', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}>
              <Plus size={14} /> Ajouter un widget
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            gridAutoRows: 'minmax(160px, auto)',
          }}>
            {dashboard.widgets.map(w => (
              <WidgetContainer
                key={w.id + '-' + refreshKey}
                widget={w}
                onDelete={() => deleteWidget(w)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddWidget && (
        <AddWidgetModal
          dashboardId={id}
          onClose={() => setShowAddWidget(false)}
          onAdded={() => { setShowAddWidget(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Widget container ────────────────────────────────────────────────────
function WidgetContainer({ widget, onDelete }: { widget: Widget; onDelete: () => void }) {
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

  return (
    <div style={{
      ...sizeMap[widget.size],
      ...heightMap[widget.height],
      background: '#ffffff',
      border: '1px solid #cbd6e2',
      borderRadius: 12,
      padding: 18,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 160,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#516f90', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
            {widget.title}
          </div>
          {widget.description && (
            <div style={{ fontSize: 11, color: '#7c98b6' }}>{widget.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#7c98b6', padding: '2px 8px', background: '#f5f8fa', borderRadius: 999 }}>
            {TIME_RANGE_LABELS[widget.time_range] || widget.time_range}
          </span>
          <button
            onClick={onDelete}
            style={{ background: 'transparent', border: 'none', color: '#cbd6e2', cursor: 'pointer', padding: 2 }}
            title="Supprimer"
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#cbd6e2'}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#7c98b6', fontSize: 12 }}>Chargement…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: '#ef4444', fontSize: 12 }}>❌ {error}</div>
        ) : !data ? (
          <div style={{ textAlign: 'center', color: '#7c98b6', fontSize: 12 }}>Pas de données</div>
        ) : (
          <WidgetRenderer widget={widget} data={data} />
        )}
      </div>
    </div>
  )
}

// ─── Renderer selon le type de widget ─────────────────────────────────────
function WidgetRenderer({ widget, data }: { widget: Widget; data: WidgetData }) {
  switch (widget.widget_type) {
    case 'metric':     return <MetricWidget widget={widget} data={data} />
    case 'bar_chart':  return <BarChartWidget widget={widget} data={data} />
    case 'line_chart': return <LineChartWidget widget={widget} data={data} />
    case 'pie_chart':  return <PieChartWidget widget={widget} data={data} />
    case 'funnel':     return <FunnelWidget widget={widget} data={data} />
    case 'table':      return <TableWidget data={data} />
    default:           return <div style={{ color: '#7c98b6' }}>Type non supporté: {widget.widget_type}</div>
  }
}

// ─── Metric (big number) ─────────────────────────────────────────────────
function MetricWidget({ widget, data }: { widget: Widget; data: WidgetData }) {
  const t = data.trend
  const up = (t?.delta || 0) > 0
  const down = (t?.delta || 0) < 0
  return (
    <div>
      <div style={{ fontSize: 36, fontWeight: 700, color: widget.color, lineHeight: 1 }}>
        {data.total.toLocaleString('fr-FR')}
      </div>
      {widget.show_trend && t && t.previous !== 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          {up && <TrendingUp size={12} style={{ color: '#22c55e' }} />}
          {down && <TrendingDown size={12} style={{ color: '#ef4444' }} />}
          <span style={{ color: up ? '#22c55e' : down ? '#ef4444' : '#7c98b6', fontWeight: 600 }}>
            {up ? '+' : ''}{t.deltaPct.toFixed(1)}%
          </span>
          <span style={{ color: '#7c98b6' }}>vs période précédente</span>
        </div>
      )}
    </div>
  )
}

// ─── Bar chart ───────────────────────────────────────────────────────────
function BarChartWidget({ widget, data }: { widget: Widget; data: WidgetData }) {
  const max = Math.max(1, ...data.breakdown.map(b => b.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.breakdown.length === 0 && <div style={{ color: '#7c98b6', fontSize: 12, textAlign: 'center' }}>Aucune donnée</div>}
      {data.breakdown.slice(0, 10).map(b => (
        <div key={b.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: '#33475b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{b.label}</span>
            <span style={{ color: '#33475b', fontWeight: 600 }}>{b.value}</span>
          </div>
          <div style={{ height: 8, background: '#f5f8fa', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${(b.value / max) * 100}%`,
              height: '100%',
              background: b.color || widget.color,
              borderRadius: 4,
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
  if (data.breakdown.length === 0) {
    return <div style={{ color: '#7c98b6', fontSize: 12, textAlign: 'center' }}>Aucune donnée</div>
  }
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
        <polygon points={area} fill={widget.color} opacity="0.15" />
        <polyline points={points} fill="none" stroke={widget.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => {
          const x = P + i * step
          const y = H - P - (v / max) * (H - 2 * P)
          return <circle key={i} cx={x} cy={y} r="3" fill={widget.color} />
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#7c98b6', marginTop: 4 }}>
        <span>{data.breakdown[0]?.label}</span>
        <span>{data.breakdown[data.breakdown.length - 1]?.label}</span>
      </div>
    </div>
  )
}

// ─── Pie chart (SVG inline) ──────────────────────────────────────────────
function PieChartWidget({ widget, data }: { widget: Widget; data: WidgetData }) {
  void widget
  if (data.breakdown.length === 0) {
    return <div style={{ color: '#7c98b6', fontSize: 12, textAlign: 'center' }}>Aucune donnée</div>
  }
  const palette = ['#ccac71', '#06b6d4', '#a855f7', '#22c55e', '#ef4444', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316']
  const total = data.breakdown.reduce((s, b) => s + b.value, 0)
  if (total === 0) {
    return <div style={{ color: '#7c98b6', fontSize: 12, textAlign: 'center' }}>Aucune donnée</div>
  }
  let offset = 0
  const R = 40, C = 2 * Math.PI * R

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg viewBox="0 0 100 100" width="120" height="120" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        {data.breakdown.map((b, i) => {
          const pct = b.value / total
          const dash = pct * C
          const col = b.color || palette[i % palette.length]
          const el = (
            <circle
              key={b.key}
              r={R} cx="50" cy="50"
              fill="transparent"
              stroke={col}
              strokeWidth="20"
              strokeDasharray={`${dash} ${C}`}
              strokeDashoffset={-offset}
            />
          )
          offset += dash
          return el
        })}
      </svg>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.breakdown.slice(0, 6).map((b, i) => {
          const col = b.color || palette[i % palette.length]
          const pct = ((b.value / total) * 100).toFixed(0)
          return (
            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: col, flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#33475b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
              <span style={{ color: '#516f90', fontWeight: 600 }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Funnel (étapes successives) ──────────────────────────────────────────
function FunnelWidget({ widget, data }: { widget: Widget; data: WidgetData }) {
  void widget
  if (data.breakdown.length === 0) {
    return <div style={{ color: '#7c98b6', fontSize: 12, textAlign: 'center' }}>Aucune donnée</div>
  }
  const max = Math.max(1, ...data.breakdown.map(b => b.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.breakdown.map(b => {
        const pct = (b.value / max) * 100
        return (
          <div key={b.key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            background: b.color ? `${b.color}15` : '#f5f8fa',
            borderLeft: `3px solid ${b.color || '#ccac71'}`,
            borderRadius: 6,
            width: `${Math.max(40, pct)}%`,
            minWidth: 200,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#33475b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: b.color || '#ccac71' }}>{b.value}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────
function TableWidget({ data }: { data: WidgetData }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {data.breakdown.slice(0, 15).map(b => (
          <tr key={b.key} style={{ borderBottom: '1px solid #eaf0f6' }}>
            <td style={{ padding: '6px 0', color: '#33475b' }}>{b.label}</td>
            <td style={{ padding: '6px 0', textAlign: 'right', color: '#33475b', fontWeight: 600 }}>{b.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Modal ajout de widget ────────────────────────────────────────────────
const WIDGET_TYPES = [
  { key: 'metric',     label: 'Métrique', icon: '📊', description: 'Un grand nombre avec tendance' },
  { key: 'bar_chart',  label: 'Barres',   icon: '📶', description: 'Comparaison par catégorie' },
  { key: 'line_chart', label: 'Courbe',   icon: '📈', description: 'Évolution dans le temps' },
  { key: 'pie_chart',  label: 'Camembert', icon: '🥧', description: 'Répartition en %' },
  { key: 'funnel',     label: 'Funnel',   icon: '🔻', description: 'Étapes successives' },
  { key: 'table',      label: 'Tableau',  icon: '📋', description: 'Liste triée' },
]

const DATA_SOURCES = [
  { key: 'contacts',         label: 'Contacts',       groupBys: ['day', 'week', 'month', 'source', 'formation', 'classe', 'zone', 'owner'] },
  { key: 'deals',            label: 'Transactions',    groupBys: ['day', 'week', 'month', 'stage', 'owner'] },
  { key: 'appointments',     label: 'Rendez-vous',     groupBys: ['day', 'week', 'month', 'status', 'owner'] },
  { key: 'campaigns',        label: 'Campagnes email', groupBys: ['week', 'month', 'status'] },
  { key: 'forms',            label: 'Formulaires',     groupBys: ['status'] },
  { key: 'form_submissions', label: 'Soumissions',     groupBys: ['day', 'week', 'month', 'status'] },
]

const GROUP_BY_LABELS: Record<string, string> = {
  day: 'Par jour',
  week: 'Par semaine',
  month: 'Par mois',
  source: 'Par origine / source',
  stage: 'Par étape',
  owner: 'Par propriétaire',
  formation: 'Par formation',
  classe: 'Par classe',
  zone: 'Par zone',
  status: 'Par statut',
}

function AddWidgetModal({ dashboardId, onClose, onAdded }: { dashboardId: string; onClose: () => void; onAdded: () => void }) {
  const [widgetType, setWidgetType] = useState('metric')
  const [title, setTitle] = useState('')
  const [dataSource, setDataSource] = useState('contacts')
  const [groupBy, setGroupBy] = useState('')
  const [timeRange, setTimeRange] = useState('last_30_days')
  const [size, setSize] = useState('medium')
  const [color, setColor] = useState('#ccac71')
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
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 640, maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 24, zIndex: 61 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#33475b' }}>Ajouter un widget</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#516f90', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <Section title="1. Type de widget">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {WIDGET_TYPES.map(wt => (
              <button
                key={wt.key}
                onClick={() => setWidgetType(wt.key)}
                style={{
                  background: widgetType === wt.key ? 'rgba(204,172,113,0.15)' : '#f5f8fa',
                  border: `1px solid ${widgetType === wt.key ? 'rgba(204,172,113,0.5)' : '#cbd6e2'}`,
                  borderRadius: 8, padding: '10px 8px', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{wt.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#33475b' }}>{wt.label}</div>
                <div style={{ fontSize: 10, color: '#516f90', marginTop: 2 }}>{wt.description}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="2. Titre">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Contacts PASS ce mois"
            style={inputStyle}
          />
        </Section>

        <Section title="3. Source de données">
          <select value={dataSource} onChange={e => { setDataSource(e.target.value); setGroupBy('') }} style={inputStyle}>
            {DATA_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Section>

        {needsGroupBy && (
          <Section title="4. Regrouper par">
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={inputStyle}>
              {currentSrc.groupBys.map(gb => (
                <option key={gb} value={gb}>{GROUP_BY_LABELS[gb] || gb}</option>
              ))}
            </select>
          </Section>
        )}

        <Section title={`${needsGroupBy ? '5' : '4'}. Période`}>
          <select value={timeRange} onChange={e => setTimeRange(e.target.value)} style={inputStyle}>
            {Object.entries(TIME_RANGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Section>

        <Section title={`${needsGroupBy ? '6' : '5'}. Taille & couleur`}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={size} onChange={e => setSize(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="small">Petit (1 colonne)</option>
              <option value="medium">Moyen (2 colonnes)</option>
              <option value="large">Grand (3 colonnes)</option>
              <option value="xlarge">Pleine largeur</option>
            </select>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 50, height: 38, padding: 2, border: '1px solid #cbd6e2', borderRadius: 8, cursor: 'pointer' }} />
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#ffffff', border: '1px solid #cbd6e2', color: '#516f90', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Annuler</button>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', color: '#ccac71', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: !title.trim() || saving ? 0.5 : 1 }}
          >
            {saving ? 'Ajout…' : 'Ajouter le widget'}
          </button>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8,
  padding: '8px 12px', color: '#33475b', fontSize: 13, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
}
