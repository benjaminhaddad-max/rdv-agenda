'use client'

import { useState, useEffect } from 'react'
import { User, Clock, Tag, Zap, CheckCircle, AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatAppointmentPlacementLabel } from '@/lib/appointment-display'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Avatar, CrmV2Button, CrmV2CloseButton, CrmV2StatusPill, hexA,
} from '@/components/crm-v2/primitives'

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
  telepro_id?: string | null
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

const COLORS = ['#C9A84C','#22c55e','#C9A84C','#a855f7','#06b6d4','#ef4444','#f97316']

const metaChip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted,
  background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '3px 10px',
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
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${crmV2.borderLight}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {appointment.formation_type && (
              <span style={metaChip}>
                <Tag size={12} style={{ color: crmV2.gold }} />
                <span style={{ color: crmV2.text, fontWeight: 700 }}>{appointment.formation_type}</span>
              </span>
            )}
            {appointment.source && (
              <span style={metaChip}>
                <Zap size={12} style={{ color: crmV2.gold }} />
                <span>{formatAppointmentPlacementLabel(appointment)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '14px 18px 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Choisir un closer
          </div>
        </div>
        <div style={{ padding: '8px 14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {closers.length === 0 && (
            <div style={{ textAlign: 'center', color: crmV2.textFaint, padding: '20px 0', fontSize: 13 }}>
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
            const loadColor = load <= 3 ? crmV2.successStrong : load <= 6 ? crmV2.goldDark : '#d13a41'
            const available = closer.is_available
            const blocked = closer.is_blocked
            const previewOpen = previewCloserId === closer.id

            return (
              <div key={closer.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div
                  onClick={() => setSelected(closer.id)}
                  style={{
                    background: isSelected ? hexA(color, 0.07) : crmV2.bg,
                    border: `1px solid ${isSelected ? color : blocked ? 'rgba(239,68,68,0.25)' : crmV2.border}`,
                    boxShadow: isSelected ? `0 0 0 1px ${color}` : 'none',
                    borderRadius: 12,
                    padding: '10px 12px',
                    minHeight: 44,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'background .12s, border-color .12s',
                  }}
                >
                  <CrmV2Avatar name={closer.name} color={color} size={36} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: crmV2.text }}>{closer.name}</span>
                      {isCurrent && <CrmV2StatusPill label="Actuel" color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} style={{ fontSize: 11 }} />}
                      {available && <CrmV2StatusPill label="Disponible" color={crmV2.successStrong} style={{ fontSize: 11 }} />}
                      {blocked && <CrmV2StatusPill label="Indisponible" color="#ef4444" style={{ fontSize: 11 }} />}
                      {!available && !blocked && <CrmV2StatusPill label="Occupé" color="#b8963e" style={{ fontSize: 11 }} />}
                    </div>
                    <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: loadColor, fontWeight: 700 }}>{load} RDV</span>
                      <span>cette semaine</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); togglePreview(closer.id) }}
                    style={{
                      background: previewOpen ? crmV2.goldSoft : crmV2.bg,
                      border: `1px solid ${previewOpen ? crmV2.goldBorder : crmV2.borderStrong}`,
                      borderRadius: 999, width: 34, height: 34,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                      color: previewOpen ? crmV2.goldDark : crmV2.textMuted,
                    }}
                    title="Voir le planning"
                    aria-label="Voir le planning"
                  >
                    {previewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>

                  {isSelected && (
                    <CheckCircle size={18} style={{ color, flexShrink: 0 }} />
                  )}
                </div>

                {previewOpen && (
                  <div style={{
                    background: crmV2.bgHover, border: `1px solid ${crmV2.border}`,
                    borderRadius: 12, padding: '10px 14px', margin: '6px 8px 8px',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                      Planning semaine — {closer.name}
                    </div>
                    {previewLoading ? (
                      <div style={{ color: crmV2.textFaint, fontSize: 12, padding: '8px 0' }}>Chargement…</div>
                    ) : previewAppts.length === 0 ? (
                      <div style={{ color: crmV2.successStrong, fontSize: 12, fontWeight: 600, padding: '4px 0' }}>Aucun RDV cette semaine</div>
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
                                padding: '4px 8px', borderRadius: 8,
                                background: isSameSlot ? 'rgba(239,68,68,0.08)' : 'transparent',
                                border: isSameSlot ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
                              }}
                            >
                              <span style={{ fontSize: 12, color: crmV2.goldDark, fontWeight: 700, minWidth: 84 }}>
                                {format(apptStart, 'EEE d · HH:mm', { locale: fr })}
                              </span>
                              <span style={{ fontSize: 12, color: crmV2.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

      <div style={{ padding: '12px 18px', borderTop: `1px solid ${crmV2.border}`, flexShrink: 0, background: crmV2.bg }}>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            color: '#d13a41', fontSize: 13, marginBottom: 10,
          }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <CrmV2Button onClick={onCancel} style={{ flex: 1, minHeight: 40 }}>
            Annuler
          </CrmV2Button>
          <CrmV2Button
            variant="primary"
            onClick={assign}
            disabled={!selected || assigning}
            icon={<User size={14} />}
            style={{ flex: 2, minHeight: 40 }}
          >
            {assigning ? (reassign ? 'Réassignation…' : 'Assignation…') : (reassign ? 'Réassigner ce closer' : 'Assigner ce closer')}
          </CrmV2Button>
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
  const isMobile = useIsMobile()

  return (
    <div
      className="crm-v2"
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(15,31,61,0.40)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 16, fontFamily: crmV2.font, color: crmV2.text,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: crmV2.bg,
          border: isMobile ? 'none' : `1px solid ${crmV2.border}`,
          borderRadius: isMobile ? '22px 22px 0 0' : 20,
          width: '100%', maxWidth: isMobile ? '100%' : 560,
          boxShadow: crmV2.shadowPanel,
          overflow: 'hidden',
          maxHeight: isMobile ? '88dvh' : '90vh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : 0,
        }}
      >
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0', flexShrink: 0 }}>
            <span style={{ width: 40, height: 4, borderRadius: 999, background: crmV2.borderStrong }} />
          </div>
        )}
        <div style={{
          padding: isMobile ? '10px 16px 14px' : '16px 18px 14px',
          borderBottom: `1px solid ${crmV2.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
              fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              {reassign ? <RefreshCw size={12} color={crmV2.gold} /> : <User size={12} color={crmV2.gold} />}
              {reassign ? 'Réassigner le closer' : 'Assigner le RDV'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: crmV2.text, letterSpacing: '-0.02em' }}>
              {appointment.prospect_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: crmV2.textMuted, fontSize: 13, marginTop: 4 }}>
              <Clock size={13} color={crmV2.gold} />
              <span>{format(start, 'EEEE d MMMM · HH:mm', { locale: fr })} – {format(end, 'HH:mm')}</span>
            </div>
          </div>
          <CrmV2CloseButton onClick={onClose} />
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
