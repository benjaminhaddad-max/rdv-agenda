'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, ChevronDown, ChevronLeft, ChevronRight, PhoneCall, RefreshCw,
  Settings, TrendingDown, TrendingUp, Phone, CalendarDays,
} from 'lucide-react'
import type { AgentMetrics, SuiviCommercialResponse, SuiviRole } from '@/lib/suivi-commercial'

type PeriodMode = 'week' | 'day' | 'month' | 'custom'

type AircallNumber = { id: number; name: string | null; digits: string | null; open?: boolean | null }
type AircallAgent = { id: number; name: string | null; email: string | null }

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

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export default function SuiviCommercialPage() {
  const pathname = usePathname()
  const base = pathname?.includes('/crm-v2') ? '/admin/crm-v2' : '/admin/crm'
  const today = parisToday()

  const [role, setRole] = useState<SuiviRole>('telepro')
  const [mode, setMode] = useState<PeriodMode>('week')
  const [from, setFrom] = useState(() => weekStartOf(today))
  const [to, setTo] = useState(() => addDays(weekStartOf(today), 6))
  const [data, setData] = useState<SuiviCommercialResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showLines, setShowLines] = useState(false)

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
    <div style={{ minHeight: '100vh', background: '#f7f4ee', color: '#0e1e35', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: '0 24px', height: 52, background: '#ffffff', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PhoneCall size={16} style={{ color: '#C9A84C' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Suivi commercial</span>
          <span style={{ fontSize: 11, color: '#4a6070' }}>
            Appels Aircall, RDV et conversions par personne
          </span>
        </div>
        <Link href={`${base}/reports`} style={{ fontSize: 12, color: '#4a6070', textDecoration: 'none' }}>
          ← Dashboards & Rapports
        </Link>
      </div>

      <div style={{ padding: '24px', maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Suivi commercial</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4a6070' }}>
              Qui appelle, qui prend des RDV, qui convertit — vision directeur.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Segmented
              value={role}
              onChange={v => setRole(v as SuiviRole)}
              options={[
                { value: 'telepro', label: 'Télépros' },
                { value: 'closer', label: 'Commerciaux' },
              ]}
            />
            <button onClick={() => setShowLines(s => !s)} style={navBtnStyle} title="Lignes et utilisateurs Aircall">
              <Settings size={14} /> Lignes & utilisateurs
            </button>
            <button onClick={load} style={navBtnStyle} title="Actualiser">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <Segmented
            value={mode}
            onChange={v => applyMode(v as PeriodMode)}
            options={[
              { value: 'day', label: 'Jour' },
              { value: 'week', label: 'Semaine' },
              { value: 'month', label: 'Mois' },
              { value: 'custom', label: 'Plage' },
            ]}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {mode !== 'custom' && (
              <button onClick={() => shift(-1)} style={navBtnStyle} title="Période précédente">
                <ChevronLeft size={16} />
              </button>
            )}
            {mode === 'custom' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
                <span style={{ color: '#4a6070', fontSize: 13 }}>→</span>
                <input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
              </div>
            ) : (
              <div style={{
                background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8,
                padding: '8px 16px', fontSize: 14, fontWeight: 600, minWidth: 240, textAlign: 'center',
              }}>
                {formatRange(from, to)}
              </div>
            )}
            {mode !== 'custom' && (
              <button
                onClick={() => shift(1)}
                disabled={!canGoNext}
                style={{ ...navBtnStyle, opacity: canGoNext ? 1 : 0.4, cursor: canGoNext ? 'pointer' : 'not-allowed' }}
                title="Période suivante"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>

        {showLines && (
          <LinesPanel
            onClose={() => setShowLines(false)}
            onSaved={load}
          />
        )}

        {data?.needs_lines && (
          <div style={{
            padding: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10,
            marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Choisis les lignes Aircall à suivre</div>
              <div style={{ fontSize: 13, color: '#4a6070', marginTop: 4 }}>
                Aucune ligne n’est cochée : les appels ne sont pas agrégés (pour éviter de tout mélanger). Les RDV restent visibles.
              </div>
            </div>
            <button onClick={() => setShowLines(true)} style={{ ...navBtnStyle, fontWeight: 700, color: '#C9A84C' }}>
              <Settings size={14} /> Configurer
            </button>
          </div>
        )}

        {data?.needs_users && !data?.needs_lines && (
          <div style={{
            padding: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10,
            marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Choisis les utilisateurs Aircall à suivre</div>
              <div style={{ fontSize: 13, color: '#4a6070', marginTop: 4 }}>
                Aucun utilisateur coché : seuls les comptes déjà liés au CRM comptent. Les autres utilisateurs Aircall (accueil, etc.) n’apparaissent pas.
              </div>
            </div>
            <button onClick={() => setShowLines(true)} style={{ ...navBtnStyle, fontWeight: 700, color: '#C9A84C' }}>
              <Settings size={14} /> Configurer
            </button>
          </div>
        )}

        {err && (
          <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', marginBottom: 16 }}>
            Erreur : {err}
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign: 'center', padding: 48, color: '#4a6070' }}>Chargement…</div>
        )}

        {data && (
          <>
            <KpiStrip data={data} />
            <AgentsTable
              data={data}
              expanded={expanded}
              onToggle={id => setExpanded(e => e === id ? null : id)}
            />
            {data.unassigned_rdv.total > 0 && (
              <p style={{ marginTop: 12, fontSize: 12, color: '#a89e8a' }}>
                {data.unassigned_rdv.total} RDV sans {data.role === 'telepro' ? 'télépro' : 'commercial'} identifié
                ({data.unassigned_rdv.positifs} positifs).
              </p>
            )}
            <p style={{ marginTop: 16, fontSize: 11, color: '#a89e8a' }}>
              {data.role === 'telepro'
                ? 'Non décroché = pas de réponse humaine (sonnerie ou messagerie). Décroché > 2 min = conversation réelle. Conversion principale = RDV / décrochés > 2 min. RDV comptés à la prise (created_at).'
                : 'Commerciaux : RDV sur l’agenda (start_at). Show = honorés / (honorés + no-show). Closing = positifs+préinscriptions / honorés. Appels : même règle messagerie / > 2 min.'}
              {' '}Données générées le {new Date(data.generated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function KpiStrip({ data }: { data: SuiviCommercialResponse }) {
  const t = data.totals
  const p = data.previous_totals
  const isCloser = data.role === 'closer'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
      <KpiCard label="Sortants" value={t.calls_outbound} hint={`${t.calls_outbound_unanswered} non décrochés`} color="#C9A84C" />
      <KpiCard
        label="Décrochés > 2 min"
        value={t.calls_outbound_talk_2min}
        hint={fmtPct(t.talk_2min_rate)}
        color="#2ea3f2"
      />
      <KpiCard label="Temps de parole" value={fmtTalk(t.talk_time_sec)} hint="hors messagerie" color="#6366f1" />
      <KpiCard
        label={isCloser ? 'RDV agenda' : 'RDV pris'}
        value={t.rdv_total}
        hint={deltaHint(t.rdv_total - p.rdv_total, p.rdv_total)}
        color="#22c55e"
      />
      <KpiCard
        label={isCloser ? 'Taux de show' : 'Conv. > 2 min'}
        value={fmtPct(isCloser ? t.show_rate : t.conversion_talk_2min)}
        hint={isCloser ? 'Honorés / (honorés + no-show)' : 'RDV / conversations > 2 min'}
        color="#0e1e35"
      />
      <KpiCard
        label={isCloser ? 'Taux de closing' : 'Positifs'}
        value={isCloser ? fmtPct(t.closing_rate) : t.rdv_positifs + t.rdv_preinscriptions}
        color="#16a34a"
      />
    </div>
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
}: {
  data: SuiviCommercialResponse
  expanded: string | null
  onToggle: (id: string) => void
}) {
  const isCloser = data.role === 'closer'
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f7f4ee', borderBottom: '1px solid #e5ddc8' }}>
            <Th align="left">{isCloser ? 'Commercial' : 'Télépro'}</Th>
            <Th>Sortants</Th>
            <Th>Non décrochés</Th>
            <Th>{'>'} 2 min</Th>
            <Th>Parole</Th>
            <Th>RDV</Th>
            <Th>{isCloser ? 'Show' : 'Conv. > 2 min'}</Th>
            <Th>{isCloser ? 'Closing' : 'Conv. sortants'}</Th>
            <Th>{isCloser ? 'No-show' : 'Positifs'}</Th>
            <Th>vs préc.</Th>
          </tr>
        </thead>
        <tbody>
          {data.agents.map(row => {
            const open = expanded === row.user_id
            return (
              <AgentBlock key={row.user_id} row={row} open={open} isCloser={isCloser} onToggle={onToggle} colSpan={10} />
            )
          })}
          {data.agents.length === 0 && (
            <tr>
              <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#4a6070' }}>
                Aucun {isCloser ? 'commercial' : 'télépro'} enregistré
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function AgentBlock({
  row, open, isCloser, onToggle, colSpan,
}: {
  row: AgentMetrics
  open: boolean
  isCloser: boolean
  onToggle: (id: string) => void
  colSpan: number
}) {
  return (
    <>
      <tr
        onClick={() => onToggle(row.user_id)}
        style={{
          borderBottom: open ? 'none' : '1px solid #f0ebe0',
          cursor: 'pointer',
          background: open ? '#faf8f4' : row.unmapped ? '#fffbeb' : undefined,
        }}
      >
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ChevronDown size={14} style={{ color: '#a89e8a', transform: open ? undefined : 'rotate(-90deg)', transition: 'transform .15s' }} />
            <span style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${row.avatar_color || '#C9A84C'}22`,
              color: row.avatar_color || '#C9A84C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {initials(row.name)}
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>{row.name}</div>
              {row.unmapped && (
                <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700 }}>NON MAPPÉ AIRCALL</div>
              )}
            </div>
          </div>
        </td>
        <Td highlight={row.calls_outbound > 0}>{row.calls_outbound}</Td>
        <Td muted>{row.calls_outbound_unanswered || '—'}</Td>
        <Td highlight={row.calls_outbound_talk_2min > 0}>{row.calls_outbound_talk_2min || '—'}</Td>
        <Td muted>{fmtTalk(row.talk_time_sec)}</Td>
        <Td highlight={row.rdv_total > 0}>{row.rdv_total}</Td>
        <Td>{fmtPct(isCloser ? row.show_rate : row.conversion_talk_2min)}</Td>
        <Td muted>{fmtPct(isCloser ? row.closing_rate : row.conversion_outbound)}</Td>
        <Td muted>{isCloser ? (row.rdv_no_show || '—') : (row.rdv_positifs + row.rdv_preinscriptions || '—')}</Td>
        <Td>
          <DeltaBadge delta={isCloser ? row.delta_rdv : row.delta_calls_outbound} previous={isCloser ? row.previous_rdv_total : row.previous_calls_outbound} />
        </Td>
      </tr>
      {open && (
        <tr style={{ background: '#faf8f4', borderBottom: '1px solid #e5ddc8' }}>
          <td colSpan={colSpan} style={{ padding: '8px 16px 18px 58px' }}>
            <ExpandedStats row={row} isCloser={isCloser} />
          </td>
        </tr>
      )}
    </>
  )
}

function ExpandedStats({ row, isCloser }: { row: AgentMetrics; isCloser: boolean }) {
  const maxBar = Math.max(1, ...row.by_day.map(d => Math.max(d.calls_outbound, d.rdv)))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', marginBottom: 10 }}>
          Activité jour par jour
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72 }}>
          {row.by_day.map(d => (
            <div key={d.date} title={`${d.date} — ${d.calls_outbound} sortants, ${d.calls_talk_2min} > 2 min, ${d.rdv} RDV`} style={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-end', height: '100%' }}>
              <div style={{ flex: 1, background: '#C9A84C', borderRadius: 2, height: `${(d.calls_outbound / maxBar) * 100}%`, minHeight: d.calls_outbound ? 3 : 0 }} />
              <div style={{ flex: 1, background: '#22c55e', borderRadius: 2, height: `${(d.rdv / maxBar) * 100}%`, minHeight: d.rdv ? 3 : 0 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#4a6070' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#C9A84C', borderRadius: 2, marginRight: 4 }} />Sortants</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#22c55e', borderRadius: 2, marginRight: 4 }} />RDV</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
        <StatChip icon={<Phone size={12} />} label="Non décrochés" value={row.calls_outbound_unanswered} />
        <StatChip icon={<Phone size={12} />} label="Messagerie" value={row.calls_voicemail} />
        <StatChip icon={<Phone size={12} />} label="Sans réponse" value={row.calls_no_answer} />
        <StatChip icon={<Phone size={12} />} label="Décroché < 2 min" value={row.calls_outbound_talk_short} />
        <StatChip icon={<Phone size={12} />} label="Décroché > 2 min" value={row.calls_outbound_talk_2min} />
        <StatChip icon={<Phone size={12} />} label="Entrants" value={row.calls_inbound} />
        <StatChip icon={<Phone size={12} />} label="Manqués (entrants)" value={row.calls_missed} />
        <StatChip icon={<Phone size={12} />} label="Non matchés CRM" value={row.calls_unmatched} />
        <StatChip icon={<CalendarDays size={12} />} label="Durée moy." value={row.avg_duration_sec != null ? fmtTalk(row.avg_duration_sec) : '—'} />
        <StatChip icon={<BarChart3 size={12} />} label="Positifs" value={row.rdv_positifs} />
        <StatChip icon={<BarChart3 size={12} />} label="Pré-inscr." value={row.rdv_preinscriptions} />
        <StatChip icon={<BarChart3 size={12} />} label="Annulés" value={row.rdv_annules} />
        <StatChip icon={<BarChart3 size={12} />} label="No-show" value={row.rdv_no_show} />
        {isCloser && <StatChip icon={<BarChart3 size={12} />} label="Honorés" value={row.rdv_honored} />}
        {row.lines.length > 0 && (
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#4a6070', marginTop: 4 }}>
            Lignes : {row.lines.map(l => `${l.line_name || l.line_id || '?'} (${l.calls})`).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}

function LinesPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [numbers, setNumbers] = useState<AircallNumber[]>([])
  const [aircallUsers, setAircallUsers] = useState<AircallAgent[]>([])
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
      const [linesRes, usersRes] = await Promise.all([
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
      ])
      if (!linesRes.ok || !usersRes.ok) throw new Error('Enregistrement impossible')
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
      for (let i = 0; i < 80; i++) {
        setProgress(`Import page ${page}… (${imported} appels)`)
        const res = await fetch('/api/crm/reports/suivi-commercial/backfill', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ page }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
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
    <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Aircall : lignes et utilisateurs</div>
        <button onClick={onClose} style={{ ...navBtnStyle, padding: '4px 10px' }}>Fermer</button>
      </div>
      {loading ? (
        <div style={{ color: '#4a6070', fontSize: 13 }}>Chargement…</div>
      ) : (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#0e1e35' }}>Lignes</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#4a6070' }}>
            Coche uniquement les lignes des télépros / commerciaux.
          </p>
          {numbers.length === 0 ? (
            <div style={{ color: '#4a6070', fontSize: 13, marginBottom: 16 }}>Aucune ligne Aircall disponible.</div>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : numbers.map(n => n.id))}
                />
                Tout cocher / décocher
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, marginBottom: 20 }}>
                {numbers.map(n => (
                  <label
                    key={n.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                      padding: '8px 10px', border: '1px solid #e5ddc8', borderRadius: 8,
                      background: selected.includes(n.id) ? 'rgba(204,172,113,0.12)' : '#faf8f4',
                      cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={selected.includes(n.id)} onChange={() => toggle(n.id)} />
                    <span>
                      <span style={{ fontWeight: 600 }}>{n.name || `Ligne ${n.id}`}</span>
                      {n.digits && <span style={{ color: '#4a6070', marginLeft: 6 }}>{n.digits}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#0e1e35' }}>Utilisateurs Aircall</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#4a6070' }}>
            Coche seulement les télépros / commerciaux. Les autres comptes Aircall n’entrent pas dans le rapport.
          </p>
          {aircallUsers.length === 0 ? (
            <div style={{ color: '#4a6070', fontSize: 13, marginBottom: 16 }}>Aucun utilisateur Aircall disponible.</div>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allUsersSelected}
                  onChange={() => setSelectedUsers(allUsersSelected ? [] : aircallUsers.map(u => u.id))}
                />
                Tout cocher / décocher
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, marginBottom: 14 }}>
                {aircallUsers.map(u => (
                  <label
                    key={u.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                      padding: '8px 10px', border: '1px solid #e5ddc8', borderRadius: 8,
                      background: selectedUsers.includes(u.id) ? 'rgba(204,172,113,0.12)' : '#faf8f4',
                      cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} />
                    <span>
                      <span style={{ fontWeight: 600 }}>{u.name || `User ${u.id}`}</span>
                      {u.email && <span style={{ color: '#4a6070', marginLeft: 6 }}>{u.email}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      {progress && <div style={{ color: '#4a6070', fontSize: 12, marginBottom: 8 }}>{progress}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={{ ...navBtnStyle, fontWeight: 700, color: '#C9A84C' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={backfill} disabled={backfilling} style={navBtnStyle}>
          {backfilling ? 'Import en cours…' : 'Importer l’historique (30 j)'}
        </button>
      </div>
    </div>
  )
}

function Segmented({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div style={{ display: 'flex', background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8, overflow: 'hidden' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit',
            background: value === opt.value ? 'rgba(204,172,113,0.2)' : 'transparent',
            color: value === opt.value ? '#0e1e35' : '#4a6070',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function KpiCard({ label, value, hint, color }: { label: string; value: number | string; hint?: string; color: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#4a6070', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: '#a89e8a', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', border: '1px solid #eee6d6', borderRadius: 8, padding: '6px 8px' }}>
      <span style={{ color: '#C9A84C' }}>{icon}</span>
      <span style={{ color: '#4a6070' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Th({ children, align = 'center' }: { children: React.ReactNode; align?: 'left' | 'center' }) {
  return (
    <th style={{
      padding: '10px 12px', textAlign: align, fontSize: 11, fontWeight: 700,
      color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.03em',
    }}>
      {children}
    </th>
  )
}

function Td({ children, highlight, muted }: { children: React.ReactNode; highlight?: boolean; muted?: boolean }) {
  return (
    <td style={{
      padding: '12px 12px', textAlign: 'center',
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color }}>
      <Icon size={13} />
      {delta > 0 ? '+' : ''}{delta}
      <span style={{ color: '#a89e8a', fontWeight: 400 }}>({previous})</span>
    </span>
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
  gap: 6,
  color: '#4a6070',
  fontFamily: 'inherit',
  fontSize: 13,
}

const dateInputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5ddc8',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  color: '#0e1e35',
}
