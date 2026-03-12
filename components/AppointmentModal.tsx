'use client'

import { useState, useRef } from 'react'
import { X, Clock, User, Mail, Phone, FileText, ExternalLink, Tag, Zap, Video, MapPin, PhoneCall } from 'lucide-react'
import StatusBadge, { AppointmentStatus, STATUS_CONFIG } from './StatusBadge'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

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

const STATUS_ACTIONS: { status: AppointmentStatus; label: string; icon: string; hint?: string }[] = [
  { status: 'no_show',      label: 'No-show',       icon: '❌', hint: '→ A replanifier' },
  { status: 'a_travailler', label: 'A travailler',   icon: '📧', hint: '→ Mail PI + brochure' },
  { status: 'pre_positif',  label: 'Pré-positif',    icon: '🔥', hint: '→ Mail PI + brochure' },
  { status: 'positif',      label: 'POSITIF',        icon: '🎉', hint: '→ Pré-inscription HubSpot' },
  { status: 'negatif',      label: 'Négatif',        icon: '💀', hint: '→ Rien à faire' },
]

const SOURCE_LABEL: Record<string, string> = {
  telepro: '📞 Placé par télépro',
  prospect: '🌐 Réservé en ligne',
  admin: '⚙️ Placé en admin',
}

const HS_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || ''
const HS_BASE_URL = process.env.NEXT_PUBLIC_HUBSPOT_BASE_URL || 'https://app-eu1.hubspot.com'

const MEETING_TYPE_LABEL: Record<string, { icon: typeof Video; label: string; color: string }> = {
  visio:       { icon: Video,     label: 'Visio',       color: '#6b87ff' },
  telephone:   { icon: PhoneCall, label: 'Téléphone',   color: '#22c55e' },
  presentiel:  { icon: MapPin,    label: 'Présentiel',  color: '#f59e0b' },
}

export default function AppointmentModal({
  appointment,
  onClose,
  onUpdate,
}: {
  appointment: Appointment
  onClose: () => void
  onUpdate: (updated: Partial<Appointment>) => void
}) {
  const [status, setStatus] = useState<AppointmentStatus>(appointment.status)
  const [pendingStatus, setPendingStatus] = useState<AppointmentStatus | null>(null)
  const [notes, setNotes] = useState(appointment.notes || '')
  const [reportSummary, setReportSummary] = useState(appointment.report_summary || '')
  const [reportTelepro, setReportTelepro] = useState(appointment.report_telepro_advice || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reportError, setReportError] = useState(false)
  const [confirmingProspect, setConfirmingProspect] = useState(false)

  // Fix : évite la fermeture accidentelle quand mousedown est sur un bouton
  // et que la souris glisse légèrement sur le backdrop avant le mouseup
  const mouseDownOnBackdrop = useRef(false)

  const start = new Date(appointment.start_at)
  const end = new Date(appointment.end_at)
  const isNonAssigne = status === 'non_assigne'

  const meetingInfo = appointment.meeting_type ? MEETING_TYPE_LABEL[appointment.meeting_type] : null

  const reportFilled = reportSummary.trim().length > 0 && reportTelepro.trim().length > 0
  // Rapport déjà sauvegardé en base (pas besoin de le re-remplir pour changer de statut)
  const reportAlreadySaved = !!(appointment.report_summary?.trim() && appointment.report_telepro_advice?.trim())

  async function updateStatus(newStatus: AppointmentStatus) {
    if (newStatus === status) return
    // Le rapport est obligatoire pour changer le statut (sauf confirme et si déjà sauvegardé)
    if (!reportFilled && !reportAlreadySaved && newStatus !== 'confirme') {
      setPendingStatus(newStatus)
      setReportError(true)
      return
    }
    setReportError(false)
    setPendingStatus(newStatus)
    setSaving(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notes,
          report_summary: reportSummary.trim() || null,
          report_telepro_advice: reportTelepro.trim() || null,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setStatus(newStatus)
        setPendingStatus(null)
        onUpdate(updated)
        setTimeout(() => onClose(), 600)
      } else {
        setPendingStatus(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmProspect() {
    setConfirmingProspect(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirme_prospect' }),
      })
      if (res.ok) {
        const updated = await res.json()
        setStatus('confirme_prospect')
        onUpdate(updated)
      }
    } finally {
      setConfirmingProspect(false)
    }
  }

  async function cancelProspect() {
    setPendingStatus('annule')
    setSaving(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'annule' }),
      })
      if (res.ok) {
        const updated = await res.json()
        setStatus('annule')
        setPendingStatus(null)
        onUpdate(updated)
      } else {
        setPendingStatus(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveAll() {
    // Si un statut est en attente mais le rapport n'est pas complet, bloquer
    if (pendingStatus && !reportFilled) {
      setReportError(true)
      return
    }
    const effectiveStatus = pendingStatus ?? status
    setSaving(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: effectiveStatus,
          notes,
          report_summary: reportSummary.trim() || null,
          report_telepro_advice: reportTelepro.trim() || null,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setStatus(effectiveStatus)
        setPendingStatus(null)
        setReportError(false)
        onUpdate(updated)
        // Fermer le modal après changement de statut
        if (effectiveStatus !== status) {
          setTimeout(() => onClose(), 600)
        } else {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        }
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose()
        mouseDownOnBackdrop.current = false
      }}
    >
      <div style={{
        background: '#1e2130',
        border: '1px solid #2a2d3e',
        borderRadius: 16,
        width: '100%', maxWidth: 580,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #2a2d3e',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 4 }}>
              {appointment.prospect_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8b8fa8', fontSize: 14 }}>
              <Clock size={14} />
              <span>
                {format(start, 'EEEE d MMMM', { locale: fr })} · {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={status} />
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#555870', padding: 4, borderRadius: 8,
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Prospect info */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
              <Mail size={14} style={{ color: '#4f6ef7', flexShrink: 0 }} />
              <span>{appointment.prospect_email}</span>
            </div>
            {appointment.prospect_phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <Phone size={14} style={{ color: '#4f6ef7', flexShrink: 0 }} />
                <span>{appointment.prospect_phone}</span>
              </div>
            )}
            {appointment.formation_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <Tag size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <span>Filière : <strong style={{ color: '#e8eaf0' }}>{appointment.formation_type}</strong></span>
              </div>
            )}
            {appointment.source && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <Zap size={14} style={{ color: '#6b87ff', flexShrink: 0 }} />
                <span>{SOURCE_LABEL[appointment.source] || appointment.source}</span>
              </div>
            )}
            {meetingInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <meetingInfo.icon size={14} style={{ color: meetingInfo.color, flexShrink: 0 }} />
                <span style={{ color: meetingInfo.color, fontWeight: 600 }}>{meetingInfo.label}</span>
                {appointment.meeting_type === 'visio' && appointment.meeting_link && (
                  <a
                    href={appointment.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'rgba(79,110,247,0.12)', border: '1px solid rgba(79,110,247,0.3)',
                      borderRadius: 6, padding: '2px 10px',
                      color: '#6b87ff', fontSize: 12, fontWeight: 600,
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Video size={11} /> Rejoindre
                  </a>
                )}
              </div>
            )}
            {appointment.classe_actuelle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <span style={{ color: '#f59e0b', flexShrink: 0, fontSize: 14 }}>🎓</span>
                <span>Classe actuelle : <strong style={{ color: '#e8eaf0' }}>{appointment.classe_actuelle}</strong></span>
              </div>
            )}
            {appointment.users && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <User size={14} style={{ color: '#4f6ef7', flexShrink: 0 }} />
                <span>Closer : <strong style={{ color: '#e8eaf0' }}>{appointment.users.name}</strong></span>
              </div>
            )}
            {(appointment.hubspot_contact_id || appointment.hubspot_deal_id) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {appointment.hubspot_contact_id && (
                  <a
                    href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/contact/${appointment.hubspot_contact_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: 6, padding: '4px 10px',
                      color: '#f59e0b', fontSize: 12, fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={11} /> Contact HubSpot
                  </a>
                )}
                {appointment.hubspot_deal_id && (
                  <a
                    href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/deal/${appointment.hubspot_deal_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.3)',
                      borderRadius: 6, padding: '4px 10px',
                      color: '#6b87ff', fontSize: 12, fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={11} /> Transaction HubSpot
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Retour prospect — visible si assigné, toujours réversible */}
        {(status === 'confirme' || status === 'confirme_prospect' || status === 'annule') && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #2a2d3e' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Retour prospect
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={confirmProspect}
                disabled={confirmingProspect || saving}
                style={{
                  flex: 1,
                  background: status === 'confirme_prospect' ? 'rgba(16,185,129,0.18)' : 'transparent',
                  border: `1px solid ${status === 'confirme_prospect' ? 'rgba(16,185,129,0.5)' : '#2a2d3e'}`,
                  borderRadius: 8, padding: '9px 14px',
                  color: status === 'confirme_prospect' ? '#10b981' : '#555870',
                  fontSize: 13, fontWeight: status === 'confirme_prospect' ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: confirmingProspect ? 0.7 : 1,
                }}
              >
                ✅ {confirmingProspect ? 'Confirmation…' : 'Prospect confirmé'}
                {status === 'confirme_prospect' && <span style={{ fontSize: 11, marginLeft: 2 }}>✓</span>}
              </button>
              <button
                onClick={cancelProspect}
                disabled={saving || confirmingProspect}
                style={{
                  flex: 1,
                  background: status === 'annule' ? 'rgba(107,114,128,0.18)' : 'transparent',
                  border: `1px solid ${status === 'annule' ? 'rgba(107,114,128,0.5)' : '#2a2d3e'}`,
                  borderRadius: 8, padding: '9px 14px',
                  color: status === 'annule' ? '#9ca3af' : '#555870',
                  fontSize: 13, fontWeight: status === 'annule' ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                🚫 {saving && pendingStatus === 'annule' ? 'Annulation…' : 'Prospect a annulé'}
                {status === 'annule' && <span style={{ fontSize: 11, marginLeft: 2 }}>✓</span>}
              </button>
            </div>
          </div>
        )}

        {/* Status actions — masqué si non-assigné */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Mettre à jour le statut
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {STATUS_ACTIONS.map((action) => {
                const cfg = STATUS_CONFIG[action.status]
                const isSaved = status === action.status
                const isPending = pendingStatus === action.status
                const isHighlighted = isSaved || isPending
                return (
                  <button
                    key={action.status}
                    onClick={() => updateStatus(action.status)}
                    disabled={saving}
                    style={{
                      background: isHighlighted ? cfg.bg : 'transparent',
                      border: `1px solid ${isHighlighted ? cfg.border : '#2a2d3e'}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 13,
                      color: isHighlighted ? cfg.color : '#8b8fa8',
                      fontWeight: isHighlighted ? 600 : 400,
                      transition: 'all 0.15s',
                      textAlign: 'left',
                      opacity: saving && !isPending ? 0.5 : 1,
                    }}
                  >
                    <span>{action.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <span>{action.label}</span>
                      {action.hint && (
                        <span style={{ fontSize: 10, color: isPending || isSaved ? cfg.color : '#555870', fontWeight: 400, opacity: 0.7 }}>{action.hint}</span>
                      )}
                    </div>
                    {isSaved && !isPending && (
                      <span style={{ fontSize: 12, color: cfg.color, marginLeft: 'auto' }}>✓</span>
                    )}
                    {isPending && saving && (
                      <span style={{ fontSize: 11, color: cfg.color, marginLeft: 'auto', opacity: 0.7 }}>…</span>
                    )}
                  </button>
                )
              })}
            </div>
            {saving && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#8b8fa8' }}>
                Synchronisation HubSpot…
              </div>
            )}
            {saved && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e' }}>
                HubSpot mis à jour
              </div>
            )}
          </div>
        )}

        {/* Message si non assigné */}
        {isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e' }}>
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '12px 16px',
              fontSize: 13, color: '#f59e0b',
            }}>
              Ce RDV n&apos;est pas encore assigné à un closer. Allez dans la vue Admin pour l&apos;assigner.
            </div>
          </div>
        )}

        {/* Rapport closer — obligatoire */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: reportError ? '#ef4444' : '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={12} />
              Rapport du RDV *
              {reportError && (
                <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  — Obligatoire avant de changer le statut
                </span>
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#8b8fa8', marginBottom: 4, fontWeight: 600 }}>Résumé du RDV</div>
              <textarea
                value={reportSummary}
                onChange={(e) => { setReportSummary(e.target.value); setReportError(false) }}
                placeholder="Comment s'est passé le RDV ? Motivations du prospect, objections, situation…"
                rows={4}
                style={{
                  width: '100%', background: '#252840',
                  border: `1px solid ${reportError && !reportSummary.trim() ? 'rgba(239,68,68,0.5)' : '#2a2d3e'}`,
                  borderRadius: 8, padding: '12px 14px', color: '#e8eaf0',
                  fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8fa8', marginBottom: 4, fontWeight: 600 }}>Conseil pour le télépro</div>
              <textarea
                value={reportTelepro}
                onChange={(e) => { setReportTelepro(e.target.value); setReportError(false) }}
                placeholder="Retour pour le télépro : qualité du lead, axes d'amélioration, infos manquantes…"
                rows={3}
                style={{
                  width: '100%', background: '#252840',
                  border: `1px solid ${reportError && !reportTelepro.trim() ? 'rgba(239,68,68,0.5)' : '#2a2d3e'}`,
                  borderRadius: 8, padding: '12px 14px', color: '#e8eaf0',
                  fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                }}
              />
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={12} />
            Notes internes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes libres sur ce RDV..."
            rows={4}
            style={{
              width: '100%', background: '#252840', border: '1px solid #2a2d3e',
              borderRadius: 8, padding: '12px 14px', color: '#e8eaf0',
              fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
          <button
            onClick={saveAll}
            disabled={saving}
            style={{
              marginTop: 8, background: '#4f6ef7', color: 'white',
              border: 'none', borderRadius: 8, padding: '8px 16px',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}
