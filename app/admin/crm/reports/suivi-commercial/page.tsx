'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  AlertCircle, AlertTriangle, ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Clock, Download, Minus, Percent, PhoneCall, PhoneOutgoing, RefreshCw, Settings, TrendingDown, TrendingUp,
} from 'lucide-react'
import {
  CrmV2Avatar, CrmV2Body, CrmV2Button, CrmV2Card, CrmV2CloseButton, CrmV2Header, CrmV2Input, CrmV2KpiCard,
  CrmV2KpiGrid, CrmV2Page, CrmV2SectionLabel, CrmV2Segmented, CrmV2Select, CrmV2Spinner, CrmV2StatusPill,
  CrmV2Table, CrmV2TableCard, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import type { AgentMetrics, SuiviCommercialResponse, SuiviRole } from '@/lib/suivi-commercial'
import PlanningPanel from './PlanningPanel'
import ReachedContactsPanel from './ReachedContactsPanel'
import { useIsMobile } from '@/lib/useIsMobile'

type PeriodMode = 'week' | 'day' | 'month' | 'custom'

type AircallNumber = { id: number; name: string | null; digits: string | null; open?: boolean | null }
type AircallAgent = { id: number; name: string | null; email: string | null }
type CrmUser = { id: string; name: string; role: string | null; email: string | null }

function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}

function weekStartOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12))
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(utcNoon)
  const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return addDays(key, -(dayMap[weekday] ?? 0))
}

function monthStartOf(key: string): string {
  return key.slice(0, 8) + '01'
}

function monthEndOf(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return addDays(next, -1)
}

function formatRange(from: string, to: string): string {
  const fmt = (k: string, withYear: boolean) => {
    const [y, m, d] = k.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d, 12))
    return dt.toLocaleDateString('fr-FR', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: withYear ? 'numeric' : undefined,
    })
  }
  if (from === to) return fmt(from, true)
  return `${fmt(from, false)} → ${fmt(to, true)}`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} %`
}

function fmtTalk(sec: number): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m} min`
  return `${sec}s`
}

export default function SuiviCommercialPage() {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const base = pathname?.includes('/crm-v2') ? '/admin/crm-v2' : '/admin/crm'
  const today = parisToday()

  const [role, setRole] = useState<SuiviRole>('telepro')
  const [mode, setMode] = useState<PeriodMode>('day')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<SuiviCommercialResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showLines, setShowLines] = useState(false)
  const [showPlanning, setShowPlanning] = useState(false)

  const applyMode = useCallback((next: PeriodMode, anchor = from) => {
    setMode(next)
    if (next === 'week') {
      const start = weekStartOf(anchor)
      setFrom(start)
      setTo(addDays(start, 6))
    } else if (next === 'day') {
      setFrom(anchor)
      setTo(anchor)
    } else if (next === 'month') {
      const start = monthStartOf(anchor)
      setFrom(start)
      setTo(monthEndOf(start))
    }
  }, [from])

  const shift = (dir: -1 | 1) => {
    if (mode === 'week') {
      const start = addDays(weekStartOf(from), dir * 7)
      if (dir > 0 && start > weekStartOf(today)) return
      setFrom(start)
      setTo(addDays(start, 6))
    } else if (mode === 'day') {
      const next = addDays(from, dir)
      if (dir > 0 && next > today) return
      setFrom(next)
      setTo(next)
    } else if (mode === 'month') {
      const [y, m] = monthStartOf(from).split('-').map(Number)
      const ny = m + dir < 1 ? y - 1 : m + dir > 12 ? y + 1 : y
      const nm = m + dir < 1 ? 12 : m + dir > 12 ? 1 : m + dir
      const start = `${ny}-${String(nm).padStart(2, '0')}-01`
      if (dir > 0 && start > monthStartOf(today)) return
      setFrom(start)
      setTo(monthEndOf(start))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/crm/reports/suivi-commercial?from=${from}&to=${to}&role=${role}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [from, to, role])

  useEffect(() => { load() }, [load])

  const canGoNext = mode === 'custom' ? false
    : mode === 'week' ? addDays(weekStartOf(from), 7) <= weekStartOf(today)
    : mode === 'day' ? addDays(from, 1) <= today
    : addDays(monthEndOf(monthStartOf(from)), 1) <= today

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: `${base}/reports`, label: isMobile ? 'Rapports' : 'Dashboards & Rapports' }}
        title="Suivi commercial"
        subtitle={`Activité téléphonique Aircall · ${formatRange(from, to)}`}
        actions={
          <>
            <CrmV2Segmented
              value={role}
              onChange={v => setRole(v as SuiviRole)}
              items={[
                { id: 'telepro', label: 'Télépros' },
                { id: 'closer', label: 'Commerciaux' },
              ]}
            />
            <CrmV2Button variant="secondary" icon={<Settings size={14} />} onClick={() => setShowLines(s => !s)} title="Lignes et utilisateurs Aircall">
              {isMobile ? 'Lignes' : 'Lignes & utilisateurs'}
            </CrmV2Button>
            <CrmV2Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load} title="Actualiser" aria-label="Actualiser" style={{ padding: '8px 11px' }} />
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={showPlanning ? 'planning' : 'table'}
          onChange={id => setShowPlanning(id === 'planning')}
          items={[
            { id: 'table', label: 'Tableau' },
            { id: 'planning', label: 'Planning' },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {/* Période : jour / semaine / mois / plage */}
        {!showPlanning && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <CrmV2Segmented
              value={mode}
              onChange={v => applyMode(v as PeriodMode)}
              items={[
                { id: 'day', label: 'Jour' },
                { id: 'week', label: 'Semaine' },
                { id: 'month', label: 'Mois' },
                { id: 'custom', label: 'Plage' },
              ]}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isMobile ? '100%' : undefined, minWidth: 0 }}>
              {mode !== 'custom' && (
                <RoundBtn onClick={() => shift(-1)} title="Période précédente">
                  <ChevronLeft size={16} />
                </RoundBtn>
              )}
              {mode === 'custom' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: isMobile ? 1 : undefined, minWidth: 0 }}>
                  <CrmV2Input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ height: 36, width: isMobile ? undefined : 160, flex: isMobile ? 1 : undefined, minWidth: 0 }} />
                  <ArrowRight size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
                  <CrmV2Input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} style={{ height: 36, width: isMobile ? undefined : 160, flex: isMobile ? 1 : undefined, minWidth: 0 }} />
                </div>
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999,
                  height: 36, padding: '0 16px', boxSizing: 'border-box',
                  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  minWidth: isMobile ? 0 : 240, flex: isMobile ? 1 : undefined,
                }}>
                  <CalendarDays size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatRange(from, to)}</span>
                </div>
              )}
              {mode !== 'custom' && (
                <RoundBtn onClick={() => shift(1)} disabled={!canGoNext} title="Période suivante">
                  <ChevronRight size={16} />
                </RoundBtn>
              )}
            </div>
          </div>
        )}

        {showPlanning && (
          <PlanningPanel
            weekStart={weekStartOf(from)}
            onClose={() => setShowPlanning(false)}
          />
        )}

        {showLines && (
          <LinesPanel
            onClose={() => setShowLines(false)}
            onSaved={load}
          />
        )}

        {data?.needs_lines && (
          <Notice
            title="Choisis les lignes Aircall à suivre"
            text="Aucune ligne n’est cochée : les appels ne sont pas agrégés (pour éviter de tout mélanger). Les RDV restent visibles."
            onConfigure={() => setShowLines(true)}
          />
        )}

        {data?.needs_users && !data?.needs_lines && (
          <Notice
            title="Choisis les utilisateurs Aircall à suivre"
            text="Aucun utilisateur coché : seuls les comptes déjà liés au CRM comptent. Les autres utilisateurs Aircall (accueil, etc.) n’apparaissent pas."
            onConfigure={() => setShowLines(true)}
          />
        )}

        {err && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
            background: crmV2.dangerSoft, border: '1px solid rgba(242,84,91,0.35)', borderRadius: 12, color: '#d13a41', fontSize: 13,
          }}>
            <AlertCircle size={15} /> Erreur : {err}
          </div>
        )}

        {!showPlanning && loading && !data && <CrmV2Spinner />}

        {!showPlanning && data && (
          <>
            <KpiStrip data={data} />
            <AgentsTable
              isMobile={isMobile}
              data={data}
              expanded={expanded}
              onToggle={id => setExpanded(e => e === id ? null : id)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.unassigned_rdv.total > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: crmV2.textMuted }}>
                  {data.unassigned_rdv.total} RDV sans {data.role === 'telepro' ? 'télépro' : 'commercial'} identifié
                  ({data.unassigned_rdv.positifs} positifs).
                </p>
              )}
              <p style={{ margin: 0, fontSize: 12, color: crmV2.textFaint, lineHeight: 1.5 }}>
                {data.role === 'telepro'
                  ? 'Non décroché = pas de réponse, messagerie, ou moins de 10 s de conversation (sonnerie exclue). Décroché > 2 min = conversation réelle. Conversion principale = RDV / décrochés > 2 min. RDV comptés à la prise (created_at).'
                  : 'Commerciaux : RDV sur l’agenda (start_at). Show = honorés / (honorés + no-show). Closing = positifs+préinscriptions / honorés. Appels : même règle messagerie / > 2 min.'}
                {' '}Données générées le {new Date(data.generated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.
              </p>
            </div>
          </>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}

function Notice({ title, text, onConfigure }: { title: string; text: string; onConfigure: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      padding: '14px 16px', background: 'rgba(201,168,76,0.10)', border: `1px solid ${crmV2.goldBorder}`, borderRadius: crmV2.radiusLg,
    }}>
      <div style={{ display: 'flex', gap: 10, minWidth: 0, flex: '1 1 260px' }}>
        <AlertTriangle size={16} color={crmV2.goldDark} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: crmV2.text }}>{title}</div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4, lineHeight: 1.45 }}>{text}</div>
        </div>
      </div>
      <CrmV2Button variant="gold" icon={<Settings size={14} />} onClick={onConfigure}>Configurer</CrmV2Button>
    </div>
  )
}

function KpiStrip({ data }: { data: SuiviCommercialResponse }) {
  const t = data.totals
  const p = data.previous_totals
  const isCloser = data.role === 'closer'
  return (
    <CrmV2KpiGrid>
      <CrmV2KpiCard label="Appels sortants" value={t.calls_outbound.toLocaleString('fr-FR')} detail={`${t.calls_outbound_unanswered} non décrochés`} color={crmV2.link} icon={<PhoneOutgoing size={15} />} />
      <CrmV2KpiCard
        label="Décrochés > 2 min"
        value={t.calls_outbound_talk_2min.toLocaleString('fr-FR')}
        detail={fmtPct(t.talk_2min_rate)}
        color={crmV2.info}
        icon={<PhoneCall size={15} />}
      />
      <CrmV2KpiCard label="Temps de parole" value={fmtTalk(t.talk_time_sec)} detail="hors messagerie" color={crmV2.success} icon={<Clock size={15} />} />
      <CrmV2KpiCard
        label={isCloser ? 'RDV agenda' : 'RDV pris'}
        value={t.rdv_total}
        detail={deltaHint(t.rdv_total - p.rdv_total, p.rdv_total)}
        color={crmV2.gold}
        icon={<CalendarCheck size={15} />}
      />
      <CrmV2KpiCard
        label={isCloser ? 'Taux de show' : 'Conv. > 2 min'}
        value={fmtPct(isCloser ? t.show_rate : t.conversion_talk_2min)}
        detail={isCloser ? 'Honorés / (honorés + no-show)' : 'RDV / conversations > 2 min'}
        color={crmV2.text}
        icon={<Percent size={15} />}
      />
      <CrmV2KpiCard
        label={isCloser ? 'Taux de closing' : 'Positifs'}
        value={isCloser ? fmtPct(t.closing_rate) : t.rdv_positifs + t.rdv_preinscriptions}
        detail={isCloser ? 'Positifs + pré-inscr. / honorés' : 'positifs + pré-inscriptions'}
        color={crmV2.successStrong}
        icon={<CheckCircle2 size={15} />}
      />
    </CrmV2KpiGrid>
  )
}

function deltaHint(delta: number, previous: number): string {
  if (previous === 0 && delta === 0) return 'vs période préc.'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta} vs préc. (${previous})`
}

function AgentsTable({
  data,
  expanded,
  onToggle,
  isMobile,
}: {
  data: SuiviCommercialResponse
  expanded: string | null
  onToggle: (id: string) => void
  isMobile: boolean
}) {
  const isCloser = data.role === 'closer'

  // Mobile : une ligne par personne, le détail se déplie dessous (pas de défilement horizontal)
  if (isMobile) {
    return (
      <CrmV2Card style={{ overflow: 'hidden' }}>
        {data.agents.map(row => (
          <AgentMobileRow
            key={row.user_id}
            row={row}
            open={expanded === row.user_id}
            isCloser={isCloser}
            onToggle={onToggle}
            from={data.from}
            to={data.to}
            role={data.role}
          />
        ))}
        {data.agents.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>
            Aucun {isCloser ? 'commercial' : 'télépro'} enregistré
          </div>
        )}
      </CrmV2Card>
    )
  }

  return (
    <CrmV2TableCard>
      <CrmV2Table>
        <thead>
          <tr>
            <CrmV2Th>{isCloser ? 'Commercial' : 'Télépro'}</CrmV2Th>
            <CrmV2Th style={NUM_TH}>Sortants</CrmV2Th>
            <CrmV2Th style={NUM_TH}>Non décrochés</CrmV2Th>
            <CrmV2Th style={NUM_TH}>{'>'} 2 min</CrmV2Th>
            <CrmV2Th style={NUM_TH}>Parole</CrmV2Th>
            <CrmV2Th style={NUM_TH}>RDV</CrmV2Th>
            <CrmV2Th style={NUM_TH}>{isCloser ? 'Show' : 'Conv. > 2 min'}</CrmV2Th>
            <CrmV2Th style={NUM_TH}>{isCloser ? 'Closing' : 'Conv. sortants'}</CrmV2Th>
            <CrmV2Th style={NUM_TH}>{isCloser ? 'No-show' : 'Positifs'}</CrmV2Th>
            <CrmV2Th style={NUM_TH}>vs préc.</CrmV2Th>
          </tr>
        </thead>
        <tbody>
          {data.agents.map(row => {
            const open = expanded === row.user_id
            return (
              <AgentBlock key={row.user_id} row={row} open={open} isCloser={isCloser} onToggle={onToggle} colSpan={10} from={data.from} to={data.to} role={data.role} />
            )
          })}
          {data.agents.length === 0 && (
            <tr>
              <CrmV2Td colSpan={10} style={{ padding: 40, textAlign: 'center', color: crmV2.textMuted }}>
                Aucun {isCloser ? 'commercial' : 'télépro'} enregistré
              </CrmV2Td>
            </tr>
          )}
        </tbody>
      </CrmV2Table>
    </CrmV2TableCard>
  )
}

function avatarColor(c: string | null | undefined) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : crmV2.goldGradient
}

function UnmappedPill() {
  return <CrmV2StatusPill label="Non mappé Aircall" color="#b45309" style={{ fontSize: 11, padding: '1px 8px' }} />
}

function AgentBlock({
  row, open, isCloser, onToggle, colSpan, from, to, role,
}: {
  row: AgentMetrics
  from: string
  to: string
  role: SuiviRole
  open: boolean
  isCloser: boolean
  onToggle: (id: string) => void
  colSpan: number
}) {
  return (
    <>
      <CrmV2Tr
        onClick={() => onToggle(row.user_id)}
        style={open ? { background: crmV2.bgHover } : row.unmapped ? { background: 'rgba(180,83,9,0.05)' } : undefined}
      >
        <CrmV2Td style={open ? { borderBottom: 'none' } : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ChevronDown size={14} style={{ color: crmV2.textFaint, transform: open ? undefined : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
            <CrmV2Avatar name={row.name} color={avatarColor(row.avatar_color)} size={24} radius="36%" />
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.name}</span>
            {row.unmapped && <UnmappedPill />}
          </div>
        </CrmV2Td>
        <NumTd strong={row.calls_outbound > 0} open={open}>{row.calls_outbound}</NumTd>
        <NumTd muted open={open}>{row.calls_outbound_unanswered || '—'}</NumTd>
        <NumTd strong={row.calls_outbound_talk_2min > 0} open={open}>{row.calls_outbound_talk_2min || '—'}</NumTd>
        <NumTd muted open={open}>{fmtTalk(row.talk_time_sec)}</NumTd>
        <NumTd strong={row.rdv_total > 0} open={open}>{row.rdv_total}</NumTd>
        <NumTd open={open}>{fmtPct(isCloser ? row.show_rate : row.conversion_talk_2min)}</NumTd>
        <NumTd muted open={open}>{fmtPct(isCloser ? row.closing_rate : row.conversion_outbound)}</NumTd>
        <NumTd muted open={open}>{isCloser ? (row.rdv_no_show || '—') : (row.rdv_positifs + row.rdv_preinscriptions || '—')}</NumTd>
        <NumTd open={open}>
          <DeltaBadge delta={isCloser ? row.delta_rdv : row.delta_calls_outbound} previous={isCloser ? row.previous_rdv_total : row.previous_calls_outbound} />
        </NumTd>
      </CrmV2Tr>
      {open && (
        <tr style={{ background: crmV2.bgHover }}>
          <td colSpan={colSpan} style={{ padding: '4px 16px 18px 58px', borderBottom: `1px solid ${crmV2.border}` }}>
            <ExpandedStats row={row} isCloser={isCloser} />
            <ReachedContactsPanel agentId={row.user_id} from={from} to={to} role={role} />
          </td>
        </tr>
      )}
    </>
  )
}

function AgentMobileRow({
  row, open, isCloser, onToggle, from, to, role,
}: {
  row: AgentMetrics
  from: string
  to: string
  role: SuiviRole
  open: boolean
  isCloser: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ borderBottom: `1px solid ${crmV2.borderLight}`, background: open ? crmV2.bgHover : row.unmapped ? 'rgba(180,83,9,0.05)' : undefined }}>
      <button
        type="button"
        onClick={() => onToggle(row.user_id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 56,
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: crmV2.text,
        }}
      >
        <CrmV2Avatar name={row.name} color={avatarColor(row.avatar_color)} size={32} radius="36%" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
            {row.unmapped && <UnmappedPill />}
          </div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.calls_outbound} sortants · {row.calls_outbound_talk_2min} {'>'} 2 min · {row.rdv_total} RDV · {fmtPct(isCloser ? row.show_rate : row.conversion_talk_2min)}
          </div>
        </div>
        <DeltaBadge delta={isCloser ? row.delta_rdv : row.delta_calls_outbound} previous={isCloser ? row.previous_rdv_total : row.previous_calls_outbound} />
        <ChevronDown size={16} style={{ color: crmV2.textFaint, transform: open ? undefined : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ padding: '0 12px 14px' }}>
          <ExpandedStats row={row} isCloser={isCloser} isMobile />
          <ReachedContactsPanel agentId={row.user_id} from={from} to={to} role={role} isMobile />
        </div>
      )}
    </div>
  )
}

// Couleurs des graphiques (charte V2)
const C_NONE = crmV2.borderStrong
const C_SHORT = '#d9bc6b'
const C_LONG = crmV2.link
const C_OUT = crmV2.gold
const C_RDV = crmV2.success

const subCard: React.CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: 14,
}

function ExpandedStats({ row, isCloser, isMobile = false }: { row: AgentMetrics; isCloser: boolean; isMobile?: boolean }) {
  const outbound = row.calls_outbound
  const parts = [
    { key: 'none', label: 'Pas de réponse', hint: 'Sonnerie, messagerie ou moins de 10 s de conversation', n: row.calls_outbound_unanswered, color: C_NONE, extra: null as string | null },
    { key: 'short', label: 'Décroché < 2 min', hint: '10 s à 2 min de conversation : quelqu’un a pris, échange court', n: row.calls_outbound_talk_short, color: C_SHORT, extra: null as string | null },
    { key: 'long', label: 'Décroché > 2 min', hint: 'Vraie conversation', n: row.calls_outbound_talk_2min, color: C_LONG, extra: row.avg_talk_2min_sec != null ? `moy. ${fmtTalk(row.avg_talk_2min_sec)} par appel` : null },
  ]
  const maxDay = Math.max(1, ...row.by_day.map(d => Math.max(d.calls_outbound, d.rdv, d.calls_talk_2min)))
  const matched = Math.max(0, row.calls_total - row.calls_unmatched)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1fr 1fr', gap: isMobile ? 10 : 14 }}>
      <div style={subCard}>
        <CrmV2SectionLabel style={{ marginBottom: 4 }}>Les {outbound} appels sortants</CrmV2SectionLabel>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: crmV2.textMuted }}>
          {outbound} tentatives = {row.calls_outbound_unanswered} sans réponse + {row.calls_outbound_talk_short} courts + {row.calls_outbound_talk_2min} vraies conv.
        </p>
        <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: crmV2.bgSoft, marginBottom: 12 }}>
          {parts.map(p => outbound > 0 && p.n > 0 ? (
            <div key={p.key} title={`${p.label} : ${p.n}`} style={{ width: `${(p.n / outbound) * 100}%`, background: p.color, minWidth: p.n ? 4 : 0 }} />
          ) : null)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {parts.map(p => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.n} {p.label}</div>
                <div style={{ fontSize: 11, color: crmV2.textFaint }}>{p.hint}{p.extra ? ` · ${p.extra}` : ''}</div>
              </div>
              <div style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 700 }}>
                {outbound ? `${Math.round((p.n / outbound) * 100)} %` : '—'}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${crmV2.borderLight}`, fontSize: 13 }}>
          <strong>{row.rdv_total} RDV</strong>
          <span style={{ color: crmV2.textMuted }}>
            {' '}sur {row.calls_outbound_talk_2min} conversations &gt; 2 min
            {row.conversion_talk_2min != null ? ` → ${fmtPct(row.conversion_talk_2min)}` : ''}
          </span>
          <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 4 }}>
            Temps de parole {fmtTalk(row.talk_time_sec)} (uniquement les décrochés, hors messagerie)
            {row.avg_duration_sec != null ? ` · moy. ${fmtTalk(row.avg_duration_sec)}` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14 }}>
        <div style={{ ...subCard, flex: 1 }}>
          <CrmV2SectionLabel style={{ marginBottom: 10 }}>Jour par jour</CrmV2SectionLabel>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 88 }}>
            {row.by_day.map(d => {
              const label = d.date.slice(8)
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', minWidth: 0 }}>
                  <div title={`${d.date} — ${d.calls_outbound} sortants, ${d.calls_talk_2min} > 2 min, ${d.rdv} RDV`} style={{ flex: 1, width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, background: C_OUT, borderRadius: '3px 3px 0 0', height: `${(d.calls_outbound / maxDay) * 100}%`, minHeight: d.calls_outbound ? 3 : 0 }} />
                    <div style={{ flex: 1, background: C_LONG, borderRadius: '3px 3px 0 0', height: `${(d.calls_talk_2min / maxDay) * 100}%`, minHeight: d.calls_talk_2min ? 3 : 0 }} />
                    <div style={{ flex: 1, background: C_RDV, borderRadius: '3px 3px 0 0', height: `${(d.rdv / maxDay) * 100}%`, minHeight: d.rdv ? 3 : 0 }} />
                  </div>
                  <span style={{ fontSize: 10, color: crmV2.textFaint }}>{Number(label)}</span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: crmV2.textMuted, flexWrap: 'wrap' }}>
            <Legend color={C_OUT} label="Sortants" />
            <Legend color={C_LONG} label="> 2 min" />
            <Legend color={C_RDV} label="RDV" />
          </div>
        </div>

        <div style={subCard}>
          <CrmV2SectionLabel style={{ marginBottom: 8 }}>{isCloser ? 'RDV agenda' : 'RDV pris'}</CrmV2SectionLabel>
          <div style={{ display: 'flex', gap: '6px 16px', fontSize: 13, flexWrap: 'wrap' }}>
            <span><b>{row.rdv_total}</b> total</span>
            <span style={{ color: crmV2.successStrong }}><b>{row.rdv_positifs + row.rdv_preinscriptions}</b> positifs / pré-inscr.</span>
            <span style={{ color: crmV2.textMuted }}><b>{row.rdv_annules}</b> annulés</span>
            <span style={{ color: crmV2.textMuted }}><b>{row.rdv_no_show}</b> no-show</span>
            {isCloser && <span><b>{row.rdv_honored}</b> honorés</span>}
          </div>
          {row.calls_inbound > 0 && (
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 8 }}>{row.calls_inbound} appels entrants · {row.calls_missed} manqués</div>
          )}
          {row.lines.length > 0 && (
            <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 8 }}>
              Ligne{row.lines.length > 1 ? 's' : ''} : {row.lines.map(l => `${l.line_name || l.line_id || '?'} (${l.calls})`).join(' · ')}
            </div>
          )}
          <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 8 }}>
            {matched} appels reliés à une fiche CRM
            {row.calls_unmatched > 0 ? ` · ${row.calls_unmatched} numéro${row.calls_unmatched > 1 ? 's' : ''} pas trouvé${row.calls_unmatched > 1 ? 's' : ''} dans les contacts` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, background: color, borderRadius: '50%' }} />{label}
    </span>
  )
}

function LinesPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [numbers, setNumbers] = useState<AircallNumber[]>([])
  const [aircallUsers, setAircallUsers] = useState<AircallAgent[]>([])
  const [crmUsers, setCrmUsers] = useState<CrmUser[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<number[]>([])
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/crm/aircall/numbers')
        const json = await res.json()
        if (!cancelled) {
          if (json.error && (!json.numbers || json.numbers.length === 0)) setError(json.error)
          setNumbers(json.numbers ?? [])
          setSelected(json.tracked_ids ?? [])
          setAircallUsers(json.users ?? [])
          setSelectedUsers(json.tracked_user_ids ?? [])
          setCrmUsers(json.crm_users ?? [])
          setUserMap(json.user_map ?? {})
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const toggle = (id: number) => {
    setSelected(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  }
  const toggleUser = (id: number) => {
    setSelectedUsers(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const [linesRes, usersRes, mapRes] = await Promise.all([
        fetch('/api/crm/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'aircall_tracked_line_ids', value: selected }),
        }),
        fetch('/api/crm/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'aircall_tracked_user_ids', value: selectedUsers }),
        }),
        fetch('/api/crm/aircall/map', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ map: userMap }),
        }),
      ])
      if (!linesRes.ok || !usersRes.ok || !mapRes.ok) throw new Error('Enregistrement impossible')
      setProgress('Enregistré — les appels sont rattachés aux comptes CRM.')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const backfill = async () => {
    setBackfilling(true)
    setError(null)
    let page = 1
    let imported = 0
    try {
      for (let i = 0; i < 250; i++) {
        setProgress(`Import page ${page}… (${imported} appels)`)
        let json: { error?: string; imported?: number; done?: boolean; next_page?: number } | null = null
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const res = await fetch('/api/crm/reports/suivi-commercial/backfill', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ page }),
            })
            json = await res.json()
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
            break
          } catch (e) {
            if (attempt === 3) throw e
            setProgress(`Page ${page} coupée, nouvel essai ${attempt + 2}/4… (${imported} déjà importés)`)
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
          }
        }
        if (!json) throw new Error('Import interrompu')
        imported += json.imported ?? 0
        if (json.done) {
          setProgress(`${imported} appels importés`)
          onSaved()
          break
        }
        page = json.next_page ?? page + 1
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBackfilling(false)
    }
  }

  const allSelected = useMemo(
    () => numbers.length > 0 && numbers.every(n => selected.includes(n.id)),
    [numbers, selected],
  )
  const allUsersSelected = useMemo(
    () => aircallUsers.length > 0 && aircallUsers.every(u => selectedUsers.includes(u.id)),
    [aircallUsers, selectedUsers],
  )

  return (
    <CrmV2Card style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Aircall : lignes et utilisateurs</div>
        <CrmV2CloseButton onClick={onClose} />
      </div>
      {loading ? (
        <CrmV2Spinner />
      ) : (
        <>
          <CrmV2SectionLabel style={{ marginBottom: 4 }}>Lignes</CrmV2SectionLabel>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: crmV2.textMuted }}>
            Coche uniquement les lignes des télépros / commerciaux.
          </p>
          {numbers.length === 0 ? (
            <div style={{ color: crmV2.textMuted, fontSize: 13, marginBottom: 16 }}>Aucune ligne Aircall disponible.</div>
          ) : (
            <>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, cursor: 'pointer', minHeight: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : numbers.map(n => n.id))}
                  style={checkboxStyle}
                />
                Tout cocher / décocher
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 8, marginBottom: 20 }}>
                {numbers.map(n => (
                  <label key={n.id} style={choiceStyle(selected.includes(n.id))}>
                    <input type="checkbox" checked={selected.includes(n.id)} onChange={() => toggle(n.id)} style={checkboxStyle} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{n.name || `Ligne ${n.id}`}</span>
                      {n.digits && <span style={{ color: crmV2.textMuted, marginLeft: 6 }}>{n.digits}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <CrmV2SectionLabel style={{ marginBottom: 4 }}>Utilisateurs Aircall</CrmV2SectionLabel>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: crmV2.textMuted }}>
            Coche les télépros / commerciaux, puis dis à qui ils correspondent dans le CRM si l’email Aircall n’est pas le même.
          </p>
          {aircallUsers.length === 0 ? (
            <div style={{ color: crmV2.textMuted, fontSize: 13, marginBottom: 16 }}>Aucun utilisateur Aircall disponible.</div>
          ) : (
            <>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, cursor: 'pointer', minHeight: 32 }}>
                <input
                  type="checkbox"
                  checked={allUsersSelected}
                  onChange={() => setSelectedUsers(allUsersSelected ? [] : aircallUsers.map(u => u.id))}
                  style={checkboxStyle}
                />
                Tout cocher / décocher
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 8, marginBottom: 14 }}>
                {aircallUsers.map(u => (
                  <div
                    key={u.id}
                    style={{ ...choiceStyle(selectedUsers.includes(u.id)), flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} style={checkboxStyle} />
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        <span style={{ fontWeight: 600 }}>{u.name || `User ${u.id}`}</span>
                        {u.email && <span style={{ color: crmV2.textMuted, marginLeft: 6 }}>{u.email}</span>}
                      </span>
                    </label>
                    <CrmV2Select
                      value={userMap[String(u.id)] || ''}
                      onChange={e => {
                        const v = e.target.value
                        setUserMap(cur => {
                          const next = { ...cur }
                          if (v) next[String(u.id)] = v
                          else delete next[String(u.id)]
                          return next
                        })
                      }}
                      style={{ height: 32, fontSize: 12 }}
                    >
                      <option value="">CRM : non lié</option>
                      {crmUsers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.role ? ` (${c.role})` : ''}
                        </option>
                      ))}
                    </CrmV2Select>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      {progress && <div style={{ color: crmV2.textMuted, fontSize: 12, marginBottom: 8 }}>{progress}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${crmV2.borderLight}` }}>
        <CrmV2Button variant="secondary" icon={<Download size={14} />} onClick={backfill} disabled={backfilling}>
          {backfilling ? 'Import en cours…' : 'Importer l’historique (30 j)'}
        </CrmV2Button>
        <CrmV2Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </CrmV2Button>
      </div>
    </CrmV2Card>
  )
}

const checkboxStyle: React.CSSProperties = { accentColor: crmV2.gold, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }

function choiceStyle(on: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minHeight: 40, boxSizing: 'border-box',
    padding: '8px 12px', border: `1px solid ${on ? crmV2.goldBorder : crmV2.border}`, borderRadius: 10,
    background: on ? crmV2.goldSoft : crmV2.bg, cursor: 'pointer',
  }
}

const NUM_TH: React.CSSProperties = { textAlign: 'center' }

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

function NumTd({ children, strong, muted, open }: { children: React.ReactNode; strong?: boolean; muted?: boolean; open?: boolean }) {
  return (
    <CrmV2Td style={{
      textAlign: 'center',
      fontWeight: strong ? 700 : 400,
      fontSize: strong ? 15 : 13,
      color: muted ? crmV2.textMuted : crmV2.text,
      whiteSpace: 'nowrap',
      ...(open ? { borderBottom: 'none' } : {}),
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
      style={{ flexShrink: 0 }}
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
