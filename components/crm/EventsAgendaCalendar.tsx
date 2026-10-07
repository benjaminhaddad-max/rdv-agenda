'use client'

import { useMemo, useState, type CSSProperties } from 'react'
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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CrmV2Button, CrmV2Card, CrmV2Segmented, CrmV2StatusPill, hexA } from '@/components/crm-v2/primitives'
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

const CALENDAR_LEGEND_TYPES = ['webinaire', 'salon', 'jpo'] as const

function eventTypeColor(ev: CalendarEventRow) {
  const typeId = eventTypeOf(ev).id
  return EVENT_TYPE_COLORS[typeId] || EVENT_TYPE_COLORS.autre
}

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
  const [hh, mm] = time.split(':').map((x) => parseInt(x, 10))
  return { dayKey, hh: hh || 0, mm: mm || 0, time }
}

/** Jours couverts (inclus) pour un événement multi-jours via [date_end=YYYY-MM-DD]. */
function dayKeysForEvent(ev: CalendarEventRow): string[] {
  const { dayKey: startKey } = parisParts(ev.event_date)
  const m = (ev.description || '').match(DATE_END_RE)
  if (!m) return [startKey]
  const endKey = m[1]
  if (endKey <= startKey) return [startKey]
  const keys: string[] = []
  let cur = parseISO(`${startKey}T12:00:00`)
  const end = parseISO(`${endKey}T12:00:00`)
  while (cur <= end) {
    keys.push(format(cur, 'yyyy-MM-dd'))
    cur = addDays(cur, 1)
  }
  return keys.length ? keys : [startKey]
}

function endMinutes(ev: CalendarEventRow, startMin: number): number {
  if (ev.event_time_end && /^\d{1,2}:\d{2}$/.test(ev.event_time_end)) {
    const [h, m] = ev.event_time_end.split(':').map((x) => parseInt(x, 10))
    return h * 60 + m
  }
  return startMin + 60
}

function startOfTodayParis(): Date {
  const key = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  return new Date(`${key}T00:00:00`)
}

type Props = {
  events: CalendarEventRow[]
  loading?: boolean
}

export default function EventsAgendaCalendar({ events, loading }: Props) {
  const isMobile = useIsMobile()
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => new Date())

  const active = useMemo(
    () => events.filter((e) => e.status !== 'cancelled'),
    [events],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>()
    for (const ev of active) {
      for (const dayKey of dayKeysForEvent(ev)) {
        const list = map.get(dayKey) || []
        list.push(ev)
        map.set(dayKey, list)
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    }
    return map
  }, [active])

  const upcoming = useMemo(() => {
    const start = startOfTodayParis().getTime()
    return active
      .filter((e) => {
        const keys = dayKeysForEvent(e)
        const last = keys[keys.length - 1]
        return parseISO(`${last}T23:59:59`).getTime() >= start
      })
      .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
  }, [active])

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
                const dayEvents = byDay.get(key) || []
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
                      {dayEvents.slice(0, 4).map((ev) => {
                        const c = eventTypeColor(ev)
                        const { time } = parisParts(ev.event_date)
                        return (
                          <Link
                            key={ev.id}
                            href={`/admin/crm/events/${ev.id}`}
                            title={ev.name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              minWidth: 0,
                              fontSize: 11,
                              fontWeight: 700,
                              lineHeight: 1.3,
                              padding: '2px 6px',
                              borderRadius: 6,
                              background: c.soft,
                              border: `1px solid ${hexA(c.solid, 0.3)}`,
                              color: crmV2.text,
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.solid, flexShrink: 0 }} />
                            <span style={{ color: c.text, flexShrink: 0 }}>{time}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{ev.name}</span>
                          </Link>
                        )
                      })}
                      {dayEvents.length > 4 && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: crmV2.textMuted, paddingLeft: 4 }}>
                          +{dayEvents.length - 4} de plus
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
                const dayEvents = byDay.get(key) || []
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
                    {dayEvents.map((ev) => {
                      const { hh, mm } = parisParts(ev.event_date)
                      const startMin = hh * 60 + mm
                      const endMin = endMinutes(ev, startMin)
                      const top = ((startMin - HOUR_START * 60) / 60) * PX_PER_HOUR
                      const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 22)
                      if (endMin <= HOUR_START * 60 || startMin >= HOUR_END * 60) return null
                      const c = eventTypeColor(ev)
                      const type = eventTypeOf(ev)
                      return (
                        <Link
                          key={ev.id}
                          href={`/admin/crm/events/${ev.id}`}
                          title={ev.name}
                          style={{
                            position: 'absolute',
                            left: 3,
                            right: 3,
                            top: Math.max(top, 0),
                            height,
                            border: `1px solid ${hexA(c.solid, 0.35)}`,
                            borderRadius: 8,
                            padding: '2px 7px',
                            boxSizing: 'border-box',
                            textDecoration: 'none',
                            overflow: 'hidden',
                            zIndex: 1,
                            backgroundColor: crmV2.bg,
                            backgroundImage: `linear-gradient(${c.soft}, ${c.soft})`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, lineHeight: '15px' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.solid, flexShrink: 0 }} />
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
                              {ev.name}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: c.text,
                              lineHeight: '13px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {parisParts(ev.event_date).time}
                            {ev.event_time_end ? `–${ev.event_time_end}` : ''} · {type.short}
                          </div>
                        </Link>
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
              const groups: { label: string; items: CalendarEventRow[] }[] = []
              let current = ''
              for (const ev of upcoming.slice(0, 40)) {
                const d = new Date(ev.event_date)
                const label = d.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'Europe/Paris',
                })
                if (label !== current) {
                  current = label
                  groups.push({ label, items: [] })
                }
                groups[groups.length - 1].items.push(ev)
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
                        {g.items.map((ev) => {
                          const b = brandOf(ev)
                          const c = eventTypeColor(ev)
                          const type = eventTypeOf(ev)
                          const { time } = parisParts(ev.event_date)
                          return (
                            <Link
                              key={ev.id}
                              href={`/admin/crm/events/${ev.id}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '48px minmax(0, 1fr)' : '64px minmax(0, 1fr)',
                                gap: 10,
                                alignItems: 'center',
                                padding: '8px 12px',
                                minHeight: 44,
                                boxSizing: 'border-box',
                                textDecoration: 'none',
                                color: 'inherit',
                                background: crmV2.bg,
                                border: `1px solid ${crmV2.border}`,
                                borderLeft: `3px solid ${c.solid}`,
                                borderRadius: 12,
                              }}
                            >
                              <div style={{ fontSize: 12, color: c.text, fontWeight: 700, lineHeight: 1.3 }}>
                                {time}
                                {ev.event_time_end ? (
                                  <div style={{ fontWeight: 600, color: crmV2.textFaint }}>{ev.event_time_end}</div>
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
                                  {ev.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: crmV2.textMuted,
                                    marginTop: 2,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {BRAND_CONFIG[b].name} · {type.short}
                                  {ev.location ? ` · ${ev.location}` : ''}
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()
          )}
        </div>
      )}
    </CrmV2Card>
  )
}
