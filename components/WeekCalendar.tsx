'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Users, LayoutDashboard, Plus } from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import StatusBadge, { AppointmentStatus } from './StatusBadge'
import AppointmentModal from './AppointmentModal'
import CloserNewRdvModal from './CloserNewRdvModal'

type Appointment = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  status: AppointmentStatus
  source?: string
  formation_type?: string | null
  hubspot_deal_id: string | null
  hubspot_contact_id?: string | null
  classe_actuelle?: string | null
  notes: string | null
  meeting_type?: string | null
  meeting_link?: string | null
  report_summary?: string | null
  report_telepro_advice?: string | null
  users?: { id: string; name: string; avatar_color: string; slug: string }
}

type Commercial = {
  id: string
  name: string
  slug: string
  avatar_color: string
  role: string
}

const GRID_START_HOUR = 10
const GRID_END_HOUR = 22
const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => i + GRID_START_HOUR) // 10h → 22h
const HOUR_HEIGHT = 54       // hauteur d'une ligne d'heure en vue semaine
const HOUR_HEIGHT_DAY = 76   // hauteur d'une ligne d'heure en vue jour
const SNAP_MIN = 15          // aimantation du glisser-déposer (minutes)
const GRID_TOTAL_MIN = (GRID_END_HOUR - GRID_START_HOUR) * 60
const COLORS = ['#C9A84C','#22c55e','#C9A84C','#a855f7','#06b6d4','#ef4444','#f97316']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function timeToPercent(dateStr: string, refDate: Date): number {
  const d = new Date(dateStr)
  const start = new Date(refDate)
  start.setHours(GRID_START_HOUR, 0, 0, 0)
  const end = new Date(refDate)
  end.setHours(GRID_END_HOUR, 0, 0, 0)
  const total = end.getTime() - start.getTime()
  const offset = d.getTime() - start.getTime()
  return Math.max(0, Math.min(100, (offset / total) * 100))
}

/** Hauteur min en % du créneau visible (≈ 20 min visuelles). */
function durationToPercent(startStr: string, endStr: string, refDate: Date): number {
  const start = new Date(startStr)
  const end = new Date(endStr)
  const refStart = new Date(refDate)
  refStart.setHours(GRID_START_HOUR, 0, 0, 0)
  const refEnd = new Date(refDate)
  refEnd.setHours(GRID_END_HOUR, 0, 0, 0)
  const total = refEnd.getTime() - refStart.getTime()
  const duration = end.getTime() - start.getTime()
  return Math.max(4, (duration / total) * 100)
}

const MAX_SIDE_COLS = 2

const NIVEAU_PREFIX_RE = /^(Terminale|Première|Premiere|Etudes Sup\.?|PASS|LAS|Seconde|Reorientation|Réorientation)\s*[-–]\s*(.+)$/i

/** Retire le préfixe Calendly (« Terminale - … ») pour gagner de la place. */
function shortProspectName(name: string): string {
  const n = name.trim()
  const m = n.match(NIVEAU_PREFIX_RE)
  return m ? m[2].trim() : n
}

/** Niveau d'études : champ classe_actuelle en priorité, sinon préfixe du nom. */
function getNiveau(classe: string | null | undefined, name: string): string {
  const c = (classe || '').trim()
  if (c) return c
  const m = name.trim().match(NIVEAU_PREFIX_RE)
  return m ? m[1].trim() : ''
}

/**
 * Distingue un lien Google Meet (externe, importé) d'un lien visio interne (/visio/).
 * Retourne le libellé court, le libellé complet et la couleur du badge.
 */
function getVisioBadge(link: string | null | undefined): {
  isGoogle: boolean
  shortLabel: string
  fullLabel: string
  color: string
} {
  const url = (link || '').trim()
  const isGoogle = /meet\.google\.com/i.test(url)
  return isGoogle
    ? { isGoogle: true, shortLabel: 'Meet', fullLabel: 'Rejoindre Google Meet', color: '#1a73e8' }
    : { isGoogle: false, shortLabel: 'Visio', fullLabel: 'Rejoindre la visio', color: '#0e8a5f' }
}

type DayLayout<T extends { id: string; start_at: string; end_at: string }> = {
  slots: Map<string, { col: number; cols: number }>
  overflow: Array<{ key: string; start_at: string; end_at: string; appts: T[] }>
}

/**
 * Répartit les RDV qui se chevauchent : max 2 colonnes visibles + badge « +N » pour le reste.
 */
function computeDayLayout<T extends { id: string; start_at: string; end_at: string }>(
  appts: T[],
  maxCols: number = MAX_SIDE_COLS,
): DayLayout<T> {
  const slots = new Map<string, { col: number; cols: number }>()
  const overflow: DayLayout<T>['overflow'] = []

  const sorted = [...appts].sort((a, b) => {
    const sa = new Date(a.start_at).getTime()
    const sb = new Date(b.start_at).getTime()
    if (sa !== sb) return sa - sb
    return new Date(a.end_at).getTime() - new Date(b.end_at).getTime()
  })

  let columns: T[][] = []
  let clusterMaxEnd = 0

  const flushCluster = () => {
    if (columns.length === 0) return
    const displayCols = Math.min(columns.length, maxCols)
    const hidden: T[] = []

    for (let i = 0; i < columns.length; i++) {
      for (const a of columns[i]) {
        if (i < maxCols) {
          slots.set(a.id, { col: i, cols: displayCols })
        } else {
          hidden.push(a)
        }
      }
    }

    if (hidden.length > 0) {
      const starts = hidden.map(a => new Date(a.start_at).getTime())
      const ends = hidden.map(a => new Date(a.end_at).getTime())
      overflow.push({
        key: hidden.map(a => a.id).join('|'),
        start_at: new Date(Math.min(...starts)).toISOString(),
        end_at: new Date(Math.max(...ends)).toISOString(),
        appts: hidden,
      })
    }

    columns = []
    clusterMaxEnd = 0
  }

  for (const a of sorted) {
    const start = new Date(a.start_at).getTime()
    const end = new Date(a.end_at).getTime()
    if (columns.length > 0 && start >= clusterMaxEnd) flushCluster()

    let placed = false
    for (let i = 0; i < columns.length; i++) {
      const last = columns[i][columns[i].length - 1]
      if (new Date(last.end_at).getTime() <= start) {
        columns[i].push(a)
        placed = true
        break
      }
    }
    if (!placed) columns.push([a])
    clusterMaxEnd = Math.max(clusterMaxEnd, end)
  }
  flushCluster()

  return { slots, overflow }
}

export default function WeekCalendar({ adminMode = false, closerId, closerColor, closerName, teamView = false, allowAssign = false }: { adminMode?: boolean; closerId?: string; closerColor?: string; closerName?: string; teamView?: boolean; allowAssign?: boolean }) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([])
  // closerId = verrouillé sur un closer, adminMode = 'all', sinon persiste via localStorage
  const [selectedCommercial, setSelectedCommercial] = useState<string>(() => {
    if (closerId) return closerId
    if (adminMode) return 'all'
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rdv_selected_commercial') || 'all'
    }
    return 'all'
  })
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [dayListModal, setDayListModal] = useState<{ day: Date; appts: Appointment[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'day' | 'week' | 'list'>('week')
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [showNewRdvModal, setShowNewRdvModal] = useState(false)

  // ── Glisser-déposer (déplacer un RDV sur un autre créneau) ──────────────
  const dragRef = useRef<{ id: string; grabOffsetY: number; durationMs: number; startISO: string; endISO: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const [moveToast, setMoveToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  useEffect(() => {
    if (!moveToast) return
    const t = setTimeout(() => setMoveToast(null), 3500)
    return () => clearTimeout(t)
  }, [moveToast])

  // En vue jour, la semaine chargée est celle du jour sélectionné (pour le fetch).
  const activeWeekStart = view === 'day'
    ? startOfWeek(selectedDay, { weekStartsOn: 1 })
    : currentWeekStart
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(activeWeekStart, i))
  const weekKey = format(activeWeekStart, 'yyyy-MM-dd')

  // Closers uniquement (pas managers, pas télépros) + admin (Pascal)
  const closers = commerciaux.filter(
    c => c.role === 'closer' || c.role === 'admin'
  )

  // Compteurs semaine (hors annulés et non-assignés)
  const activeAppointments = appointments.filter(a => a.status !== 'annule' && a.status !== 'non_assigne')
  const rdvCount = activeAppointments.length
  const rdvEffectues = activeAppointments.filter(a => ['va_reflechir', 'preinscription'].includes(a.status)).length
  const weekIsDense = rdvCount > 28

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ week: weekKey })
      if (selectedCommercial !== 'all') params.set('commercial_id', selectedCommercial)
      const res = await fetch(`/api/appointments?${params}`, { cache: 'no-store' })
      if (res.ok) setAppointments(await res.json())
    } finally {
      setLoading(false)
    }
  }, [weekKey, selectedCommercial])

  useEffect(() => {
    fetch('/api/users', { cache: 'no-store' }).then(r => r.json()).then(setCommerciaux)
  }, [])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])

  function handleSelectCommercial(id: string) {
    if (closerId && !teamView) return // verrouillé en mode closer (sauf vue équipe)
    setSelectedCommercial(id)
    if (!adminMode && typeof window !== 'undefined') {
      localStorage.setItem('rdv_selected_commercial', id)
    }
  }

  function getAppointmentsForDay(day: Date) {
    return appointments.filter(a =>
      isSameDay(new Date(a.start_at), day) && a.status !== 'non_assigne'
    )
  }

  function getColorForCommercial(id: string) {
    // Code couleur stable par closer : on utilise sa couleur propre
    // (avatar_color) pour que la même personne ait toujours la même couleur,
    // dans l'agenda comme dans la fenêtre d'attribution.
    const found = closers.find(c => c.id === id)
    if (found?.avatar_color) return found.avatar_color
    // En vue équipe, chaque closer garde sa propre couleur (sinon tout serait
    // de la couleur du closer courant). On ne force la couleur que pour ses RDV.
    if (closerId && closerColor && (!teamView || id === closerId)) return closerColor
    const idx = closers.findIndex(c => c.id === id)
    return idx >= 0 ? COLORS[idx % COLORS.length] : '#C9A84C'
  }

  /** Applique le déplacement : calcule le nouveau créneau, met à jour de façon
   *  optimiste, puis persiste via l'API (rollback si conflit/erreur). */
  function moveAppointment(
    drag: NonNullable<typeof dragRef.current>,
    day: Date,
    newTopPx: number,
    colHeight: number,
  ) {
    if (colHeight <= 0) return
    const durMin = drag.durationMs / 60000
    const fraction = newTopPx / colHeight
    let minutes = Math.round((fraction * GRID_TOTAL_MIN) / SNAP_MIN) * SNAP_MIN
    minutes = Math.max(0, Math.min(GRID_TOTAL_MIN - durMin, minutes))

    const newStart = new Date(day)
    newStart.setHours(GRID_START_HOUR, 0, 0, 0)
    newStart.setMinutes(newStart.getMinutes() + minutes)
    const newEnd = new Date(newStart.getTime() + drag.durationMs)
    const newStartISO = newStart.toISOString()
    const newEndISO = newEnd.toISOString()

    if (newStartISO === drag.startISO) return // pas de changement

    const { id } = drag
    const prevStart = drag.startISO
    const prevEnd = drag.endISO

    // Mise à jour optimiste
    setAppointments(prev => prev.map(a =>
      a.id === id ? { ...a, start_at: newStartISO, end_at: newEndISO } : a,
    ))

    fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_at: newStartISO, end_at: newEndISO }),
    })
      .then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setAppointments(prev => prev.map(a =>
            a.id === id ? { ...a, start_at: prevStart, end_at: prevEnd } : a,
          ))
          setMoveToast({ kind: 'err', msg: j.error || 'Déplacement impossible' })
        } else {
          setMoveToast({
            kind: 'ok',
            msg: `RDV déplacé au ${format(newStart, 'EEEE d MMMM à HH:mm', { locale: fr })}`,
          })
        }
      })
      .catch(() => {
        setAppointments(prev => prev.map(a =>
          a.id === id ? { ...a, start_at: prevStart, end_at: prevEnd } : a,
        ))
        setMoveToast({ kind: 'err', msg: 'Erreur réseau, déplacement annulé' })
      })
  }

  /** Drop sur une colonne de jour : calcule la position verticale du curseur. */
  function handleColumnDrop(e: React.DragEvent<HTMLDivElement>, day: Date) {
    e.preventDefault()
    setDragOverDay(null)
    const drag = dragRef.current
    if (!drag) return
    const rect = e.currentTarget.getBoundingClientRect()
    const newTopPx = e.clientY - rect.top - drag.grabOffsetY
    moveAppointment(drag, day, newTopPx, rect.height)
  }

  /** Handlers communs aux colonnes de jour (vues semaine et jour). */
  function columnDragProps(day: Date) {
    const key = day.toISOString()
    return {
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        if (!dragRef.current) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (dragOverDay !== key) setDragOverDay(key)
      },
      onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null)
      },
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleColumnDrop(e, day),
    }
  }

  /** Carte RDV positionnée (vue semaine ou jour). `scale='day'` = plus grand. */
  function renderApptCard(
    appt: Appointment,
    day: Date,
    dayLayout: DayLayout<Appointment>,
    scale: 'week' | 'day',
  ) {
    const isDay = scale === 'day'
    const top = timeToPercent(appt.start_at, day)
    const height = durationToPercent(appt.start_at, appt.end_at, day)
    const color = getColorForCommercial(appt.users?.id || '')
    const isCancelled = appt.status === 'annule'
    const isConfirmed = appt.status === 'confirme_prospect'
    const formation = (appt.formation_type || '').trim()
    const displayName = shortProspectName(appt.prospect_name)
    const niveau = getNiveau(appt.classe_actuelle, appt.prospect_name)
    const tooltip = `${format(new Date(appt.start_at), 'HH:mm')} ${appt.prospect_name}${niveau ? ` — ${niveau}` : ''}${formation ? ` · ${formation}` : ''}`

    const lay = dayLayout.slots.get(appt.id) || { col: 0, cols: 1 }
    const gap = 3
    const widthPct = 100 / lay.cols
    const leftPct = widthPct * lay.col
    const sideBySide = lay.cols > 1
    const hasOverflowBadge = dayLayout.overflow.some(b => {
      const bs = new Date(b.start_at).getTime()
      const be = new Date(b.end_at).getTime()
      const as = new Date(appt.start_at).getTime()
      const ae = new Date(appt.end_at).getTime()
      return as < be && ae > bs
    })
    const rightReserve = hasOverflowBadge ? 38 : 0

    const nameSize = isDay ? 14 : (sideBySide ? 10 : 11)
    const niveauSize = isDay ? 12 : (sideBySide ? 8 : 9)
    const badgeSize = isDay ? 11 : 8

    const isDragging = draggingId === appt.id

    return (
      <div
        key={appt.id}
        onClick={() => setSelectedAppointment(appt)}
        title={tooltip}
        draggable={!isCancelled}
        onDragStart={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          dragRef.current = {
            id: appt.id,
            grabOffsetY: e.clientY - rect.top,
            durationMs: new Date(appt.end_at).getTime() - new Date(appt.start_at).getTime(),
            startISO: appt.start_at,
            endISO: appt.end_at,
          }
          setDraggingId(appt.id)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', appt.id)
        }}
        onDragEnd={() => {
          setDraggingId(null)
          setDragOverDay(null)
          dragRef.current = null
        }}
        style={{
          position: 'absolute',
          left: `calc(${leftPct}% + ${lay.col === 0 ? 3 : gap}px)`,
          width: `calc(${widthPct}% - ${lay.cols === 1 ? 6 : gap + 2}px - ${rightReserve}px)`,
          top: `${top}%`,
          height: `${height}%`,
          background: isCancelled ? 'rgba(107,114,128,0.12)' : '#fff',
          border: `1px solid ${isCancelled ? 'rgba(107,114,128,0.35)' : `${color}55`}`,
          borderLeft: `${isDay ? 4 : 3}px solid ${isCancelled ? '#6b7280' : color}`,
          borderRadius: 5,
          padding: isDay ? '6px 10px' : (sideBySide ? '2px 4px' : '3px 5px'),
          cursor: isCancelled ? 'pointer' : 'grab',
          overflow: 'hidden',
          zIndex: isDragging ? 9 : 1,
          opacity: isDragging ? 0.45 : 1,
          boxSizing: 'border-box',
          boxShadow: '0 1px 2px rgba(14,30,53,0.06)',
          transition: 'box-shadow 0.12s, z-index 0s, opacity 0.12s',
        }}
        onMouseEnter={e => {
          if (draggingId) return
          const el = e.currentTarget as HTMLDivElement
          el.style.zIndex = '8'
          el.style.boxShadow = '0 6px 16px rgba(14,30,53,0.16)'
        }}
        onMouseLeave={e => {
          if (draggingId) return
          const el = e.currentTarget as HTMLDivElement
          el.style.zIndex = '1'
          el.style.boxShadow = '0 1px 2px rgba(14,30,53,0.06)'
        }}
      >
        {isConfirmed && (
          <span
            title="Présence confirmée par le prospect"
            style={{
              position: 'absolute',
              top: 4, right: 4,
              width: isDay ? 16 : 12, height: isDay ? 16 : 12,
              borderRadius: '50%',
              background: '#10b981',
              color: '#fff',
              fontSize: isDay ? 10 : 8,
              fontWeight: 700,
              lineHeight: `${isDay ? 16 : 12}px`,
              textAlign: 'center',
            }}
          >
            ✓
          </span>
        )}
        <div style={{
          fontSize: nameSize,
          fontWeight: 700,
          color: isCancelled ? '#6b7280' : '#0e1e35',
          lineHeight: 1.25,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          paddingRight: isConfirmed ? (isDay ? 20 : 14) : 0,
        }}>
          <span style={{ color: isCancelled ? '#6b7280' : color, marginRight: 4 }}>
            {format(new Date(appt.start_at), 'HH:mm')}
          </span>
          {appt.meeting_type === 'visio' && <span style={{ marginRight: 2 }}>📹</span>}
          {displayName}
        </div>
        {niveau && (
          <div style={{
            fontSize: niveauSize,
            fontWeight: 600,
            color: isCancelled ? '#9ca3af' : '#64748b',
            lineHeight: 1.25,
            marginTop: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {niveau}{isDay && formation ? ` · ${formation}` : ''}
          </div>
        )}
        {appt.meeting_type === 'visio' && appt.meeting_link && (() => {
          const badge = getVisioBadge(appt.meeting_link)
          return (
            <a
              href={appt.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title={`${badge.fullLabel} — ${appt.meeting_link}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                marginTop: isDay ? 5 : 2,
                padding: isDay ? '2px 8px' : '1px 5px',
                borderRadius: 4,
                background: badge.color,
                color: '#fff',
                fontSize: badgeSize,
                fontWeight: 700,
                textDecoration: 'none',
                lineHeight: 1.4,
                maxWidth: '100%',
              }}
            >
              {badge.isGoogle ? '🎥 Meet' : '🎥 Visio'}
            </a>
          )
        })()}
      </div>
    )
  }

  /** Badge « +N » pour les RDV masqués d'un créneau chargé. */
  function renderOverflowBadge(block: DayLayout<Appointment>['overflow'][number], day: Date) {
    return (
      <button
        key={block.key}
        type="button"
        onClick={e => {
          e.stopPropagation()
          setDayListModal({ day, appts: block.appts })
        }}
        title={block.appts.map(a =>
          `${format(new Date(a.start_at), 'HH:mm')} ${a.prospect_name}`,
        ).join('\n')}
        style={{
          position: 'absolute',
          right: 4,
          top: `${timeToPercent(block.start_at, day)}%`,
          height: `${durationToPercent(block.start_at, block.end_at, day)}%`,
          minHeight: 24,
          width: 32,
          background: '#0e1e35',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 800,
          cursor: 'pointer',
          zIndex: 4,
          padding: 0,
          lineHeight: 1.1,
          boxShadow: '0 2px 6px rgba(14,30,53,0.25)',
        }}
      >
        +{block.appts.length}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f7f4ee' }}>
      {/* Top bar — masquée en mode admin et en mode closer (le parent gère le header) */}
      {!adminMode && !closerId && (
        <div style={{
          padding: '0 24px',
          height: 64,
          background: '#ffffff',
          borderBottom: '1px solid #e5ddc8',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(204,172,113,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar size={18} style={{ color: '#C9A84C' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0e1e35' }}>Agenda RDV</div>
              <div style={{ fontSize: 12, color: '#4a6070' }}>Diploma Santé</div>
            </div>
          </div>

          {/* Week counters */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{
              background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.2)',
              borderRadius: 10, padding: '6px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#C9A84C', lineHeight: 1 }}>{rdvCount}</div>
              <div style={{ fontSize: 11, color: '#4a6070', marginTop: 2 }}>RDV cette semaine</div>
            </div>
            <div style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 10, padding: '6px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{rdvEffectues}</div>
              <div style={{ fontSize: 11, color: '#4a6070', marginTop: 2 }}>Avancés</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Lien admin — masqué en vue équipe (télépro / closer) */}
            {!teamView && (
              <a
                href="/admin"
                style={{
                  background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.25)',
                  borderRadius: 8, padding: '6px 12px',
                  color: '#C9A84C', fontSize: 12,
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <LayoutDashboard size={13} />
                Admin
              </a>
            )}

            {/* Sélecteur closer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} style={{ color: '#4a6070' }} />
              <select
                value={selectedCommercial}
                onChange={e => handleSelectCommercial(e.target.value)}
                style={{
                  background: '#f0e9da', border: '1px solid #e5ddc8',
                  borderRadius: 8, padding: '6px 10px', color: '#0e1e35',
                  fontSize: 13, cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="all">Toute l&apos;équipe</option>
                {closers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', background: '#f0e9da', borderRadius: 8, padding: 3, border: '1px solid #e5ddc8' }}>
              {(['day', 'week', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? '#C9A84C' : 'transparent',
                    border: 'none', borderRadius: 6, padding: '5px 14px',
                    color: view === v ? 'white' : '#4a6070',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Liste'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mode admin : barre unique compacte (stats + nav + filtres) */}
      {adminMode && (
        <div style={{
          padding: '6px 24px',
          background: '#ffffff',
          borderBottom: '1px solid #e5ddc8',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#C9A84C', fontWeight: 700 }}>{rdvCount} RDV</span>
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>{rdvEffectues} avancés</span>
          </div>

          <div style={{ width: 1, height: 20, background: '#e5ddc8', flexShrink: 0 }} />

          <button
            onClick={() => view === 'day'
              ? setSelectedDay(d => addDays(d, -1))
              : setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
            style={{
              background: '#f0e9da', border: '1px solid #e5ddc8',
              borderRadius: 8, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#4a6070', flexShrink: 0,
            }}
          >
            <ChevronLeft size={15} />
          </button>

          <div style={{ fontWeight: 700, fontSize: 13, color: '#0e1e35', textTransform: 'capitalize', flexShrink: 0 }}>
            {view === 'day' ? (
              format(selectedDay, 'EEEE d MMMM yyyy', { locale: fr })
            ) : (
              <>
                {format(activeWeekStart, 'd MMMM', { locale: fr })}
                {' '}—{' '}
                {format(addDays(activeWeekStart, 6), 'd MMMM yyyy', { locale: fr })}
              </>
            )}
          </div>

          <button
            onClick={() => view === 'day'
              ? setSelectedDay(d => addDays(d, 1))
              : setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
            style={{
              background: '#f0e9da', border: '1px solid #e5ddc8',
              borderRadius: 8, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#4a6070', flexShrink: 0,
            }}
          >
            <ChevronRight size={15} />
          </button>

          <button
            onClick={() => view === 'day'
              ? setSelectedDay(new Date())
              : setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            style={{
              background: 'transparent', border: '1px solid #e5ddc8',
              borderRadius: 8, padding: '4px 10px',
              color: '#4a6070', fontSize: 11, cursor: 'pointer', flexShrink: 0,
            }}
          >
            Aujourd&apos;hui
          </button>

          {loading && (
            <div style={{ fontSize: 11, color: '#4a6070', flexShrink: 0 }}>Chargement…</div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Users size={13} style={{ color: '#4a6070' }} />
            <select
              value={selectedCommercial}
              onChange={e => setSelectedCommercial(e.target.value)}
              style={{
                background: '#f0e9da', border: '1px solid #e5ddc8',
                borderRadius: 8, padding: '4px 8px', color: '#0e1e35',
                fontSize: 11, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">Tous les closers</option>
              {closers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <div style={{ display: 'flex', background: '#f0e9da', borderRadius: 8, padding: 2, border: '1px solid #e5ddc8' }}>
              {(['day', 'week', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? '#C9A84C' : 'transparent',
                    border: 'none', borderRadius: 6, padding: '3px 10px',
                    color: view === v ? 'white' : '#4a6070',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Liste'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Week nav — hors mode admin */}
      {!adminMode && (
      <div style={{
        padding: '10px 24px',
        background: '#ffffff',
        borderBottom: '1px solid #e5ddc8',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <button
          onClick={() => view === 'day'
            ? setSelectedDay(d => addDays(d, -1))
            : setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
          style={{
            background: '#f0e9da', border: '1px solid #e5ddc8',
            borderRadius: 8, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#4a6070',
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <div style={{ fontWeight: 700, fontSize: 14, color: '#0e1e35', minWidth: 200, textTransform: 'capitalize' }}>
          {view === 'day' ? (
            format(selectedDay, 'EEEE d MMMM yyyy', { locale: fr })
          ) : (
            <>
              {format(activeWeekStart, 'd MMMM', { locale: fr })}
              {' '}—{' '}
              {format(addDays(activeWeekStart, 6), 'd MMMM yyyy', { locale: fr })}
            </>
          )}
        </div>

        <button
          onClick={() => view === 'day'
            ? setSelectedDay(d => addDays(d, 1))
            : setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
          style={{
            background: '#f0e9da', border: '1px solid #e5ddc8',
            borderRadius: 8, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#4a6070',
          }}
        >
          <ChevronRight size={16} />
        </button>

        <button
          onClick={() => view === 'day'
            ? setSelectedDay(new Date())
            : setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          style={{
            background: 'transparent', border: '1px solid #e5ddc8',
            borderRadius: 8, padding: '5px 14px',
            color: '#4a6070', fontSize: 12, cursor: 'pointer',
          }}
        >
          Aujourd&apos;hui
        </button>

        {/* Contrôles closer */}
        {closerId && !adminMode && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Sélecteur équipe — permet au closer de voir tous les RDV pour
                repérer où il reste de la place avant de placer un RDV. */}
            {teamView && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} style={{ color: '#4a6070' }} />
                <select
                  value={selectedCommercial}
                  onChange={e => handleSelectCommercial(e.target.value)}
                  style={{
                    background: '#f0e9da', border: '1px solid #e5ddc8',
                    borderRadius: 8, padding: '6px 10px', color: '#0e1e35',
                    fontSize: 12, cursor: 'pointer', outline: 'none',
                  }}
                >
                  {closerId && <option value={closerId}>Mon agenda</option>}
                  <option value="all">Toute l&apos;équipe</option>
                </select>
              </div>
            )}

            <button
              onClick={() => setShowNewRdvModal(true)}
              style={{
                background: 'rgba(204,172,113,0.15)',
                border: '1px solid rgba(204,172,113,0.4)',
                borderRadius: 8, padding: '6px 14px',
                color: '#C9A84C', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(204,172,113,0.25)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(204,172,113,0.15)'
              }}
            >
              <Plus size={13} />
              Nouveau RDV
            </button>

            <div style={{ display: 'flex', background: '#f0e9da', borderRadius: 8, padding: 3, border: '1px solid #e5ddc8' }}>
              {(['day', 'week', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? '#C9A84C' : 'transparent',
                    border: 'none', borderRadius: 6, padding: '4px 12px',
                    color: view === v ? 'white' : '#4a6070',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Liste'}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ fontSize: 12, color: '#4a6070', marginLeft: 8 }}>Chargement…</div>
        )}
      </div>
      )}

      {weekIsDense && view === 'week' && (
        <div style={{
          padding: '8px 24px',
          background: '#fff8eb',
          borderBottom: '1px solid #f0d9a8',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
            Semaine chargée ({rdvCount} RDV) — la vue liste est plus lisible.
          </span>
          <button
            type="button"
            onClick={() => setView('list')}
            style={{
              background: '#C9A84C',
              border: 'none',
              borderRadius: 8,
              padding: '5px 12px',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Passer en vue Liste
          </button>
        </div>
      )}

      {/* Calendar grid */}
      {view === 'week' ? (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Day headers — fixes, ne scrollent pas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '56px repeat(7, 1fr)',
            borderBottom: '1px solid #e5ddc8',
            background: '#ffffff',
            flexShrink: 0,
            zIndex: 2,
          }}>
            <div style={{ borderRight: '1px solid #e5ddc8' }} />
            {weekDays.map(day => {
              const dayAppts = getAppointmentsForDay(day)
              const today = isToday(day)
              const busyDay = dayAppts.length > 5
              return (
                <div
                  key={day.toISOString()}
                  role={busyDay ? 'button' : undefined}
                  tabIndex={busyDay ? 0 : undefined}
                  onClick={busyDay ? () => setDayListModal({ day, appts: dayAppts }) : undefined}
                  onKeyDown={busyDay ? e => { if (e.key === 'Enter') setDayListModal({ day, appts: dayAppts }) } : undefined}
                  title={busyDay ? `Voir les ${dayAppts.length} RDV` : undefined}
                  style={{
                    padding: '6px 4px',
                    textAlign: 'center',
                    borderRight: '1px solid #e5ddc8',
                    background: today ? 'rgba(204,172,113,0.06)' : 'transparent',
                    cursor: busyDay ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#4a6070', textTransform: 'uppercase', fontWeight: 600 }}>
                    {format(day, 'EEE', { locale: fr })}
                  </div>
                  <div style={{
                    fontSize: 15, fontWeight: 700,
                    color: today ? '#C9A84C' : '#0e1e35',
                    lineHeight: 1.2, marginTop: 1,
                  }}>
                    {format(day, 'd')}
                  </div>
                  {dayAppts.length > 0 && (
                    <div style={{
                      marginTop: 2,
                      minWidth: 18, height: 18, padding: '0 4px',
                      background: busyDay ? '#C9A84C' : '#4cabdb',
                      borderRadius: 10,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: 'white', lineHeight: 1,
                    }}>
                      {dayAppts.length}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Time grid — remplit toute la hauteur dispo (scroll seulement si écran trop court) */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', position: 'relative', flex: '1 0 auto', minHeight: `${HOURS.length * HOUR_HEIGHT}px` }}>
            {/* Hour labels */}
            <div style={{ borderRight: '1px solid #e5ddc8', display: 'flex', flexDirection: 'column' }}>
              {HOURS.map(h => (
                <div
                  key={h}
                  style={{
                    flex: 1, minHeight: 0,
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                    paddingRight: 8, paddingTop: 4,
                    fontSize: 12, color: '#4a6070', fontWeight: 600,
                  }}
                >
                  {h}h
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map(day => {
              const dayAppts = getAppointmentsForDay(day)
              const today = isToday(day)
              const dayLayout = computeDayLayout(dayAppts)
              const hiddenIds = new Set(dayLayout.overflow.flatMap(b => b.appts.map(a => a.id)))

              return (
                <div
                  key={day.toISOString()}
                  {...columnDragProps(day)}
                  style={{
                    borderRight: '1px solid #e5ddc8',
                    position: 'relative',
                    background: dragOverDay === day.toISOString()
                      ? 'rgba(204,172,113,0.12)'
                      : (today ? 'rgba(204,172,113,0.02)' : 'transparent'),
                    minWidth: 0,
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {HOURS.map(h => (
                    <div key={h} style={{ flex: 1, minHeight: 0, borderBottom: '1px solid #e5ddc8' }} />
                  ))}

                  {dayAppts.filter(a => !hiddenIds.has(a.id)).map(appt =>
                    renderApptCard(appt, day, dayLayout, 'week'),
                  )}

                  {dayLayout.overflow.map(block => renderOverflowBadge(block, day))}

                  {/* Current time indicator */}
                  {today && (() => {
                    const now = new Date()
                    const nowPercent = timeToPercent(now.toISOString(), day)
                    if (nowPercent < 0 || nowPercent > 100) return null
                    return (
                      <div style={{
                        position: 'absolute', left: 0, right: 0,
                        top: `${nowPercent}%`,
                        height: 2, background: '#C9A84C',
                        zIndex: 2,
                      }}>
                        <div style={{
                          position: 'absolute', left: -4, top: -4,
                          width: 10, height: 10, borderRadius: '50%',
                          background: '#C9A84C',
                        }} />
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
          </div>{/* fin overflow: auto */}
        </div>
      ) : view === 'day' ? (
        /* Day view — grille horaire d'une seule colonne, plus grande */
        (() => {
          const dayAppts = getAppointmentsForDay(selectedDay)
          const dayLayout = computeDayLayout(dayAppts, 3)
          const hiddenIds = new Set(dayLayout.overflow.flatMap(b => b.appts.map(a => a.id)))
          const today = isToday(selectedDay)
          const activeCount = dayAppts.filter(a => a.status !== 'annule').length
          return (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* En-tête du jour */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 24px',
                borderBottom: '1px solid #e5ddc8',
                background: today ? 'rgba(204,172,113,0.06)' : '#ffffff',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: today ? '#C9A84C' : '#0e1e35', textTransform: 'capitalize' }}>
                  {format(selectedDay, 'EEEE d MMMM', { locale: fr })}
                </span>
                <span style={{
                  minWidth: 22, height: 22, padding: '0 7px',
                  background: '#C9A84C', borderRadius: 11,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: 'white',
                }}>
                  {activeCount}
                </span>
                <span style={{ fontSize: 12, color: '#4a6070' }}>RDV</span>
              </div>

              {/* Grille horaire — remplit toute la hauteur dispo */}
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', position: 'relative', flex: '1 0 auto', minHeight: `${HOURS.length * HOUR_HEIGHT_DAY}px` }}>
                  {/* Libellés des heures */}
                  <div style={{ borderRight: '1px solid #e5ddc8', display: 'flex', flexDirection: 'column' }}>
                    {HOURS.map(h => (
                      <div
                        key={h}
                        style={{
                          flex: 1, minHeight: 0,
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                          paddingRight: 10, paddingTop: 4,
                          fontSize: 13, color: '#4a6070', fontWeight: 600,
                        }}
                      >
                        {h}h
                      </div>
                    ))}
                  </div>

                  {/* Colonne du jour */}
                  <div
                    {...columnDragProps(selectedDay)}
                    style={{ position: 'relative', minWidth: 0, background: dragOverDay === selectedDay.toISOString() ? 'rgba(204,172,113,0.12)' : (today ? 'rgba(204,172,113,0.02)' : 'transparent'), display: 'flex', flexDirection: 'column' }}
                  >
                    {HOURS.map(h => (
                      <div key={h} style={{ flex: 1, minHeight: 0, borderBottom: '1px solid #e5ddc8' }} />
                    ))}

                    {dayAppts.length === 0 && (
                      <div style={{
                        position: 'absolute', top: 24, left: 0, right: 0,
                        textAlign: 'center', color: '#94a3b8', fontSize: 13,
                      }}>
                        Aucun RDV ce jour
                      </div>
                    )}

                    {dayAppts.filter(a => !hiddenIds.has(a.id)).map(appt =>
                      renderApptCard(appt, selectedDay, dayLayout, 'day'),
                    )}

                    {dayLayout.overflow.map(block => renderOverflowBadge(block, selectedDay))}

                    {/* Indicateur d'heure courante */}
                    {today && (() => {
                      const now = new Date()
                      const nowPercent = timeToPercent(now.toISOString(), selectedDay)
                      if (nowPercent < 0 || nowPercent > 100) return null
                      return (
                        <div style={{
                          position: 'absolute', left: 0, right: 0,
                          top: `${nowPercent}%`,
                          height: 2, background: '#C9A84C',
                          zIndex: 2,
                        }}>
                          <div style={{
                            position: 'absolute', left: -4, top: -4,
                            width: 10, height: 10, borderRadius: '50%',
                            background: '#C9A84C',
                          }} />
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )
        })()
      ) : (
        /* List view */
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {activeAppointments.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#4a6070', paddingTop: 60 }}>
              Aucun RDV assigné cette semaine
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...activeAppointments]
                .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                .map(appt => (
                <div
                  key={appt.id}
                  onClick={() => setSelectedAppointment(appt)}
                  style={{
                    background: '#e5ddc8', border: '1px solid #e5ddc8',
                    borderRadius: 12, padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 16,
                    cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#C9A84C')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5ddc8')}
                >
                  {appt.users && (
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: `${getColorForCommercial(appt.users.id)}20`,
                      border: `1px solid ${getColorForCommercial(appt.users.id)}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                      color: getColorForCommercial(appt.users.id),
                      flexShrink: 0,
                    }}>
                      {getInitials(appt.users.name)}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0e1e35' }}>
                      {appt.prospect_name}
                    </div>
                    <div style={{ fontSize: 12, color: '#4a6070', marginTop: 2 }}>
                      {format(new Date(appt.start_at), 'EEEE d MMMM · HH:mm', { locale: fr })} – {format(new Date(appt.end_at), 'HH:mm')}
                      {appt.users && <span> · {appt.users.name}</span>}
                      {appt.formation_type && <span style={{ color: '#C9A84C' }}> · {appt.formation_type}</span>}
                    </div>
                  </div>

                  <StatusBadge status={appt.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Liste du jour (créneaux chargés / badge +N) */}
      {dayListModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(14,30,53,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setDayListModal(null) }}
        >
          <div style={{
            background: '#fff',
            borderRadius: 14,
            width: '100%',
            maxWidth: 480,
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(14,30,53,0.2)',
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e5ddc8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#0e1e35' }}>
                {format(dayListModal.day, 'EEEE d MMMM', { locale: fr })}
                {' '}
                <span style={{ color: '#C9A84C' }}>({dayListModal.appts.length} RDV)</span>
              </span>
              <button
                type="button"
                onClick={() => setDayListModal(null)}
                style={{
                  background: 'none', border: 'none', fontSize: 20,
                  color: '#94a3b8', cursor: 'pointer', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...dayListModal.appts]
                .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                .map(appt => (
                  <div
                    key={appt.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setDayListModal(null)
                      setSelectedAppointment(appt)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setDayListModal(null)
                        setSelectedAppointment(appt)
                      }
                    }}
                    style={{
                      textAlign: 'left',
                      background: '#f7f4ee',
                      border: '1px solid #e5ddc8',
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#C9A84C' }}>
                      {format(new Date(appt.start_at), 'HH:mm')}
                      {' – '}
                      {format(new Date(appt.end_at), 'HH:mm')}
                      {appt.meeting_type === 'visio' ? ' · 📹' : ''}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0e1e35', marginTop: 2 }}>
                      {shortProspectName(appt.prospect_name)}
                    </div>
                    {(() => {
                      const niveau = getNiveau(appt.classe_actuelle, appt.prospect_name)
                      const meta = [niveau, appt.formation_type?.trim()].filter(Boolean).join(' · ')
                      return meta ? (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{meta}</div>
                      ) : null
                    })()}
                    {appt.meeting_type === 'visio' && appt.meeting_link && (() => {
                      const badge = getVisioBadge(appt.meeting_link)
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <a
                            href={appt.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: badge.color,
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                              textDecoration: 'none',
                            }}
                          >
                            🎥 {badge.fullLabel}
                          </a>
                          {badge.isGoogle && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: '#1a73e8',
                              background: 'rgba(26,115,232,0.1)',
                              border: '1px solid rgba(26,115,232,0.3)',
                              borderRadius: 4,
                              padding: '2px 6px',
                            }}>
                              Lien Google externe
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* AppointmentModal (consultation/édition) */}
      {selectedAppointment && (
        <AppointmentModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          adminMode={adminMode}
          canAssign={allowAssign}
          onUpdate={(updated) => {
            setAppointments(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
            setSelectedAppointment(prev => prev ? { ...prev, ...updated } : null)
          }}
        />
      )}

      {/* CloserNewRdvModal (création) */}
      {showNewRdvModal && closerId && (
        <CloserNewRdvModal
          closerId={closerId}
          closerName={closerName ?? 'moi'}
          onClose={() => setShowNewRdvModal(false)}
          onSuccess={() => {
            setShowNewRdvModal(false)
            fetchAppointments()
          }}
        />
      )}

      {/* Toast de déplacement (glisser-déposer) */}
      {moveToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            background: moveToast.kind === 'ok' ? '#0e1e35' : '#b91c1c',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(14,30,53,0.25)',
            maxWidth: '90vw',
          }}
        >
          {moveToast.msg}
        </div>
      )}
    </div>
  )
}
