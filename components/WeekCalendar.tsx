'use client'

import { useState, useEffect, useCallback } from 'react'
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

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 8h → 18h
const COLORS = ['#4f6ef7','#22c55e','#f59e0b','#a855f7','#06b6d4','#ef4444','#f97316']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function timeToPercent(dateStr: string, refDate: Date): number {
  const d = new Date(dateStr)
  const start = new Date(refDate)
  start.setHours(8, 0, 0, 0)
  const end = new Date(refDate)
  end.setHours(18, 0, 0, 0)
  const total = end.getTime() - start.getTime()
  const offset = d.getTime() - start.getTime()
  return Math.max(0, Math.min(100, (offset / total) * 100))
}

function durationToPercent(startStr: string, endStr: string, refDate: Date): number {
  const start = new Date(startStr)
  const end = new Date(endStr)
  const refStart = new Date(refDate)
  refStart.setHours(8, 0, 0, 0)
  const refEnd = new Date(refDate)
  refEnd.setHours(18, 0, 0, 0)
  const total = refEnd.getTime() - refStart.getTime()
  const duration = end.getTime() - start.getTime()
  return Math.max(4, (duration / total) * 100)
}

export default function WeekCalendar({ adminMode = false, closerId, closerColor, closerName }: { adminMode?: boolean; closerId?: string; closerColor?: string; closerName?: string }) {
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
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'week' | 'list'>('week')
  const [showNewRdvModal, setShowNewRdvModal] = useState(false)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))
  const weekKey = format(currentWeekStart, 'yyyy-MM-dd')

  // Closers uniquement (pas managers, pas télépros) + admin (Pascal)
  const closers = commerciaux.filter(c => c.role === 'commercial' || c.role === 'admin')

  // Compteurs semaine (hors annulés et non-assignés)
  const rdvCount = appointments.filter(a => a.status !== 'annule' && a.status !== 'non_assigne').length
  const rdvEffectues = appointments.filter(a => ['va_reflechir', 'preinscription'].includes(a.status)).length

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ week: weekKey })
      if (selectedCommercial !== 'all') params.set('commercial_id', selectedCommercial)
      const res = await fetch(`/api/appointments?${params}`)
      if (res.ok) setAppointments(await res.json())
    } finally {
      setLoading(false)
    }
  }, [weekKey, selectedCommercial])

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setCommerciaux)
  }, [])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])

  function handleSelectCommercial(id: string) {
    if (closerId) return // verrouillé en mode closer
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
    if (closerId && closerColor) return closerColor
    const idx = closers.findIndex(c => c.id === id)
    return idx >= 0 ? COLORS[idx % COLORS.length] : '#4f6ef7'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f1117' }}>
      {/* Top bar — masquée en mode admin et en mode closer (le parent gère le header) */}
      {!adminMode && !closerId && (
        <div style={{
          padding: '0 24px',
          height: 64,
          background: '#1a1d27',
          borderBottom: '1px solid #2a2d3e',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(79,110,247,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar size={18} style={{ color: '#4f6ef7' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>Agenda RDV</div>
              <div style={{ fontSize: 12, color: '#555870' }}>Diploma Santé</div>
            </div>
          </div>

          {/* Week counters */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{
              background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.2)',
              borderRadius: 10, padding: '6px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#6b87ff', lineHeight: 1 }}>{rdvCount}</div>
              <div style={{ fontSize: 11, color: '#555870', marginTop: 2 }}>RDV cette semaine</div>
            </div>
            <div style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 10, padding: '6px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{rdvEffectues}</div>
              <div style={{ fontSize: 11, color: '#555870', marginTop: 2 }}>Avancés</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Lien admin */}
            <a
              href="/admin"
              style={{
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 8, padding: '6px 12px',
                color: '#f59e0b', fontSize: 12,
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <LayoutDashboard size={13} />
              Admin
            </a>

            {/* Sélecteur closer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} style={{ color: '#555870' }} />
              <select
                value={selectedCommercial}
                onChange={e => handleSelectCommercial(e.target.value)}
                style={{
                  background: '#252840', border: '1px solid #2a2d3e',
                  borderRadius: 8, padding: '6px 10px', color: '#e8eaf0',
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
            <div style={{ display: 'flex', background: '#252840', borderRadius: 8, padding: 3, border: '1px solid #2a2d3e' }}>
              {(['week', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? '#4f6ef7' : 'transparent',
                    border: 'none', borderRadius: 6, padding: '5px 14px',
                    color: view === v ? 'white' : '#8b8fa8',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {v === 'week' ? 'Semaine' : 'Liste'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mode admin : bar minimaliste avec compteurs + filtre */}
      {adminMode && (
        <div style={{
          padding: '8px 24px',
          background: '#1a1d27',
          borderBottom: '1px solid #2a2d3e',
          display: 'flex', alignItems: 'center', gap: 16,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#6b87ff', fontWeight: 700 }}>{rdvCount} RDV</span>
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 700 }}>{rdvEffectues} avancés</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={13} style={{ color: '#555870' }} />
            <select
              value={selectedCommercial}
              onChange={e => setSelectedCommercial(e.target.value)}
              style={{
                background: '#252840', border: '1px solid #2a2d3e',
                borderRadius: 8, padding: '5px 10px', color: '#e8eaf0',
                fontSize: 12, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">Tous les closers</option>
              {closers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Week nav */}
      <div style={{
        padding: '10px 24px',
        background: '#1a1d27',
        borderBottom: '1px solid #2a2d3e',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <button
          onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
          style={{
            background: '#252840', border: '1px solid #2a2d3e',
            borderRadius: 8, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#8b8fa8',
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0', minWidth: 200 }}>
          {format(currentWeekStart, 'd MMMM', { locale: fr })}
          {' '}—{' '}
          {format(addDays(currentWeekStart, 6), 'd MMMM yyyy', { locale: fr })}
        </div>

        <button
          onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
          style={{
            background: '#252840', border: '1px solid #2a2d3e',
            borderRadius: 8, width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#8b8fa8',
          }}
        >
          <ChevronRight size={16} />
        </button>

        <button
          onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          style={{
            background: 'transparent', border: '1px solid #2a2d3e',
            borderRadius: 8, padding: '5px 14px',
            color: '#8b8fa8', fontSize: 12, cursor: 'pointer',
          }}
        >
          Aujourd&apos;hui
        </button>

        {/* Toggle view en mode admin */}
        {adminMode && (
          <div style={{ marginLeft: 'auto', display: 'flex', background: '#252840', borderRadius: 8, padding: 3, border: '1px solid #2a2d3e' }}>
            {(['week', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? '#4f6ef7' : 'transparent',
                  border: 'none', borderRadius: 6, padding: '4px 12px',
                  color: view === v ? 'white' : '#8b8fa8',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {v === 'week' ? 'Semaine' : 'Liste'}
              </button>
            ))}
          </div>
        )}

        {/* Bouton + RDV — visible uniquement pour les closers */}
        {closerId && !adminMode && (
          <button
            onClick={() => setShowNewRdvModal(true)}
            style={{
              marginLeft: 'auto',
              background: 'rgba(79,110,247,0.15)',
              border: '1px solid rgba(79,110,247,0.4)',
              borderRadius: 8, padding: '6px 14px',
              color: '#6b87ff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(79,110,247,0.25)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(79,110,247,0.15)'
            }}
          >
            <Plus size={13} />
            Nouveau RDV
          </button>
        )}

        {loading && (
          <div style={{ fontSize: 12, color: '#555870', marginLeft: 8 }}>Chargement…</div>
        )}
      </div>

      {/* Calendar grid */}
      {view === 'week' ? (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Day headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '56px repeat(7, 1fr)',
            borderBottom: '1px solid #2a2d3e',
            background: '#1a1d27',
            flexShrink: 0,
          }}>
            <div style={{ borderRight: '1px solid #2a2d3e' }} />
            {weekDays.map(day => {
              const dayAppts = getAppointmentsForDay(day)
              const today = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  style={{
                    padding: '8px 6px',
                    textAlign: 'center',
                    borderRight: '1px solid #2a2d3e',
                    background: today ? 'rgba(79,110,247,0.06)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#555870', textTransform: 'uppercase', fontWeight: 600 }}>
                    {format(day, 'EEE', { locale: fr })}
                  </div>
                  <div style={{
                    fontSize: 17, fontWeight: 700,
                    color: today ? '#6b87ff' : '#e8eaf0',
                    lineHeight: 1.2, marginTop: 2,
                  }}>
                    {format(day, 'd')}
                  </div>
                  {dayAppts.length > 0 && (
                    <div style={{
                      marginTop: 3, fontSize: 10, fontWeight: 600,
                      color: today ? '#6b87ff' : '#8b8fa8',
                      background: today ? 'rgba(79,110,247,0.15)' : '#252840',
                      borderRadius: 10, padding: '1px 7px', display: 'inline-block',
                    }}>
                      {dayAppts.length}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Time grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', position: 'relative' }}>
            {/* Hour labels */}
            <div style={{ borderRight: '1px solid #2a2d3e' }}>
              {HOURS.map(h => (
                <div
                  key={h}
                  style={{
                    height: 60,
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                    paddingRight: 8, paddingTop: 4,
                    fontSize: 11, color: '#555870', fontWeight: 600,
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
              return (
                <div
                  key={day.toISOString()}
                  style={{
                    borderRight: '1px solid #2a2d3e',
                    position: 'relative',
                    background: today ? 'rgba(79,110,247,0.02)' : 'transparent',
                  }}
                >
                  {HOURS.map(h => (
                    <div key={h} style={{ height: 60, borderBottom: '1px solid #1e2130' }} />
                  ))}

                  {dayAppts.map(appt => {
                    const top = timeToPercent(appt.start_at, day)
                    const height = durationToPercent(appt.start_at, appt.end_at, day)
                    const color = getColorForCommercial(appt.users?.id || '')
                    const isCancelled = appt.status === 'annule'

                    return (
                      <div
                        key={appt.id}
                        onClick={() => setSelectedAppointment(appt)}
                        style={{
                          position: 'absolute',
                          left: 3, right: 3,
                          top: `${top}%`,
                          height: `${height}%`,
                          background: isCancelled ? 'rgba(107,114,128,0.1)' : `${color}18`,
                          border: `1px solid ${isCancelled ? 'rgba(107,114,128,0.3)' : `${color}50`}`,
                          borderLeft: `3px solid ${isCancelled ? '#6b7280' : color}`,
                          borderRadius: 6,
                          padding: '3px 6px',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          zIndex: 1,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => {
                          const el = e.currentTarget as HTMLDivElement
                          el.style.background = isCancelled ? 'rgba(107,114,128,0.2)' : `${color}28`
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget as HTMLDivElement
                          el.style.background = isCancelled ? 'rgba(107,114,128,0.1)' : `${color}18`
                        }}
                      >
                        <div style={{
                          fontSize: 11, fontWeight: 700,
                          color: isCancelled ? '#6b7280' : color,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          {appt.meeting_type === 'visio' && <span style={{ fontSize: 9 }}>📹</span>}
                          {format(new Date(appt.start_at), 'HH:mm')} {appt.prospect_name}
                        </div>
                        {height > 8 && appt.users && (
                          <div style={{ fontSize: 10, color: '#555870', marginTop: 1 }}>
                            {appt.users.name}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Current time indicator */}
                  {today && (() => {
                    const now = new Date()
                    const nowPercent = timeToPercent(now.toISOString(), day)
                    if (nowPercent < 0 || nowPercent > 100) return null
                    return (
                      <div style={{
                        position: 'absolute', left: 0, right: 0,
                        top: `${nowPercent}%`,
                        height: 2, background: '#4f6ef7',
                        zIndex: 2,
                      }}>
                        <div style={{
                          position: 'absolute', left: -4, top: -4,
                          width: 10, height: 10, borderRadius: '50%',
                          background: '#4f6ef7',
                        }} />
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* List view */
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {appointments.filter(a => a.status !== 'non_assigne').length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555870', paddingTop: 60 }}>
              Aucun RDV assigné cette semaine
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {appointments.filter(a => a.status !== 'non_assigne').map(appt => (
                <div
                  key={appt.id}
                  onClick={() => setSelectedAppointment(appt)}
                  style={{
                    background: '#1e2130', border: '1px solid #2a2d3e',
                    borderRadius: 12, padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 16,
                    cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#4f6ef7')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2d3e')}
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
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0' }}>
                      {appt.prospect_name}
                    </div>
                    <div style={{ fontSize: 12, color: '#8b8fa8', marginTop: 2 }}>
                      {format(new Date(appt.start_at), 'EEEE d MMMM · HH:mm', { locale: fr })} – {format(new Date(appt.end_at), 'HH:mm')}
                      {appt.users && <span> · {appt.users.name}</span>}
                      {appt.formation_type && <span style={{ color: '#f59e0b' }}> · {appt.formation_type}</span>}
                    </div>
                  </div>

                  <StatusBadge status={appt.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AppointmentModal (consultation/édition) */}
      {selectedAppointment && (
        <AppointmentModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
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
    </div>
  )
}
