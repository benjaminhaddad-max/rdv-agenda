'use client'

/**
 * Grille semaine des horaires d'appel (espace télépro › « Mes horaires »),
 * façon agenda :
 * - glisser sur une colonne vide → nouvelle plage ;
 * - glisser une plage → la déplacer (même jour ou autre jour) ;
 * - tirer le haut / le bas d'une plage → changer le début / la fin ;
 * - clic → éditeur du jour (plages au clavier, recopie, répétition).
 * Les RDV où la personne est closer s'affichent à droite de la colonne pour
 * savoir où elle est. Jours passés et jours imposés : lecture seule.
 * Données : lib/telepro-planning.ts (DayReport).
 */

import { useEffect, useRef, useState } from 'react'
import { GraduationCap, Lock } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { DayStats, SCHOOL_COLOR, SchoolBadge, VERDICTS, VerdictPill, WEEKDAYS, type DayReport } from '@/components/planning/PlanningUi'

const SNAP = 15
const PX_PER_HOUR = 44
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 21
const MIN_DURATION = 15

export type GridSlot = { start: string; end: string }
export type GridChange = { date: string; slots: GridSlot[] }

type DragMode = 'create' | 'move' | 'resize-start' | 'resize-end'
type Drag = {
  mode: DragMode
  originDate: string
  slotIndex: number
  /** create : minute d'ancrage ; move : décalage de la prise dans la plage */
  anchor: number
  startMin: number
  endMin: number
  targetDate: string
  x0: number
  y0: number
  moved: boolean
}

function toMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

function toHm(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function parisNowMinutes(): number {
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).split(':').map(Number)
  return h * 60 + m
}

const MEETING_COLOR = '#2563eb'

export default function ScheduleGrid({ days, today, canEditDay, onCommit, onOpenDay }: {
  days: DayReport[]
  today: string
  canEditDay: (day: DayReport) => boolean
  onCommit: (changes: GridChange[]) => void
  onOpenDay: (day: DayReport) => void
}) {
  // Amplitude affichée : 8 h → 21 h, élargie si une plage ou un RDV déborde
  let minHour = DEFAULT_START_HOUR
  let maxHour = DEFAULT_END_HOUR
  for (const d of days) {
    for (const s of [...d.slots, ...(d.meetings ?? [])]) {
      minHour = Math.min(minHour, Math.floor(toMin(s.start) / 60))
      maxHour = Math.max(maxHour, Math.ceil(toMin(s.end) / 60))
    }
  }
  maxHour = Math.min(24, maxHour)
  const gridMin = minHour * 60
  const gridMax = maxHour * 60
  const height = (maxHour - minHour) * PX_PER_HOUR
  const yOf = (min: number) => ((min - gridMin) / 60) * PX_PER_HOUR

  const colRefs = useRef<Array<HTMLDivElement | null>>([])
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [nowMin, setNowMin] = useState(parisNowMinutes)
  useEffect(() => {
    const id = setInterval(() => setNowMin(parisNowMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  const editableByDate = new Map(days.map(d => [d.date, canEditDay(d)]))
  const dayByDate = new Map(days.map(d => [d.date, d]))

  /** Minute (arrondie au quart d'heure) sous le pointeur dans la colonne i. */
  function minuteAt(i: number, clientY: number): number {
    const el = colRefs.current[i]
    if (!el) return gridMin
    const rect = el.getBoundingClientRect()
    const raw = gridMin + ((clientY - rect.top) / PX_PER_HOUR) * 60
    return Math.max(gridMin, Math.min(gridMax, Math.round(raw / SNAP) * SNAP))
  }

  /** Colonne sous le pointeur (null hors grille). */
  function columnAt(clientX: number): number | null {
    for (let i = 0; i < days.length; i++) {
      const r = colRefs.current[i]?.getBoundingClientRect()
      if (r && clientX >= r.left && clientX < r.right) return i
    }
    return null
  }

  function begin(next: Drag) {
    dragRef.current = next
    setDrag(next)
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const moved = d.moved || Math.abs(e.clientY - d.y0) > 3 || Math.abs(e.clientX - d.x0) > 3
      const originIdx = days.findIndex(x => x.date === d.originDate)
      let next: Drag = { ...d, moved }
      if (d.mode === 'create') {
        const m = minuteAt(originIdx, e.clientY)
        const start = Math.min(d.anchor, m)
        const end = Math.max(d.anchor, m)
        next = { ...next, startMin: start, endMin: Math.max(end, start + MIN_DURATION) }
      } else if (d.mode === 'resize-start') {
        next = { ...next, startMin: Math.min(minuteAt(originIdx, e.clientY), d.endMin - MIN_DURATION) }
      } else if (d.mode === 'resize-end') {
        next = { ...next, endMin: Math.max(minuteAt(originIdx, e.clientY), d.startMin + MIN_DURATION) }
      } else {
        const col = columnAt(e.clientX)
        const target = col != null && editableByDate.get(days[col].date) ? days[col].date : d.targetDate
        const targetIdx = days.findIndex(x => x.date === target)
        const duration = d.endMin - d.startMin
        let start = minuteAt(targetIdx, e.clientY) - d.anchor
        start = Math.round(start / SNAP) * SNAP
        start = Math.max(gridMin, Math.min(gridMax - duration, start))
        next = { ...next, targetDate: target, startMin: start, endMin: start + duration }
      }
      dragRef.current = next
      setDrag(next)
    }
    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      const origin = dayByDate.get(d.originDate)
      if (!origin) return
      if (!d.moved) {
        onOpenDay(origin)
        return
      }
      const own: GridSlot[] = origin.slots.map(s => ({ start: s.start, end: s.end }))
      const placed = { start: toHm(d.startMin), end: toHm(d.endMin) }
      if (d.mode === 'create') {
        onCommit([{ date: origin.date, slots: [...own, placed] }])
      } else if (d.mode === 'move' && d.targetDate !== d.originDate) {
        const target = dayByDate.get(d.targetDate)
        if (!target) return
        // Jour d'arrivée d'abord : s'il est refusé, le jour de départ reste intact
        onCommit([
          { date: target.date, slots: [...target.slots.map(s => ({ start: s.start, end: s.end })), placed] },
          { date: origin.date, slots: own.filter((_, i) => i !== d.slotIndex) },
        ])
      } else {
        onCommit([{ date: origin.date, slots: own.map((s, i) => (i === d.slotIndex ? placed : s)) }])
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const hours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i)
  const draggingSlot = drag && drag.mode !== 'create' ? `${drag.originDate}|${drag.slotIndex}` : null

  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow,
      overflow: 'hidden', userSelect: drag ? 'none' : undefined,
    }}>
      {/* En-têtes de jour : date, bilan, chiffres */}
      <div style={{ display: 'grid', gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`, borderBottom: `1px solid ${crmV2.border}` }}>
        <div />
        {days.map((d, i) => {
          const isToday = d.date === today
          return (
            <div key={d.date} style={{
              padding: '8px 8px 6px', borderLeft: `1px solid ${crmV2.border}`, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
              background: isToday ? crmV2.goldSoft : undefined,
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: isToday ? crmV2.goldDark : crmV2.text }}>
                {WEEKDAYS[i]} {Number(d.date.slice(8))}
              </span>
              {d.school && !d.slots.length && <SchoolBadge small />}
              {d.slots.length > 0 && (d.date <= today) && <VerdictPill verdict={d.verdict} small />}
              {d.slots.some(s => s.locked) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#6d28d9' }}>
                  <Lock size={10} /> Fixé par la direction
                </span>
              )}
              <DayStats day={d} compact />
            </div>
          )
        })}
      </div>

      {/* Grille horaire */}
      <div style={{ display: 'grid', gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div style={{ position: 'relative', height }}>
          {hours.map(h => (
            <span key={h} style={{
              position: 'absolute', top: yOf(h * 60) - 7, right: 6, fontSize: 10.5, color: crmV2.textFaint, fontVariantNumeric: 'tabular-nums',
            }}>
              {h > minHour ? `${h}h` : ''}
            </span>
          ))}
        </div>
        {days.map((d, i) => {
          const editable = !!editableByDate.get(d.date)
          const past = d.date < today
          return (
            <div
              key={d.date}
              ref={el => { colRefs.current[i] = el }}
              onPointerDown={e => {
                if (!editable || e.button !== 0) return
                e.preventDefault()
                const m = Math.floor(minuteAt(i, e.clientY) / SNAP) * SNAP
                begin({
                  mode: 'create', originDate: d.date, slotIndex: -1, anchor: m, startMin: m, endMin: m + MIN_DURATION,
                  targetDate: d.date, x0: e.clientX, y0: e.clientY, moved: false,
                })
              }}
              title={editable ? 'Glisse pour ajouter une plage — clic pour modifier la journée' : undefined}
              style={{
                position: 'relative', height, borderLeft: `1px solid ${crmV2.border}`,
                cursor: editable ? 'crosshair' : 'default',
                background: past ? crmV2.bgSoft : d.date === today ? 'rgba(201,168,76,0.04)' : undefined,
                backgroundImage: `repeating-linear-gradient(to bottom, ${crmV2.border} 0, ${crmV2.border} 1px, transparent 1px, transparent ${PX_PER_HOUR}px)`,
                touchAction: 'none',
              }}
            >
              {/* Jour d'école : bandeau sur toute la colonne */}
              {d.school && !d.slots.length && (
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 4, color: SCHOOL_COLOR, fontSize: 12, fontWeight: 700,
                  background: 'repeating-linear-gradient(135deg, rgba(13,148,136,0.07) 0, rgba(13,148,136,0.07) 8px, rgba(13,148,136,0.02) 8px, rgba(13,148,136,0.02) 16px)',
                }}>
                  <GraduationCap size={18} /> École
                </div>
              )}

              {/* Plages d'appel */}
              {d.slots.map((s, si) => {
                if (draggingSlot === `${d.date}|${si}`) return null
                const top = yOf(toMin(s.start))
                const h = Math.max(14, yOf(toMin(s.end)) - top)
                const verdictColor = (past || d.date === today) && s.verdict !== 'a_venir' ? VERDICTS[s.verdict].color : null
                const movable = editable && !s.locked
                return (
                  <div
                    key={s.id}
                    onPointerDown={e => {
                      e.stopPropagation()
                      if (e.button !== 0) return
                      if (!movable) { onOpenDay(d); return }
                      e.preventDefault()
                      const startMin = toMin(s.start)
                      const endMin = toMin(s.end)
                      const rect = e.currentTarget.getBoundingClientRect()
                      const offsetY = e.clientY - rect.top
                      const mode: DragMode = offsetY < 7 ? 'resize-start' : offsetY > rect.height - 7 ? 'resize-end' : 'move'
                      begin({
                        mode, originDate: d.date, slotIndex: si,
                        anchor: Math.round(((offsetY / PX_PER_HOUR) * 60) / SNAP) * SNAP,
                        startMin, endMin, targetDate: d.date, x0: e.clientX, y0: e.clientY, moved: false,
                      })
                    }}
                    title={s.locked ? 'Horaire imposé par la direction' : movable ? 'Glisse pour déplacer, tire le haut ou le bas pour ajuster — clic pour modifier / répéter' : undefined}
                    style={{
                      position: 'absolute', top, height: h, left: 3, right: 3, boxSizing: 'border-box',
                      borderRadius: 6, padding: '3px 6px', overflow: 'hidden',
                      background: s.locked ? 'rgba(124,58,237,0.12)' : crmV2.goldSoft,
                      border: `1px solid ${s.locked ? 'rgba(124,58,237,0.35)' : crmV2.goldBorder}`,
                      borderLeft: `3px solid ${verdictColor ?? (s.locked ? '#7c3aed' : crmV2.gold)}`,
                      color: s.locked ? '#5b21b6' : crmV2.goldDark,
                      fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25,
                      cursor: movable ? 'grab' : 'pointer', opacity: past ? 0.75 : 1, zIndex: 1,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {s.locked && <Lock size={9} />}{s.start}–{s.end}
                    </span>
                    {s.calls > 0 && h > 30 && (
                      <div style={{ fontWeight: 500, color: crmV2.textMuted }}>{s.calls} appel{s.calls > 1 ? 's' : ''}</div>
                    )}
                    {movable && (
                      <>
                        <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize' }} />
                        <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize' }} />
                      </>
                    )}
                  </div>
                )
              })}

              {/* Aperçu pendant le glisser */}
              {drag && (drag.mode === 'move' ? drag.targetDate : drag.originDate) === d.date && (
                <div style={{
                  position: 'absolute', top: yOf(drag.startMin), height: Math.max(14, yOf(drag.endMin) - yOf(drag.startMin)),
                  left: 3, right: 3, boxSizing: 'border-box', borderRadius: 6, padding: '3px 6px', zIndex: 3, pointerEvents: 'none',
                  background: 'rgba(201,168,76,0.28)', border: `2px dashed ${crmV2.gold}`,
                  color: crmV2.goldDark, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}>
                  {toHm(drag.startMin)}–{toHm(drag.endMin)}
                </div>
              )}

              {/* RDV où la personne est closer : là où elle est */}
              {(d.meetings ?? []).map(m => {
                const top = yOf(toMin(m.start))
                const h = Math.max(16, yOf(toMin(m.end)) - top)
                return (
                  <div key={m.id} title={`En RDV ${m.start}–${m.end}${m.name ? ` · ${m.name}` : ''}`} style={{
                    position: 'absolute', top, height: h, left: '42%', right: 2, boxSizing: 'border-box', zIndex: 2,
                    borderRadius: 6, padding: '2px 5px', overflow: 'hidden', pointerEvents: 'none',
                    background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', borderLeft: `3px solid ${MEETING_COLOR}`,
                    color: '#1e40af', fontSize: 10.5, fontWeight: 600, lineHeight: 1.2,
                  }}>
                    <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>RDV {m.start}</div>
                    {h > 28 && m.name && <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>}
                  </div>
                )
              })}

              {/* Heure actuelle */}
              {d.date === today && nowMin >= gridMin && nowMin <= gridMax && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: yOf(nowMin), height: 2, background: '#dc2626', zIndex: 4, pointerEvents: 'none' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Légende de la grille. */
export function ScheduleGridLegend({ editable }: { editable: boolean }) {
  const swatch = (bg: string, border: string) => (
    <span style={{ width: 14, height: 10, borderRadius: 3, background: bg, border: `1px solid ${border}`, display: 'inline-block' }} />
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: crmV2.textMuted }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch(crmV2.goldSoft, crmV2.goldBorder)} Mes horaires</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch('rgba(124,58,237,0.12)', 'rgba(124,58,237,0.35)')} Imposé</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch('rgba(37,99,235,0.12)', 'rgba(37,99,235,0.35)')} En RDV (closer)</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch('rgba(13,148,136,0.1)', 'rgba(13,148,136,0.35)')} École</span>
      {editable && (
        <span style={{ marginLeft: 'auto' }}>
          Glisse sur la grille pour ajouter une plage, glisse-la pour la déplacer, tire ses bords pour l&apos;ajuster · clic = modifier / répéter
        </span>
      )}
    </div>
  )
}
