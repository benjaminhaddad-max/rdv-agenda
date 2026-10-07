'use client'

import type { ReactNode } from 'react'
import { addDays, addWeeks, format, isSameDay, isSameWeek, startOfToday, startOfWeek, subWeeks } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  AlertCircle, Calendar, CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, List, MapPin, PhoneCall,
  RefreshCw, RotateCcw, Sparkles, TrendingUp, Video, X,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Card, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Segmented } from '@/components/crm-v2/primitives'
import { STATUS_CONFIG, type AppointmentStatus } from '@/components/StatusBadge'
import { REPLAN_STATUSES, TRACKING_STATUSES, type MyAppointment } from './types'
import { RdvStatusPill, TpCallButton, TpFilterChip, TpRoundButton, rdvStatusStyle } from './ui'

type Stats = { total: number; thisMonth: number; positifs: number; aVenir: number } | null

function modeOf(rdv: MyAppointment): { icon: ReactNode; label: string } {
  if (rdv.meeting_type === 'visio') return { icon: <Video size={12} />, label: 'Visio' }
  if (rdv.meeting_type === 'telephone') return { icon: <PhoneCall size={12} />, label: 'Téléphone' }
  return { icon: <MapPin size={12} />, label: 'Présentiel' }
}

function durationLabel(rdv: MyAppointment) {
  const min = Math.round((new Date(rdv.end_at).getTime() - new Date(rdv.start_at).getTime()) / 60000)
  return min > 0 ? `${min} min` : ''
}

/** Carte d'un RDV : heure, nom, mode · closer, statut, appel. */
function RdvCard({
  rdv, onOpen, onReprendre, rebooking, showReplan, highlight, dim, showDate, isMobile,
}: {
  rdv: MyAppointment
  onOpen: () => void
  onReprendre?: () => void
  rebooking?: boolean
  showReplan: boolean
  highlight?: boolean
  dim?: boolean
  showDate?: boolean
  isMobile: boolean
}) {
  const mode = modeOf(rdv)
  const start = new Date(rdv.start_at)
  const canReplan = showReplan && REPLAN_STATUSES.includes(rdv.status)
  const closer = rdv.rdv_users ? `Closer ${rdv.rdv_users.name}` : 'Closer à attribuer'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      style={{
        background: crmV2.bg, border: `1px solid ${highlight ? crmV2.goldBorder : crmV2.border}`, borderRadius: crmV2.radiusLg,
        padding: 12, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', opacity: dim ? 0.8 : 1,
        boxShadow: crmV2.shadow,
      }}
    >
      <div style={{ width: 52, flexShrink: 0, textAlign: 'center', borderRadius: 12, background: 'rgba(201,168,76,0.12)', padding: '8px 0' }}>
        {showDate && <div style={{ fontSize: 10, fontWeight: 700, color: crmV2.goldDark, textTransform: 'uppercase' }}>{format(start, 'd MMM', { locale: fr })}</div>}
        <div style={{ fontSize: 15, fontWeight: 800, color: crmV2.goldDark }}>{format(start, 'HH:mm')}</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: crmV2.goldDark }}>{durationLabel(rdv)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {rdv.prospect_name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span style={{ display: 'inline-flex', flexShrink: 0, color: rdv.meeting_type === 'telephone' ? '#16a34a' : crmV2.gold }}>{mode.icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[mode.label, rdv.formation_type, closer, !isMobile ? rdv.prospect_phone : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <RdvStatusPill status={rdv.status} />
          {canReplan && onReprendre && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onReprendre() }}
              disabled={rebooking}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '2px 10px', minHeight: 24,
                background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, color: crmV2.goldDark,
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <RotateCcw size={11} /> {rebooking ? 'Chargement…' : 'Reprendre RDV'}
            </button>
          )}
        </div>
      </div>
      {rdv.prospect_phone && <TpCallButton phone={rdv.prospect_phone} contactId={rdv.hubspot_contact_id} />}
    </div>
  )
}

function DayHeading({ children, today, count }: { children: ReactNode; today?: boolean; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px 0' }}>
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: today ? crmV2.goldDark : crmV2.textMuted,
      }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: today ? crmV2.goldBorder : crmV2.border }} />
      {typeof count === 'number' && count > 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textFaint }}>{count} RDV</span>
      )}
    </div>
  )
}

function dayLabel(date: Date, today: Date) {
  if (isSameDay(date, today)) return `Aujourd'hui · ${format(date, 'EEE d MMM', { locale: fr })}`
  if (isSameDay(date, addDays(today, 1))) return `Demain · ${format(date, 'EEE d MMM', { locale: fr })}`
  return format(date, 'EEEE d MMMM yyyy', { locale: fr })
}

export default function PlanningView({
  rdvs, loading, error, onRefresh, stats, statusFilter, setStatusFilter, planningView, setPlanningView,
  planningWeekStart, setPlanningWeekStart, rebookLoading, onOpen, onReprendre, isMobile,
}: {
  rdvs: MyAppointment[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  stats: Stats
  statusFilter: AppointmentStatus | null
  setStatusFilter: (s: AppointmentStatus | null) => void
  planningView: 'week' | 'chrono'
  setPlanningView: (v: 'week' | 'chrono') => void
  planningWeekStart: Date
  setPlanningWeekStart: (fn: (d: Date) => Date) => void
  rebookLoading: string | null
  onOpen: (rdv: MyAppointment) => void
  onReprendre: (rdv: MyAppointment) => void
  isMobile: boolean
}) {
  const today = startOfToday()
  const now = new Date()

  // ── Indicateurs ──
  const rdvsThisMonth = rdvs.filter(r => {
    const d = new Date(r.start_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const rdvsPositifs = rdvs.filter(r => r.status === 'positif' || r.status === 'preinscription')
  const rdvsAVenir = rdvs.filter(r => new Date(r.start_at) > now)
  const kpis = [
    { label: 'Total placés', value: stats?.total ?? rdvs.length, color: '#b8963e', bg: 'rgba(204,172,113,0.10)', icon: <CalendarCheck size={15} /> },
    { label: 'Ce mois', value: stats?.thisMonth ?? rdvsThisMonth.length, color: '#16a34a', bg: 'rgba(34,197,94,0.10)', icon: <TrendingUp size={15} /> },
    { label: 'Positifs', value: stats?.positifs ?? rdvsPositifs.length, color: '#a855f7', bg: 'rgba(168,85,247,0.10)', icon: <Sparkles size={15} /> },
    { label: 'À venir', value: stats?.aVenir ?? rdvsAVenir.length, color: '#b8963e', bg: 'rgba(204,172,113,0.10)', icon: <CalendarClock size={15} /> },
  ]

  const statusCounts = rdvs.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ── Semaine ──
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(planningWeekStart, i))
  const rdvsThisWeek = rdvs.filter(r => isSameWeek(new Date(r.start_at), planningWeekStart, { weekStartsOn: 1 }))
  const isCurrentWeek = isSameWeek(planningWeekStart, now, { weekStartsOn: 1 })

  // ── Filtre par statut ──
  const filteredRdvs = statusFilter
    ? [...rdvs].filter(r => r.status === statusFilter).sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
    : []

  // ── Chronologique : tous les RDV par jour, ordre croissant ──
  const allChronoGroups: { date: Date; rdvs: MyAppointment[] }[] = []
  for (const rdv of [...rdvs].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())) {
    const d = new Date(rdv.start_at)
    const existing = allChronoGroups.find(g => isSameDay(g.date, d))
    if (existing) existing.rdvs.push(rdv)
    else allChronoGroups.push({ date: d, rdvs: [rdv] })
  }

  const navBtn = {
    width: 36, height: 36, borderRadius: 999, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  } as const

  let body: ReactNode
  if (loading && rdvs.length === 0) {
    body = (
      <div style={{ textAlign: 'center', padding: '60px 0', color: crmV2.textMuted }}>
        <RefreshCw size={24} style={{ animation: 'crm-v2-spin 1s linear infinite', marginBottom: 12 }} />
        <div>Chargement…</div>
      </div>
    )
  } else if (error && rdvs.length === 0) {
    body = (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#dc2626' }}>
        <AlertCircle size={24} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Erreur de chargement</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>{error}</div>
        <button type="button" onClick={onRefresh} style={{
          marginTop: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999,
          padding: '8px 16px', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Réessayer
        </button>
      </div>
    )
  } else if (rdvs.length === 0) {
    body = (
      <div style={{ textAlign: 'center', padding: '60px 0', color: crmV2.textMuted }}>
        <Calendar size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: crmV2.text }}>Aucun RDV placé pour le moment</div>
        <div style={{ fontSize: 13 }}>Place ton premier RDV avec « Nouveau RDV »</div>
      </div>
    )
  } else if (statusFilter) {
    const s = rdvStatusStyle(statusFilter)
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>
            {STATUS_CONFIG[statusFilter]?.label} — {filteredRdvs.length} RDV
          </div>
          <button type="button" onClick={() => setStatusFilter(null)} style={{
            background: 'none', border: 'none', color: crmV2.link, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'inherit', padding: '6px 0',
          }}>
            <X size={12} /> Tout voir
          </button>
        </div>
        {filteredRdvs.map(rdv => (
          <RdvCard key={rdv.id} rdv={rdv} onOpen={() => onOpen(rdv)} onReprendre={() => onReprendre(rdv)}
            rebooking={rebookLoading === rdv.id} showReplan showDate isMobile={isMobile} />
        ))}
      </div>
    )
  } else if (planningView === 'chrono') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {allChronoGroups.map(({ date, rdvs: dayRdvs }) => {
          const isToday = isSameDay(date, today)
          const isPast = date < today && !isToday
          return (
            <div key={date.toISOString()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <DayHeading today={isToday} count={dayRdvs.length}>
                {isPast ? 'Passé · ' : ''}{dayLabel(date, today)}
              </DayHeading>
              {dayRdvs.map(rdv => (
                <RdvCard key={rdv.id} rdv={rdv} onOpen={() => onOpen(rdv)} onReprendre={() => onReprendre(rdv)}
                  rebooking={rebookLoading === rdv.id} showReplan highlight={isToday} dim={isPast} isMobile={isMobile} />
              ))}
            </div>
          )
        })}
      </div>
    )
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CrmV2Card style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button type="button" aria-label="Semaine précédente" onClick={() => setPlanningWeekStart(w => subWeeks(w, 1))} style={navBtn}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>
              {isCurrentWeek ? 'Cette semaine' : `Semaine du ${format(planningWeekStart, 'd MMM', { locale: fr })} au ${format(addDays(planningWeekStart, 4), 'd MMM yyyy', { locale: fr })}`}
            </div>
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
              {rdvsThisWeek.length} RDV cette semaine
            </div>
          </div>
          <button type="button" aria-label="Semaine suivante" onClick={() => setPlanningWeekStart(w => addWeeks(w, 1))} style={navBtn}>
            <ChevronRight size={16} />
          </button>
        </CrmV2Card>
        {weekDays.map(day => {
          const dayRdvs = rdvsThisWeek.filter(r => isSameDay(new Date(r.start_at), day))
          const isToday = isSameDay(day, today)
          return (
            <div key={day.toISOString()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <DayHeading today={isToday} count={dayRdvs.length}>
                {isToday ? "Aujourd'hui · " : ''}{format(day, 'EEEE d MMM', { locale: fr })}
              </DayHeading>
              {dayRdvs.length === 0
                ? <div style={{ paddingLeft: 4, fontSize: 12, color: crmV2.textFaint }}>Aucun RDV</div>
                : dayRdvs.map(rdv => (
                  <RdvCard key={rdv.id} rdv={rdv} onOpen={() => onOpen(rdv)} showReplan={false} highlight={isToday} isMobile={isMobile} />
                ))}
            </div>
          )
        })}
        {!isCurrentWeek && (
          <div style={{ textAlign: 'center' }}>
            <button type="button" onClick={() => setPlanningWeekStart(() => startOfWeek(new Date(), { weekStartsOn: 1 }))} style={{
              background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999, padding: '8px 16px', minHeight: 40,
              fontSize: 13, color: crmV2.text, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
            }}>
              Revenir à cette semaine
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      ...(isMobile ? { padding: '14px 12px 20px' } : { maxWidth: 960, margin: '0 auto', padding: '20px 28px 32px', boxSizing: 'border-box', width: '100%' }),
    }}>
      {/* Titre de section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: isMobile ? 17 : 15, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={17} color="#22c55e" /> Mon planning
          </div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>Suivi de tous tes RDV placés</div>
        </div>
        {!isMobile && <TpRoundButton onClick={onRefresh} title="Actualiser" spinning={loading}><RefreshCw size={15} /></TpRoundButton>}
      </div>

      {/* Indicateurs */}
      {isMobile ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.color}40`, borderRadius: 14, padding: '10px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: crmV2.textMuted, marginTop: 4, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <CrmV2KpiGrid>
          {kpis.map(k => <CrmV2KpiCard key={k.label} label={k.label} value={k.value} color={k.color} icon={k.icon} />)}
        </CrmV2KpiGrid>
      )}
      {stats && (
        <div style={{ fontSize: 11, color: crmV2.textMuted, display: 'flex', alignItems: 'center', gap: 6, marginTop: -4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: crmV2.gold }} /> Statistiques sur l&apos;historique complet
        </div>
      )}

      {/* Filtres par statut */}
      {rdvs.length > 0 && (
        <div style={{
          display: 'flex', gap: 6,
          ...(isMobile ? { overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -12px', padding: '0 12px' } : { flexWrap: 'wrap' }),
        }}>
          <TpFilterChip label={`Tous (${rdvs.length})`} active={statusFilter === null} onClick={() => setStatusFilter(null)} />
          {TRACKING_STATUSES.map(status => {
            const count = statusCounts[status] || 0
            if (count === 0) return null
            const active = statusFilter === status
            return (
              <TpFilterChip key={status} label={`${STATUS_CONFIG[status].label} (${count})`} active={active}
                color={rdvStatusStyle(status).color} onClick={() => setStatusFilter(active ? null : status)} />
            )
          })}
        </div>
      )}

      {/* Vue chronologique / par semaine */}
      {rdvs.length > 0 && !statusFilter && (
        <div>
          <CrmV2Segmented
            size="sm"
            value={planningView}
            onChange={setPlanningView}
            items={[
              { id: 'chrono', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><List size={12} /> Chronologique</span> },
              { id: 'week', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Calendar size={12} /> Par semaine</span> },
            ]}
          />
        </div>
      )}

      {body}
    </div>
  )
}
