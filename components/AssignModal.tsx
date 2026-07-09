'use client'

import { useState, useEffect } from 'react'
import { X, User, Clock, Tag, Zap, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatAppointmentSourceLabel } from '@/lib/appointment-display'

type Appointment = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  source?: string
  formation_type?: string | null
  notes: string | null
  telepro?: { id: string; name: string } | null
}

type Commercial = {
  id: string
  name: string
  avatar_color: string
  slug: string
  role: string
  rdv_count?: number
  is_available?: boolean
  is_blocked?: boolean
}

const SOURCE_LABEL: Record<string, string> = {
  prospect: '🌐 Réservé en ligne',
  admin: '⚙️ Admin',
}

const COLORS = ['#C9A84C','#22c55e','#C9A84C','#a855f7','#06b6d4','#ef4444','#f97316']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

/** Panneau de sélection closer — réutilisable en modale autonome ou inline dans AppointmentModal. */
export function AssignCloserPanel({
  appointment,
  onAssigned,
  onCancel,
  reassign = false,
  currentCloserId,
  showMeta = true,
}: {
  appointment: Appointment
  onAssigned: (updatedAppointment: Record<string, unknown>) => void
  onCancel: () => void
  reassign?: boolean
  currentCloserId?: string | null
  /** Afficher filière / source (utile en modale autonome, masqué en inline). */
  showMeta?: boolean
}) {
  const [closers, setClosers] = useState<Commercial[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewCloserId, setPreviewCloserId] = useState<string | null>(null)
  const [previewAppts, setPreviewAppts] = useState<{ id: string; prospect_name: string; start_at: string; end_at: string; status: string }[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(async (users: Commercial[]) => {
        const closersList = users.filter(u => u.role === 'closer' || u.role === 'admin')

        const weekStart = new Date(appointment.start_at)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
        const weekKey = format(weekStart, 'yyyy-MM-dd')
        const dateStr = format(new Date(appointment.start_at), 'yyyy-MM-dd')

        const closersWithLoad = await Promise.all(
          closersList.map(async (closer) => {
            let rdv_count = 0
            let is_available = false
            let is_blocked = false

            try {
              const resAppts = await fetch(`/api/appointments?commercial_id=${closer.id}&week=${weekKey}`)
              if (resAppts.ok) {
                const appts = await resAppts.json()
                rdv_count = appts.filter((a: { status: string }) => a.status !== 'annule').length
              }

              const resSlots = await fetch(`/api/availability?commercial_id=${closer.id}&date=${dateStr}`)
              if (resSlots.ok) {
                const slots: { start: string; end: string; available: boolean }[] = await resSlots.json()
                is_available = slots.some(s =>
                  s.available &&
                  new Date(s.start).getTime() <= new Date(appointment.start_at).getTime() &&
                  new Date(s.end).getTime() >= new Date(appointment.end_at).getTime()
                )
                if (slots.length === 0) is_blocked = true
              }
            } catch {}

            return { ...closer, rdv_count, is_available, is_blocked }
          })
        )

        const sorted = closersWithLoad.sort((a, b) => {
          if (a.is_available && !b.is_available) return -1
          if (!a.is_available && b.is_available) return 1
          return (a.rdv_count || 0) - (b.rdv_count || 0)
        })
        setClosers(sorted)

        const available = sorted.filter(c => c.is_available)
        if (available.length === 1) {
          setSelected(available[0].id)
        } else if (available.length > 1) {
          const admin = available.find(c => c.role === 'admin')
          if (admin) setSelected(admin.id)
        }
      })
  }, [appointment.start_at, appointment.end_at])

  async function assign() {
    if (!selected) return
    setAssigning(true)
    setError(null)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commercial_id: selected, ...(reassign ? { reassign: true } : {}) }),
      })
      if (res.ok) {
        const updated = await res.json()
        onAssigned(updated)
      } else {
        const data = await res.json()
        setError(data.error || 'Erreur lors de l\'assignation')
      }
    } finally {
      setAssigning(false)
    }
  }

  async function togglePreview(closerId: string) {
    if (previewCloserId === closerId) {
      setPreviewCloserId(null)
      setPreviewAppts([])
      return
    }
    setPreviewCloserId(closerId)
    setPreviewLoading(true)
    setPreviewAppts([])
    try {
      const weekStart = new Date(appointment.start_at)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
      const weekKey = format(weekStart, 'yyyy-MM-dd')
      const res = await fetch(`/api/appointments?commercial_id=${closerId}&week=${weekKey}`)
      if (res.ok) {
        const data = await res.json()
        setPreviewAppts(
          data
            .filter((a: { status: string }) => a.status !== 'annule')
            .sort((a: { start_at: string }, b: { start_at: string }) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
        )
      }
    } catch {} finally {
      setPreviewLoading(false)
    }
  }

  return (
    <>
      {showMeta && (appointment.formation_type || appointment.source) && (
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #e5ddc8', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {appointment.formation_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4a6070' }}>
                <Tag size={13} style={{ color: '#C9A84C' }} />
                <span style={{ color: '#0e1e35', fontWeight: 600 }}>{appointment.formation_type}</span>
              </div>
            )}
            {appointment.source && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4a6070' }}>
                <Zap size={13} style={{ color: '#C9A84C' }} />
                <span>
                  {appointment.source === 'telepro'
                    ? formatAppointmentSourceLabel('telepro', appointment.telepro?.name)
                    : (SOURCE_LABEL[appointment.source] || appointment.source)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '12px 24px 4px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Choisir un closer
          </div>
        </div>
        <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {closers.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0', fontSize: 13 }}>
              Chargement des closers…
            </div>
          )}
          {closers.map((closer, idx) => {
            // Code couleur stable par closer (sa couleur propre), avec repli
            // sur la palette positionnelle si avatar_color est absent.
            const color = closer.avatar_color || COLORS[idx % COLORS.length]
            const isSelected = selected === closer.id
            const isCurrent = reassign && currentCloserId === closer.id
            const load = closer.rdv_count || 0
            const loadColor = load <= 3 ? '#22c55e' : load <= 6 ? '#C9A84C' : '#ef4444'
            const available = closer.is_available
            const blocked = closer.is_blocked

            return (
              <div key={closer.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div
                  onClick={() => setSelected(closer.id)}
                  style={{
                    background: isSelected ? `${color}12` : '#f7f4ee',
                    border: `1px solid ${isSelected ? color : blocked ? 'rgba(239,68,68,0.2)' : '#e5ddc8'}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${color}20`,
                    border: `1px solid ${color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color,
                    flexShrink: 0,
                  }}>
                    {getInitials(closer.name)}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#0e1e35' }}>{closer.name}</span>
                      {isCurrent && (
                        <span style={{
                          background: 'rgba(204,172,113,0.15)', color: '#C9A84C',
                          borderRadius: 6, padding: '1px 8px',
                          fontSize: 10, fontWeight: 700,
                        }}>
                          Actuel
                        </span>
                      )}
                      {available && (
                        <span style={{
                          background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                          borderRadius: 6, padding: '1px 8px',
                          fontSize: 10, fontWeight: 700,
                        }}>
                          Disponible
                        </span>
                      )}
                      {blocked && (
                        <span style={{
                          background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                          borderRadius: 6, padding: '1px 8px',
                          fontSize: 10, fontWeight: 700,
                        }}>
                          Indisponible
                        </span>
                      )}
                      {!available && !blocked && (
                        <span style={{
                          background: 'rgba(204,172,113,0.15)', color: '#C9A84C',
                          borderRadius: 6, padding: '1px 8px',
                          fontSize: 10, fontWeight: 700,
                        }}>
                          Occupé
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: loadColor, fontWeight: 600 }}>{load} RDV</span>
                      <span>cette semaine</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); togglePreview(closer.id) }}
                    style={{
                      background: previewCloserId === closer.id ? 'rgba(204,172,113,0.15)' : 'transparent',
                      border: `1px solid ${previewCloserId === closer.id ? 'rgba(204,172,113,0.4)' : '#e5ddc8'}`,
                      borderRadius: 8, width: 32, height: 32,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                      color: previewCloserId === closer.id ? '#C9A84C' : '#94a3b8',
                    }}
                    title="Voir le planning"
                  >
                    {previewCloserId === closer.id ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>

                  {isSelected && (
                    <CheckCircle size={20} style={{ color, flexShrink: 0 }} />
                  )}
                </div>

                {previewCloserId === closer.id && (
                  <div style={{
                    background: '#f7f4ee', border: '1px solid #e5ddc8',
                    borderRadius: 10, padding: '10px 14px', margin: '4px 16px 8px',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Planning semaine — {closer.name}
                    </div>
                    {previewLoading ? (
                      <div style={{ color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>Chargement…</div>
                    ) : previewAppts.length === 0 ? (
                      <div style={{ color: '#22c55e', fontSize: 12, padding: '4px 0' }}>Aucun RDV cette semaine</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {previewAppts.map(appt => {
                          const apptStart = new Date(appt.start_at)
                          const isSameSlot =
                            new Date(appointment.start_at).getTime() === apptStart.getTime()
                          return (
                            <div
                              key={appt.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '4px 8px', borderRadius: 6,
                                background: isSameSlot ? 'rgba(239,68,68,0.1)' : 'transparent',
                                border: isSameSlot ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
                              }}
                            >
                              <span style={{ fontSize: 11, color: '#C9A84C', fontWeight: 600, minWidth: 80 }}>
                                {format(apptStart, 'EEE d · HH:mm', { locale: fr })}
                              </span>
                              <span style={{ fontSize: 12, color: '#4a6070', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {appt.prospect_name}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid #e5ddc8', flexShrink: 0 }}>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            color: '#ef4444', fontSize: 13, marginBottom: 12,
          }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, background: 'transparent',
              border: '1px solid #e5ddc8', borderRadius: 10,
              padding: '10px', color: '#4a6070', fontSize: 14,
              cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            onClick={assign}
            disabled={!selected || assigning}
            style={{
              flex: 2, background: selected ? '#C9A84C' : '#f0e9da',
              border: 'none', borderRadius: 10,
              padding: '10px', color: selected ? '#0e1e35' : '#94a3b8', fontSize: 14,
              cursor: selected ? 'pointer' : 'default', fontWeight: 700,
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'inherit',
            }}
          >
            <User size={16} />
            {assigning ? (reassign ? 'Réassignation…' : 'Assignation…') : (reassign ? 'Réassigner ce closer' : 'Assigner ce closer')}
          </button>
        </div>
      </div>
    </>
  )
}

/** Modale autonome (file d'attente admin, etc.) */
export default function AssignModal({
  appointment,
  onClose,
  onAssigned,
  reassign = false,
  currentCloserId,
}: {
  appointment: Appointment
  onClose: () => void
  onAssigned: (updatedAppointment: Record<string, unknown>) => void
  reassign?: boolean
  currentCloserId?: string | null
}) {
  const start = new Date(appointment.start_at)
  const end = new Date(appointment.end_at)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5ddc8',
        borderRadius: 16,
        width: '100%', maxWidth: 560,
        boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
        overflow: 'hidden',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5ddc8',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              {reassign ? '🔄 Réassigner le closer' : 'Assigner le RDV'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0e1e35' }}>
              {appointment.prospect_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4a6070', fontSize: 13, marginTop: 4 }}>
              <Clock size={13} />
              <span>{format(start, 'EEEE d MMMM · HH:mm', { locale: fr })} – {format(end, 'HH:mm')}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#4a6070', padding: 4, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <AssignCloserPanel
          appointment={appointment}
          onAssigned={(updated) => { onAssigned(updated); onClose() }}
          onCancel={onClose}
          reassign={reassign}
          currentCloserId={currentCloserId}
        />
      </div>
    </div>
  )
}
