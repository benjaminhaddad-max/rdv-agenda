'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, EyeOff, ExternalLink, Plus, Radar } from 'lucide-react'
import {
  CrmV2Button,
  CrmV2Card,
  CrmV2CloseButton,
  CrmV2Drawer,
  CrmV2Field,
  CrmV2Input,
  CrmV2Segmented,
  CrmV2Select,
  CrmV2StatusPill,
  CrmV2Textarea,
  hexA,
} from '@/components/crm-v2/primitives'
import { crmV2, crmV2AgendaCards } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { BRAND_CONFIG, eventTypeOf, type EventBrand } from '@/lib/events-studio/config'

export const EVENT_BRAND_COLORS: Record<
  EventBrand,
  { solid: string; soft: string; text: string; label: string }
> = {
  diploma: {
    solid: '#38bdf8',
    soft: 'rgba(56, 189, 248, 0.18)',
    text: '#0369a1',
    label: 'Diploma Santé',
  },
  medibox: {
    solid: '#22c55e',
    soft: 'rgba(34, 197, 94, 0.16)',
    text: '#15803d',
    label: 'Medibox',
  },
  edumove: {
    solid: '#f97316',
    soft: 'rgba(249, 115, 22, 0.16)',
    text: '#c2410c',
    label: 'Edumove',
  },
}

/** Couleurs calendrier par type d’événement. */
export const EVENT_TYPE_COLORS: Record<
  string,
  { solid: string; soft: string; text: string; label: string }
> = {
  webinaire: {
    solid: '#dc2626',
    soft: 'rgba(220, 38, 38, 0.15)',
    text: '#b91c1c',
    label: 'Webinaire',
  },
  salon: {
    solid: '#16a34a',
    soft: 'rgba(22, 163, 74, 0.15)',
    text: '#15803d',
    label: 'Salon',
  },
  jpo: {
    solid: '#c2ab82',
    soft: 'rgba(194, 171, 130, 0.18)',
    text: '#8a7349',
    label: 'JPO',
  },
  autre: {
    solid: '#64748b',
    soft: 'rgba(100, 116, 139, 0.15)',
    text: '#475569',
    label: 'Autre',
  },
}

/** Événements des prépas concurrentes (veille) — violet, bordure en pointillés. */
export const COMPETITOR_COLOR = {
  solid: '#7c3aed',
  soft: 'rgba(124, 58, 237, 0.13)',
  text: '#6d28d9',
  label: 'Concurrents',
}

const COMPETITOR_NAMES: Record<string, string> = {
  antemed: 'Antémed Epsilon',
  medisup: 'Médisup',
  cpcm: 'CPCM',
}

const TYPE_SHORT: Record<string, string> = {
  jpo: 'JPO',
  webinaire: 'Webinaire',
  salon: 'Salon',
  autre: 'Autre',
}

const CALENDAR_LEGEND_TYPES = ['webinaire', 'salon', 'jpo'] as const

export type CalendarEventRow = {
  id: string
  name: string
  brand: string | null
  event_type: string | null
  event_date: string
  event_time_end: string | null
  location: string | null
  status: string
  description?: string | null
}

export type CompetitorEvent = {
  id: string
  competitor: string
  name: string
  event_type: string
  start_date: string
  end_date: string | null
  time_start: string | null
  time_end: string | null
  location: string | null
  source_url: string | null
  notes: string | null
  found_by: 'bot' | 'manual'
  hidden: boolean
  last_seen_at: string
}

type LastScan = {
  started_at: string
  finished_at: string | null
  found: number
  inserted: number
  updated: number
  errors: string | null
} | null

/** Élément affiché dans le calendrier : un de nos événements ou un événement concurrent. */
type CalItem = {
  key: string
  kind: 'ours' | 'competitor'
  name: string
  /** Libellé court devant le nom (concurrent) */
  prefix: string | null
  dayKeys: string[]
  /** 'HH:MM' ou null (horaires inconnus) */
  time: string | null
  timeEnd: string | null
  startIso: number
  color: { solid: string; soft: string; text: string }
  typeShort: string
  sub: string
  href: string | null
  competitor: CompetitorEvent | null
}

type ViewMode = 'month' | 'week' | 'agenda'

const HOUR_START = 8
const HOUR_END = 21
const PX_PER_HOUR = 52
const DATE_END_RE = /\[date_end=(\d{4}-\d{2}-\d{2})\]/

function brandOf(ev: CalendarEventRow): EventBrand {
  if (ev.brand === 'medibox' || ev.brand === 'edumove' || ev.brand === 'diploma') return ev.brand
  return 'diploma'
}

function parisParts(iso: string) {
  const d = new Date(iso)
  const dayKey = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  const time = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  })
  return { dayKey, time }
}

function daysBetween(startKey: string, endKey: string | null): string[] {
  if (!endKey || endKey <= startKey) return [startKey]
  const keys: string[] = []
  let cur = parseISO(`${startKey}T12:00:00`)
  const end = parseISO(`${endKey}T12:00:00`)
  while (cur <= end && keys.length < 62) {
    keys.push(format(cur, 'yyyy-MM-dd'))
    cur = addDays(cur, 1)
  }
  return keys.length ? keys : [startKey]
}

function toMinutes(t: string | null): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null
  const [h, m] = t.split(':').map((x) => parseInt(x, 10))
  return h * 60 + m
}

function ourItem(ev: CalendarEventRow): CalItem {
  const { dayKey, time } = parisParts(ev.event_date)
  const m = (ev.description || '').match(DATE_END_RE)
  const typeId = eventTypeOf(ev).id
  const type = eventTypeOf(ev)
  return {
    key: `o:${ev.id}`,
    kind: 'ours',
    name: ev.name,
    prefix: null,
    dayKeys: daysBetween(dayKey, m ? m[1] : null),
    time,
    timeEnd: ev.event_time_end && /^\d{1,2}:\d{2}$/.test(ev.event_time_end) ? ev.event_time_end : null,
    startIso: new Date(ev.event_date).getTime(),
    color: EVENT_TYPE_COLORS[typeId] || EVENT_TYPE_COLORS.autre,
    typeShort: type.short,
    sub: `${BRAND_CONFIG[brandOf(ev)].name} · ${type.short}${ev.location ? ` · ${ev.location}` : ''}`,
    href: `/admin/crm/events/${ev.id}`,
    competitor: null,
  }
}

function competitorItem(ev: CompetitorEvent): CalItem {
  const who = COMPETITOR_NAMES[ev.competitor] || ev.competitor
  const typeShort = TYPE_SHORT[ev.event_type] || 'Autre'
  return {
    key: `c:${ev.id}`,
    kind: 'competitor',
    name: ev.name,
    prefix: who,
    dayKeys: daysBetween(ev.start_date, ev.end_date),
    time: ev.time_start,
    timeEnd: ev.time_end,
    startIso: new Date(`${ev.start_date}T${ev.time_start || '00:00'}:00`).getTime(),
    color: COMPETITOR_COLOR,
    typeShort,
    sub: `${who} · ${typeShort}${ev.location ? ` · ${ev.location}` : ''}`,
    href: null,
    competitor: ev,
  }
}

function timeLabel(it: CalItem): string {
  if (!it.time) return 'Horaires ?'
  return it.timeEnd ? `${it.time}–${it.timeEnd}` : it.time
}

function startOfTodayParis(): Date {
  const key = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  return new Date(`${key}T00:00:00`)
}

function formatDayFr(key: string): string {
  return parseISO(`${key}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Lien (nos événements) ou bouton (concurrent → panneau de détail). */
function ItemShell({
  it,
  style,
  children,
  onSelect,
}: {
  it: CalItem
  style: CSSProperties
  children: ReactNode
  onSelect: (ev: CompetitorEvent | null) => void
}) {
  const tooltip = it.prefix ? `${it.prefix} — ${it.name} (${timeLabel(it)})` : it.name
  if (it.href) {
    return (
      <Link href={it.href} title={tooltip} style={{ textDecoration: 'none', ...style }}>
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      title={tooltip}
      onClick={() => onSelect(it.competitor)}
      style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', ...style }}
    >
      {children}
    </button>
  )
}

type Props = {
  events: CalendarEventRow[]
  loading?: boolean
}

const EMPTY_DRAFT = {
  competitor: 'cpcm',
  name: '',
  event_type: 'jpo',
  start_date: '',
  end_date: '',
  time_start: '',
  time_end: '',
  location: '',
  source_url: '',
  notes: '',
}

export default function EventsAgendaCalendar({ events, loading }: Props) {
  const isMobile = useIsMobile()
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => new Date())

  // ── Veille concurrents ──
  const [competitorEvents, setCompetitorEvents] = useState<CompetitorEvent[]>([])
  const [lastScan, setLastScan] = useState<LastScan>(null)
  const [showCompetitors, setShowCompetitors] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<CompetitorEvent | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadCompetitors = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/competitor-events', { credentials: 'include' })
      if (!res.ok) return
      const j = await res.json()
      setCompetitorEvents(Array.isArray(j.events) ? j.events : [])
      setLastScan(j.last_scan || null)
    } catch {
      /* table pas encore créée / réseau : on affiche juste nos événements */
    }
  }, [])

  useEffect(() => {
    try {
      if (localStorage.getItem('events-cal-hide-competitors') === '1') setShowCompetitors(false)
    } catch {
      /* stockage indisponible */
    }
    loadCompetitors()
  }, [loadCompetitors])

  function toggleCompetitors() {
    setShowCompetitors((v) => {
      try {
        localStorage.setItem('events-cal-hide-competitors', v ? '1' : '0')
      } catch {
        /* stockage indisponible */
      }
      return !v
    })
  }

  async function runScan() {
    setScanning(true)
    setScanMsg('Veille en cours (1 à 3 min)…')
    try {
      const res = await fetch('/api/crm/competitor-events/scan', { method: 'POST', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Erreur veille')
      setScanMsg(
        `Veille terminée : ${j.inserted} nouveau${j.inserted > 1 ? 'x' : ''}, ${j.updated} mis à jour` +
          (j.errors?.length ? ` · ${j.errors.length} erreur(s)` : ''),
      )
      await loadCompetitors()
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : 'Erreur veille')
    } finally {
      setScanning(false)
    }
  }

  async function hideCompetitorEvent(ev: CompetitorEvent) {
    const res = await fetch(`/api/crm/competitor-events/${ev.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: true }),
    })
    if (res.ok) {
      setCompetitorEvents((list) => list.filter((e) => e.id !== ev.id))
      setSelected(null)
    }
  }

  async function saveDraft() {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/crm/competitor-events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Erreur enregistrement')
      setAdding(false)
      setDraft(EMPTY_DRAFT)
      await loadCompetitors()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erreur enregistrement')
    } finally {
      setSaving(false)
    }
  }

  // ── Éléments affichés ──
  const items = useMemo(() => {
    const ours = events.filter((e) => e.status !== 'cancelled').map(ourItem)
    const theirs = showCompetitors ? competitorEvents.filter((e) => !e.hidden).map(competitorItem) : []
    return [...ours, ...theirs]
  }, [events, competitorEvents, showCompetitors])

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>()
    for (const it of items) {
      for (const dayKey of it.dayKeys) {
        const list = map.get(dayKey) || []
        list.push(it)
        map.set(dayKey, list)
      }
    }
    for (const list of map.values()) {
      // Nos événements d'abord, puis les concurrents ; chacun par heure.
      list.sort((a, b) =>
        a.kind !== b.kind ? (a.kind === 'ours' ? -1 : 1) : (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0),
      )
    }
    return map
  }, [items])

  const upcoming = useMemo(() => {
    const start = format(startOfTodayParis(), 'yyyy-MM-dd')
    return items
      .filter((it) => it.dayKeys[it.dayKeys.length - 1] >= start)
      .sort((a, b) => a.startIso - b.startIso)
  }, [items])

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: endOfWeek(cursor, { weekStartsOn: 1 }) })
  }, [cursor])

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const title =
    view === 'week'
      ? `${format(weekDays[0], 'd MMM', { locale: fr })} – ${format(weekDays[6], 'd MMM yyyy', { locale: fr })}`
      : format(cursor, 'MMMM yyyy', { locale: fr })

  function goPrev() {
    setCursor((c) => (view === 'week' ? subWeeks(c, 1) : subMonths(c, 1)))
  }
  function goNext() {
    setCursor((c) => (view === 'week' ? addWeeks(c, 1) : addMonths(c, 1)))
  }

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

  const todayBg = crmV2AgendaCards.todayColumn
  const gridLine = '#e4e9f0'
  const roundBtn: CSSProperties = {
    width: isMobile ? 40 : 36,
    height: isMobile ? 40 : 36,
    flexShrink: 0,
    borderRadius: 999,
    border: `1px solid ${crmV2.borderStrong}`,
    background: crmV2.bg,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: crmV2.text,
    cursor: 'pointer',
    padding: 0,
  }

  /** Style commun d'une puce : nos événements en trait plein, concurrents en pointillés. */
  function chipBorder(it: CalItem, alpha = 0.3) {
    return it.kind === 'competitor'
      ? `1px dashed ${hexA(it.color.solid, 0.6)}`
      : `1px solid ${hexA(it.color.solid, alpha)}`
  }

  const lastScanLabel = lastScan
    ? `Veille : ${new Date(lastScan.finished_at || lastScan.started_at).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      })}`
    : 'Veille : jamais lancée'

  return (
    <CrmV2Card style={{ padding: 0, overflow: 'hidden' }}>
      {/* Barre d'outils du gabarit D : navigation en pilules, légende, choix de vue */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 10 : 12,
          flexWrap: 'wrap',
          padding: isMobile ? '10px 12px' : '12px 14px',
          borderBottom: `1px solid ${crmV2.border}`,
          background: crmV2.bg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button type="button" onClick={goPrev} aria-label="Précédent" title="Précédent" style={roundBtn}>
            <ChevronLeft size={15} />
          </button>
          <CrmV2Button variant="secondary" onClick={() => setCursor(new Date())} style={isMobile ? { height: 40 } : undefined}>
            Aujourd’hui
          </CrmV2Button>
          <button type="button" onClick={goNext} aria-label="Suivant" title="Suivant" style={roundBtn}>
            <ChevronRight size={15} />
          </button>
          <span
            style={{
              fontSize: isMobile ? 14 : 15,
              fontWeight: 700,
              color: crmV2.text,
              textTransform: 'capitalize',
              marginLeft: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {CALENDAR_LEGEND_TYPES.map((typeId) => (
            <CrmV2StatusPill
              key={typeId}
              label={EVENT_TYPE_COLORS[typeId].label}
              color={EVENT_TYPE_COLORS[typeId].text}
              bg={EVENT_TYPE_COLORS[typeId].soft}
            />
          ))}
          <button
            type="button"
            onClick={toggleCompetitors}
            title={showCompetitors ? 'Masquer les événements concurrents' : 'Afficher les événements concurrents'}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', opacity: showCompetitors ? 1 : 0.45 }}
          >
            <CrmV2StatusPill
              label={`${COMPETITOR_COLOR.label}${showCompetitors ? '' : ' (masqués)'}`}
              color={COMPETITOR_COLOR.text}
              bg={COMPETITOR_COLOR.soft}
              style={{ border: `1px dashed ${hexA(COMPETITOR_COLOR.solid, 0.6)}` }}
            />
          </button>
          <CrmV2Segmented<ViewMode>
            value={view}
            onChange={setView}
            items={[
              { id: 'month', label: 'Mois' },
              { id: 'week', label: 'Semaine' },
              { id: 'agenda', label: 'Agenda' },
            ]}
          />
        </div>
      </div>

      {/* Bandeau veille concurrents */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: isMobile ? '8px 12px' : '8px 14px',
          borderBottom: `1px solid ${crmV2.border}`,
          background: hexA(COMPETITOR_COLOR.solid, 0.04),
          fontSize: 12,
          color: crmV2.textMuted,
        }}
      >
        <Radar size={14} color={COMPETITOR_COLOR.text} />
        <span style={{ fontWeight: 600, color: COMPETITOR_COLOR.text }}>
          Veille Antémed Epsilon · Médisup · CPCM
        </span>
        <span title={lastScan?.errors || undefined}>
          {scanMsg || `${lastScanLabel} · bot automatique chaque matin`}
        </span>
        <span style={{ flex: 1 }} />
        <CrmV2Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => { setFormError(null); setAdding(true) }}>
          Ajouter
        </CrmV2Button>
        <CrmV2Button size="sm" variant="secondary" icon={<Radar size={13} />} onClick={runScan} disabled={scanning}>
          {scanning ? 'Recherche…' : 'Relancer la veille'}
        </CrmV2Button>
      </div>

      {loading ? (
        <div style={{ padding: 28, color: crmV2.textMuted, fontSize: 13 }}>Chargement…</div>
      ) : view === 'month' ? (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: isMobile ? 560 : 0 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                borderBottom: `1px solid ${crmV2.border}`,
                background: crmV2.thBg,
              }}
            >
              {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d, i) => (
                <div
                  key={d}
                  style={{
                    padding: '9px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: crmV2.textMuted,
                    textTransform: 'uppercase',
                    borderLeft: i === 0 ? 'none' : `1px solid ${crmV2.border}`,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gridAutoRows: 'minmax(104px, auto)',
              }}
            >
              {monthDays.map((day, idx) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayItems = byDay.get(key) || []
                const inMonth = isSameMonth(day, cursor)
                const today = isToday(day)
                return (
                  <div
                    key={key}
                    style={{
                      borderLeft: idx % 7 === 0 ? 'none' : `1px solid ${gridLine}`,
                      borderBottom: `1px solid ${gridLine}`,
                      padding: '6px 5px',
                      background: today ? todayBg : inMonth ? crmV2.bg : '#fafbfd',
                      minHeight: 104,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 4, paddingLeft: 2 }}>
                      <span
                        style={{
                          minWidth: 24,
                          height: 24,
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          color: today ? '#fff' : inMonth ? crmV2.text : crmV2.textFaint,
                          background: today ? crmV2.gold : 'transparent',
                        }}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 3 }}>
                      {dayItems.slice(0, 4).map((it) => (
                        <ItemShell
                          key={it.key}
                          it={it}
                          onSelect={setSelected}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            minWidth: 0,
                            width: '100%',
                            boxSizing: 'border-box',
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.3,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: it.color.soft,
                            border: chipBorder(it),
                            color: crmV2.text,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.color.solid, flexShrink: 0 }} />
                          <span style={{ color: it.color.text, flexShrink: 0 }}>
                            {it.kind === 'competitor' ? it.prefix : it.time}
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{it.name}</span>
                        </ItemShell>
                      ))}
                      {dayItems.length > 4 && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: crmV2.textMuted, paddingLeft: 4 }}>
                          +{dayItems.length - 4} de plus
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : view === 'week' ? (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 720 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `52px repeat(7, minmax(0, 1fr))`,
                borderBottom: `1px solid ${crmV2.border}`,
                position: 'sticky',
                top: 0,
                background: crmV2.thBg,
                zIndex: 2,
              }}
            >
              <div />
              {weekDays.map((day) => {
                const today = isToday(day)
                return (
                  <div
                    key={day.toISOString()}
                    style={{
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                      borderLeft: `1px solid ${crmV2.border}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        color: crmV2.textMuted,
                        textTransform: 'uppercase',
                      }}
                    >
                      {format(day, 'EEE', { locale: fr })}
                    </span>
                    <span
                      style={{
                        minWidth: 26,
                        height: 26,
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        fontWeight: 700,
                        color: today ? '#fff' : crmV2.text,
                        background: today ? crmV2.gold : 'transparent',
                      }}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Événements sans horaires connus : bandeau « journée » au-dessus de la grille */}
            {weekDays.some((d) => (byDay.get(format(d, 'yyyy-MM-dd')) || []).some((it) => toMinutes(it.time) == null)) && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `52px repeat(7, minmax(0, 1fr))`,
                  borderBottom: `1px solid ${crmV2.border}`,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: crmV2.textFaint, padding: '6px 4px', textAlign: 'right' }}>
                  Journée
                </div>
                {weekDays.map((day) => {
                  const key = format(day, 'yyyy-MM-dd')
                  const allDay = (byDay.get(key) || []).filter((it) => toMinutes(it.time) == null)
                  return (
                    <div key={key} style={{ borderLeft: `1px solid ${crmV2.border}`, padding: 3, display: 'grid', gap: 3, alignContent: 'start' }}>
                      {allDay.map((it) => (
                        <ItemShell
                          key={it.key}
                          it={it}
                          onSelect={setSelected}
                          style={{
                            display: 'block',
                            width: '100%',
                            boxSizing: 'border-box',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: it.color.soft,
                            border: chipBorder(it),
                            color: crmV2.text,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {it.prefix ? `${it.prefix} · ` : ''}
                          {it.name}
                        </ItemShell>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `52px repeat(7, minmax(0, 1fr))`,
                position: 'relative',
                paddingTop: 8,
              }}
            >
              {/* Gouttière des heures */}
              <div style={{ position: 'relative', height: (HOUR_END - HOUR_START) * PX_PER_HOUR }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      top: (h - HOUR_START) * PX_PER_HOUR - 7,
                      right: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: crmV2.textMuted,
                    }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {weekDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const timed = (byDay.get(key) || []).filter((it) => toMinutes(it.time) != null)
                const today = isToday(day)
                return (
                  <div
                    key={key}
                    style={{
                      position: 'relative',
                      height: (HOUR_END - HOUR_START) * PX_PER_HOUR,
                      borderLeft: `1px solid ${crmV2.border}`,
                      borderTop: `1px solid ${gridLine}`,
                      boxSizing: 'border-box',
                      backgroundColor: today ? todayBg : crmV2.bg,
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${PX_PER_HOUR - 1}px, ${gridLine} ${PX_PER_HOUR - 1}px, ${gridLine} ${PX_PER_HOUR}px)`,
                    }}
                  >
                    {timed.map((it, idx) => {
                      const startMin = toMinutes(it.time) as number
                      const endMin = toMinutes(it.timeEnd) ?? startMin + 60
                      if (endMin <= HOUR_START * 60 || startMin >= HOUR_END * 60) return null
                      const top = ((startMin - HOUR_START * 60) / 60) * PX_PER_HOUR
                      const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 22)
                      // Chevauchement simple : les concurrents se décalent à droite de nos événements.
                      const overlaps = timed.filter((o) => {
                        const s = toMinutes(o.time) as number
                        const e = toMinutes(o.timeEnd) ?? s + 60
                        return s < endMin && e > startMin
                      })
                      const col = overlaps.indexOf(it)
                      const n = overlaps.length
                      return (
                        <ItemShell
                          key={`${it.key}-${idx}`}
                          it={it}
                          onSelect={setSelected}
                          style={{
                            position: 'absolute',
                            left: `calc(${(col / n) * 100}% + 3px)`,
                            width: `calc(${100 / n}% - 6px)`,
                            top: Math.max(top, 0),
                            height,
                            border: chipBorder(it, 0.35),
                            borderRadius: 8,
                            padding: '2px 7px',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            zIndex: 1,
                            backgroundColor: crmV2.bg,
                            backgroundImage: `linear-gradient(${it.color.soft}, ${it.color.soft})`,
                            display: 'block',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, lineHeight: '15px' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: it.color.solid, flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: crmV2.text,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                              }}
                            >
                              {it.name}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: it.color.text,
                              lineHeight: '13px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {timeLabel(it)} · {it.prefix || it.typeShort}
                          </div>
                        </ItemShell>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: isMobile ? '4px 12px 12px' : '4px 16px 16px' }}>
          {upcoming.length === 0 ? (
            <div style={{ padding: 24, color: crmV2.textMuted, fontSize: 13 }}>
              Aucun événement à venir.
            </div>
          ) : (
            (() => {
              const groups: { label: string; items: CalItem[] }[] = []
              let current = ''
              for (const it of upcoming.slice(0, 60)) {
                const label = formatDayFr(it.dayKeys[0])
                if (label !== current) {
                  current = label
                  groups.push({ label, items: [] })
                }
                groups[groups.length - 1].items.push(it)
              }
              return (
                <div style={{ display: 'grid', gap: 4 }}>
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.4px',
                          color: crmV2.textMuted,
                          textTransform: 'uppercase',
                          padding: '14px 4px 6px',
                        }}
                      >
                        {g.label}
                      </div>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {g.items.map((it) => (
                          <ItemShell
                            key={it.key}
                            it={it}
                          onSelect={setSelected}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: isMobile ? '48px minmax(0, 1fr)' : '64px minmax(0, 1fr)',
                              gap: 10,
                              alignItems: 'center',
                              padding: '8px 12px',
                              minHeight: 44,
                              width: '100%',
                              boxSizing: 'border-box',
                              color: 'inherit',
                              background: it.kind === 'competitor' ? hexA(COMPETITOR_COLOR.solid, 0.04) : crmV2.bg,
                              border: it.kind === 'competitor' ? `1px dashed ${hexA(COMPETITOR_COLOR.solid, 0.45)}` : `1px solid ${crmV2.border}`,
                              borderLeft: `3px solid ${it.color.solid}`,
                              borderRadius: 12,
                            }}
                          >
                            <div style={{ fontSize: 12, color: it.color.text, fontWeight: 700, lineHeight: 1.3 }}>
                              {it.time || '—'}
                              {it.timeEnd ? (
                                <div style={{ fontWeight: 600, color: crmV2.textFaint }}>{it.timeEnd}</div>
                              ) : null}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 14,
                                  color: crmV2.text,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {it.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: it.kind === 'competitor' ? COMPETITOR_COLOR.text : crmV2.textMuted,
                                  marginTop: 2,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {it.kind === 'competitor' ? 'Concurrent · ' : ''}
                                {it.sub}
                                {it.dayKeys.length > 1 ? ` · jusqu’au ${format(parseISO(`${it.dayKeys[it.dayKeys.length - 1]}T12:00:00`), 'd MMM', { locale: fr })}` : ''}
                              </div>
                            </div>
                          </ItemShell>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()
          )}
        </div>
      )}

      {/* Détail d'un événement concurrent */}
      <CrmV2Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        header={
          selected && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <CrmV2StatusPill
                  label={`Concurrent · ${COMPETITOR_NAMES[selected.competitor] || selected.competitor}`}
                  color={COMPETITOR_COLOR.text}
                  bg={COMPETITOR_COLOR.soft}
                />
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8, lineHeight: 1.3 }}>{selected.name}</div>
              </div>
              <CrmV2CloseButton onClick={() => setSelected(null)} />
            </div>
          )
        }
        footer={
          selected && (
            <>
              {selected.source_url && (
                <a href={selected.source_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="secondary" icon={<ExternalLink size={14} />}>
                    Voir la source
                  </CrmV2Button>
                </a>
              )}
              <span style={{ flex: 1 }} />
              <CrmV2Button variant="danger" icon={<EyeOff size={14} />} onClick={() => hideCompetitorEvent(selected)}>
                Masquer
              </CrmV2Button>
            </>
          )
        }
      >
        {selected && (
          <div style={{ padding: 18, display: 'grid', gap: 14, fontSize: 13 }}>
            {[
              ['Type', TYPE_SHORT[selected.event_type] || 'Autre'],
              [
                'Date',
                selected.end_date
                  ? `Du ${formatDayFr(selected.start_date)} au ${formatDayFr(selected.end_date)}`
                  : formatDayFr(selected.start_date),
              ],
              [
                'Horaires',
                selected.time_start
                  ? `${selected.time_start}${selected.time_end ? ` – ${selected.time_end}` : ''}`
                  : 'Non trouvés',
              ],
              ['Lieu', selected.location || '—'],
              ['Détails', selected.notes || '—'],
              [
                'Source',
                selected.found_by === 'manual'
                  ? 'Ajouté à la main'
                  : `Bot de veille · vu le ${new Date(selected.last_seen_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </div>
                <div style={{ marginTop: 3, color: crmV2.text, lineHeight: 1.5, textTransform: label === 'Date' ? 'none' : undefined }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}
      </CrmV2Drawer>

      {/* Ajout manuel d'un événement concurrent */}
      <CrmV2Drawer
        open={adding}
        onClose={() => setAdding(false)}
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Ajouter un événement concurrent</div>
            <CrmV2CloseButton onClick={() => setAdding(false)} />
          </div>
        }
        footer={
          <>
            {formError && <span style={{ fontSize: 12, color: crmV2.danger, alignSelf: 'center' }}>{formError}</span>}
            <span style={{ flex: 1 }} />
            <CrmV2Button variant="secondary" onClick={() => setAdding(false)}>
              Annuler
            </CrmV2Button>
            <CrmV2Button variant="primary" onClick={saveDraft} disabled={saving || !draft.name || !draft.start_date}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </CrmV2Button>
          </>
        }
      >
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <CrmV2Field label="Concurrent">
            <CrmV2Select value={draft.competitor} onChange={(e) => setDraft({ ...draft, competitor: e.target.value })}>
              {Object.entries(COMPETITOR_NAMES).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </CrmV2Select>
          </CrmV2Field>
          <CrmV2Field label="Type">
            <CrmV2Select value={draft.event_type} onChange={(e) => setDraft({ ...draft, event_type: e.target.value })}>
              {Object.entries(TYPE_SHORT).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </CrmV2Select>
          </CrmV2Field>
          <CrmV2Field label="Nom" span={2}>
            <CrmV2Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="JPO Paris 6e" />
          </CrmV2Field>
          <CrmV2Field label="Date">
            <CrmV2Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
          </CrmV2Field>
          <CrmV2Field label="Fin (si plusieurs jours)">
            <CrmV2Input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
          </CrmV2Field>
          <CrmV2Field label="Début">
            <CrmV2Input type="time" value={draft.time_start} onChange={(e) => setDraft({ ...draft, time_start: e.target.value })} />
          </CrmV2Field>
          <CrmV2Field label="Fin">
            <CrmV2Input type="time" value={draft.time_end} onChange={(e) => setDraft({ ...draft, time_end: e.target.value })} />
          </CrmV2Field>
          <CrmV2Field label="Lieu" span={2}>
            <CrmV2Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Adresse, ville ou « En ligne »" />
          </CrmV2Field>
          <CrmV2Field label="Lien source" span={2}>
            <CrmV2Input value={draft.source_url} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} placeholder="https://…" />
          </CrmV2Field>
          <CrmV2Field label="Notes" span={2}>
            <CrmV2Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </CrmV2Field>
        </div>
      </CrmV2Drawer>
    </CrmV2Card>
  )
}
