'use client'

import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { X, Clock, User, Mail, Phone, FileText, ExternalLink, Tag, Zap, Video, MapPin, PhoneCall, RefreshCw, Sparkles, ChevronLeft } from 'lucide-react'
import StatusBadge, { AppointmentStatus, STATUS_CONFIG } from './StatusBadge'
import { AssignCloserPanel } from './AssignModal'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { personalizeVisioUrl, firstNameOf } from '@/lib/visio-url'
import MeetingModeSwitcher from './MeetingModeSwitcher'
import { formatAppointmentSourceLabel } from '@/lib/appointment-display'

const JitsiMeeting = lazy(() => import('./JitsiMeeting'))

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
  negatif_reason?: string | null
  negatif_reason_detail?: string | null
  interlocuteur_principal?: string | null
  consigne_text?: string | null
  consigne_echeance?: string | null
  consigne_rien_a_faire?: boolean | null
  contexte_concurrence?: string | null
  financement?: string | null
  jpo_invitation?: string | null
  users?: { id: string; name: string; avatar_color: string; slug: string }
  telepro?: { id: string; name: string; avatar_color?: string | null } | null
  sms_confirmed_at?: string | null
  email_parent?: string | null
  phone_parent?: string | null
}

const STATUS_ACTIONS: { status: AppointmentStatus; label: string; icon: string; hint?: string }[] = [
  { status: 'no_show',      label: 'No-show',       icon: '❌', hint: '→ A replanifier' },
  { status: 'a_travailler', label: 'A travailler',   icon: '📧', hint: '→ Mail PI + brochure' },
  { status: 'pre_positif',  label: 'Pré-positif',    icon: '🔥', hint: '→ Mail PI + brochure' },
  { status: 'positif',      label: 'POSITIF',        icon: '🎉', hint: '→ Pré-inscription HubSpot' },
  { status: 'negatif',      label: 'Négatif',        icon: '💀', hint: '→ Rien à faire' },
]

const SOURCE_LABEL: Record<string, string> = {
  prospect: '🌐 Réservé en ligne',
  admin: '⚙️ Placé en admin',
}

const MEETING_TYPE_LABEL: Record<string, { icon: typeof Video; label: string; color: string }> = {
  visio:       { icon: Video,     label: 'Visio',       color: '#C9A84C' },
  telephone:   { icon: PhoneCall, label: 'Téléphone',   color: '#22c55e' },
  presentiel:  { icon: MapPin,    label: 'Présentiel',  color: '#C9A84C' },
}

function isGoogleMeetLink(link: string | null | undefined): boolean {
  return /meet\.google\.com/i.test(link || '')
}

function isInternalVisioLink(link: string | null | undefined): boolean {
  return /\/visio\//i.test(link || '')
}

/** Ouvre le bon outil visio selon le type de lien (Meet externe vs visio interne vs Jitsi legacy). */
function openVisioLink(link: string, onJitsi: () => void): void {
  if (isGoogleMeetLink(link) || isInternalVisioLink(link)) {
    window.open(link, '_blank', 'noopener,noreferrer')
    return
  }
  onJitsi()
}

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y, m - 1, day, hh, mm, 0, 0)
}

const scheduleInputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5ddc8',
  borderRadius: 8,
  padding: '6px 10px',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

export default function AppointmentModal({
  appointment,
  onClose,
  onUpdate,
  onDelete,
  adminMode = false,
  canAssign = false,
}: {
  appointment: Appointment
  onClose: () => void
  onUpdate: (updated: Partial<Appointment>) => void
  onDelete?: (id: string) => void
  adminMode?: boolean
  canAssign?: boolean
}) {
  // Admin ou closer autorisé à (ré)assigner le RDV à un closer.
  const showAssign = adminMode || canAssign
  const [status, setStatus] = useState<AppointmentStatus>(appointment.status)
  const [pendingStatus, setPendingStatus] = useState<AppointmentStatus | null>(null)
  const [notes, setNotes] = useState(appointment.notes || '')
  const [reportSummary, setReportSummary] = useState(appointment.report_summary || '')
  const [reportTelepro, setReportTelepro] = useState(appointment.report_telepro_advice || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reportError, setReportError] = useState(false)
  const [confirmingProspect, setConfirmingProspect] = useState(false)
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [showJitsi, setShowJitsi] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [studentLinkCopied, setStudentLinkCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // New closer report fields
  const [negatifReason, setNegatifReason] = useState<string | null>(appointment.negatif_reason || null)
  const [negatifReasonDetail, setNegatifReasonDetail] = useState<string[]>(
    appointment.negatif_reason === 'inscrit_autre_prepa' && appointment.negatif_reason_detail
      ? JSON.parse(appointment.negatif_reason_detail) : []
  )
  const [negatifAutreText, setNegatifAutreText] = useState(
    appointment.negatif_reason === 'autre' ? (appointment.negatif_reason_detail || '') : ''
  )
  const [negatifError, setNegatifError] = useState(false)
  const [interlocuteur, setInterlocuteur] = useState<string | null>(appointment.interlocuteur_principal || null)
  const [consigneText, setConsigneText] = useState(appointment.consigne_text || '')
  const [consigneEcheance, setConsigneEcheance] = useState(appointment.consigne_echeance || '')
  const [consigneRienAFaire, setConsigneRienAFaire] = useState(appointment.consigne_rien_a_faire || false)
  const [contexteConcurrence, setContexteConcurrence] = useState<string | null>(appointment.contexte_concurrence || null)
  const [financement, setFinancement] = useState<string | null>(appointment.financement || null)
  const [jpoInvitation, setJpoInvitation] = useState<string | null>(appointment.jpo_invitation || null)
  const [emailParent, setEmailParent] = useState(appointment.email_parent || '')
  const [phoneParent, setPhoneParent] = useState(appointment.phone_parent || '')

  // Fix : évite la fermeture accidentelle quand mousedown est sur un bouton
  // et que la souris glisse légèrement sur le backdrop avant le mouseup
  const mouseDownOnBackdrop = useRef(false)

  const start = new Date(appointment.start_at)
  const end = new Date(appointment.end_at)
  const [rdvDate, setRdvDate] = useState(() => toDateInputValue(start))
  const [rdvStartTime, setRdvStartTime] = useState(() => toTimeInputValue(start))
  const [rdvEndTime, setRdvEndTime] = useState(() => toTimeInputValue(end))
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)
  const [rescheduleSaving, setRescheduleSaving] = useState(false)
  const [rescheduleOk, setRescheduleOk] = useState(false)

  useEffect(() => {
    const s = new Date(appointment.start_at)
    const e = new Date(appointment.end_at)
    setRdvDate(toDateInputValue(s))
    setRdvStartTime(toTimeInputValue(s))
    setRdvEndTime(toTimeInputValue(e))
    setRescheduleError(null)
    setRescheduleOk(false)
  }, [appointment.start_at, appointment.end_at])

  // Pré-remplit les coordonnées parent depuis la fiche contact si absentes sur le RDV.
  useEffect(() => {
    if (!appointment.hubspot_contact_id) return
    const needEmail = !appointment.email_parent
    const needPhone = !appointment.phone_parent
    if (!needEmail && !needPhone) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/crm/contacts/${appointment.hubspot_contact_id}/details?phase=core`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        const raw = (data.contact?.hubspot_raw ?? {}) as Record<string, unknown>
        if (needEmail) {
          const email = raw.email_parent
          if (typeof email === 'string' && email.trim()) setEmailParent(email.trim())
        }
        if (needPhone) {
          const phone = raw.telephone_parent ?? raw.telephone_du_responsable_legal_1
          if (typeof phone === 'string' && phone.trim()) setPhoneParent(phone.trim())
        }
      } catch {
        // best-effort
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.hubspot_contact_id, appointment.email_parent, appointment.phone_parent])

  const displayStart = combineDateAndTime(rdvDate, rdvStartTime)
  const displayEnd = combineDateAndTime(rdvDate, rdvEndTime)
  const hasScheduleChange =
    displayStart.getTime() !== start.getTime() ||
    displayEnd.getTime() !== end.getTime()
  const isNonAssigne = status === 'non_assigne'

  const meetingInfo = appointment.meeting_type ? MEETING_TYPE_LABEL[appointment.meeting_type] : null

  const reportFilled = reportSummary.trim().length > 0 && reportTelepro.trim().length > 0
  // Rapport déjà sauvegardé en base (pas besoin de le re-remplir pour changer de statut)
  const reportAlreadySaved = !!(appointment.report_summary?.trim() && appointment.report_telepro_advice?.trim())

  function buildExtraFields() {
    return {
      negatif_reason: negatifReason,
      negatif_reason_detail: negatifReason === 'inscrit_autre_prepa'
        ? JSON.stringify(negatifReasonDetail)
        : negatifReason === 'autre' ? negatifAutreText : null,
      interlocuteur_principal: interlocuteur,
      consigne_text: consigneText.trim() || null,
      consigne_echeance: consigneRienAFaire ? null : consigneEcheance || null,
      consigne_rien_a_faire: consigneRienAFaire,
      contexte_concurrence: contexteConcurrence,
      financement,
      jpo_invitation: jpoInvitation,
    }
  }

  async function updateStatus(newStatus: AppointmentStatus) {
    if (newStatus === status) return
    // Le rapport est obligatoire pour changer le statut (sauf confirme et si déjà sauvegardé)
    if (!reportFilled && !reportAlreadySaved && newStatus !== 'confirme') {
      setPendingStatus(newStatus)
      setReportError(true)
      return
    }
    // Raison négatif obligatoire
    if (newStatus === 'negatif' && !negatifReason) {
      setPendingStatus(newStatus)
      setNegatifError(true)
      return
    }
    setReportError(false)
    setNegatifError(false)
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
          email_parent: emailParent.trim() || null,
          phone_parent: phoneParent.trim() || null,
          ...buildExtraFields(),
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

  async function resetToConfirme() {
    setSaving(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirme' }),
      })
      if (res.ok) {
        const updated = await res.json()
        setStatus('confirme')
        onUpdate(updated)
      }
    } finally {
      setSaving(false)
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

  async function saveReschedule() {
    if (!hasScheduleChange) return
    if (displayEnd <= displayStart) {
      setRescheduleError('L\'heure de fin doit être après l\'heure de début.')
      return
    }
    setRescheduleSaving(true)
    setRescheduleError(null)
    setRescheduleOk(false)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_at: displayStart.toISOString(),
          end_at: displayEnd.toISOString(),
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated)
        setRescheduleOk(true)
        setTimeout(() => setRescheduleOk(false), 3000)
      } else {
        const data = await res.json().catch(() => ({}))
        setRescheduleError(data.error || 'Impossible de modifier le créneau')
      }
    } finally {
      setRescheduleSaving(false)
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
          email_parent: emailParent.trim() || null,
          phone_parent: phoneParent.trim() || null,
          ...buildExtraFields(),
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

  async function deleteAppointment() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}?hard=true`, {
        method: 'DELETE',
      })
      if (res.ok) {
        onDelete?.(appointment.id)
        onClose()
      } else {
        setDeleting(false)
        setConfirmDelete(false)
      }
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
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
        background: '#ffffff',
        border: '1px solid #e5ddc8',
        borderRadius: 16,
        width: '100%', maxWidth: 580,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        ...(showReassignModal ? {} : { overflowY: 'auto' as const }),
      }}>
        {showReassignModal ? (
          <>
            {/* Vue réassignation — intégrée dans la même modale CRM */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e5ddc8',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'none', border: 'none', padding: 0, marginBottom: 8,
                    color: '#C9A84C', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <ChevronLeft size={14} />
                  Retour au RDV
                </button>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  {appointment.users ? '🔄 Réassigner le closer' : 'Assigner le closer'}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                  {appointment.prospect_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4a6070', fontSize: 13, marginTop: 4 }}>
                  <Clock size={13} />
                  <span>
                    {format(displayStart, 'EEEE d MMMM', { locale: fr })} · {format(displayStart, 'HH:mm')} – {format(displayEnd, 'HH:mm')}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#4a6070', padding: 4, borderRadius: 8,
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                }}
              >
                <X size={18} />
              </button>
            </div>
            <AssignCloserPanel
              appointment={appointment}
              showMeta={false}
              reassign={!!appointment.users}
              currentCloserId={appointment.users?.id ?? null}
              onCancel={() => setShowReassignModal(false)}
              onAssigned={(updated) => {
                onUpdate(updated as Partial<Appointment>)
                setShowReassignModal(false)
              }}
            />
          </>
        ) : (
        <>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5ddc8',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              {appointment.prospect_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4a6070', fontSize: 14 }}>
              <Clock size={14} />
              <span>
                {format(displayStart, 'EEEE d MMMM', { locale: fr })} · {format(displayStart, 'HH:mm')} – {format(displayEnd, 'HH:mm')}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={status} />
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#4a6070', padding: 4, borderRadius: 8,
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Prospect info */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Date et heure modifiables */}
            <div style={{
              background: '#f7f4ee',
              border: '1px solid #e5ddc8',
              borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#4a6070',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
              }}>
                Date et heure du RDV
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Clock size={14} style={{ color: '#C9A84C', flexShrink: 0 }} />
                <input
                  type="date"
                  value={rdvDate}
                  onChange={e => { setRdvDate(e.target.value); setRescheduleError(null); setRescheduleOk(false) }}
                  style={scheduleInputStyle}
                />
                <input
                  type="time"
                  value={rdvStartTime}
                  onChange={e => { setRdvStartTime(e.target.value); setRescheduleError(null); setRescheduleOk(false) }}
                  style={scheduleInputStyle}
                />
                <span style={{ color: '#94a3b8', fontSize: 13 }}>–</span>
                <input
                  type="time"
                  value={rdvEndTime}
                  onChange={e => { setRdvEndTime(e.target.value); setRescheduleError(null); setRescheduleOk(false) }}
                  style={scheduleInputStyle}
                />
                {hasScheduleChange && (
                  <button
                    type="button"
                    onClick={saveReschedule}
                    disabled={rescheduleSaving}
                    style={{
                      background: '#C9A84C',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 12px',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: rescheduleSaving ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: rescheduleSaving ? 0.7 : 1,
                    }}
                  >
                    {rescheduleSaving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                {format(displayStart, 'EEEE d MMMM yyyy', { locale: fr })} · {format(displayStart, 'HH:mm')} – {format(displayEnd, 'HH:mm')}
              </div>
              {rescheduleError && (
                <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6, fontWeight: 600 }}>
                  {rescheduleError}
                </div>
              )}
              {rescheduleOk && (
                <div style={{ fontSize: 12, color: '#15803d', marginTop: 6, fontWeight: 600 }}>
                  Créneau mis à jour — confirmation envoyée au prospect
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
              <Mail size={14} style={{ color: '#C9A84C', flexShrink: 0 }} />
              <span>{appointment.prospect_email}</span>
            </div>
            {appointment.prospect_phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
                <Phone size={14} style={{ color: '#C9A84C', flexShrink: 0 }} />
                <span>{appointment.prospect_phone}</span>
              </div>
            )}
            {appointment.formation_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
                <Tag size={14} style={{ color: '#C9A84C', flexShrink: 0 }} />
                <span>Filière : <strong style={{ color: '#0f172a' }}>{appointment.formation_type}</strong></span>
              </div>
            )}
            {appointment.source && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
                <Zap size={14} style={{ color: '#C9A84C', flexShrink: 0 }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {appointment.source === 'telepro'
                    ? formatAppointmentSourceLabel('telepro', appointment.telepro?.name)
                    : (SOURCE_LABEL[appointment.source] || appointment.source)}
                  {appointment.source === 'telepro' && appointment.telepro?.avatar_color && (
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: appointment.telepro.avatar_color,
                      flexShrink: 0, display: 'inline-block',
                    }} />
                  )}
                </span>
              </div>
            )}
            {appointment.sms_confirmed_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.35)',
                  borderRadius: 8, padding: '3px 10px',
                  fontSize: 12, fontWeight: 700, color: '#10b981',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  📱 Confirmé via SMS — {format(new Date(appointment.sms_confirmed_at), "d MMM 'à' HH'h'mm", { locale: fr })}
                </span>
              </div>
            )}
            {meetingInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
                <meetingInfo.icon size={14} style={{ color: meetingInfo.color, flexShrink: 0 }} />
                <span style={{ color: meetingInfo.color, fontWeight: 600 }}>{meetingInfo.label}</span>
                {appointment.meeting_type === 'visio' && appointment.meeting_link && (() => {
                  const rawLink = appointment.meeting_link
                  const isGoogle = isGoogleMeetLink(rawLink)
                  const isInternal = isInternalVisioLink(rawLink)
                  // Notre lien : pré-rempli avec le nom du closer (sinon "Admissions")
                  const myName = appointment.users?.name || 'Admissions Diploma'
                  const link = isInternal ? personalizeVisioUrl(rawLink, firstNameOf(myName)) : rawLink
                  // Lien élève : pré-rempli avec le prénom du prospect
                  const studentLink = isInternal
                    ? personalizeVisioUrl(rawLink, firstNameOf(appointment.prospect_name))
                    : rawLink
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => openVisioLink(link, () => setShowJitsi(true))}
                        style={{
                          background: isGoogle
                            ? 'rgba(26,115,232,0.12)'
                            : 'rgba(204,172,113,0.12)',
                          border: isGoogle
                            ? '1px solid rgba(26,115,232,0.35)'
                            : '1px solid rgba(204,172,113,0.3)',
                          borderRadius: 6,
                          padding: '2px 10px',
                          color: isGoogle ? '#1a73e8' : '#C9A84C',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontFamily: 'inherit',
                        }}
                      >
                        <Video size={11} />
                        {isGoogle
                          ? 'Rejoindre Google Meet'
                          : isInternal
                            ? 'Rejoindre la visio'
                            : 'Rejoindre (IA activée)'}
                        {(isGoogle || isInternal) && <ExternalLink size={10} />}
                      </button>
                      {isInternal && (
                        <button
                          type="button"
                          title="Copier le lien à envoyer à l'élève (son prénom se remplit automatiquement)"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(studentLink)
                              setStudentLinkCopied(true)
                              setTimeout(() => setStudentLinkCopied(false), 2000)
                            } catch { /* clipboard indisponible */ }
                          }}
                          style={{
                            background: studentLinkCopied ? 'rgba(16,185,129,0.12)' : 'rgba(15,23,42,0.06)',
                            border: studentLinkCopied ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(15,23,42,0.15)',
                            borderRadius: 6,
                            padding: '2px 10px',
                            color: studentLinkCopied ? '#0e8a5f' : '#475569',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: 'inherit',
                          }}
                        >
                          {studentLinkCopied ? '✓ Lien élève copié' : '📋 Copier le lien élève'}
                        </button>
                      )}
                    </>
                  )
                })()}
                <MeetingModeSwitcher
                  appointmentId={appointment.id}
                  meetingType={appointment.meeting_type}
                  meetingLink={appointment.meeting_link}
                  status={status}
                  disabled={saving}
                  onUpdated={(updated) => onUpdate(updated)}
                />
              </div>
            )}
            {appointment.classe_actuelle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
                <span style={{ color: '#C9A84C', flexShrink: 0, fontSize: 14 }}>🎓</span>
                <span>Classe actuelle : <strong style={{ color: '#0f172a' }}>{appointment.classe_actuelle}</strong></span>
              </div>
            )}
            {appointment.users && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
                <User size={14} style={{ color: '#C9A84C', flexShrink: 0 }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Closer :
                  {appointment.users.avatar_color && (
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: appointment.users.avatar_color,
                      flexShrink: 0, display: 'inline-block',
                    }} />
                  )}
                  <strong style={{ color: '#0f172a' }}>{appointment.users.name}</strong>
                </span>
                {showAssign && (
                  <button
                    onClick={() => setShowReassignModal(true)}
                    style={{
                      marginLeft: 4,
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)',
                      borderRadius: 6, padding: '2px 8px',
                      color: '#C9A84C', fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <RefreshCw size={10} />
                    Réassigner
                  </button>
                )}
              </div>
            )}
            {showAssign && !appointment.users && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#4a6070' }}>
                <User size={14} style={{ color: '#C9A84C', flexShrink: 0 }} />
                <span style={{ color: '#4a6070' }}>Aucun closer assigné</span>
                <button
                  onClick={() => setShowReassignModal(true)}
                  style={{
                    marginLeft: 4,
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)',
                    borderRadius: 6, padding: '2px 8px',
                    color: '#C9A84C', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <User size={10} />
                  Assigner
                </button>
              </div>
            )}
            {(appointment.hubspot_contact_id || appointment.hubspot_deal_id) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {appointment.hubspot_contact_id && (
                  <a
                    href={`/admin/crm/contacts/${appointment.hubspot_contact_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)',
                      borderRadius: 6, padding: '4px 10px',
                      color: '#C9A84C', fontSize: 12, fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={11} /> Ouvrir le contact
                  </a>
                )}
                {appointment.hubspot_deal_id && (
                  <a
                    href={`/admin/crm/deals/${appointment.hubspot_deal_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)',
                      borderRadius: 6, padding: '4px 10px',
                      color: '#C9A84C', fontSize: 12, fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={11} /> Ouvrir la transaction
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Retour prospect — visible si assigné, toujours réversible */}
        {(status === 'confirme' || status === 'confirme_prospect' || status === 'annule') && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Retour prospect
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={confirmProspect}
                disabled={confirmingProspect || saving}
                style={{
                  flex: 1,
                  background: status === 'confirme_prospect' ? 'rgba(16,185,129,0.18)' : 'transparent',
                  border: `1px solid ${status === 'confirme_prospect' ? 'rgba(16,185,129,0.5)' : '#e5ddc8'}`,
                  borderRadius: 8, padding: '9px 14px',
                  color: status === 'confirme_prospect' ? '#10b981' : '#4a6070',
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
                  border: `1px solid ${status === 'annule' ? 'rgba(107,114,128,0.5)' : '#e5ddc8'}`,
                  borderRadius: 8, padding: '9px 14px',
                  color: status === 'annule' ? '#9ca3af' : '#4a6070',
                  fontSize: 13, fontWeight: status === 'annule' ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                🚫 {saving && pendingStatus === 'annule' ? 'Annulation…' : 'Prospect a annulé'}
                {status === 'annule' && <span style={{ fontSize: 11, marginLeft: 2 }}>✓</span>}
              </button>
            </div>
            {(status === 'confirme_prospect' || status === 'annule') && (
              <button
                onClick={resetToConfirme}
                disabled={saving || confirmingProspect}
                style={{
                  marginTop: 8, background: 'none', border: 'none',
                  color: '#4a6070', fontSize: 11, cursor: 'pointer',
                  textDecoration: 'underline', padding: 0,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                ⏳ Remettre en attente de confirmation
              </button>
            )}
          </div>
        )}

        {/* Status actions — masqué si non-assigné */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
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
                      border: `1px solid ${isHighlighted ? cfg.border : '#e5ddc8'}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 13,
                      color: isHighlighted ? cfg.color : '#4a6070',
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
                        <span style={{ fontSize: 10, color: isPending || isSaved ? cfg.color : '#4a6070', fontWeight: 400, opacity: 0.8 }}>{action.hint}</span>
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
              <div style={{ marginTop: 8, fontSize: 12, color: '#4a6070' }}>
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
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{
              background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.2)',
              borderRadius: 10, padding: '12px 16px',
              fontSize: 13, color: '#C9A84C',
            }}>
              Ce RDV n&apos;est pas encore assigné à un closer. Allez dans la vue Admin pour l&apos;assigner.
            </div>
          </div>
        )}

        {/* Section: Raison négatif — visible si statut négatif ou en attente */}
        {!isNonAssigne && (status === 'negatif' || pendingStatus === 'negatif') && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: negatifError ? '#ef4444' : '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              💀 Raison du négatif *
              {negatifError && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> — Obligatoire</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                { value: 'inscrit_autre_prepa', label: 'Inscrit autre prépa' },
                { value: 'pas_les_moyens', label: 'Pas les moyens (potentiel medibox)' },
                { value: 'reorientation', label: 'Réorientation' },
                { value: 'autre', label: 'Autre (préciser)' },
              ] as const).map(opt => {
                const selected = negatifReason === opt.value
                return (
                  <div key={opt.value}>
                    <button
                      onClick={() => { setNegatifReason(opt.value); setNegatifError(false) }}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: selected ? 'rgba(239,68,68,0.1)' : 'transparent',
                        border: `1px solid ${selected ? 'rgba(239,68,68,0.4)' : negatifError ? 'rgba(239,68,68,0.3)' : '#e5ddc8'}`,
                        borderRadius: 8, padding: '9px 14px',
                        color: selected ? '#ef4444' : '#4a6070',
                        fontSize: 13, fontWeight: selected ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                    {/* Sub-options: autre prépa checkboxes */}
                    {selected && opt.value === 'inscrit_autre_prepa' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: 12 }}>
                        {['Stan/Laennec', 'Antemed-Epsilon', 'Medisup Sciences', 'CPCM'].map(prepa => {
                          const checked = negatifReasonDetail.includes(prepa)
                          return (
                            <button key={prepa} onClick={() => {
                              setNegatifReasonDetail(prev => checked ? prev.filter(p => p !== prepa) : [...prev, prepa])
                            }} style={{
                              background: checked ? 'rgba(239,68,68,0.15)' : '#f7f4ee',
                              border: `1px solid ${checked ? 'rgba(239,68,68,0.4)' : '#e5ddc8'}`,
                              borderRadius: 6, padding: '5px 10px',
                              color: checked ? '#ef4444' : '#4a6070',
                              fontSize: 11, fontWeight: checked ? 600 : 400, cursor: 'pointer',
                            }}>
                              {checked ? '✓ ' : ''}{prepa}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {/* Sub-option: autre texte libre */}
                    {selected && opt.value === 'autre' && (
                      <input
                        value={negatifAutreText}
                        onChange={e => setNegatifAutreText(e.target.value)}
                        placeholder="Préciser la raison…"
                        style={{
                          width: '100%', marginTop: 6, background: '#f7f4ee', border: '1px solid #e5ddc8',
                          borderRadius: 8, padding: '8px 12px', color: '#0f172a', fontSize: 13,
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Section: Interlocuteur principal */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              👤 Interlocuteur principal
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: interlocuteur ? 10 : 0 }}>
              {(['parent', 'etudiant'] as const).map(val => {
                const selected = interlocuteur === val
                return (
                  <button key={val} onClick={() => setInterlocuteur(val)} style={{
                    flex: 1, background: selected ? 'rgba(204,172,113,0.12)' : 'transparent',
                    border: `1px solid ${selected ? 'rgba(204,172,113,0.4)' : '#e5ddc8'}`,
                    borderRadius: 8, padding: '9px 14px',
                    color: selected ? '#C9A84C' : '#4a6070',
                    fontSize: 13, fontWeight: selected ? 600 : 400, cursor: 'pointer',
                  }}>
                    {val === 'parent' ? '👨‍👩‍👧 Parent' : '🎓 Étudiant'}
                  </button>
                )
              })}
            </div>
            {interlocuteur && (
              <div style={{ background: '#f7f4ee', border: '1px solid #e5ddc8', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#4a6070', marginBottom: 6, fontWeight: 600 }}>
                  {interlocuteur === 'parent' ? 'Consigne pour Pascal' : 'Consigne pour le télépro'}
                </div>
                <input
                  value={consigneText}
                  onChange={e => setConsigneText(e.target.value)}
                  placeholder="Décrire la consigne…"
                  style={{
                    width: '100%', background: '#ffffff', border: '1px solid #e5ddc8',
                    borderRadius: 8, padding: '8px 12px', color: '#0f172a', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 8,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!consigneRienAFaire && (
                    <>
                      <div style={{ fontSize: 11, color: '#4a6070', fontWeight: 600 }}>Échéance :</div>
                      <input
                        type="date"
                        value={consigneEcheance}
                        onChange={e => setConsigneEcheance(e.target.value)}
                        style={{
                          background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8,
                          padding: '6px 10px', color: '#0f172a', fontSize: 12, outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </>
                  )}
                  <button
                    onClick={() => { setConsigneRienAFaire(!consigneRienAFaire); if (!consigneRienAFaire) setConsigneEcheance('') }}
                    style={{
                      background: consigneRienAFaire ? 'rgba(107,114,128,0.2)' : 'transparent',
                      border: `1px solid ${consigneRienAFaire ? 'rgba(107,114,128,0.4)' : '#e5ddc8'}`,
                      borderRadius: 6, padding: '5px 10px',
                      color: consigneRienAFaire ? '#9ca3af' : '#4a6070',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {consigneRienAFaire ? '✓ ' : ''}Rien à faire
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section: Contexte concurrence */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              🏆 Contexte concurrence
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                { value: 'bien_renseignee', label: 'Bien renseignée ou va le faire' },
                { value: 'peu_renseignee', label: 'Peu renseignée ou va pas trop regarder' },
                { value: 'pas_renseignee', label: 'Pas renseignée' },
              ] as const).map(opt => {
                const selected = contexteConcurrence === opt.value
                return (
                  <button key={opt.value} onClick={() => setContexteConcurrence(opt.value)} style={{
                    textAlign: 'left', background: selected ? 'rgba(204,172,113,0.1)' : 'transparent',
                    border: `1px solid ${selected ? 'rgba(204,172,113,0.4)' : '#e5ddc8'}`,
                    borderRadius: 8, padding: '9px 14px',
                    color: selected ? '#C9A84C' : '#4a6070',
                    fontSize: 13, fontWeight: selected ? 600 : 400, cursor: 'pointer',
                  }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Section: Financement */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              💰 Financement
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'pas_de_probleme', label: 'Pas de problème' },
                { value: 'potentiel_blocage', label: 'Potentiel blocage financier' },
              ] as const).map(opt => {
                const selected = financement === opt.value
                return (
                  <button key={opt.value} onClick={() => setFinancement(opt.value)} style={{
                    flex: 1, background: selected ? (opt.value === 'pas_de_probleme' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)') : 'transparent',
                    border: `1px solid ${selected ? (opt.value === 'pas_de_probleme' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)') : '#e5ddc8'}`,
                    borderRadius: 8, padding: '9px 14px',
                    color: selected ? (opt.value === 'pas_de_probleme' ? '#22c55e' : '#ef4444') : '#4a6070',
                    fontSize: 13, fontWeight: selected ? 600 : 400, cursor: 'pointer',
                  }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Section: JPO */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              🎓 Inviter à la prochaine JPO
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'oui', label: 'Oui' },
                { value: 'pas_besoin', label: 'Pas besoin' },
              ] as const).map(opt => {
                const selected = jpoInvitation === opt.value
                return (
                  <button key={opt.value} onClick={() => setJpoInvitation(opt.value)} style={{
                    flex: 1, background: selected ? 'rgba(204,172,113,0.12)' : 'transparent',
                    border: `1px solid ${selected ? 'rgba(204,172,113,0.4)' : '#e5ddc8'}`,
                    borderRadius: 8, padding: '9px 14px',
                    color: selected ? '#C9A84C' : '#4a6070',
                    fontSize: 13, fontWeight: selected ? 600 : 400, cursor: 'pointer',
                  }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Rapport closer — obligatoire */}
        {!isNonAssigne && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5ddc8' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: reportError ? '#ef4444' : '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={12} />
              Rapport du RDV *
              {reportError && (
                <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  — Obligatoire avant de changer le statut
                </span>
              )}
            </div>
            {aiGenerated && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
                borderRadius: 8, padding: '6px 12px',
              }}>
                <Sparkles size={14} style={{ color: '#8b5cf6' }} />
                <span style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>
                  Rapport pré-rempli par l&apos;IA — vous pouvez le modifier avant de valider
                </span>
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#4a6070', marginBottom: 4, fontWeight: 600 }}>Résumé du RDV</div>
              <textarea
                value={reportSummary}
                onChange={(e) => { setReportSummary(e.target.value); setReportError(false) }}
                placeholder="Comment s'est passé le RDV ? Motivations du prospect, objections, situation…"
                rows={4}
                style={{
                  width: '100%', background: '#f7f4ee',
                  border: `1px solid ${reportError && !reportSummary.trim() ? 'rgba(239,68,68,0.5)' : '#e5ddc8'}`,
                  borderRadius: 8, padding: '12px 14px', color: '#0f172a',
                  fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#4a6070', marginBottom: 4, fontWeight: 600 }}>Conseil pour le télépro</div>
              <textarea
                value={reportTelepro}
                onChange={(e) => { setReportTelepro(e.target.value); setReportError(false) }}
                placeholder="Retour pour le télépro : qualité du lead, axes d'amélioration, infos manquantes…"
                rows={3}
                style={{
                  width: '100%', background: '#f7f4ee',
                  border: `1px solid ${reportError && !reportTelepro.trim() ? 'rgba(239,68,68,0.5)' : '#e5ddc8'}`,
                  borderRadius: 8, padding: '12px 14px', color: '#0f172a',
                  fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                }}
              />
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e5ddc8' }}>
              <div style={{ fontSize: 11, color: '#4a6070', marginBottom: 8, fontWeight: 600 }}>
                Coordonnées parent <span style={{ fontWeight: 400, textTransform: 'none' }}>(facultatif)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Mail size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
                  <input
                    type="email"
                    value={emailParent}
                    onChange={(e) => setEmailParent(e.target.value)}
                    placeholder="Email parent"
                    style={{
                      flex: 1, background: '#f7f4ee', border: '1px solid #e5ddc8',
                      borderRadius: 8, padding: '8px 12px', color: '#0f172a',
                      fontSize: 13, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Phone size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
                  <input
                    type="tel"
                    value={phoneParent}
                    onChange={(e) => setPhoneParent(e.target.value)}
                    placeholder="Numéro parent"
                    style={{
                      flex: 1, background: '#f7f4ee', border: '1px solid #e5ddc8',
                      borderRadius: 8, padding: '8px 12px', color: '#0f172a',
                      fontSize: 13, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={12} />
            Notes internes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes libres sur ce RDV..."
            rows={4}
            style={{
              width: '100%', background: '#f7f4ee', border: '1px solid #e5ddc8',
              borderRadius: 8, padding: '12px 14px', color: '#0f172a',
              fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
          <button
            onClick={saveAll}
            disabled={saving}
            style={{
              marginTop: 8, background: '#C9A84C', color: '#0e1e35',
              border: 'none', borderRadius: 8, padding: '8px 16px',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>

        {/* Zone danger — suppression définitive du RDV (admin/agenda uniquement) */}
        {onDelete && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e5ddc8' }}>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8, padding: '8px 14px',
                  color: '#ef4444', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                🗑️ Supprimer le RDV
              </button>
            ) : (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, marginBottom: 4 }}>
                  Supprimer définitivement ce RDV ?
                </div>
                <div style={{ fontSize: 12, color: '#4a6070', marginBottom: 12 }}>
                  Cette action est irréversible. Le RDV disparaîtra de l&apos;agenda.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={deleteAppointment}
                    disabled={deleting}
                    style={{
                      background: '#ef4444', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '8px 16px',
                      cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      opacity: deleting ? 0.7 : 1, fontFamily: 'inherit',
                    }}
                  >
                    {deleting ? 'Suppression…' : 'Oui, supprimer'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    style={{
                      background: 'transparent', border: '1px solid #e5ddc8',
                      borderRadius: 8, padding: '8px 16px',
                      color: '#4a6070', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </div>

    {showJitsi && appointment.meeting_link && (
      <Suspense fallback={null}>
        <JitsiMeeting
          meetingLink={appointment.meeting_link}
          appointmentId={appointment.id}
          onClose={() => setShowJitsi(false)}
          onReportGenerated={(summary, advice) => {
            setReportSummary(summary)
            setReportTelepro(advice)
            setAiGenerated(true)
            onUpdate({ report_summary: summary, report_telepro_advice: advice })
          }}
        />
      </Suspense>
    )}
    </>
  )
}
