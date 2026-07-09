'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, ChevronLeft, ChevronRight, Phone, RefreshCw, TrendingDown, TrendingUp,
} from 'lucide-react'

interface TeleproWeekRow {
  telepro_id: string
  name: string
  avatar_color: string | null
  total: number
  positifs: number
  annules: number
  no_show: number
  autres: number
  previous_week: number
  delta: number
}

interface ReportData {
  generated_at: string
  week_start: string
  week_end: string
  week_label: string
  previous_week_start: string
  total: number
  unassigned: {
    total: number
    positifs: number
    annules: number
    no_show: number
    autres: number
  }
  telepros: TeleproWeekRow[]
}

function addWeeks(key: string, weeks: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + weeks * 7, 12))
  return next.toISOString().slice(0, 10)
}

function currentWeekStart(): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const key = fmt.format(now)
  const [y, m, d] = key.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12))
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
  }).format(utcNoon)
  const dayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  }
  const offset = dayMap[weekday] ?? 0
  return new Date(Date.UTC(y, m - 1, d - offset, 12)).toISOString().slice(0, 10)
}

export default function TeleproWeeklyReportPage() {
  const [weekStart, setWeekStart] = useState(currentWeekStart)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/crm/reports/telepro-weekly?week=${weekStart}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const isCurrentWeek = weekStart === currentWeekStart()

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', color: '#0e1e35', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: '0 24px', height: 52, background: '#ffffff', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={16} style={{ color: '#C9A84C' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>RDV placés par télépro</span>
          <span style={{ fontSize: 11, color: '#4a6070' }}>
            Semaine par semaine — basé sur la date de prise du RDV
          </span>
        </div>
        <Link
          href="/admin/crm/reports"
          style={{ fontSize: 12, color: '#4a6070', textDecoration: 'none' }}
        >
          ← Dashboards & Rapports
        </Link>
      </div>

      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Rapport hebdomadaire télépros</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4a6070' }}>
              Nombre de rendez-vous pris par chaque téléprospecteur, semaine du lundi au dimanche.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setWeekStart(w => addWeeks(w, -1))}
              style={navBtnStyle}
              title="Semaine précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{
              background: '#ffffff',
              border: '1px solid #e5ddc8',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
              minWidth: 220,
              textAlign: 'center',
            }}>
              {loading && !data ? 'Chargement…' : data?.week_label ?? '—'}
              {isCurrentWeek && (
                <span style={{ marginLeft: 8, fontSize: 10, color: '#C9A84C', fontWeight: 700, textTransform: 'uppercase' }}>
                  Cette semaine
                </span>
              )}
            </div>
            <button
              onClick={() => setWeekStart(w => addWeeks(w, 1))}
              disabled={isCurrentWeek}
              style={{ ...navBtnStyle, opacity: isCurrentWeek ? 0.4 : 1, cursor: isCurrentWeek ? 'not-allowed' : 'pointer' }}
              title="Semaine suivante"
            >
              <ChevronRight size={16} />
            </button>
            <button onClick={load} style={navBtnStyle} title="Actualiser">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {err && (
          <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', marginBottom: 16 }}>
            Erreur : {err}
          </div>
        )}

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <KpiCard label="Total RDV placés" value={data.total} color="#C9A84C" />
              <KpiCard label="Télépros actifs" value={data.telepros.filter(t => t.total > 0).length} color="#2ea3f2" />
              <KpiCard
                label="Moyenne / télépro"
                value={data.telepros.length
                  ? Math.round((data.total / data.telepros.filter(t => t.total > 0).length || 1) * 10) / 10
                  : 0}
                color="#22c55e"
              />
              {data.unassigned.total > 0 && (
                <KpiCard label="Sans télépro identifié" value={data.unassigned.total} color="#a89e8a" />
              )}
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f7f4ee', borderBottom: '1px solid #e5ddc8' }}>
                    <Th align="left">Télépro</Th>
                    <Th>RDV placés</Th>
                    <Th>Positifs</Th>
                    <Th>Annulés</Th>
                    <Th>No-show</Th>
                    <Th>Autres</Th>
                    <Th>vs. sem. préc.</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.telepros.map(row => (
                    <tr key={row.telepro_id} style={{ borderBottom: '1px solid #f0ebe0' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: `${row.avatar_color || '#C9A84C'}22`,
                            color: row.avatar_color || '#C9A84C',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700,
                          }}>
                            {row.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <span style={{ fontWeight: 600 }}>{row.name}</span>
                        </div>
                      </td>
                      <Td highlight={row.total > 0}>{row.total}</Td>
                      <Td muted>{row.positifs || '—'}</Td>
                      <Td muted>{row.annules || '—'}</Td>
                      <Td muted>{row.no_show || '—'}</Td>
                      <Td muted>{row.autres || '—'}</Td>
                      <Td>
                        <DeltaBadge delta={row.delta} previous={row.previous_week} />
                      </Td>
                    </tr>
                  ))}
                  {data.telepros.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#4a6070' }}>
                        Aucun télépro enregistré
                      </td>
                    </tr>
                  )}
                  {data.telepros.every(t => t.total === 0) && data.telepros.length > 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#4a6070', background: '#faf8f4' }}>
                        Aucun RDV placé cette semaine
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.telepros.some(t => t.total > 0) && (
                  <tfoot>
                    <tr style={{ background: '#f7f4ee', fontWeight: 700, borderTop: '2px solid #e5ddc8' }}>
                      <td style={{ padding: '12px 16px' }}>Total</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#C9A84C', fontSize: 15 }}>
                        {data.total}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {data.telepros.reduce((s, r) => s + r.positifs, 0) + data.unassigned.positifs}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {data.telepros.reduce((s, r) => s + r.annules, 0) + data.unassigned.annules}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {data.telepros.reduce((s, r) => s + r.no_show, 0) + data.unassigned.no_show}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {data.telepros.reduce((s, r) => s + r.autres, 0) + data.unassigned.autres}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <p style={{ marginTop: 16, fontSize: 11, color: '#a89e8a' }}>
              Comptabilisation au moment de la prise du RDV (created_at).
              Positifs = statuts positif / pré-inscription.
              Données générées le {new Date(data.generated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5ddc8',
  borderRadius: 8,
  padding: '8px 10px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  color: '#4a6070',
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, color: '#4a6070', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function Th({ children, align = 'center' }: { children: React.ReactNode; align?: 'left' | 'center' }) {
  return (
    <th style={{
      padding: '10px 16px',
      textAlign: align,
      fontSize: 11,
      fontWeight: 700,
      color: '#4a6070',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}>
      {children}
    </th>
  )
}

function Td({ children, highlight, muted }: { children: React.ReactNode; highlight?: boolean; muted?: boolean }) {
  return (
    <td style={{
      padding: '12px 16px',
      textAlign: 'center',
      fontWeight: highlight ? 700 : 400,
      fontSize: highlight ? 15 : 13,
      color: highlight ? '#0e1e35' : muted ? '#4a6070' : '#0e1e35',
    }}>
      {children}
    </td>
  )
}

function DeltaBadge({ delta, previous }: { delta: number; previous: number }) {
  if (previous === 0 && delta === 0) {
    return <span style={{ color: '#a89e8a', fontSize: 12 }}>—</span>
  }
  const up = delta > 0
  const down = delta < 0
  const color = up ? '#22c55e' : down ? '#ef4444' : '#4a6070'
  const Icon = up ? TrendingUp : down ? TrendingDown : Phone
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, fontWeight: 600, color,
    }}>
      <Icon size={13} />
      {delta > 0 ? '+' : ''}{delta}
      <span style={{ color: '#a89e8a', fontWeight: 400 }}>({previous})</span>
    </span>
  )
}
