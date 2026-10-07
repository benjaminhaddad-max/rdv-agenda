'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, BarChart3, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Minus, RefreshCw,
  TrendingDown, TrendingUp, Users, UserX,
} from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Avatar, CrmV2Body, CrmV2Card, CrmV2Header, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page, CrmV2Spinner,
  CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

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
  const isMobile = useIsMobile()
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
  const hasAny = !!data && data.telepros.some(t => t.total > 0)

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: '/admin/crm/reports', label: isMobile ? 'Rapports' : 'Dashboards & Rapports' }}
        title="Rapport hebdomadaire télépros"
        subtitle={
          <>
            RDV placés et leurs issues
            {data?.week_label ? ` · ${data.week_label}` : ''}
            {!isMobile && ' — semaine du lundi au dimanche, selon la date de prise du RDV'}
          </>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isMobile ? '100%' : undefined }}>
            <RoundBtn onClick={() => setWeekStart(w => addWeeks(w, -1))} title="Semaine précédente">
              <ChevronLeft size={16} />
            </RoundBtn>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999,
              height: 36, padding: '0 16px', boxSizing: 'border-box',
              fontWeight: 600, fontSize: 13, color: crmV2.text, whiteSpace: 'nowrap',
              minWidth: isMobile ? 0 : 220, flex: isMobile ? 1 : undefined,
            }}>
              <CalendarDays size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading && !data ? 'Chargement…' : data?.week_label ?? '—'}</span>
              {isCurrentWeek && (
                <CrmV2StatusPill label="Cette semaine" color={crmV2.goldDark} bg="rgba(204,172,113,0.16)" dot={false} style={{ fontSize: 11, padding: '1px 8px' }} />
              )}
            </div>
            <RoundBtn
              onClick={() => setWeekStart(w => addWeeks(w, 1))}
              disabled={isCurrentWeek}
              title="Semaine suivante"
            >
              <ChevronRight size={16} />
            </RoundBtn>
            <RoundBtn onClick={load} title="Actualiser">
              <RefreshCw size={14} />
            </RoundBtn>
          </div>
        }
      />

      <CrmV2Body>
        {err && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
            background: crmV2.dangerSoft, border: '1px solid rgba(242,84,91,0.35)', borderRadius: 12, color: '#d13a41', fontSize: 13,
          }}>
            <AlertCircle size={15} /> Erreur : {err}
          </div>
        )}

        {loading && !data && <CrmV2Spinner />}

        {data && (
          <>
            <CrmV2KpiGrid>
              <CrmV2KpiCard label="Total RDV placés" value={data.total} color={crmV2.gold} icon={<CalendarCheck size={15} />} detail="sur la semaine" />
              <CrmV2KpiCard label="Télépros actifs" value={data.telepros.filter(t => t.total > 0).length} color={crmV2.link} icon={<Users size={15} />} detail={`sur ${data.telepros.length}`} />
              <CrmV2KpiCard
                label="Moyenne / télépro"
                value={data.telepros.length
                  ? Math.round((data.total / data.telepros.filter(t => t.total > 0).length || 1) * 10) / 10
                  : 0}
                color={crmV2.success}
                icon={<BarChart3 size={15} />}
                detail="par télépro actif"
              />
              {data.unassigned.total > 0 && (
                <CrmV2KpiCard label="Sans télépro identifié" value={data.unassigned.total} color={crmV2.textFaint} icon={<UserX size={15} />} detail="RDV non rattachés" />
              )}
            </CrmV2KpiGrid>

            {isMobile ? (
              // Mobile : une ligne par télépro, sans défilement horizontal
              <CrmV2Card style={{ overflow: 'hidden' }}>
                {data.telepros.map(row => (
                  <div key={row.telepro_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 56,
                    borderBottom: `1px solid ${crmV2.borderLight}`,
                  }}>
                    <CrmV2Avatar name={row.name} color={avatarColor(row.avatar_color)} size={32} radius="36%" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Pos. {row.positifs || 0} · Ann. {row.annules || 0} · No-show {row.no_show || 0} · Autres {row.autres || 0}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: row.total > 0 ? crmV2.text : crmV2.textFaint }}>{row.total}</div>
                      <DeltaBadge delta={row.delta} previous={row.previous_week} />
                    </div>
                  </div>
                ))}
                {data.telepros.length === 0 && (
                  <div style={{ padding: 32, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>Aucun télépro enregistré</div>
                )}
                {data.telepros.every(t => t.total === 0) && data.telepros.length > 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: crmV2.textMuted, fontSize: 13, background: crmV2.bgHover }}>Aucun RDV placé cette semaine</div>
                )}
                {hasAny && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: crmV2.thBg, fontWeight: 700 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>Total</div>
                      <div style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 600, marginTop: 2 }}>
                        Pos. {sum(data, 'positifs')} · Ann. {sum(data, 'annules')} · No-show {sum(data, 'no_show')} · Autres {sum(data, 'autres')}
                      </div>
                    </div>
                    <div style={{ fontSize: 18, color: crmV2.goldDark }}>{data.total}</div>
                  </div>
                )}
              </CrmV2Card>
            ) : (
              <CrmV2TableCard>
                <CrmV2Table>
                  <thead>
                    <tr>
                      <CrmV2Th>Télépro</CrmV2Th>
                      <CrmV2Th style={NUM_TH}>RDV placés</CrmV2Th>
                      <CrmV2Th style={NUM_TH}>Positifs</CrmV2Th>
                      <CrmV2Th style={NUM_TH}>Annulés</CrmV2Th>
                      <CrmV2Th style={NUM_TH}>No-show</CrmV2Th>
                      <CrmV2Th style={NUM_TH}>Autres</CrmV2Th>
                      <CrmV2Th style={NUM_TH}>vs. sem. préc.</CrmV2Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.telepros.map(row => (
                      <CrmV2Tr key={row.telepro_id}>
                        <CrmV2Td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <CrmV2Avatar name={row.name} color={avatarColor(row.avatar_color)} size={24} radius="36%" />
                            <span style={{ fontWeight: 600 }}>{row.name}</span>
                          </div>
                        </CrmV2Td>
                        <NumTd strong={row.total > 0}>{row.total}</NumTd>
                        <NumTd muted>{row.positifs || '—'}</NumTd>
                        <NumTd muted>{row.annules || '—'}</NumTd>
                        <NumTd muted>{row.no_show || '—'}</NumTd>
                        <NumTd muted>{row.autres || '—'}</NumTd>
                        <NumTd>
                          <DeltaBadge delta={row.delta} previous={row.previous_week} />
                        </NumTd>
                      </CrmV2Tr>
                    ))}
                    {data.telepros.length === 0 && (
                      <tr>
                        <CrmV2Td colSpan={7} style={{ padding: 40, textAlign: 'center', color: crmV2.textMuted }}>
                          Aucun télépro enregistré
                        </CrmV2Td>
                      </tr>
                    )}
                    {data.telepros.every(t => t.total === 0) && data.telepros.length > 0 && (
                      <tr>
                        <CrmV2Td colSpan={7} style={{ padding: 24, textAlign: 'center', color: crmV2.textMuted, background: crmV2.bgHover }}>
                          Aucun RDV placé cette semaine
                        </CrmV2Td>
                      </tr>
                    )}
                  </tbody>
                  {hasAny && (
                    <tfoot>
                      <tr style={{ background: crmV2.thBg, fontWeight: 700 }}>
                        <CrmV2Td style={TOTAL_TD}>Total</CrmV2Td>
                        <CrmV2Td style={{ ...TOTAL_TD, textAlign: 'center', color: crmV2.goldDark, fontSize: 15 }}>{data.total}</CrmV2Td>
                        <CrmV2Td style={{ ...TOTAL_TD, textAlign: 'center' }}>{sum(data, 'positifs')}</CrmV2Td>
                        <CrmV2Td style={{ ...TOTAL_TD, textAlign: 'center' }}>{sum(data, 'annules')}</CrmV2Td>
                        <CrmV2Td style={{ ...TOTAL_TD, textAlign: 'center' }}>{sum(data, 'no_show')}</CrmV2Td>
                        <CrmV2Td style={{ ...TOTAL_TD, textAlign: 'center' }}>{sum(data, 'autres')}</CrmV2Td>
                        <CrmV2Td style={TOTAL_TD} />
                      </tr>
                    </tfoot>
                  )}
                </CrmV2Table>
              </CrmV2TableCard>
            )}

            <p style={{ margin: 0, fontSize: 12, color: crmV2.textFaint, lineHeight: 1.5 }}>
              Comptabilisation au moment de la prise du RDV (created_at).
              Positifs = statuts positif / pré-inscription.
              Données générées le {new Date(data.generated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.
            </p>
          </>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}

/** Total d'une issue, télépros + RDV sans télépro identifié. */
function sum(data: ReportData, k: 'positifs' | 'annules' | 'no_show' | 'autres') {
  return data.telepros.reduce((s, r) => s + r[k], 0) + data.unassigned[k]
}

function avatarColor(c: string | null) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : crmV2.goldGradient
}

const NUM_TH: React.CSSProperties = { textAlign: 'center' }
const TOTAL_TD: React.CSSProperties = { borderTop: `2px solid ${crmV2.thBorder}`, borderBottom: 'none', fontWeight: 700 }

function RoundBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        width: 36, height: 36, borderRadius: 999, flexShrink: 0,
        background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.text,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

function NumTd({ children, strong, muted }: { children: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <CrmV2Td style={{
      textAlign: 'center',
      fontWeight: strong ? 700 : 400,
      fontSize: strong ? 15 : 13,
      color: muted ? crmV2.textMuted : crmV2.text,
    }}>
      {children}
    </CrmV2Td>
  )
}

function DeltaBadge({ delta, previous }: { delta: number; previous: number }) {
  if (previous === 0 && delta === 0) {
    return <span style={{ color: crmV2.textFaint, fontSize: 12 }}>—</span>
  }
  const up = delta > 0
  const down = delta < 0
  const color = up ? crmV2.successStrong : down ? '#dc2626' : crmV2.textMuted
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus
  return (
    <CrmV2StatusPill
      dot={false}
      color={color}
      bg={up ? 'rgba(22,163,74,0.10)' : down ? 'rgba(239,68,68,0.10)' : crmV2.chipBg}
      label={
        <>
          <Icon size={12} />
          {delta > 0 ? '+' : ''}{delta}
          <span style={{ color: crmV2.textFaint, fontWeight: 500 }}>({previous})</span>
        </>
      }
    />
  )
}
