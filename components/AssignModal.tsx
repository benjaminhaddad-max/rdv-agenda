'use client'

import { useState, useEffect } from 'react'
import { X, User, Clock, Tag, Zap, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

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
}

type Commercial = {
  id: string
  name: string
  avatar_color: string
  slug: string
  role: string
  rdv_count?: number  // charge semaine
  is_available?: boolean  // dispo sur ce créneau ?
  is_blocked?: boolean    // jour bloqué ?
}

const SOURCE_LABEL: Record<string, string> = {
  telepro: '📞 Placé par télépro',
  prospect: '🌐 Réservé en ligne',
  admin: '⚙️ Admin',
}

const COLORS = ['#4f6ef7','#22c55e','#f59e0b','#a855f7','#06b6d4','#ef4444','#f97316']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

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
  const [closers, setClosers] = useState<Commercial[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewCloserId, setPreviewCloserId] = useState<string | null>(null)
  const [previewAppts, setPreviewAppts] = useState<{ id: string; prospect_name: string; start_at: string; end_at: string; status: string }[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const start = new Date(appointment.start_at)
  const end = new Date(appointment.end_at)

  useEffect(() => {
    // Charger les closers + leur charge + dispo sur ce créneau
    fetch('/api/users')
      .then(r => r.json())
      .then(async (users: Commercial[]) => {
        const closersList = users.filter(u => u.role === 'commercial' || u.role === 'admin')

        // Charger le nombre de RDV de chaque closer cette semaine
        const weekStart = new Date(appointment.start_at)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Lundi
        const weekKey = format(weekStart, 'yyyy-MM-dd')
        const dateStr = format(new Date(appointment.start_at), 'yyyy-MM-dd')

        const closersWithLoad = await Promise.all(
          closersList.map(async (closer) => {
            let rdv_count = 0
            let is_available = false
            let is_blocked = false

            try {
              // Charge de la semaine
              const resAppts = await fetch(`/api/appointments?commercial_id=${closer.id}&week=${weekKey}`)
              if (resAppts.ok) {
                const appts = await resAppts.json()
                rdv_count = appts.filter((a: { status: string }) => a.status !== 'annule').length
              }

              // Check dispo sur le créneau du RDV
              const resSlots = await fetch(`/api/availability?commercial_id=${closer.id}&date=${dateStr}`)
              if (resSlots.ok) {
                const slots: { start: string; end: string; available: boolean }[] = await resSlots.json()
                // Le closer est dispo s'il a un slot libre qui couvre le créneau du RDV
                is_available = slots.some(s =>
                  s.available &&
                  new Date(s.start).getTime() <= new Date(appointment.start_at).getTime() &&
                  new Date(s.end).getTime() >= new Date(appointment.end_at).getTime()
                )
                // Si aucun slot du tout → jour bloqué ou pas de dispo ce jour
                if (slots.length === 0) is_blocked = true
              }
            } catch {}

            return { ...closer, rdv_count, is_available, is_blocked }
          })
        )

        // Sort: available first, then by load ascending
        const sorted = closersWithLoad.sort((a, b) => {
          if (a.is_available && !b.is_available) return -1
          if (!a.is_available && b.is_available) return 1
          return (a.rdv_count || 0) - (b.rdv_count || 0)
        })
        setClosers(sorted)

        // Auto-select rules
        const available = sorted.filter(c => c.is_available)
        if (available.length === 1) {
          // Un seul closer dispo → le sélectionner
          setSelected(available[0].id)
        } else if (available.length > 1) {
          // Admin dispo → le sélectionner par défaut
          const admin = available.find(c => c.role === 'admin')
          if (admin) {
            setSelected(admin.id)
          }
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
        onClose()
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
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#1e2130',
        border: '1px solid #2a2d3e',
        borderRadius: 16,
        width: '100%', maxWidth: 560,
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #2a2d3e',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: reassign ? '#6b87ff' : '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              {reassign ? '🔄 Réassigner le closer' : 'Assigner le RDV'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0' }}>
              {appointment.prospect_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8b8fa8', fontSize: 13, marginTop: 4 }}>
              <Clock size={13} />
              <span>{format(start, 'EEEE d MMMM · HH:mm', { locale: fr })} – {format(end, 'HH:mm')}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#555870', padding: 4, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Infos RDV */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #2a2d3e', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {appointment.formation_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#8b8fa8' }}>
                <Tag size={13} style={{ color: '#f59e0b' }} />
                <span style={{ color: '#e8eaf0', fontWeight: 600 }}>{appointment.formation_type}</span>
              </div>
            )}
            {appointment.source && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#8b8fa8' }}>
                <Zap size={13} style={{ color: '#6b87ff' }} />
                <span>{SOURCE_LABEL[appointment.source] || appointment.source}</span>
              </div>
            )}
          </div>
        </div>

        {/* Liste des closers */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ padding: '12px 24px 4px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Choisir un closer
            </div>
          </div>
          <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closers.length === 0 && (
              <div style={{ textAlign: 'center', color: '#555870', padding: '20px 0', fontSize: 13 }}>
                Chargement des closers…
              </div>
            )}
            {closers.map((closer, idx) => {
              const color = COLORS[idx % COLORS.length]
              const isSelected = selected === closer.id
              const isCurrent = reassign && currentCloserId === closer.id
              const load = closer.rdv_count || 0
              const loadColor = load <= 3 ? '#22c55e' : load <= 6 ? '#f59e0b' : '#ef4444'
              const available = closer.is_available
              const blocked = closer.is_blocked

              return (
                <div key={closer.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div
                  onClick={() => setSelected(closer.id)}
                  style={{
                    background: isSelected ? `${color}12` : '#252840',
                    border: `1px solid ${isSelected ? color : blocked ? 'rgba(239,68,68,0.2)' : '#2a2d3e'}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'all 0.15s',
                    opacity: blocked ? 0.5 : 1,
                  }}
                >
                  {/* Avatar */}
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

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#e8eaf0' }}>{closer.name}</span>
                      {isCurrent && (
                        <span style={{
                          background: 'rgba(107,135,255,0.15)', color: '#6b87ff',
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
                          background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                          borderRadius: 6, padding: '1px 8px',
                          fontSize: 10, fontWeight: 700,
                        }}>
                          Occupé
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#555870', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: loadColor, fontWeight: 600 }}>{load} RDV</span>
                      <span>cette semaine</span>
                    </div>
                  </div>

                  {/* Eye preview */}
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePreview(closer.id) }}
                    style={{
                      background: previewCloserId === closer.id ? 'rgba(79,110,247,0.15)' : 'transparent',
                      border: `1px solid ${previewCloserId === closer.id ? 'rgba(79,110,247,0.4)' : '#2a2d3e'}`,
                      borderRadius: 8, width: 32, height: 32,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                      color: previewCloserId === closer.id ? '#6b87ff' : '#555870',
                    }}
                    title="Voir le planning"
                  >
                    {previewCloserId === closer.id ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>

                  {/* Selected check */}
                  {isSelected && (
                    <CheckCircle size={20} style={{ color, flexShrink: 0 }} />
                  )}
                </div>

                {/* Preview panel */}
                {previewCloserId === closer.id && (
                  <div style={{
                    background: '#1a1d27', border: '1px solid #2a2d3e',
                    borderRadius: 10, padding: '10px 14px', margin: '4px 16px 8px',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Planning semaine — {closer.name}
                    </div>
                    {previewLoading ? (
                      <div style={{ color: '#555870', fontSize: 12, padding: '8px 0' }}>Chargement…</div>
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
                              <span style={{ fontSize: 11, color: '#6b87ff', fontWeight: 600, minWidth: 80 }}>
                                {format(apptStart, 'EEE d · HH:mm', { locale: fr })}
                              </span>
                              <span style={{ fontSize: 12, color: '#8b8fa8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #2a2d3e', flexShrink: 0 }}>
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
              onClick={onClose}
              style={{
                flex: 1, background: 'transparent',
                border: '1px solid #2a2d3e', borderRadius: 10,
                padding: '10px', color: '#8b8fa8', fontSize: 14,
                cursor: 'pointer', fontWeight: 500,
              }}
            >
              Annuler
            </button>
            <button
              onClick={assign}
              disabled={!selected || assigning}
              style={{
                flex: 2, background: selected ? '#4f6ef7' : '#252840',
                border: 'none', borderRadius: 10,
                padding: '10px', color: selected ? 'white' : '#555870', fontSize: 14,
                cursor: selected ? 'pointer' : 'default', fontWeight: 700,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <User size={16} />
              {assigning ? (reassign ? 'Réassignation…' : 'Assignation…') : (reassign ? 'Réassigner ce closer' : 'Assigner ce closer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
