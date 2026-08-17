'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CrmV2Button, CrmV2Card } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
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

export type CalendarEventRow = {
  id: string
  name: string
  brand: string | null
  event_type: string | null
  event_date: string
  event_time_end: string | null
  location: string | null
  status: string
}

function brandOf(ev: CalendarEventRow): EventBrand {
  if (ev.brand === 'medibox' || ev.brand === 'edumove' || ev.brand === 'diploma') return ev.brand
  return 'diploma'
}

function parisDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
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
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))

  const upcoming = useMemo(() => {
    const start = startOfTodayParis().getTime()
    return events
      .filter((e) => e.status !== 'cancelled' && new Date(e.event_date).getTime() >= start)
      .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
  }, [events])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>()
    for (const ev of events) {
      if (ev.status === 'cancelled') continue
      const key = parisDayKey(ev.event_date)
      const list = map.get(key) || []
      list.push(ev)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    }
    return map
  }, [events])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const monthLabel = format(cursor, 'MMMM yyyy', { locale: fr })

  return (
    <CrmV2Card style={{ padding: 18 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: crmV2.text }}>Calendrier</div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
            Événements à venir · toutes marques
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CrmV2Button variant="secondary" onClick={() => setCursor((c) => subMonths(c, 1))}>
            <ChevronLeft size={14} />
          </CrmV2Button>
          <span
            style={{
              minWidth: 140,
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 600,
              color: crmV2.text,
              textTransform: 'capitalize',
            }}
          >
            {monthLabel}
          </span>
          <CrmV2Button variant="secondary" onClick={() => setCursor((c) => addMonths(c, 1))}>
            <ChevronRight size={14} />
          </CrmV2Button>
          <CrmV2Button variant="secondary" onClick={() => setCursor(startOfMonth(new Date()))}>
            Aujourd’hui
          </CrmV2Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {(Object.keys(EVENT_BRAND_COLORS) as EventBrand[]).map((b) => {
          const c = EVENT_BRAND_COLORS[b]
          return (
            <div
              key={b}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: c.solid,
                  display: 'inline-block',
                }}
              />
              {c.label}
            </div>
          )
        })}
      </div>

      {loading ? (
        <div style={{ color: crmV2.textMuted, fontSize: 13, padding: 16 }}>Chargement…</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 4,
                marginBottom: 4,
              }}
            >
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                <div
                  key={d}
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: crmV2.textFaint,
                    padding: '4px 0',
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayEvents = byDay.get(key) || []
                const inMonth = isSameMonth(day, cursor)
                const today = isToday(day)
                return (
                  <div
                    key={key}
                    style={{
                      minHeight: 84,
                      borderRadius: crmV2.radius,
                      border: `1px solid ${today ? EVENT_BRAND_COLORS.diploma.solid : crmV2.border}`,
                      background: inMonth ? crmV2.bg : crmV2.bgSoft,
                      padding: 5,
                      opacity: inMonth ? 1 : 0.55,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: today ? 700 : 500,
                        color: today ? EVENT_BRAND_COLORS.diploma.text : crmV2.textMuted,
                        marginBottom: 3,
                      }}
                    >
                      {format(day, 'd')}
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      {dayEvents.slice(0, 3).map((ev) => {
                        const b = brandOf(ev)
                        const colors = EVENT_BRAND_COLORS[b]
                        const type = eventTypeOf(ev)
                        return (
                          <Link
                            key={ev.id}
                            href={`/admin/crm/events/${ev.id}`}
                            title={`${ev.name} · ${formatTime(ev.event_date)}${ev.event_time_end ? `–${ev.event_time_end}` : ''}`}
                            style={{
                              display: 'block',
                              fontSize: 10,
                              fontWeight: 600,
                              lineHeight: 1.25,
                              padding: '2px 4px',
                              borderRadius: 5,
                              background: colors.soft,
                              color: colors.text,
                              borderLeft: `3px solid ${colors.solid}`,
                              textDecoration: 'none',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatTime(ev.event_date)} {type.short}
                          </Link>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <div style={{ fontSize: 10, color: crmV2.textFaint, paddingLeft: 2 }}>
                          +{dayEvents.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: crmV2.text }}>
              À venir ({upcoming.length})
            </div>
            {upcoming.length === 0 ? (
              <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun événement à venir.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
                {upcoming.slice(0, 24).map((ev) => {
                  const b = brandOf(ev)
                  const colors = EVENT_BRAND_COLORS[b]
                  const type = eventTypeOf(ev)
                  const day = new Date(ev.event_date)
                  return (
                    <Link
                      key={ev.id}
                      href={`/admin/crm/events/${ev.id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: crmV2.radius,
                          border: `1px solid ${crmV2.border}`,
                          background: crmV2.bg,
                          borderLeft: `4px solid ${colors.solid}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>
                            {BRAND_CONFIG[b].name}
                          </span>
                          <span style={{ fontSize: 11, color: crmV2.textFaint }}>{type.short}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4, color: crmV2.text }}>
                          {ev.name}
                        </div>
                        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
                          {day.toLocaleDateString('fr-FR', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'Europe/Paris',
                          })}{' '}
                          · {formatTime(ev.event_date)}
                          {ev.event_time_end ? `–${ev.event_time_end}` : ''}
                        </div>
                        {ev.location && (
                          <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 2 }}>
                            {ev.location}
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </CrmV2Card>
  )
}
