'use client'

import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import {
  User, Mail, Phone, FileText, Tag, Zap, RefreshCw, Sparkles, ChevronLeft,
  Calendar, CalendarClock, Check, CheckCircle2, Ban, Hourglass, Smartphone, GraduationCap, UserX, Flame, PartyPopper,
  ThumbsDown, UsersRound, Trophy, Wallet, Trash2, Briefcase, type LucideIcon,
} from 'lucide-react'
import { AppointmentStatus, STATUS_CONFIG } from './StatusBadge'
import { AssignCloserPanel } from './AssignModal'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import RdvModeBlock from './RdvModeBlock'
import { CrmV2CloseButton } from './crm-v2/primitives'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2, crmV2Outcomes } from '@/lib/crm-v2-theme'
import VisioParticipantsBlock from './VisioParticipantsBlock'
import { appointmentPlacedByTelepro, formatAppointmentPlacementLabel } from '@/lib/appointment-display'
import MediboxBadge from './MediboxBadge'
import { RDV_BRANDS, RDV_BRAND_IDS, normalizeRdvBrand, type RdvBrand } from '@/lib/rdv-brand'
import type { ExtraParticipant } from '@/lib/appointment-participants'

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
  brand?: string | null
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
  telepro_id?: string | null
  telepro?: { id: string; name: string; avatar_color?: string | null } | null
  sms_confirmed_at?: string | null
  email_parent?: string | null
  phone_parent?: string | null
  extra_participants?: ExtraParticipant[] | null
}

const STATUS_ACTIONS: { status: AppointmentStatus; label: string; icon: LucideIcon; color: string; hint?: string }[] = [
  { status: 'no_show',      label: 'No-show',       icon: UserX,       color: crmV2Outcomes.no_show,      hint: '→ A replanifier' },
  { status: 'a_travailler', label: 'A travailler',  icon: Mail,        color: crmV2Outcomes.a_travailler, hint: '→ Mail PI + brochure' },
  { status: 'pre_positif',  label: 'Pré-positif',   icon: Flame,       color: crmV2Outcomes.pre_positif,  hint: '→ Mail PI + brochure' },
  { status: 'positif',      label: 'POSITIF',       icon: PartyPopper, color: crmV2Outcomes.positif,      hint: '→ Pré-inscription' },
  { status: 'negatif',      label: 'Négatif',       icon: ThumbsDown,  color: crmV2Outcomes.negatif,      hint: '→ Rien à faire' },
]

/** Libellé de section de la fiche RDV : 11 px / 700 / MAJUSCULES. */
const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
}
const sectionPad: React.CSSProperties = { padding: '14px 18px', borderBottom: `1px solid ${crmV2.borderLight}` }

/** '#rrggbb' → rgba */
function tint(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
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
  border: `1px solid ${crmV2.borderStrong}`,
  borderRadius: 10,
  padding: '6px 10px',
  color: crmV2.text,
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
  teleproView = false,
}: {
  appointment: Appointment
  onClose: () => void
  onUpdate: (updated: Partial<Appointment>) => void
  onDelete?: (id: string) => void
  adminMode?: boolean
  canAssign?: boolean
  /** Télépro : consultation seule de l'issue, du retour prospect et de l'assignation */
  teleproView?: boolean
}) {
  const isMobile = useIsMobile()
  // Admin ou closer autorisé à (ré)assigner le RDV à un closer.
  const showAssign = (adminMode || canAssign) && !teleproView
  const dateBlockRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
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

  const durationMin = Math.max(0, Math.round((displayEnd.getTime() - displayStart.getTime()) / 60000))
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.confirme
  // Le télépro qualifie aussi l'issue (no-show, positif…) — seule la réassignation lui reste fermée (showAssign)
  const canQualify = true

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

  const closeBtn = <CrmV2CloseButton onClick={onClose} />
  const smallGoldBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
    borderRadius: 999, padding: '4px 10px',
    color: crmV2.text, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
  }
  const infoRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: crmV2.textMuted }
  const iconGold = { color: crmV2.gold, flexShrink: 0 } as const

  return (
    <>
    {/* Fond sombre — tiroir à droite (ordinateur) ou panneau qui monte du bas (mobile) */}
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: isMobile ? 'rgba(15,31,61,0.40)' : 'rgba(15,31,61,0.28)',
      }}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose()
        mouseDownOnBackdrop.current = false
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          ...(isMobile
            ? { left: 0, right: 0, bottom: 0, maxHeight: '92dvh', borderRadius: '22px 22px 0 0', animation: 'crm-v2-sheet-up .22s ease-out', paddingBottom: 'env(safe-area-inset-bottom)' }
            : { top: 12, right: 12, bottom: 12, width: 460, maxWidth: 'calc(100vw - 24px)', borderRadius: 20 }),
          background: crmV2.bg,
          border: `1px solid ${crmV2.border}`,
          boxShadow: crmV2.shadowPanel,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: crmV2.font,
          color: crmV2.text,
        }}
      >
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0', flexShrink: 0 }}>
            <span style={{ width: 40, height: 4, borderRadius: 999, background: crmV2.borderStrong }} />
          </div>
        )}
        {showReassignModal ? (
          <>
            {/* Vue réassignation — intégrée dans le même tiroir */}
            <div style={{
              padding: '16px 18px 14px',
              borderBottom: `1px solid ${crmV2.border}`,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
              flexShrink: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'none', border: 'none', padding: 0, marginBottom: 8,
                    color: crmV2.link, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <ChevronLeft size={14} />
                  Retour au RDV
                </button>
                <div style={{ ...sectionLabel, marginBottom: 4 }}>
                  <RefreshCw size={12} color={crmV2.gold} />
                  {appointment.users ? 'Réassigner le closer' : 'Assigner le closer'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {appointment.prospect_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: crmV2.textMuted, fontSize: 13, marginTop: 4 }}>
                  <Calendar size={13} color={crmV2.gold} />
                  <span>
                    {format(displayStart, 'EEEE d MMMM', { locale: fr })} · {format(displayStart, 'HH:mm')} · {durationMin} min
                  </span>
                </div>
              </div>
              {closeBtn}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
            </div>
          </>
        ) : (
        <>
        {/* En-tête : statut (mis à jour en direct), fermer, nom, date */}
        <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}`,
              borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusCfg.color }} />
              {statusCfg.label}
            </span>
            {closeBtn}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: crmV2.text }}>
              {appointment.prospect_name}
            </h2>
            <MediboxBadge brand={appointment.brand} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13, color: crmV2.textMuted }}>
            <Calendar size={13} color={crmV2.gold} />
            <span>
              {format(displayStart, 'EEEE d MMMM', { locale: fr })} · {format(displayStart, 'HH:mm')} · {durationMin} min
            </span>
          </div>
          {canQualify && (
            <BrandPicker
              appointmentId={appointment.id}
              brand={appointment.brand}
              onChanged={updated => onUpdate(updated as Partial<Appointment>)}
            />
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Infos prospect */}
        <div style={{ ...sectionPad }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={infoRow}>
              <Mail size={14} style={iconGold} />
              <span style={{ overflowWrap: 'anywhere' }}>{appointment.prospect_email}</span>
            </div>
            {appointment.prospect_phone && (
              <div style={infoRow}>
                <Phone size={14} style={iconGold} />
                <a href={`tel:${appointment.prospect_phone.replace(/\s+/g, '')}`} style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>
                  {appointment.prospect_phone}
                </a>
              </div>
            )}
            {appointment.formation_type && (
              <div style={infoRow}>
                <Tag size={14} style={iconGold} />
                <span>Filière : <strong style={{ color: crmV2.text }}>{appointment.formation_type}</strong></span>
              </div>
            )}
            {appointment.classe_actuelle && (
              <div style={infoRow}>
                <GraduationCap size={14} style={iconGold} />
                <span>Classe actuelle : <strong style={{ color: crmV2.text }}>{appointment.classe_actuelle}</strong></span>
              </div>
            )}
            {appointment.source && (
              <div style={infoRow}>
                <Zap size={14} style={iconGold} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {formatAppointmentPlacementLabel(appointment)}
                  {appointmentPlacedByTelepro(appointment)?.avatar_color && (
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: appointmentPlacedByTelepro(appointment)!.avatar_color!,
                      flexShrink: 0, display: 'inline-block',
                    }} />
                  )}
                </span>
              </div>
            )}
            {appointment.sms_confirmed_at && (
              <span style={{
                alignSelf: 'flex-start',
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.35)',
                borderRadius: 999, padding: '3px 10px',
                fontSize: 12, fontWeight: 700, color: '#059669',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <Smartphone size={12} />
                Confirmé via SMS — {format(new Date(appointment.sms_confirmed_at), "d MMM 'à' HH'h'mm", { locale: fr })}
              </span>
            )}

            {/* Mode du RDV : Visio / Téléphone / Présentiel (+ adresse) */}
            <RdvModeBlock
              appointmentId={appointment.id}
              meetingType={appointment.meeting_type}
              meetingLink={appointment.meeting_link}
              prospectName={appointment.prospect_name}
              prospectPhone={appointment.prospect_phone}
              closerName={appointment.users?.name}
              status={status}
              disabled={saving}
              onJoinLegacyVisio={() => setShowJitsi(true)}
              onUpdated={(updated) => onUpdate(updated)}
            />
            {appointment.meeting_type === 'visio' && appointment.meeting_link && status !== 'annule' && (
              <VisioParticipantsBlock
                appointmentId={appointment.id}
                extraParticipants={appointment.extra_participants}
                disabled={saving}
                onUpdated={(updated) => onUpdate({ id: appointment.id, ...updated })}
              />
            )}

            {appointment.users && (
              <div style={{ ...infoRow, flexWrap: 'wrap' }}>
                <User size={14} style={iconGold} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Closer :
                  {appointment.users.avatar_color && (
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: appointment.users.avatar_color,
                      flexShrink: 0, display: 'inline-block',
                    }} />
                  )}
                  <strong style={{ color: crmV2.text }}>{appointment.users.name}</strong>
                </span>
                {showAssign && (
                  <button type="button" onClick={() => setShowReassignModal(true)} style={{ ...smallGoldBtn, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', color: crmV2.goldDark }}>
                    <RefreshCw size={11} />
                    Réassigner
                  </button>
                )}
              </div>
            )}
            {showAssign && !appointment.users && (
              <div style={infoRow}>
                <User size={14} style={iconGold} />
                <span>Aucun closer assigné</span>
                <button type="button" onClick={() => setShowReassignModal(true)} style={{ ...smallGoldBtn, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', color: crmV2.goldDark }}>
                  <User size={11} />
                  Assigner
                </button>
              </div>
            )}
            {(appointment.hubspot_contact_id || appointment.hubspot_deal_id) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                {appointment.hubspot_contact_id && (
                  <a
                    href={`/admin/crm/contacts/${appointment.hubspot_contact_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...smallGoldBtn, padding: '6px 12px' }}
                  >
                    <User size={12} /> Ouvrir le contact
                  </a>
                )}
                {appointment.hubspot_deal_id && (
                  <a
                    href={`/admin/crm/deals/${appointment.hubspot_deal_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...smallGoldBtn, padding: '6px 12px' }}
                  >
                    <Briefcase size={12} /> Ouvrir la transaction
                  </a>
                )}
              </div>
            )}

            {/* Date et heure modifiables (bouton « Replanifier » du pied de page) */}
            <div ref={dateBlockRef} style={{
              background: crmV2.bgHover,
              border: `1px solid ${crmV2.border}`,
              borderRadius: 12,
              padding: '10px 12px',
              marginTop: 2,
            }}>
              <div style={{ ...sectionLabel, marginBottom: 8 }}>
                <CalendarClock size={12} color={crmV2.gold} />
                Date et heure du RDV
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  ref={dateInputRef}
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
                <span style={{ color: crmV2.textFaint, fontSize: 13 }}>–</span>
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
                      background: crmV2.primary,
                      border: `1px solid ${crmV2.primary}`,
                      borderRadius: 999,
                      padding: '6px 14px',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: rescheduleSaving ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: rescheduleSaving ? 0.7 : 1,
                    }}
                  >
                    {rescheduleSaving ? 'Enregistrement…' : 'Replanifier'}
                  </button>
                )}
              </div>
              {rescheduleError && (
                <div style={{ fontSize: 12, color: '#d13a41', marginTop: 6, fontWeight: 600 }}>
                  {rescheduleError}
                </div>
              )}
              {rescheduleOk && (
                <div style={{ fontSize: 12, color: '#15803d', marginTop: 6, fontWeight: 600 }}>
                  Créneau mis à jour — confirmation envoyée au prospect
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Retour prospect — visible si assigné, toujours réversible */}
        {canQualify && (status === 'confirme' || status === 'confirme_prospect' || status === 'annule') && (
          <div style={sectionPad}>
            <div style={sectionLabel}>Retour prospect</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { key: 'confirme_prospect', label: confirmingProspect ? 'Confirmation…' : 'Prospect confirmé', icon: CheckCircle2, color: '#10b981', onClick: confirmProspect },
                { key: 'annule', label: saving && pendingStatus === 'annule' ? 'Annulation…' : 'Prospect a annulé', icon: Ban, color: '#6b7280', onClick: cancelProspect },
              ] as const).map(b => {
                const active = status === b.key
                const Icon = b.icon
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={b.onClick}
                    disabled={confirmingProspect || saving}
                    style={{
                      flex: 1,
                      background: active ? tint(b.color, 0.12) : crmV2.bg,
                      border: `1px solid ${active ? tint(b.color, 0.45) : crmV2.border}`,
                      borderRadius: 12, padding: '9px 8px',
                      color: active ? b.color : crmV2.textMuted,
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontFamily: 'inherit',
                      opacity: confirmingProspect || saving ? 0.7 : 1,
                    }}
                  >
                    <Icon size={14} />
                    {b.label}
                    {active && <Check size={13} />}
                  </button>
                )
              })}
            </div>
            {(status === 'confirme_prospect' || status === 'annule') && (
              <button
                type="button"
                onClick={resetToConfirme}
                disabled={saving || confirmingProspect}
                style={{
                  marginTop: 8, background: 'none', border: 'none',
                  color: crmV2.link, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  padding: 0, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                <Hourglass size={12} /> Remettre en attente de confirmation
              </button>
            )}
          </div>
        )}

        {/* Issue du RDV — masquée si non assigné */}
        {canQualify && !isNonAssigne && (
          <div style={sectionPad}>
            <div style={sectionLabel}>Issue du RDV</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {STATUS_ACTIONS.map((action) => {
                const isSaved = status === action.status
                const isPending = pendingStatus === action.status
                const isHighlighted = isSaved || isPending
                const Icon = action.icon
                return (
                  <button
                    key={action.status}
                    type="button"
                    onClick={() => updateStatus(action.status)}
                    disabled={saving}
                    style={{
                      textAlign: 'left',
                      background: isHighlighted ? tint(action.color, 0.10) : crmV2.bg,
                      border: `1px solid ${isHighlighted ? tint(action.color, 0.45) : crmV2.border}`,
                      borderRadius: 12,
                      padding: '9px 11px',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 2,
                      fontFamily: 'inherit',
                      transition: 'background .15s, border-color .15s',
                      opacity: saving && !isPending ? 0.5 : 1,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: isHighlighted ? action.color : crmV2.text }}>
                      <Icon size={14} color={action.color} />
                      {action.label}
                      {isSaved && !isPending && <Check size={13} style={{ marginLeft: 'auto' }} />}
                      {isPending && saving && <span style={{ marginLeft: 'auto', opacity: 0.7 }}>…</span>}
                    </span>
                    {action.hint && (
                      <span style={{ fontSize: 11, color: isHighlighted ? action.color : crmV2.textFaint, fontWeight: 500 }}>{action.hint}</span>
                    )}
                  </button>
                )
              })}
            </div>
            {saving && (
              <div style={{ marginTop: 8, fontSize: 12, color: crmV2.textMuted }}>
                Synchronisation…
              </div>
            )}
            {saved && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Check size={12} /> Transaction mise à jour
              </div>
            )}
          </div>
        )}

        {/* Message si non assigné */}
        {isNonAssigne && (
          <div style={sectionPad}>
            <div style={{
              background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.30)',
              borderRadius: 12, padding: '10px 12px',
              fontSize: 13, color: crmV2.goldDark,
            }}>
              {teleproView
                ? 'Ce RDV attend d’être assigné à un closer.'
                : 'Ce RDV n’est pas encore assigné à un closer. Allez dans la vue Admin pour l’assigner.'}
            </div>
          </div>
        )}

        {/* Raison du négatif — visible si statut négatif ou en attente */}
        {canQualify && !isNonAssigne && (status === 'negatif' || pendingStatus === 'negatif') && (
          <div style={sectionPad}>
            <div style={{ ...sectionLabel, color: negatifError ? '#ef4444' : crmV2.textMuted }}>
              <ThumbsDown size={12} color={crmV2Outcomes.negatif} />
              Raison du négatif *
              {negatifError && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>— Obligatoire</span>}
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
                      type="button"
                      onClick={() => { setNegatifReason(opt.value); setNegatifError(false) }}
                      style={choiceStyle(selected, '#ef4444', negatifError)}
                    >
                      {opt.label}
                    </button>
                    {/* Sous-options : autres prépas */}
                    {selected && opt.value === 'inscrit_autre_prepa' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: 12 }}>
                        {['Stan/Laennec', 'Antemed-Epsilon', 'Medisup Sciences', 'CPCM'].map(prepa => {
                          const checked = negatifReasonDetail.includes(prepa)
                          return (
                            <button key={prepa} type="button" onClick={() => {
                              setNegatifReasonDetail(prev => checked ? prev.filter(p => p !== prepa) : [...prev, prepa])
                            }} style={{
                              background: checked ? 'rgba(239,68,68,0.12)' : crmV2.bg,
                              border: `1px solid ${checked ? 'rgba(239,68,68,0.4)' : crmV2.border}`,
                              borderRadius: 999, padding: '5px 10px',
                              color: checked ? '#ef4444' : crmV2.textMuted,
                              fontSize: 12, fontWeight: checked ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              {checked && <Check size={11} />}{prepa}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {/* Sous-option : autre texte libre */}
                    {selected && opt.value === 'autre' && (
                      <input
                        value={negatifAutreText}
                        onChange={e => setNegatifAutreText(e.target.value)}
                        placeholder="Préciser la raison…"
                        style={{ ...fieldStyle, marginTop: 6 }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Interlocuteur principal */}
        {canQualify && !isNonAssigne && (
          <div style={sectionPad}>
            <div style={sectionLabel}><UsersRound size={12} color={crmV2.gold} />Interlocuteur principal</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: interlocuteur ? 10 : 0 }}>
              {(['parent', 'etudiant'] as const).map(val => {
                const selected = interlocuteur === val
                const Icon = val === 'parent' ? UsersRound : GraduationCap
                return (
                  <button key={val} type="button" onClick={() => setInterlocuteur(val)} style={{ ...choiceStyle(selected, crmV2.gold), flex: 1, textAlign: 'center', justifyContent: 'center' }}>
                    <Icon size={14} />
                    {val === 'parent' ? 'Parent' : 'Étudiant'}
                  </button>
                )
              })}
            </div>
            {interlocuteur && (
              <div style={{ background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 6, fontWeight: 700 }}>
                  {interlocuteur === 'parent' ? 'Consigne pour Pascal' : 'Consigne pour le télépro'}
                </div>
                <input
                  value={consigneText}
                  onChange={e => setConsigneText(e.target.value)}
                  placeholder="Décrire la consigne…"
                  style={{ ...fieldStyle, marginBottom: 8 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {!consigneRienAFaire && (
                    <>
                      <div style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 700 }}>Échéance :</div>
                      <input
                        type="date"
                        value={consigneEcheance}
                        onChange={e => setConsigneEcheance(e.target.value)}
                        style={scheduleInputStyle}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { setConsigneRienAFaire(!consigneRienAFaire); if (!consigneRienAFaire) setConsigneEcheance('') }}
                    style={{
                      background: consigneRienAFaire ? 'rgba(107,114,128,0.14)' : crmV2.bg,
                      border: `1px solid ${consigneRienAFaire ? 'rgba(107,114,128,0.4)' : crmV2.border}`,
                      borderRadius: 999, padding: '5px 12px',
                      color: consigneRienAFaire ? '#4b5563' : crmV2.textMuted,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {consigneRienAFaire && <Check size={11} />}Rien à faire
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contexte concurrence */}
        {canQualify && !isNonAssigne && (
          <div style={sectionPad}>
            <div style={sectionLabel}><Trophy size={12} color={crmV2.gold} />Contexte concurrence</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                { value: 'bien_renseignee', label: 'Bien renseignée ou va le faire' },
                { value: 'peu_renseignee', label: 'Peu renseignée ou va pas trop regarder' },
                { value: 'pas_renseignee', label: 'Pas renseignée' },
              ] as const).map(opt => (
                <button key={opt.value} type="button" onClick={() => setContexteConcurrence(opt.value)} style={choiceStyle(contexteConcurrence === opt.value, crmV2.gold)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Financement */}
        {canQualify && !isNonAssigne && (
          <div style={sectionPad}>
            <div style={sectionLabel}><Wallet size={12} color={crmV2.gold} />Financement</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'pas_de_probleme', label: 'Pas de problème', color: '#16a34a' },
                { value: 'potentiel_blocage', label: 'Potentiel blocage financier', color: '#ef4444' },
              ] as const).map(opt => (
                <button key={opt.value} type="button" onClick={() => setFinancement(opt.value)} style={{ ...choiceStyle(financement === opt.value, opt.color), flex: 1, justifyContent: 'center', textAlign: 'center' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* JPO */}
        {canQualify && !isNonAssigne && (
          <div style={sectionPad}>
            <div style={sectionLabel}><GraduationCap size={12} color={crmV2.gold} />Inviter à la prochaine JPO</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'oui', label: 'Oui' },
                { value: 'pas_besoin', label: 'Pas besoin' },
              ] as const).map(opt => (
                <button key={opt.value} type="button" onClick={() => setJpoInvitation(opt.value)} style={{ ...choiceStyle(jpoInvitation === opt.value, crmV2.gold), flex: 1, justifyContent: 'center', textAlign: 'center' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rapport closer — obligatoire */}
        {canQualify && !isNonAssigne && (
          <div style={sectionPad}>
            <div style={{ ...sectionLabel, color: reportError ? '#ef4444' : crmV2.textMuted }}>
              <FileText size={12} color={crmV2.gold} />
              Rapport du RDV *
              {reportError && (
                <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                  — Obligatoire avant de changer le statut
                </span>
              )}
            </div>
            {aiGenerated && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)',
                borderRadius: 10, padding: '6px 12px',
              }}>
                <Sparkles size={14} style={{ color: '#8b5cf6' }} />
                <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                  Rapport pré-rempli par l&apos;IA — vous pouvez le modifier avant de valider
                </span>
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <div style={fieldLabel}>Résumé du RDV</div>
              <textarea
                value={reportSummary}
                onChange={(e) => { setReportSummary(e.target.value); setReportError(false) }}
                placeholder="Comment s'est passé le RDV ? Motivations du prospect, objections, situation…"
                rows={4}
                style={{ ...textareaStyle, borderColor: reportError && !reportSummary.trim() ? 'rgba(239,68,68,0.5)' : crmV2.borderStrong }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Conseil pour le télépro</div>
              <textarea
                value={reportTelepro}
                onChange={(e) => { setReportTelepro(e.target.value); setReportError(false) }}
                placeholder="Retour pour le télépro : qualité du lead, axes d'amélioration, infos manquantes…"
                rows={3}
                style={{ ...textareaStyle, borderColor: reportError && !reportTelepro.trim() ? 'rgba(239,68,68,0.5)' : crmV2.borderStrong }}
              />
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${crmV2.border}` }}>
              <div style={{ ...fieldLabel, marginBottom: 8 }}>
                Coordonnées parent <span style={{ fontWeight: 400 }}>(facultatif)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Mail size={14} style={iconGold} />
                  <input type="email" value={emailParent} onChange={(e) => setEmailParent(e.target.value)} placeholder="E-mail parent" style={fieldStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Phone size={14} style={iconGold} />
                  <input type="tel" value={phoneParent} onChange={(e) => setPhoneParent(e.target.value)} placeholder="Numéro parent" style={fieldStyle} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ padding: '14px 18px 18px' }}>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>
            <FileText size={12} color={crmV2.gold} />
            {teleproView ? 'Notes du télépro' : 'Notes internes'}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes libres sur ce RDV…"
            rows={4}
            style={{ ...textareaStyle, background: '#fdf6e3', borderColor: 'rgba(201,168,76,0.30)' }}
          />
        </div>

        {/* Zone danger — suppression définitive du RDV (admin/agenda uniquement) */}
        {onDelete && (
          <div style={{ padding: '0 18px 18px' }}>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 999, padding: '7px 14px',
                  color: '#d13a41', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Trash2 size={14} /> Supprimer le RDV
              </button>
            ) : (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, color: crmV2.text, fontWeight: 700, marginBottom: 4 }}>
                  Supprimer définitivement ce RDV ?
                </div>
                <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 12 }}>
                  Cette action est irréversible. Le RDV disparaîtra de l&apos;agenda.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={deleteAppointment}
                    disabled={deleting}
                    style={{
                      background: '#ef4444', color: '#fff', border: '1px solid #ef4444',
                      borderRadius: 999, padding: '7px 16px',
                      cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      opacity: deleting ? 0.7 : 1, fontFamily: 'inherit',
                    }}
                  >
                    {deleting ? 'Suppression…' : 'Oui, supprimer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    style={{
                      background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
                      borderRadius: 999, padding: '7px 16px',
                      color: crmV2.text, fontSize: 13, fontWeight: 600,
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
        </div>

        {/* Pied : Replanifier (va à la date) · Enregistrer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${crmV2.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              dateBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              setTimeout(() => {
                const el = dateInputRef.current
                if (!el) return
                el.focus()
                try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.() } catch { /* non supporté */ }
              }, 250)
            }}
            style={{
              flex: 1, borderRadius: 999, padding: '10px 0', fontSize: 13, fontWeight: 600,
              background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.text,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <CalendarClock size={14} /> Replanifier
          </button>
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            style={{
              flex: 1, borderRadius: 999, padding: '10px 0', fontSize: 13, fontWeight: 700,
              background: crmV2.primary, border: `1px solid ${crmV2.primary}`, color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.75 : 1,
            }}
          >
            <Check size={14} /> {saving ? 'Enregistrement…' : saved ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
        </>
        )}
      </aside>
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

const fieldStyle: React.CSSProperties = {
  flex: 1, width: '100%', background: '#ffffff', border: `1px solid ${crmV2.borderStrong}`,
  borderRadius: 10, padding: '0 12px', height: 38, color: crmV2.text, fontSize: 13,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const textareaStyle: React.CSSProperties = {
  width: '100%', background: '#ffffff', border: `1px solid ${crmV2.borderStrong}`,
  borderRadius: 10, padding: '10px 12px', color: crmV2.text,
  fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', lineHeight: 1.55,
}
const fieldLabel: React.CSSProperties = { fontSize: 12, color: crmV2.textMuted, marginBottom: 4, fontWeight: 700 }

/** Bouton de choix (radio visuel) de la fiche RDV. */
function choiceStyle(selected: boolean, color: string, error = false): React.CSSProperties {
  return {
    width: '100%', textAlign: 'left',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: selected ? tint(color, 0.10) : '#ffffff',
    border: `1px solid ${selected ? tint(color, 0.45) : error ? 'rgba(239,68,68,0.35)' : crmV2.border}`,
    borderRadius: 12, padding: '9px 12px',
    color: selected ? (color === crmV2.gold ? crmV2.goldDark : color) : crmV2.text,
    fontSize: 13, fontWeight: selected ? 700 : 500,
    cursor: 'pointer', fontFamily: 'inherit',
  }
}

/** Marque du RDV (Diploma Santé par défaut) : corrigeable, ex. un RDV passé qui concernait Medibox. */
function BrandPicker({ appointmentId, brand, onChanged }: {
  appointmentId: string
  brand?: string | null
  onChanged: (updated: Record<string, unknown>) => void
}) {
  const [current, setCurrent] = useState<RdvBrand>(normalizeRdvBrand(brand))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setCurrent(normalizeRdvBrand(brand)) }, [brand])

  async function choose(b: RdvBrand) {
    if (b === current || busy) return
    const prev = current
    setCurrent(b)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: b }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setCurrent(prev); setError(j.error || 'Modification impossible'); return }
      onChanged({ ...j, brand: b })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted, marginRight: 2 }}>Marque</span>
        {RDV_BRAND_IDS.map(b => {
          const on = b === current
          const c = RDV_BRANDS[b].color
          return (
            <button key={b} type="button" onClick={() => choose(b)} disabled={busy} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999,
              fontSize: 12, fontWeight: on ? 700 : 500, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
              border: `1px solid ${on ? c : crmV2.border}`, background: on ? `${c}18` : crmV2.bg,
              color: on ? c : crmV2.textMuted,
            }}>
              {b !== 'diploma' && (
                <span style={{ background: c, color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 3, padding: '0 4px', lineHeight: 1.5 }}>
                  {RDV_BRANDS[b].letter}
                </span>
              )}
              {RDV_BRANDS[b].label}
            </button>
          )
        })}
      </div>
      {error && <div style={{ fontSize: 12, color: '#d13a41', marginTop: 4 }}>{error}</div>}
    </div>
  )
}
