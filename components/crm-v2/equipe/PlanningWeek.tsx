'use client'

/**
 * Briques du mode « Planning » de la page Équipe (onglet Télépros) : une
 * colonne par jour du lundi au dimanche dans le tableau des télépros.
 * - horaires prévus (imposés 🔒 ou saisis par le télépro) ;
 * - sans horaires : activité réelle d'après Aircall (1er → dernier appel) ;
 * - journée passée : bilan (bien fait / partiel / pas d'appel) ;
 * - RDV où le télépro est closer : savoir où il est.
 * En tête de chaque jour : télépros présents (au moins un appel) et prévus.
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Lock } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  SchoolBadge, SlotChip, VERDICTS, VerdictPill, WEEKDAYS, fmtMinutes, type DayReport,
} from '@/components/planning/PlanningUi'

export type PlanningMember = { id: string; name: string; email: string | null; avatar_color: string | null }
export type PlanningData = {
  week_start: string
  ready: boolean
  dates: string[]
  telepros: PlanningMember[]
  report: Record<string, DayReport[]>
}

/** Planning + bilan Aircall d'une semaine pour tous les télépros. */
export function usePlanningWeek(weekStart: string, refreshKey: number, enabled = true) {
  const [data, setData] = useState<PlanningData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/planning?week=${weekStart}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Planning indisponible'); return }
      setData(j as PlanningData)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { if (enabled) load() }, [load, refreshKey, enabled])

  const dayCounts = useMemo<PlanningDayCount[]>(() => {
    if (!data) return []
    return data.dates.map((_, i) => {
      const presentList: PlanningDayPerson[] = [], plannedList: PlanningDayPerson[] = []
      for (const m of data.telepros) {
        const d = data.report[m.id]?.[i]
        if (!d) continue
        if (d.calls > 0) presentList.push({ member: m, day: d })
        if (d.slots.length) plannedList.push({ member: m, day: d })
      }
      const byName = (a: PlanningDayPerson, b: PlanningDayPerson) => a.member.name.localeCompare(b.member.name, 'fr')
      presentList.sort((a, b) => b.day.calls - a.day.calls)
      plannedList.sort(byName)
      return { present: presentList.length, planned: plannedList.length, presentList, plannedList }
    })
  }, [data])

  return { data, loading, error, dayCounts, reload: load }
}

export type PlanningDayPerson = { member: PlanningMember; day: DayReport }
export type PlanningDayCount = {
  present: number
  planned: number
  presentList?: PlanningDayPerson[]
  plannedList?: PlanningDayPerson[]
}

/**
 * En-tête d'une colonne jour : « Lun 5 » + présents / prévus. Clic sur les
 * chiffres → liste déroulante des télépros présents et prévus ce jour-là.
 */
export function PlanningDayHeader({ date, index, counts, today }: {
  date: string
  index: number
  counts?: PlanningDayCount
  today: string
}) {
  const present = counts?.present ?? 0
  const planned = counts?.planned ?? 0
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const hasList = present > 0 || planned > 0

  useEffect(() => {
    if (!anchor) return
    const close = () => setAnchor(null)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [anchor])

  const counter = (
    <>
      {date <= today && (
        <><strong style={{ color: present ? crmV2.successStrong : crmV2.textFaint }}>{present}</strong> présent{present > 1 ? 's' : ''}</>
      )}
      {planned > 0 && `${date <= today ? ' · ' : ''}${planned} prévu${planned > 1 ? 's' : ''}`}
    </>
  )

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, textTransform: 'none', letterSpacing: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: date === today ? crmV2.goldDark : crmV2.text }}>
        {WEEKDAYS[index]} {Number(date.slice(8))}
      </span>
      {hasList ? (
        <button
          ref={btnRef}
          type="button"
          title="Voir qui est présent / prévu"
          onClick={e => {
            e.stopPropagation()
            setAnchor(a => a ? null : (btnRef.current?.getBoundingClientRect() ?? null))
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0, border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 11, fontWeight: 500, color: crmV2.textMuted, whiteSpace: 'nowrap', fontFamily: 'inherit',
          }}
        >
          <span>{counter}</span>
          <ChevronDown size={12} style={{ transition: 'transform .15s', transform: anchor ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
        </button>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 500, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{counter}</span>
      )}
      {anchor && counts && (
        <DayPeoplePopover
          ref={popRef}
          anchor={anchor}
          date={date}
          today={today}
          presentList={counts.presentList ?? []}
          plannedList={counts.plannedList ?? []}
        />
      )}
    </span>
  )
}

const DayPeoplePopover = forwardRef<HTMLDivElement, {
  anchor: DOMRect
  date: string
  today: string
  presentList: PlanningDayPerson[]
  plannedList: PlanningDayPerson[]
}>(function DayPeoplePopover({ anchor, date, today, presentList, plannedList }, ref) {
  const width = 300
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))
  const top = anchor.bottom + 6
  const showPresent = date <= today
  const presentIds = new Set(presentList.map(p => p.member.id))
  // Prévus pas encore / jamais venus (journée passée ou en cours)
  const absent = showPresent ? plannedList.filter(p => !presentIds.has(p.member.id)) : []

  const section = (label: string, color: string, rows: ReactNode[], empty: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      {rows.length ? rows : <div style={{ fontSize: 12, color: crmV2.textFaint }}>{empty}</div>}
    </div>
  )
  const row = (p: PlanningDayPerson, detail: ReactNode) => (
    <div key={p.member.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: p.member.avatar_color || crmV2.textFaint, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.member.name}</span>
      </span>
      <span style={{ fontSize: 11.5, color: crmV2.textMuted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{detail}</span>
    </div>
  )
  const slotsText = (d: DayReport) => d.slots.map(sl => `${sl.start}–${sl.end}`).join(', ')

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', top, left, width, maxHeight: `calc(100vh - ${Math.round(top) + 16}px)`, overflowY: 'auto', zIndex: 60,
        background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(15,23,42,.14)',
        padding: 12, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', cursor: 'default',
      }}
    >
      {showPresent && section(
        `Présents · ${presentList.length}`, crmV2.successStrong,
        presentList.map(p => row(p, <>{p.day.first_call} → {p.day.last_call} · {p.day.calls} app.{p.day.rdv ? <> · <strong style={{ color: crmV2.goldDark }}>{p.day.rdv} RDV</strong></> : null}</>)),
        "Personne n'a appelé",
      )}
      {absent.length > 0 && section(
        `${date < today ? 'Prévus mais absents' : 'Prévus, pas encore là'} · ${absent.length}`, date < today ? '#dc2626' : '#d97706',
        absent.map(p => row(p, slotsText(p.day))),
        '',
      )}
      {section(
        `Prévus · ${plannedList.length}`, crmV2.textMuted,
        plannedList.map(p => row(p, <>{slotsText(p.day)}{showPresent && presentIds.has(p.member.id) ? <span style={{ color: crmV2.successStrong }}> ✓</span> : null}</>)),
        "Pas d'horaires prévus",
      )}
    </div>
  )
})

/** Case jour d'un télépro (clic → modifier / imposer les horaires). */
export function PlanningDayCell({ day, today, onClick }: { day: DayReport; today: string; onClick: () => void }) {
  const past = day.date < today
  const activityOnly = !day.slots.length && day.calls > 0
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      title={past ? 'Voir le bilan / corriger les horaires' : 'Définir ou imposer les horaires'}
      style={{
        width: '100%', minHeight: 40, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column', gap: 3, padding: 4, borderRadius: 8,
        border: `1px solid ${day.date === today ? crmV2.goldBorder : 'transparent'}`,
        background: day.verdict === 'absent' ? 'rgba(220,38,38,0.06)' : day.verdict === 'partiel' ? 'rgba(217,119,6,0.06)' : 'transparent',
      }}
    >
      {day.slots.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {day.slots.map(s => <SlotChip key={s.id} slot={s} />)}
        </span>
      )}
      {activityOnly && (
        <span title="Pas d'horaires prévus : amplitude réelle d'après Aircall" style={{
          display: 'inline-flex', alignSelf: 'flex-start', padding: '1px 6px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
          color: '#475569', border: '1px dashed #94a3b8', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}>
          {day.first_call}–{day.last_call}
        </span>
      )}
      {day.school && !day.slots.length && <SchoolBadge small />}
      {!day.slots.length && !day.calls && !day.school && (
        <span style={{ fontSize: 11, color: crmV2.textFaint }}>{past ? '—' : '+'}</span>
      )}
      {day.slots.length > 0 && (past || day.date === today) && <VerdictPill verdict={day.verdict} small />}
      {(day.meetings ?? []).length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {day.meetings.map(m => (
            <span key={m.id} title={`En RDV (closer) ${m.start}–${m.end}${m.name ? ` · ${m.name}` : ''}`} style={{
              padding: '1px 6px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              color: '#1e40af', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)',
            }}>
              RDV {m.start}
            </span>
          ))}
        </span>
      )}
      {day.calls > 0 && (
        <span style={{ fontSize: 10.5, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
          {day.calls} app. · {day.talk2} ≥2m · <span style={{ color: day.rdv ? crmV2.goldDark : undefined, fontWeight: day.rdv ? 700 : 400 }}>{day.rdv} RDV</span>
        </span>
      )}
    </button>
  )
}

/** Colonne « Semaine » : jours présents, heures prévues, RDV. */
export function PlanningWeekSummary({ days }: { days: DayReport[] }) {
  const planned = days.reduce((s, d) => s + d.planned_min, 0)
  const present = days.filter(d => d.calls > 0).length
  const calls = days.reduce((s, d) => s + d.calls, 0)
  const rdv = days.reduce((s, d) => s + d.rdv, 0)
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 11.5, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
      <strong style={{ color: present ? crmV2.text : crmV2.textFaint }}>{present} j présent{present > 1 ? 's' : ''}</strong>
      <span>{planned ? `${fmtMinutes(planned)} prévues` : 'sans horaires'} · {calls} app.</span>
      <span style={{ color: rdv ? crmV2.goldDark : undefined, fontWeight: rdv ? 700 : 400 }}>{rdv} RDV</span>
    </span>
  )
}

/** Légende du mode Planning. */
export function PlanningLegend() {
  return (
    <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5, color: crmV2.textMuted }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} color="#7c3aed" /> imposé</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 14, height: 10, border: '1px dashed #94a3b8', borderRadius: 3 }} /> activité réelle sans horaires
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 14, height: 10, borderRadius: 3, background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)' }} /> en RDV (closer)
      </span>
      {(['ok', 'partiel', 'absent'] as const).map(v => <span key={v} title={VERDICTS[v].hint}><VerdictPill verdict={v} small /></span>)}
    </span>
  )
}
