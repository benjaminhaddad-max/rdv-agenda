'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard, TrendingUp, Users, Briefcase, CheckSquare, Workflow,
  AlertCircle, Calendar, Mail, ArrowUpRight, Clock, RefreshCw,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface Stats {
  generated_at: string
  leads: {
    today: number
    last_7_days: number
    last_30_days: number
    daily_series: Array<{ date: string; count: number }>
  }
  sources: Array<{ label: string; count: number }>
  stages:  Array<{ label: string; count: number }>
  classes: Record<string, number>
  deals: {
    open: number
    won_month: number
  }
  tasks: {
    overdue: number
    today: number
    week: number
  }
  workflows: {
    active: number
    running_executions: number
  }
  top_owners: Array<{ owner_id: string; name: string; count: number }>
  last_submissions: Array<{
    hubspot_contact_id: string
    firstname: string | null
    lastname: string | null
    email: string | null
    recent_conversion_event: string | null
    recent_conversion_date: string | null
    hs_lead_status: string | null
  }>
}

const LEAD_STATUS_COLORS: Record<string, string> = {
  'Nouveau':              '#2ea3f2',
  'Nouveau - Chaud':      '#ef4444',
  'Rdv pris':             '#22c55e',
  'Pré-inscription':      '#a855f7',
  'Inscrit':              '#16a34a',
  'NRP1':                 '#f59e0b',
  'NRP2':                 '#f59e0b',
  'NRP3':                 '#fb923c',
  'Délai de réflexion':   '#fde047',
  'À replanifier':        '#0ea5e9',
  'Perdu':                '#94a3b8',
  '—':                    '#cbd6e2',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/crm/dashboard/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  if (loading && !stats) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#516f90', fontSize: 13 }}>Chargement…</div>
  }
  if (err) {
    return <div style={{ padding: 40, color: '#ef4444' }}>Erreur : {err}</div>
  }
  if (!stats) return null

  const trend7d = stats.leads.last_7_days
  const trend30d = stats.leads.last_30_days

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', fontFamily: 'Inter, system-ui, sans-serif', color: '#33475b' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
              <Link href="/admin/crm" style={{ color: '#fff', textDecoration: 'none' }}>CRM</Link> / Dashboard
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <LayoutDashboard size={22} /> Dashboard
            </h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              Vue d&apos;ensemble du CRM — leads, deals, tâches et workflows.
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{ background: '#fff', color: '#0038f0', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualiser
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
        {/* Row 1 — KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <KpiCard
            icon={<TrendingUp size={16} />}
            label="Nouveaux leads"
            primary={stats.leads.today}
            sub={`${stats.leads.last_7_days} sur 7j · ${stats.leads.last_30_days} sur 30j`}
            color="#0038f0"
            href="/admin/crm"
            sparkline={stats.leads.daily_series.map(s => s.count)}
          />
          <KpiCard
            icon={<Briefcase size={16} />}
            label="Transactions"
            primary={stats.deals.open}
            primaryLabel="ouvertes"
            sub={`${stats.deals.won_month} gagnées ce mois`}
            color="#22c55e"
            href="/admin/crm/transactions"
          />
          <KpiCard
            icon={<CheckSquare size={16} />}
            label="Mes tâches"
            primary={stats.tasks.overdue}
            primaryLabel={stats.tasks.overdue === 1 ? 'en retard' : 'en retard'}
            sub={`${stats.tasks.today} aujourd'hui · ${stats.tasks.week} cette semaine`}
            color={stats.tasks.overdue > 0 ? '#ef4444' : '#516f90'}
            href="/admin/crm/tasks"
            highlight={stats.tasks.overdue > 0}
          />
          <KpiCard
            icon={<Workflow size={16} />}
            label="Workflows"
            primary={stats.workflows.active}
            primaryLabel="actifs"
            sub={`${stats.workflows.running_executions} contacts en cours`}
            color="#a855f7"
            href="/admin/crm/workflows"
          />
        </div>

        {/* Row 2 — Sparkline + Sources */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <Card title="Leads par jour (30 derniers jours)" icon={TrendingUp}>
            <LineSpark data={stats.leads.daily_series} />
          </Card>
          <Card title="Sources des leads (30j)" icon={ArrowUpRight}>
            <BarList items={stats.sources.map(s => ({ label: s.label, value: s.count }))} color="#2ea3f2" />
          </Card>
        </div>

        {/* Row 3 — Stages + Classes + Top owners */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Card title="Statuts du lead (tous)" icon={Users}>
            <BarList
              items={stats.stages.map(s => ({ label: s.label, value: s.count, color: LEAD_STATUS_COLORS[s.label] }))}
              color="#a855f7"
            />
          </Card>
          <Card title="Classes (leads 30j)" icon={Calendar}>
            <BarList
              items={['Terminale', 'Première', 'Seconde']
                .filter(c => stats.classes[c])
                .map(c => ({ label: c, value: stats.classes[c] || 0 }))}
              color="#ccac71"
            />
          </Card>
          <Card title="Top commerciaux (30j)" icon={TrendingUp}>
            {stats.top_owners.length === 0 ? (
              <div style={{ color: '#516f90', fontSize: 12, padding: 20, textAlign: 'center' }}>
                Aucun owner sur cette période
              </div>
            ) : (
              <BarList items={stats.top_owners.map(o => ({ label: o.name, value: o.count }))} color="#0038f0" />
            )}
          </Card>
        </div>

        {/* Row 4 — Last submissions */}
        <Card title="Dernières soumissions de formulaire" icon={Mail}>
          {stats.last_submissions.length === 0 ? (
            <div style={{ color: '#516f90', fontSize: 12, padding: 20, textAlign: 'center' }}>Aucune soumission récente</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {stats.last_submissions.map((s, i) => (
                <li key={s.hubspot_contact_id + i}>
                  <Link
                    href={`/admin/crm/contacts/${s.hubspot_contact_id}`}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'center', padding: '10px 12px', textDecoration: 'none', color: '#33475b', borderRadius: 6 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f8fa')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {[s.firstname, s.lastname].filter(Boolean).join(' ') || s.email || 'Anonyme'}
                      </div>
                      <div style={{ fontSize: 11, color: '#516f90', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#516f90', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.recent_conversion_event || '—'}
                    </div>
                    <div>
                      {s.hs_lead_status && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: (LEAD_STATUS_COLORS[s.hs_lead_status] || '#cbd6e2') + '22', color: LEAD_STATUS_COLORS[s.hs_lead_status] || '#516f90' }}>
                          {s.hs_lead_status}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#516f90', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                      <Clock size={11} />
                      {s.recent_conversion_date ? formatDistanceToNow(new Date(s.recent_conversion_date), { locale: fr, addSuffix: true }) : '—'}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div style={{ fontSize: 10, color: '#516f90', textAlign: 'right', padding: '0 8px' }}>
          Données générées {format(new Date(stats.generated_at), "'le' d MMMM yyyy 'à' HH:mm:ss", { locale: fr })}
        </div>
      </div>

      <style jsx>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── KpiCard ─────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, primary, primaryLabel, sub, color, href, sparkline, highlight,
}: {
  icon: React.ReactNode
  label: string
  primary: number
  primaryLabel?: string
  sub?: string
  color: string
  href?: string
  sparkline?: number[]
  highlight?: boolean
}) {
  const inner = (
    <div style={{
      background: '#fff', borderRadius: 12, padding: 16,
      border: `1px solid ${highlight ? color + '55' : '#cbd6e2'}`,
      boxShadow: highlight ? `0 4px 16px ${color}1c` : '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column', gap: 8, height: '100%',
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#516f90', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color }}>{primary.toLocaleString('fr-FR')}</div>
        {primaryLabel && <div style={{ fontSize: 12, color: '#516f90' }}>{primaryLabel}</div>}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#516f90' }}>{sub}</div>}
      {sparkline && sparkline.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <Sparkline data={sparkline} color={color} />
        </div>
      )}
    </div>
  )
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    )
  }
  return inner
}

// ─── Card ────────────────────────────────────────────────────────────────
function Card({ title, icon: Icon, children }: { title: string; icon?: typeof TrendingUp; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #cbd6e2', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, fontWeight: 600, color: '#33475b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {Icon && <Icon size={12} style={{ color: '#ccac71' }} />}
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── BarList ─────────────────────────────────────────────────────────────
function BarList({ items, color }: { items: Array<{ label: string; value: number; color?: string }>; color: string }) {
  if (items.length === 0) {
    return <div style={{ color: '#516f90', fontSize: 12, padding: 20, textAlign: 'center' }}>Aucune donnée</div>
  }
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => {
        const pct = (item.value / max) * 100
        const itemColor = item.color || color
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#33475b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{item.label}</span>
              <span style={{ color: '#516f90', fontWeight: 600 }}>{item.value.toLocaleString('fr-FR')}</span>
            </div>
            <div style={{ height: 6, background: '#f0f0f5', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: itemColor, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Sparkline (SVG) ─────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null
  const max = Math.max(...data, 1)
  const W = 100, H = 30
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * W
    const y = H - (v / max) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 30, display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── LineSpark (avec valeurs Y et axe X + tooltip au hover) ──────────────
function LineSpark({ data }: { data: Array<{ date: string; count: number }> }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  if (data.length === 0) return <div style={{ color: '#516f90', fontSize: 12, padding: 20, textAlign: 'center' }}>Aucune donnée</div>

  const W = 600, H = 160, padL = 30, padB = 22, padT = 8, padR = 4
  const max = Math.max(...data.map(d => d.count), 1)
  const total = data.reduce((s, d) => s + d.count, 0)
  const points = data.map((d, i) => {
    const x = padL + (i / (data.length - 1 || 1)) * (W - padL - padR)
    const y = padT + (1 - d.count / max) * (H - padT - padB)
    return { x, y, ...d }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = `${path} L ${points[points.length - 1].x.toFixed(1)} ${(H - padB).toFixed(1)} L ${padL} ${(H - padB).toFixed(1)} Z`

  const labelIdx = [0, Math.floor(data.length / 2), data.length - 1]

  // Convertit la position de souris en index de point (0..data.length-1)
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const xRatio = (e.clientX - rect.left) / rect.width  // 0..1
    // Inverse mapping de x → index
    const usable = (W - padL - padR) / W
    const startRatio = padL / W
    const adj = (xRatio - startRatio) / usable
    const idx = Math.round(adj * (data.length - 1))
    if (idx >= 0 && idx < data.length) setHoverIdx(idx)
    else setHoverIdx(null)
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null
  const tooltipLeft = hovered ? `${(hovered.x / W) * 100}%` : '0'
  const tooltipDate = hovered ? new Date(hovered.date) : null
  const tooltipLabel = tooltipDate
    ? tooltipDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    : ''

  return (
    <div>
      <div
        ref={wrapRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        style={{ position: 'relative', width: '100%' }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 200, display: 'block', cursor: 'crosshair' }}>
          {/* Axes */}
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#cbd6e2" strokeWidth="0.5" />
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#cbd6e2" strokeWidth="0.5" />
          {/* Y labels */}
          <text x={padL - 4} y={padT + 4} fontSize="8" fill="#516f90" textAnchor="end">{max}</text>
          <text x={padL - 4} y={H - padB} fontSize="8" fill="#516f90" textAnchor="end">0</text>
          {/* Area gradient */}
          <defs>
            <linearGradient id="leadGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stopColor="#0038f0" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0038f0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#leadGrad)" />
          <path d={path} fill="none" stroke="#0038f0" strokeWidth="1.5" />
          {/* Dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoverIdx === i ? 3 : 1.5}
              fill="#0038f0"
              stroke={hoverIdx === i ? '#fff' : 'none'}
              strokeWidth={hoverIdx === i ? 1.5 : 0}
            />
          ))}
          {/* Vertical hover line */}
          {hovered && (
            <line
              x1={hovered.x} y1={padT}
              x2={hovered.x} y2={H - padB}
              stroke="#0038f0" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.4"
            />
          )}
          {/* X labels */}
          {labelIdx.map(i => {
            const p = points[i]
            if (!p) return null
            const d = new Date(p.date)
            const lab = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            return <text key={i} x={p.x} y={H - 6} fontSize="8" fill="#516f90" textAnchor="middle">{lab}</text>
          })}
        </svg>

        {/* Tooltip HTML positionné au-dessus du point */}
        {hovered && (
          <div
            style={{
              position: 'absolute',
              left: tooltipLeft,
              top: 0,
              transform: 'translate(-50%, -110%)',
              background: '#33475b',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 11,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 10,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{hovered.count.toLocaleString('fr-FR')} lead{hovered.count > 1 ? 's' : ''}</div>
            <div style={{ opacity: 0.85, fontSize: 10 }}>{tooltipLabel}</div>
            {/* Petit triangle */}
            <div style={{
              position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid #33475b',
            }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#516f90', textAlign: 'right', marginTop: 4 }}>
        Total <strong style={{ color: '#33475b' }}>{total.toLocaleString('fr-FR')}</strong> sur 30 jours
      </div>
    </div>
  )
}
