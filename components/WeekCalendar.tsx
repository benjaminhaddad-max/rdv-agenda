'use client'

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Users, LayoutDashboard, Plus, Check, MapPin, Video, Phone, X, Pin, Ban, List, CalendarDays, CalendarRange } from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import StatusBadge, { AppointmentStatus } from './StatusBadge'
import AppointmentModal from './AppointmentModal'
import CloserNewRdvModal from './CloserNewRdvModal'
import { useIsMobile } from '@/lib/useIsMobile'
import { parseExtraParticipants } from '@/lib/appointment-participants'
import { campusShortLabel } from '@/lib/campus'
import { RDV_BRANDS, normalizeRdvBrand } from '@/lib/rdv-brand'
import MediboxBadge from './MediboxBadge'
import { CrmV2Button, CrmV2Segmented, CrmV2Tabs } from '@/components/crm-v2/primitives'
import { AgendaRoundButton, AgendaSelectPill } from '@/components/crm-v2/agenda/AgendaControls'
import { crmV2, crmV2AgendaCards } from '@/lib/crm-v2-theme'
import { EVENT_TYPE_COLORS } from '@/components/crm/EventsAgendaCalendar'
import {
  UnavailabilityCreateDialog, UnavailabilityDetailDialog, UnavailabilityLayer, useRangeSelect, useUnavailability,
  type UnavailabilityBlock,
} from '@/components/agenda/Unavailability'

/** Nos événements (JPO, salons, webinaires) + ceux des concurrents — rappel épinglé en haut des jours. */
type AgendaEvent = {
  id: string
  name: string
  brand: string | null
  /** Nom de la prépa concurrente ; null = un de nos événements */
  competitor: string | null
  event_type: string
  start_day: string
  end_day: string
  time_start: string | null
  time_end: string | null
  location: string | null
}

/** Violet pointillé = concurrents (même code couleur que l'agenda Événements). */
const COMPETITOR_PIN = { solid: '#7c3aed', soft: 'rgba(124, 58, 237, 0.10)', text: '#6d28d9' }

function eventHours(ev: AgendaEvent): string {
  if (!ev.time_start) return 'horaires ?'
  return ev.time_end ? `${ev.time_start}–${ev.time_end}` : `dès ${ev.time_start}`
}

const AGENDA_EVENT_SHORT: Record<string, string> = { jpo: 'JPO', salon: 'Salon', webinaire: 'Webinaire', autre: 'Événement' }

type Appointment = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  status: AppointmentStatus
  source?: string
  brand?: string | null
  formation_type?: string | null
  hubspot_deal_id: string | null
  hubspot_contact_id?: string | null
  classe_actuelle?: string | null
  notes: string | null
  meeting_type?: string | null
  meeting_link?: string | null
  extra_participants?: unknown
  report_summary?: string | null
  report_telepro_advice?: string | null
  users?: { id: string; name: string; avatar_color: string; slug: string }
  telepro_id?: string | null
  telepro?: { id: string; name: string; avatar_color?: string | null } | null
}

type Commercial = {
  id: string
  name: string
  slug: string
  avatar_color: string
  role: string
}

// Vue semaine 9 h → 21 h : 12 tranches d'1/12, tout visible sans défiler
const GRID_START_HOUR = 9
const GRID_END_HOUR = 21
const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => i + GRID_START_HOUR) // 9h … 20h
const HOUR_HEIGHT = 70        // hauteur min d'une tranche en vue semaine (défile sur les petits écrans)
const HOUR_HEIGHT_DAY = 64    // hauteur min d'une tranche en vue jour (ordinateur)
const HOUR_HEIGHT_MOBILE = 36 // hauteur min d'une tranche sur mobile

/** Couleurs de FOND post-RDV — le CONTOUR reste toujours la couleur du closer. */
/** Code couleur du CRM : issue d'un RDV passé (les RDV à venir prennent la couleur du closer). */
const POST_RDV_COLORS = {
  positif: '#166534',       // vert foncé
  pre_positif: '#22c55e',   // vert clair
  no_show: '#374151',       // gris foncé
  pending_update: '#dc2626', // rouge — fiche non mise à jour
} as const

const POST_RDV_LEGEND: { label: string; color: string }[] = [
  { label: 'Positif', color: POST_RDV_COLORS.positif },
  { label: 'Pré-positif', color: POST_RDV_COLORS.pre_positif },
  { label: 'No-show', color: POST_RDV_COLORS.no_show },
  { label: 'Fiche non màj', color: POST_RDV_COLORS.pending_update },
]

/** Carte façon maquette V2 : fond teinté, bordure douce, horaire dans la couleur de base. */
type CardPalette = { base: string; bg: string; border: string }
function cardPalette(base: string): CardPalette {
  return {
    base,
    bg: `color-mix(in srgb, ${base} 13%, #ffffff)`,
    border: `color-mix(in srgb, ${base} 38%, #ffffff)`,
  }
}
const CANCELLED_PALETTE: CardPalette = { base: '#9aa5b1', bg: '#f5f6f8', border: '#e3e6eb' }

const SNAP_MIN = 15          // aimantation du glisser-déposer (minutes)
const GRID_TOTAL_MIN = (GRID_END_HOUR - GRID_START_HOUR) * 60
/** Pastille du mode de RDV : bleu = visio, orange = téléphone, vert = présentiel */
const MEETING_PILL: Record<string, { Icon: typeof Video; bg: string; label: string }> = {
  visio: { Icon: Video, bg: '#2563eb', label: 'Visio' },
  telephone: { Icon: Phone, bg: '#ea580c', label: 'Téléphone' },
  presentiel: { Icon: MapPin, bg: '#059669', label: 'Présentiel' },
}
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

/** Issues saisies par le closer quand le prospect est venu (cf. lib/suivi-commercial). */
const VENU_STATUSES = new Set(['a_travailler', 'pre_positif', 'positif', 'negatif', 'va_reflechir', 'preinscription'])

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

type CalendarView = 'day' | '2days' | 'week' | 'list'
type CardScale = 'week' | 'day' | 'compact'

/** « lun. » → « Lun » */
function dayShort(day: Date): string {
  const s = format(day, 'EEE', { locale: fr }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function WeekCalendar({
  adminMode = false, closerId, closerColor, closerName, teamView = false, allowAssign = false,
  title, onNewRdv, toolbarExtra, mineId,
}: {
  adminMode?: boolean
  closerId?: string
  /** Espace télépro : active les sous-onglets « Équipe » / « Moi » (RDV placés ou closés par cette personne) */
  mineId?: string
  closerColor?: string
  closerName?: string
  teamView?: boolean
  allowAssign?: boolean
  /** Titre de page affiché dans l'en-tête V2 (ex. « Agenda » côté admin) */
  title?: string
  /** Action « Nouveau RDV » fournie par la page parente (sinon : modale closer si closerId) */
  onNewRdv?: () => void
  /** Boutons supplémentaires affichés dans la rangée des filtres (outils admin) */
  toolbarExtra?: ReactNode
}) {
  const isMobile = useIsMobile()
  const mobileViewInit = useRef(false)
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [allAppointments, setAppointments] = useState<Appointment[]>([])
  // Marque d'un RDV : logo M / L / E sur la carte (plus de filtre par marque).
  const appointments = allAppointments
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
  // Sous-onglet « Moi » de l'espace télépro (mémorisé dans le navigateur)
  const [mineOnly, setMineOnly] = useState<boolean>(() => {
    if (!mineId || typeof window === 'undefined') return false
    try { return localStorage.getItem('rdv_agenda_scope') === 'mine' } catch { return false }
  })
  const mineScope = mineId && mineOnly ? mineId : null
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [dayListModal, setDayListModal] = useState<{ day: Date; appts: Appointment[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<CalendarView>('week')
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [showNewRdvModal, setShowNewRdvModal] = useState(false)
  // Rafraîchit la couleur « fiche non màj » dès qu’un créneau vient de se terminer
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Sur mobile, on démarre en vue « 2 jours » (lisible sans défilement horizontal).
  useEffect(() => {
    if (isMobile && !mobileViewInit.current) {
      setView('2days')
      mobileViewInit.current = true
    }
  }, [isMobile])
  // La vue « 2 jours » n'existe que sur mobile : retour en semaine si l'écran s'élargit.
  useEffect(() => {
    if (!isMobile && view === '2days') setView('week')
  }, [isMobile, view])

  const padX = isMobile ? 12 : 28

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

  // En vue jour / 2 jours, la semaine chargée est celle du jour sélectionné (pour le fetch).
  const dayBased = view === 'day' || view === '2days'
  const activeWeekStart = dayBased
    ? startOfWeek(selectedDay, { weekStartsOn: 1 })
    : currentWeekStart
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(activeWeekStart, i))
  const weekKey = format(activeWeekStart, 'yyyy-MM-dd')
  // Vue 2 jours à cheval sur deux semaines (dimanche + lundi) : on charge aussi la semaine suivante.
  const nextDayWeekStart = startOfWeek(addDays(selectedDay, 1), { weekStartsOn: 1 })
  const extraWeekKey = view === '2days' && !isSameDay(nextDayWeekStart, activeWeekStart)
    ? format(nextDayWeekStart, 'yyyy-MM-dd')
    : null
  const visibleDays: Date[] = view === 'day'
    ? [selectedDay]
    : view === '2days'
      ? [selectedDay, addDays(selectedDay, 1)]
      : weekDays

  // Nos événements sur la période affichée (rappel épinglé, n'affecte pas la grille RDV)
  const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([])
  const eventsFrom = format(visibleDays[0], 'yyyy-MM-dd')
  const eventsTo = format(visibleDays[visibleDays.length - 1], 'yyyy-MM-dd')
  useEffect(() => {
    let cancelled = false
    fetch(`/api/events-studio/agenda?from=${eventsFrom}&to=${eventsTo}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j) setAgendaEvents(Array.isArray(j.events) ? j.events : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [eventsFrom, eventsTo])
  // Indisponibilités closers (plages grisées + sélection à la souris)
  const unavFrom = useMemo(() => { const d = new Date(visibleDays[0]); d.setHours(0, 0, 0, 0); return d }, [eventsFrom]) // eslint-disable-line react-hooks/exhaustive-deps
  const unavTo = useMemo(() => { const d = addDays(visibleDays[visibleDays.length - 1], 1); d.setHours(0, 0, 0, 0); return d }, [eventsTo]) // eslint-disable-line react-hooks/exhaustive-deps
  const unav = useUnavailability(unavFrom, unavTo)
  const [unavCreate, setUnavCreate] = useState<{ start: Date; end: Date } | null>(null)
  const [unavDetail, setUnavDetail] = useState<UnavailabilityBlock[] | null>(null)
  const canBlock = unav.canManageSelf && (adminMode || !!closerId)
  const rangeSelect = useRangeSelect({
    enabled: canBlock && !isMobile,
    startHour: GRID_START_HOUR,
    endHour: GRID_END_HOUR,
    onSelect: (start, end) => setUnavCreate({ start, end }),
  })
  function openBlankUnavailability() {
    const start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(Math.min(Math.max(start.getHours() + 1, GRID_START_HOUR), GRID_END_HOUR - 1))
    if (dayBased && !isSameDay(selectedDay, new Date())) start.setFullYear(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())
    setUnavCreate({ start, end: new Date(start.getTime() + 3600_000) })
  }

  // Bandeau replié : 3 événements max par jour, « +N » pour tout déplier
  const [pinsExpanded, setPinsExpanded] = useState(false)
  const eventsForDay = (day: Date) => {
    const k = format(day, 'yyyy-MM-dd')
    return agendaEvents
      .filter(e => e.start_day <= k && e.end_day >= k)
      // Les nôtres d'abord, puis les concurrents ; chacun par heure de début
      .sort((a, b) => (a.competitor ? 1 : 0) - (b.competitor ? 1 : 0) || (a.time_start || '').localeCompare(b.time_start || ''))
  }

  // Closers uniquement (pas managers, pas télépros) + admin (Pascal)
  const closers = commerciaux.filter(
    c => c.role === 'closer' || c.role === 'admin'
  )

  // Compteurs semaine (hors annulés et non-assignés)
  const activeAppointments = appointments.filter(a => a.status !== 'annule' && a.status !== 'non_assigne')
  // Présence au prorata : RDV de la semaine déjà passés (lundi → maintenant).
  // Venu = le closer a saisi une issue (ni no-show ni annulé).
  const presence = useMemo(() => {
    const now = Date.now()
    const weekStartMs = activeWeekStart.getTime()
    const weekEndMs = addDays(activeWeekStart, 7).getTime()
    let venus = 0, noShow = 0, pending = 0
    for (const a of activeAppointments) {
      const t = new Date(a.start_at).getTime()
      if (t < weekStartMs || t >= weekEndMs || t > now) continue
      if (a.status === 'no_show') noShow++
      else if (VENU_STATUSES.has(a.status)) venus++
      else pending++
    }
    const lastDay = now >= weekEndMs ? null : now < weekStartMs ? undefined : new Date(now)
    return { venus, noShow, pending, rate: venus + noShow > 0 ? Math.round((venus / (venus + noShow)) * 100) : null, lastDay }
  }, [activeAppointments, activeWeekStart])

  // RDV placés (créés) cette semaine, mêmes filtres que l'agenda
  const [placedCount, setPlacedCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      from: activeWeekStart.toISOString(),
      to: addDays(activeWeekStart, 7).toISOString(),
    })
    if (mineScope) params.set('mine', mineScope)
    else if (selectedCommercial !== 'all') params.set('commercial_id', selectedCommercial)
    fetch(`/api/appointments/week-stats?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setPlacedCount(typeof j?.placed === 'number' ? j.placed : null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [weekKey, selectedCommercial, mineScope]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const keys = extraWeekKey ? [weekKey, extraWeekKey] : [weekKey]
      const results = await Promise.all(keys.map(async k => {
        const params = new URLSearchParams({ week: k })
        if (mineScope) params.set('mine', mineScope)
        else if (selectedCommercial !== 'all') params.set('commercial_id', selectedCommercial)
        const res = await fetch(`/api/appointments?${params}`, { cache: 'no-store' })
        return res.ok ? (await res.json() as Appointment[]) : null
      }))
      if (results.every(r => r === null)) return
      const merged = new Map<string, Appointment>()
      for (const list of results) for (const a of list || []) merged.set(a.id, a)
      setAppointments([...merged.values()])
    } finally {
      setLoading(false)
    }
  }, [weekKey, extraWeekKey, selectedCommercial, mineScope])

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

  function selectMineOnly(on: boolean) {
    setMineOnly(on)
    try { localStorage.setItem('rdv_agenda_scope', on ? 'mine' : 'team') } catch { /* ignore */ }
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

  /** Fond du bloc = statut post-RDV (null = pas encore qualifié → fond blanc). */
  /** Couleur de l'issue d'un RDV passé, ou null s'il est à venir. */
  function getOutcomeColor(appt: Appointment): string | null {
    const s = appt.status
    if (s === 'positif' || s === 'preinscription') return POST_RDV_COLORS.positif
    if (s === 'pre_positif') return POST_RDV_COLORS.pre_positif
    if (s === 'no_show') return POST_RDV_COLORS.no_show
    const ended = new Date(appt.end_at).getTime() < Date.now()
    if (ended && (s === 'confirme' || s === 'confirme_prospect')) return POST_RDV_COLORS.pending_update
    return null
  }

  /** Carte : couleur de l'issue si le RDV est passé, sinon couleur du closer. */
  function getCardPalette(appt: Appointment): CardPalette {
    if (appt.status === 'annule') return CANCELLED_PALETTE
    return cardPalette(getOutcomeColor(appt) || getColorForCommercial(appt.users?.id || ''))
  }

  /** Fond teinté d'un RDV passé (null = RDV à venir, fond blanc en vue liste). */
  function getStatusFill(appt: Appointment): string | null {
    if (appt.status === 'annule') return CANCELLED_PALETTE.bg
    const c = getOutcomeColor(appt)
    return c ? cardPalette(c).bg : null
  }

  function statusFillTextColor(fill: string | null): string {
    return fill === CANCELLED_PALETTE.bg ? '#7c98b6' : '#2d3e50'
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

    // Mise à jour optimiste (dates + retrait confirmation prospect si besoin)
    setAppointments(prev => prev.map(a => {
      if (a.id !== id) return a
      const patch: Partial<Appointment> = { start_at: newStartISO, end_at: newEndISO }
      if (a.status === 'confirme_prospect') patch.status = 'confirme'
      return { ...a, ...patch }
    }))

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
          const data = await res.json().catch(() => null)
          if (data?.id) {
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...data } : a))
          }
          setMoveToast({
            kind: 'ok',
            msg: `RDV déplacé au ${format(newStart, 'EEEE d MMMM à HH:mm', { locale: fr })} — rappels SMS/email relancés`,
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

  // ── Navigation ────────────────────────────────────────────────────────
  function goPrev() {
    if (view === 'day') setSelectedDay(d => addDays(d, -1))
    else if (view === '2days') setSelectedDay(d => addDays(d, -2))
    else setCurrentWeekStart(subWeeks(currentWeekStart, 1))
  }
  function goNext() {
    if (view === 'day') setSelectedDay(d => addDays(d, 1))
    else if (view === '2days') setSelectedDay(d => addDays(d, 2))
    else setCurrentWeekStart(addWeeks(currentWeekStart, 1))
  }
  function goToday() {
    if (dayBased) setSelectedDay(new Date())
    else setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }

  /** Libellé de la période affichée (sous-titre de l'en-tête). */
  function rangeLabel(): string {
    if (view === 'day') {
      return capitalize(format(selectedDay, isMobile ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy', { locale: fr }))
    }
    if (view === '2days') {
      const d2 = addDays(selectedDay, 1)
      const sameMonth = selectedDay.getMonth() === d2.getMonth()
      return `${format(selectedDay, sameMonth ? 'd' : 'd MMMM', { locale: fr })} – ${format(d2, 'd MMMM', { locale: fr })}`
    }
    const end = addDays(activeWeekStart, 6)
    const sameMonth = activeWeekStart.getMonth() === end.getMonth()
    const sameYear = activeWeekStart.getFullYear() === end.getFullYear()
    const startFmt = sameMonth ? 'd' : sameYear ? 'd MMMM' : 'd MMMM yyyy'
    if (isMobile) {
      return `${format(activeWeekStart, startFmt, { locale: fr })} – ${format(end, 'd MMMM', { locale: fr })}`
    }
    return `Semaine du ${format(activeWeekStart, startFmt, { locale: fr })} au ${format(end, 'd MMMM yyyy', { locale: fr })}`
  }

  /** Carte RDV positionnée. `day` = grande carte (vue jour), `compact` = semaine mobile. */
  function renderApptCard(
    appt: Appointment,
    day: Date,
    dayLayout: DayLayout<Appointment>,
    scale: CardScale,
  ) {
    const isDay = scale === 'day'
    const compact = scale === 'compact'
    // Mobile (jour / 2 jours) : carte sur une ligne, nom puis heure
    const inline = isMobile && !compact
    const height = durationToPercent(appt.start_at, appt.end_at, day)
    // RDV hors plage (avant 9 h / après 21 h) : collé au bord plutôt que hors grille
    const top = Math.min(timeToPercent(appt.start_at, day), 100 - Math.min(height, 100))
    const palette = getCardPalette(appt)
    const isCancelled = appt.status === 'annule'
    const isConfirmed = appt.status === 'confirme_prospect'
    const textOnFill = isCancelled ? '#7c98b6' : '#2d3e50'
    const subtleOnFill = '#64748b'
    const timeColor = palette.base
    const formation = (appt.formation_type || '').trim()
    const displayName = shortProspectName(appt.prospect_name)
    const niveau = getNiveau(appt.classe_actuelle, appt.prospect_name)
    const startLabel = format(new Date(appt.start_at), 'HH:mm')
    const rangeTime = `${startLabel} – ${format(new Date(appt.end_at), 'HH:mm')}`
    const meetingLabel = appt.meeting_type === 'visio'
      ? 'Visio'
      : appt.meeting_type === 'presentiel'
        ? `Présentiel${campusShortLabel(appt.meeting_link) ? ` — ${campusShortLabel(appt.meeting_link)}` : ''}`
        : appt.meeting_type === 'telephone' ? 'Téléphone' : ''
    // Infobulle : nom, heure, niveau, closer
    const tooltip = [
      `${normalizeRdvBrand(appt.brand) !== 'diploma' ? `[${RDV_BRANDS[normalizeRdvBrand(appt.brand)].label}] ` : ''}${appt.prospect_name}${niveau ? ` — ${niveau}` : ''}${formation ? ` · ${formation}` : ''}`,
      [rangeTime, meetingLabel].filter(Boolean).join(' · '),
      appt.users?.name ? `Closer : ${appt.users.name}` : 'Closer : non assigné',
      isConfirmed ? 'Présence confirmée par le prospect' : '',
    ].filter(Boolean).join('\n')

    const lay = dayLayout.slots.get(appt.id) || { col: 0, cols: 1 }
    const gap = compact ? 1 : 4
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
    const rightReserve = hasOverflowBadge ? (compact ? 16 : 38) : 0

    const nameSize = isDay ? (isMobile ? 13 : 14) : compact ? 10 : 12
    const metaSize = isDay ? 12 : 11
    const badgeSize = isDay ? 11 : 10

    const isDragging = draggingId === appt.id
    const meetingMode = appt.meeting_type ? MEETING_PILL[appt.meeting_type] : null
    const pillSize = isDay ? 20 : compact ? 13 : 17
    const meetingIcon = meetingMode && (
      <span
        title={meetingLabel}
        style={{
          width: pillSize, height: pillSize, borderRadius: compact ? 3 : 5, flexShrink: 0,
          background: isCancelled ? '#94a3b8' : meetingMode.bg, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <meetingMode.Icon size={isDay ? 13 : compact ? 9 : 11} strokeWidth={2.6} />
      </span>
    )

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
          // De l'air autour des cartes, comme sur la maquette
          left: `calc(${leftPct}% + ${lay.col === 0 ? (compact ? 1 : 5) : gap / 2}px)`,
          width: `calc(${widthPct}% - ${lay.cols === 1 ? (compact ? 2 : 10) : (compact ? 2 : 7)}px - ${rightReserve / lay.cols}px)`,
          // Hauteur = durée exacte du RDV (pas de hauteur mini : sinon les cartes se chevauchent)
          top: `calc(${top}% + 1px)`,
          height: `calc(${height}% - 2px)`,
          // Style maquette : fond pastel selon l'issue, point = couleur du closer
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          // Carré à peine arrondi (5 px : hors des règles d'arrondi de la skin V2)
          borderRadius: compact ? 4 : 5,
          padding: isDay && !isMobile ? '5px 10px' : compact ? '1px 3px' : inline ? '0 8px' : (sideBySide ? '2px 6px' : '2px 8px'),
          display: 'flex',
          flexDirection: inline ? 'row' : 'column',
          alignItems: inline ? 'center' : 'stretch',
          gap: inline ? 6 : 0,
          cursor: isCancelled ? 'pointer' : 'grab',
          overflow: 'hidden',
          zIndex: isDragging ? 9 : 1,
          opacity: isDragging ? 0.45 : 1,
          boxSizing: 'border-box',
          textDecoration: isCancelled ? 'line-through' : undefined,
          transition: 'box-shadow 0.12s, z-index 0s, opacity 0.12s',
        }}
        onMouseEnter={e => {
          if (draggingId) return
          const el = e.currentTarget as HTMLDivElement
          el.style.zIndex = '8'
          el.style.boxShadow = '0 4px 14px rgba(15,31,61,0.12)'
        }}
        onMouseLeave={e => {
          if (draggingId) return
          const el = e.currentTarget as HTMLDivElement
          el.style.zIndex = '1'
          el.style.boxShadow = 'none'
        }}
      >
        {/* Ligne 1 : nom */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: compact ? 2 : 4, minWidth: 0,
          flex: inline ? 1 : undefined, flexShrink: 0,
          lineHeight: compact ? '12px' : isDay && !isMobile ? '18px' : '14px',
        }}>
          <MediboxBadge brand={appt.brand} compact={!isDay} style={isDay ? undefined : { fontSize: compact ? 8 : 10 }} />
          {/* Mode du RDV (visio / tél / présentiel) avant le nom */}
          {meetingIcon}
          <span style={{
            fontSize: nameSize, fontWeight: 700, color: textOnFill, minWidth: 0,
            overflow: 'hidden', textOverflow: compact ? 'clip' : 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {compact ? displayName.split(/\s+/)[0] : displayName}
          </span>
          {isConfirmed && !compact && (
            <span
              title="Présence confirmée par le prospect"
              style={{
                marginLeft: 'auto', flexShrink: 0,
                width: isDay ? 16 : 12, height: isDay ? 16 : 12, borderRadius: '50%',
                background: '#10b981', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Check size={isDay ? 11 : 8} strokeWidth={3} />
            </span>
          )}
        </div>

        {/* Ligne 2 : heure (+ mode et niveau) */}
        {!compact && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 0,
            fontSize: metaSize, fontWeight: 600, color: timeColor, whiteSpace: 'nowrap', overflow: 'hidden',
            lineHeight: isDay && !isMobile ? '16px' : '12px',
          }}>
            <span style={{ flexShrink: 0 }}>{rangeTime}</span>
            {!inline && isDay && niveau && (
              <span style={{ color: subtleOnFill, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                · {niveau}{isDay && formation ? ` · ${formation}` : ''}
              </span>
            )}
            {inline && isConfirmed && <Check size={11} strokeWidth={3} color="#10b981" style={{ flexShrink: 0 }} />}
          </div>
        )}

        {!isMobile && isDay && appt.meeting_type === 'visio' && appt.meeting_link && (() => {
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
                alignSelf: 'flex-start',
                gap: 3,
                marginTop: isDay ? 4 : 2,
                padding: isDay ? '1px 8px' : '0 6px',
                borderRadius: 999,
                background: badge.color,
                color: '#fff',
                fontSize: badgeSize,
                fontWeight: 700,
                textDecoration: 'none',
                lineHeight: 1.5,
                maxWidth: '100%',
                flexShrink: 0,
              }}
            >
              <Video size={badgeSize + 1} strokeWidth={2.2} />
              {badge.shortLabel}
            </a>
          )
        })()}
        {!isMobile && isDay && appt.meeting_type === 'presentiel' && campusShortLabel(appt.meeting_link) && (
          <div
            title={appt.meeting_link || undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: 3,
              marginTop: isDay ? 4 : 2,
              padding: isDay ? '1px 8px' : '0 6px',
              borderRadius: 999,
              background: 'rgba(201,168,76,0.15)',
              color: crmV2.goldDark,
              fontSize: badgeSize,
              fontWeight: 700,
              lineHeight: 1.5,
              maxWidth: '100%',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <MapPin size={badgeSize + 1} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{campusShortLabel(appt.meeting_link)}</span>
          </div>
        )}
      </div>
    )
  }

  /** Badge « +N » pour les RDV masqués d'un créneau chargé. */
  function renderOverflowBadge(block: DayLayout<Appointment>['overflow'][number], day: Date, compact: boolean) {
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
          right: compact ? 1 : 4,
          top: `${timeToPercent(block.start_at, day)}%`,
          height: `${durationToPercent(block.start_at, block.end_at, day)}%`,
          minHeight: 24,
          width: compact ? 14 : 32,
          background: crmV2.primary,
          color: '#fff',
          border: 'none',
          borderRadius: compact ? 5 : 8,
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          fontFamily: 'inherit',
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

  function eventPinTitle(ev: AgendaEvent) {
    const short = AGENDA_EVENT_SHORT[ev.event_type] || 'Événement'
    return `${ev.competitor ? `${ev.competitor} (concurrent) · ` : ''}${short} · ${ev.name} · ${eventHours(ev)}${ev.location ? ` · ${ev.location}` : ''}`
  }

  /**
   * Nos événements : 2 lignes (type + horaires début–fin, puis nom).
   * Concurrents : 1 ligne en violet pointillé (prépa · type · horaires), détail au survol.
   */
  function renderEventPin(ev: AgendaEvent, compact: boolean) {
    const c = ev.competitor ? COMPETITOR_PIN : (EVENT_TYPE_COLORS[ev.event_type] || EVENT_TYPE_COLORS.autre)
    const short = AGENDA_EVENT_SHORT[ev.event_type] || 'Événement'
    const style = {
      display: 'flex', flexDirection: 'column' as const, gap: 0, minWidth: 0, boxSizing: 'border-box' as const,
      fontSize: compact ? 9 : 11, fontWeight: 700, lineHeight: 1.3, padding: compact ? '1px 3px' : '2px 6px',
      borderRadius: 6, background: c.soft, color: crmV2.text, textDecoration: 'none',
      border: ev.competitor ? `1px dashed ${c.solid}99` : `1px solid ${c.solid}4d`,
    }
    const line = { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, whiteSpace: 'nowrap' as const, overflow: 'hidden' }
    const dot = <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.solid, flexShrink: 0 }} />
    const inner = compact ? (
      <div style={line}>
        {dot}
        <span style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {ev.competitor ? ev.competitor.split(' ')[0] : short} {ev.time_start || ''}
        </span>
      </div>
    ) : ev.competitor ? (
      <div style={line}>
        {dot}
        <span style={{ color: c.text, flexShrink: 0 }}>{ev.competitor.replace(/^Prépa /, '').split(' ')[0]}</span>
        <span style={{ flexShrink: 0 }}>{short}</span>
        <span style={{ color: c.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{eventHours(ev)}</span>
      </div>
    ) : (
      <>
        <div style={line}>
          {dot}
          <span style={{ color: c.text, flexShrink: 0 }}>{short}</span>
          <span style={{ color: c.text, marginLeft: 'auto', flexShrink: 0 }}>{eventHours(ev)}</span>
        </div>
        <div style={{ ...line, fontWeight: 600, paddingLeft: 10 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</span>
        </div>
      </>
    )
    return adminMode && !ev.competitor ? (
      <a key={ev.id} href={`/admin/crm/events/${ev.id}`} title={eventPinTitle(ev)} style={style}>{inner}</a>
    ) : (
      <div key={ev.id} title={eventPinTitle(ev)} style={style}>{inner}</div>
    )
  }

  /** Grille horaire 9 h–21 h pour 1, 2 ou 7 jours : prend toute la hauteur disponible. */
  function renderTimeGrid(days: Date[]) {
    const single = days.length === 1
    const compact = isMobile && days.length > 2
    const scale: CardScale = single ? 'day' : compact ? 'compact' : 'week'
    const timeCol = isMobile ? 34 : 52
    const gridCols = `${timeCol}px repeat(${days.length}, minmax(0, 1fr))`
    const hourHeight = isMobile ? HOUR_HEIGHT_MOBILE : single ? HOUR_HEIGHT_DAY : HOUR_HEIGHT
    const lineColor = '#e4e9f0'

    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* En-têtes de jours */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols, flexShrink: 0,
          borderBottom: `1px solid ${crmV2.border}`, background: crmV2.thBg,
        }}>
          <div />
          {days.map(day => {
            const dayAppts = getAppointmentsForDay(day)
            const today = isToday(day)
            const busyDay = dayAppts.length > 5
            const activeCount = single ? dayAppts.filter(a => a.status !== 'annule').length : dayAppts.length
            const numPill = (
              <span style={{
                fontSize: 15, fontWeight: 700, borderRadius: 999, minWidth: 26, height: 26, padding: '0 4px',
                boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: today ? '#fff' : crmV2.text, background: today ? crmV2.gold : 'transparent',
              }}>
                {format(day, 'd')}
              </span>
            )
            const countPill = activeCount > 0 && !compact ? (
              <span style={{
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, boxSizing: 'border-box',
                background: busyDay ? crmV2.gold : crmV2.info, color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, lineHeight: 1,
              }}>
                {activeCount}
              </span>
            ) : null
            return (
              <div
                key={day.toISOString()}
                role={busyDay ? 'button' : undefined}
                tabIndex={busyDay ? 0 : undefined}
                onClick={busyDay ? () => setDayListModal({ day, appts: dayAppts }) : undefined}
                onKeyDown={busyDay ? e => { if (e.key === 'Enter') setDayListModal({ day, appts: dayAppts }) } : undefined}
                title={busyDay ? `Voir les ${dayAppts.length} RDV` : undefined}
                style={isMobile ? {
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0',
                  borderLeft: `1px solid ${crmV2.border}`, cursor: busyDay ? 'pointer' : 'default', minWidth: 0,
                } : {
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', minWidth: 0,
                  borderLeft: `1px solid ${crmV2.border}`, cursor: busyDay ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  fontSize: isMobile ? 10 : 11, fontWeight: 700, letterSpacing: isMobile ? 0 : '0.04em',
                  textTransform: 'uppercase', color: isMobile ? crmV2.textFaint : crmV2.textMuted, whiteSpace: 'nowrap',
                }}>
                  {single && !isMobile
                    ? format(day, 'EEEE', { locale: fr })
                    : compact ? dayShort(day).charAt(0) : dayShort(day)}
                </span>
                {numPill}
                {!isMobile && single && (
                  <span style={{ fontSize: 13, color: crmV2.textMuted, textTransform: 'capitalize' }}>
                    {format(day, 'MMMM', { locale: fr })}
                  </span>
                )}
                {countPill && <span style={{ marginLeft: isMobile ? 0 : 'auto', display: 'inline-flex' }}>{countPill}</span>}
              </div>
            )
          })}
        </div>

        {/* Rappel épinglé : nos événements du jour (JPO, salons, webinaires), hors grille horaire */}
        {days.some(d => eventsForDay(d).length > 0) && (
          <div style={{
            display: 'grid', gridTemplateColumns: gridCols, flexShrink: 0,
            borderBottom: `1px solid ${crmV2.border}`, background: crmV2.bg,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: crmV2.textFaint }} title="Événements du jour (les nôtres + concurrents en violet)">
              <Pin size={12} />
            </div>
            {days.map(day => {
              const evs = eventsForDay(day)
              const shown = pinsExpanded ? evs : evs.slice(0, compact ? 1 : 3)
              return (
                <div key={day.toISOString()} style={{
                  borderLeft: `1px solid ${crmV2.border}`, padding: compact ? 2 : '3px 4px',
                  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
                }}>
                  {shown.map(ev => renderEventPin(ev, compact))}
                  {evs.length > shown.length && (
                    <button
                      type="button"
                      onClick={() => setPinsExpanded(true)}
                      title={evs.slice(shown.length).map(eventPinTitle).join('\n')}
                      style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: '0 4px', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: crmV2.textMuted, fontFamily: 'inherit' }}
                    >
                      +{evs.length - shown.length} autre{evs.length - shown.length > 1 ? 's' : ''}
                    </button>
                  )}
                  {pinsExpanded && evs.length > (compact ? 1 : 3) && (
                    <button
                      type="button"
                      onClick={() => setPinsExpanded(false)}
                      style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: '0 4px', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: crmV2.textMuted, fontFamily: 'inherit' }}
                    >
                      Réduire
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Grille — remplit toute la hauteur dispo (défile seulement si l'écran est trop court) */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: gridCols, position: 'relative',
            flex: '1 0 auto', minHeight: `${HOURS.length * hourHeight}px`,
          }}>
            {/* Libellés des heures */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {HOURS.map(h => (
                <div
                  key={h}
                  style={{
                    flex: 1, minHeight: 0, textAlign: 'right', paddingRight: isMobile ? 6 : 8,
                    fontSize: isMobile ? 10 : 11, fontWeight: 600, color: crmV2.textMuted,
                    transform: 'translateY(-7px)', boxSizing: 'border-box',
                  }}
                >
                  {h}h
                </div>
              ))}
            </div>

            {/* Colonnes de jours */}
            {days.map(day => {
              const dayAppts = getAppointmentsForDay(day)
              const today = isToday(day)
              const dayLayout = computeDayLayout(dayAppts, single ? 3 : MAX_SIDE_COLS)
              const hiddenIds = new Set(dayLayout.overflow.flatMap(b => b.appts.map(a => a.id)))
              const dragOver = dragOverDay === day.toISOString()

              return (
                <div
                  key={day.toISOString()}
                  {...columnDragProps(day)}
                  onMouseDown={rangeSelect.columnProps(day).onMouseDown}
                  style={{
                    ...rangeSelect.columnProps(day).style,
                    position: 'relative', minWidth: 0, boxSizing: 'border-box',
                    borderLeft: `1px solid ${crmV2.border}`,
                    borderTop: `1px solid ${lineColor}`,
                    backgroundColor: dragOver
                      ? 'rgba(204,172,113,0.12)'
                      : (today ? crmV2AgendaCards.todayColumn : 'transparent'),
                    backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 1px), ${lineColor} calc(100% - 1px))`,
                    backgroundSize: `100% calc(100% / ${HOURS.length})`,
                  }}
                >
                  {single && dayAppts.length === 0 && (
                    <div style={{
                      position: 'absolute', top: 24, left: 0, right: 0,
                      textAlign: 'center', color: crmV2.textFaint, fontSize: 13,
                    }}>
                      Aucun RDV ce jour
                    </div>
                  )}

                  <UnavailabilityLayer
                    state={unav}
                    selected={closerId && !teamView ? closerId : selectedCommercial}
                    day={day}
                    startHour={GRID_START_HOUR}
                    endHour={GRID_END_HOUR}
                    compact={compact}
                    onOpen={setUnavDetail}
                  />
                  {rangeSelect.preview(day)}

                  {dayAppts.filter(a => !hiddenIds.has(a.id)).map(appt =>
                    renderApptCard(appt, day, dayLayout, scale),
                  )}

                  {dayLayout.overflow.map(block => renderOverflowBadge(block, day, compact))}

                  {/* Trait « maintenant » */}
                  {today && (() => {
                    const now = new Date()
                    const nowPercent = timeToPercent(now.toISOString(), day)
                    if (nowPercent <= 0 || nowPercent >= 100) return null
                    return (
                      <div style={{
                        position: 'absolute', left: 0, right: 0,
                        top: `${nowPercent}%`,
                        height: 2, background: crmV2AgendaCards.nowLine,
                        zIndex: 5, pointerEvents: 'none',
                      }}>
                        <span style={{
                          position: 'absolute', left: -5, top: -4,
                          width: 10, height: 10, borderRadius: '50%',
                          background: crmV2AgendaCards.nowLine,
                        }} />
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }


  // Sous-onglets « Équipe » / « Moi » : espace télépro (mineId) et closer en vue équipe
  const scopeTabs = mineId ? (
    <CrmV2Segmented
      size="sm"
      items={[{ id: 'team', label: 'Équipe' }, { id: 'mine', label: 'Moi' }]}
      value={mineOnly ? 'mine' : 'team'}
      onChange={id => selectMineOnly(id === 'mine')}
    />
  ) : closerId && teamView && !adminMode ? (
    <CrmV2Segmented
      size="sm"
      items={[{ id: 'team', label: 'Équipe' }, { id: 'mine', label: 'Moi' }]}
      value={selectedCommercial === closerId ? 'mine' : 'team'}
      onChange={id => handleSelectCommercial(id === 'mine' ? closerId : 'all')}
    />
  ) : null

  // Filtre closers (admin, agenda équipe du télépro) ; masqué sur « Moi » et côté closer
  const closerFilter = scopeTabs && (mineScope || closerId) ? null : adminMode || (!closerId) ? (
    <AgendaSelectPill
      icon={<Users size={13} />}
      value={selectedCommercial}
      onChange={e => handleSelectCommercial(e.target.value)}
      aria-label="Filtrer par closer"
    >
      <option value="all">{adminMode ? 'Tous les closers' : 'Toute l’équipe'}</option>
      {closers.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </AgendaSelectPill>
  ) : null

  const viewItems: { id: CalendarView; label: string }[] = isMobile
    ? [{ id: 'day', label: 'Jour' }, { id: '2days', label: '2 jours' }, { id: 'week', label: 'Semaine' }, { id: 'list', label: 'Liste' }]
    : [{ id: 'day', label: 'Jour' }, { id: 'week', label: 'Semaine' }, { id: 'list', label: 'Liste' }]

  // « Nouveau RDV » : modale closer, ou action fournie par la page parente
  const newRdvAction = closerId ? () => setShowNewRdvModal(true) : onNewRdv
  const pageTitle = title ?? (!adminMode && !closerId ? 'Agenda RDV' : undefined)
  const showAdminLink = !adminMode && !closerId && !teamView
  const showLegend = teamView || adminMode

  // Légende : la couleur de fond d'un RDV passé = son issue ; le logo = sa marque.
  const legend = showLegend ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
      {POST_RDV_LEGEND.map(item => (
        <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: crmV2.text }}>
          <span style={{
            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
            background: cardPalette(item.color).bg, border: `2px solid ${item.color}`, boxSizing: 'border-box',
          }} />
          {item.label}
        </span>
      ))}
      <span style={{ width: 1, height: 16, background: crmV2.border }} />
      {(['medibox', 'linova', 'edumove'] as const).map(b => (
        <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: crmV2.text }}>
          <MediboxBadge brand={b} compact style={{ fontSize: 10 }} />
          {RDV_BRANDS[b].label}
        </span>
      ))}
    </span>
  ) : null

  const presenceTitle = presence.lastDay === undefined
    ? 'Semaine à venir : pas encore de RDV passés'
    : `RDV passés ${presence.lastDay ? `du lundi à aujourd'hui` : 'sur toute la semaine'} : ${presence.venus} venus, ${presence.noShow} no-show${presence.pending ? `, ${presence.pending} fiche${presence.pending > 1 ? 's' : ''} non mise${presence.pending > 1 ? 's' : ''} à jour (non comptée${presence.pending > 1 ? 's' : ''})` : ''}`
  // Barre de chiffres juste au-dessus du planning (mêmes filtres que l'agenda)
  const weekRangeShort = `${format(activeWeekStart, 'EEE d', { locale: fr })} → ${format(addDays(activeWeekStart, 6), 'EEE d MMM', { locale: fr })}`
  const presenceColor = presence.rate == null ? crmV2.textMuted : presence.rate >= 70 ? crmV2.successStrong : presence.rate >= 50 ? '#b45309' : '#dc2626'
  const statBox = (label: ReactNode, value: ReactNode, detail: ReactNode, color: string, title: string) => (
    <div title={title} style={{
      display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: isMobile ? '8px 12px' : '10px 16px',
      boxShadow: crmV2.shadow, minWidth: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 12, color: crmV2.textMuted }}>{detail}</span>
    </div>
  )
  const statsBar = (
    <div style={{ display: 'flex', gap: isMobile ? 8 : 12, flexWrap: 'wrap', padding: isMobile ? '10px 12px 0' : '14px 28px 0', flexShrink: 0 }}>
      {statBox(
        'RDV placés cette semaine',
        placedCount ?? '…',
        `pris du ${weekRangeShort}`,
        crmV2.goldDark,
        "RDV pris (créés) par l'équipe entre lundi et dimanche de cette semaine, quelle que soit leur date",
      )}
      {statBox(
        'Taux de présence',
        presence.rate == null ? '—' : `${presence.rate} %`,
        presence.lastDay === undefined
          ? 'aucun RDV passé pour l’instant'
          : `${presence.venus} venus / ${presence.venus + presence.noShow} RDV passés · ${presence.lastDay ? `lun → ${format(presence.lastDay, 'EEE', { locale: fr })}` : 'semaine complète'}`,
        presenceColor,
        presenceTitle,
      )}
    </div>
  )

  const subtitle = <>{rangeLabel()}</>

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative',
      background: crmV2.bgSoft, color: crmV2.text, fontFamily: 'inherit',
    }}>
      {/* En-tête V2 : titre, période, navigation, vues, action principale, filtres */}
      <div style={{
        background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`,
        padding: isMobile ? '14px 12px 0' : '20px 28px 0', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: isMobile ? 10 : '12px 16px', flexWrap: isMobile ? 'nowrap' : 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            {pageTitle ? (
              <>
                <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 600, letterSpacing: '-0.02em', color: crmV2.text }}>
                  {pageTitle}
                </h1>
                <div style={{
                  marginTop: 4, fontSize: 13, color: crmV2.textMuted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {subtitle}
                </div>
              </>
            ) : (
              <div style={{
                fontSize: isMobile ? 15 : 16, fontWeight: 700, color: crmV2.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {rangeLabel()}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <AgendaRoundButton onClick={goPrev} label="Période précédente">
              <ChevronLeft size={15} />
            </AgendaRoundButton>
            <CrmV2Button
              variant="secondary"
              onClick={goToday}
              style={isMobile ? { height: 36, padding: '0 12px' } : undefined}
            >
              {isMobile ? 'Auj.' : 'Aujourd’hui'}
            </CrmV2Button>
            <AgendaRoundButton onClick={goNext} label="Période suivante">
              <ChevronRight size={15} />
            </AgendaRoundButton>
            {!isMobile && newRdvAction && (
              <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={newRdvAction} style={{ marginLeft: 4 }}>
                Nouveau RDV
              </CrmV2Button>
            )}
            {!isMobile && showAdminLink && (
              <a
                href="/admin"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 16px',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                  background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, color: crmV2.goldDark,
                }}
              >
                <LayoutDashboard size={14} /> Admin
              </a>
            )}
          </div>
        </div>


        {/* Filtres : closers, marque, légende, outils */}
        <div
          className="crm-v2-agenda-filters"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: isMobile ? 10 : 16,
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            overflowX: isMobile ? 'auto' : 'visible', scrollbarWidth: 'none',
            margin: isMobile ? '10px -12px 0' : undefined, padding: isMobile ? '0 12px' : undefined,
          }}
        >
          {scopeTabs}
          {closerFilter}
          {legend}
          {isMobile && showAdminLink && (
            <a
              href="/admin"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, height: 32, padding: '0 12px',
                fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, color: crmV2.goldDark,
              }}
            >
              <LayoutDashboard size={13} /> Admin
            </a>
          )}
          {loading && (
            <span style={{ fontSize: 12, color: crmV2.textFaint, whiteSpace: 'nowrap', flexShrink: 0 }}>Chargement…</span>
          )}
          {canBlock && (
            <button
              type="button"
              onClick={openBlankUnavailability}
              title="Bloquer une plage où tu n'es pas disponible (ou glisse directement sur la grille)"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, height: 32, padding: '0 12px',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
                background: crmV2.bg, border: `1px solid ${crmV2.border}`, color: crmV2.textMuted,
                marginLeft: !toolbarExtra && !isMobile ? 'auto' : undefined,
              }}
            >
              <Ban size={13} /> Indispo
            </button>
          )}
          {toolbarExtra && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              flexWrap: isMobile ? 'nowrap' : 'wrap', marginLeft: isMobile ? 0 : 'auto',
            }}>
              {toolbarExtra}
            </div>
          )}
        </div>

        {/* Vues : onglets soulignés, comme les vues du CRM */}
        <div style={{ marginTop: isMobile ? 6 : 10 }}>
          <CrmV2Tabs
            bordered={false}
            value={view}
            onChange={id => setView(id as CalendarView)}
            items={viewItems.map(v => ({
              id: v.id,
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {v.id === 'list' ? <List size={14} /> : v.id === 'day' ? <CalendarDays size={14} /> : <CalendarRange size={14} />}
                  {v.label}
                </span>
              ),
            }))}
          />
        </div>
      </div>

      {statsBar}

      {/* Calendrier */}
      {view !== 'list' ? (
        isMobile ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: crmV2.bg }}>
            {renderTimeGrid(visibleDays)}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, padding: '16px 28px 20px', display: 'flex' }}>
            <div style={{
              flex: 1, minWidth: 0, background: crmV2.bg, border: `1px solid ${crmV2.border}`,
              borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              {renderTimeGrid(visibleDays)}
            </div>
          </div>
        )
      ) : (
        /* Vue liste */
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 12 : '16px 28px 20px' }}>
          {agendaEvents.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12,
              padding: '8px 10px', borderRadius: 12, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
            }}>
              <Pin size={12} color={crmV2.textFaint} />
              <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4 }}>
                Événements de la semaine
              </span>
              {agendaEvents.map(ev => (
                <span key={ev.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted }}>
                    {format(new Date(`${ev.start_day}T12:00:00`), 'EEE d', { locale: fr })}
                  </span>
                  {renderEventPin(ev, false)}
                </span>
              ))}
            </div>
          )}
          {activeAppointments.length === 0 ? (
            <div style={{ textAlign: 'center', color: crmV2.textMuted, paddingTop: 60, fontSize: 13 }}>
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
                    background: getStatusFill(appt) || crmV2.bg,
                    border: `1px solid ${getColorForCommercial(appt.users?.id || '')}66`,
                    borderLeft: `6px solid ${getColorForCommercial(appt.users?.id || '')}`,
                    borderRadius: 12, padding: isMobile ? '10px 12px' : '12px 18px',
                    display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16,
                    cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxShadow: crmV2.shadow, minHeight: 44, boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = getColorForCommercial(appt.users?.id || ''))}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = `${getColorForCommercial(appt.users?.id || '')}55`)}
                >
                  {appt.users && (
                    <div style={{
                      width: 36, height: 36, borderRadius: '36%',
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
                    <div style={{
                      fontWeight: 700, fontSize: 14,
                      color: statusFillTextColor(getStatusFill(appt)),
                      display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.prospect_name}</span>
                      <MediboxBadge brand={appt.brand} />
                    </div>
                    <div style={{
                      fontSize: 12, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'nowrap' : undefined,
                      color: crmV2.textMuted,
                    }}>
                      {format(new Date(appt.start_at), 'EEEE d MMMM · HH:mm', { locale: fr })} – {format(new Date(appt.end_at), 'HH:mm')}
                      {appt.users && <span> · {appt.users.name}</span>}
                      {appt.formation_type && <span> · {appt.formation_type}</span>}
                    </div>
                  </div>

                  <StatusBadge status={appt.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bouton flottant « + » (mobile) */}
      {isMobile && newRdvAction && (
        <button
          type="button"
          onClick={newRdvAction}
          aria-label="Nouveau RDV"
          title="Nouveau RDV"
          style={{
            position: 'absolute', right: 14, bottom: 14, zIndex: 20,
            width: 52, height: 52, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: crmV2.primary, color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(15,31,61,0.3)',
          }}
        >
          <Plus size={22} />
        </button>
      )}

      {/* Liste du jour (créneaux chargés / badge +N) */}
      {dayListModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(15,31,61,0.40)',
            display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
            padding: isMobile ? 0 : 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setDayListModal(null) }}
        >
          <div style={{
            background: crmV2.bg,
            borderRadius: isMobile ? '22px 22px 0 0' : crmV2.radiusLg,
            width: '100%',
            maxWidth: isMobile ? undefined : 480,
            maxHeight: isMobile ? '85dvh' : '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: crmV2.shadowPanel,
            fontFamily: crmV2.font,
            color: crmV2.text,
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${crmV2.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: crmV2.text }}>
                {capitalize(format(dayListModal.day, 'EEEE d MMMM', { locale: fr }))}
                {' '}
                <span style={{ color: crmV2.goldDark }}>({dayListModal.appts.length} RDV)</span>
              </span>
              <button
                type="button"
                onClick={() => setDayListModal(null)}
                aria-label="Fermer"
                title="Fermer"
                style={{
                  width: 34, height: 34, borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
                  color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <X size={16} />
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
                    title={appt.users?.name ? `Closer : ${appt.users.name}` : undefined}
                    style={{
                      textAlign: 'left',
                      background: getStatusFill(appt) || crmV2.bgHover,
                      border: `1px solid ${getColorForCommercial(appt.users?.id || '')}55`,
                      borderLeft: `4px solid ${getColorForCommercial(appt.users?.id || '')}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: statusFillTextColor(getStatusFill(appt)),
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {shortProspectName(appt.prospect_name)}
                      <MediboxBadge brand={appt.brand} />
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, marginTop: 2,
                      display: 'flex', alignItems: 'center', gap: 5,
                      color: getStatusFill(appt)
                        ? statusFillTextColor(getStatusFill(appt))
                        : getColorForCommercial(appt.users?.id || ''),
                    }}>
                      {format(new Date(appt.start_at), 'HH:mm')}
                      {' – '}
                      {format(new Date(appt.end_at), 'HH:mm')}
                      {appt.meeting_type && MEETING_PILL[appt.meeting_type] && (() => {
                        const m = MEETING_PILL[appt.meeting_type!]
                        return (
                          <span title={m.label} style={{ width: 18, height: 18, borderRadius: 5, background: m.bg, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <m.Icon size={12} strokeWidth={2.6} />
                          </span>
                        )
                      })()}
                    </div>
                    {(() => {
                      const niveau = getNiveau(appt.classe_actuelle, appt.prospect_name)
                      const meta = [niveau, appt.formation_type?.trim(), appt.users?.name].filter(Boolean).join(' · ')
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
                              gap: 5,
                              padding: '4px 12px',
                              borderRadius: 999,
                              background: badge.color,
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                              textDecoration: 'none',
                            }}
                          >
                            <Video size={13} /> {badge.fullLabel}
                          </a>
                          {badge.isGoogle && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: '#1a73e8',
                              background: 'rgba(26,115,232,0.1)',
                              border: '1px solid rgba(26,115,232,0.3)',
                              borderRadius: 999,
                              padding: '2px 8px',
                            }}>
                              Lien Google externe
                            </span>
                          )}
                        </div>
                      )
                    })()}
                    {appt.meeting_type === 'presentiel' && campusShortLabel(appt.meeting_link) && (
                      <div style={{ fontSize: 12, color: crmV2.goldDark, fontWeight: 600, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MapPin size={12} style={{ flexShrink: 0 }} /> {appt.meeting_link}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* AppointmentModal (consultation/édition) */}
      {selectedAppointment && (
        <AppointmentModal
          appointment={{
            ...selectedAppointment,
            extra_participants: parseExtraParticipants(selectedAppointment.extra_participants),
          }}
          onClose={() => setSelectedAppointment(null)}
          adminMode={adminMode}
          canAssign={allowAssign}
          teleproView={teamView && !closerId && !adminMode}
          onUpdate={(updated) => {
            setAppointments(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
            setSelectedAppointment(prev => prev ? { ...prev, ...updated } : null)
          }}
          onDelete={(deletedId) => {
            setAppointments(prev => prev.filter(a => a.id !== deletedId))
            setSelectedAppointment(null)
            setMoveToast({ kind: 'ok', msg: 'RDV supprimé' })
          }}
        />
      )}

      {/* Indisponibilités : création (glisser sur la grille / bouton) et détail */}
      <UnavailabilityCreateDialog
        state={unav}
        initial={unavCreate}
        onClose={() => setUnavCreate(null)}
        onSaved={() => { setUnavCreate(null); unav.reload(); setMoveToast({ kind: 'ok', msg: 'Indisponibilité enregistrée' }) }}
      />
      <UnavailabilityDetailDialog
        state={unav}
        blocks={unavDetail}
        onClose={() => setUnavDetail(null)}
        onChanged={() => { setUnavDetail(null); unav.reload(); setMoveToast({ kind: 'ok', msg: 'Indisponibilité retirée' }) }}
      />

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
            bottom: isMobile ? 84 : 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            background: moveToast.kind === 'ok' ? crmV2.primary : '#b91c1c',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 12,
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
