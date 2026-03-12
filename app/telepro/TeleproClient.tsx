'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { format, addDays, isSameDay, startOfToday, startOfWeek, addWeeks, subWeeks, isSameWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Calendar, Clock, Phone, Tag, FileText, ArrowLeft, Search, User, MapPin,
  GraduationCap, X, CheckCircle, Link, Plus, Mail, Video, PhoneCall, Copy,
  Check, PlusCircle, RefreshCw, ChevronLeft, ChevronRight, TrendingUp, RotateCcw, List,
  ExternalLink,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import StatusBadge, { AppointmentStatus, STATUS_CONFIG } from '@/components/StatusBadge'

// ─── Types ─────────────────────────────────────────────────────────────────
type Slot = { start: string; end: string; count?: number }

interface HubSpotContact {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    phone?: string
    departement?: string
    classe_actuelle?: string
    diploma_sante___formation_demandee?: string
  }
}

type TeleproUser = {
  id: string
  name: string
  email: string
  role: string
  slug: string
  avatar_color: string
  hubspot_owner_id?: string | null
}

type MyAppointment = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  status: AppointmentStatus
  formation_type?: string | null
  meeting_type?: string | null
  meeting_link?: string | null
  report_summary?: string | null
  report_telepro_advice?: string | null
  hubspot_contact_id?: string | null
  hubspot_deal_id?: string | null
  notes?: string | null
  source?: string | null
  classe_actuelle?: string | null
  departement?: string | null
  rdv_users?: { id: string; name: string; avatar_color: string; slug: string } | null
}

// ─── Constantes ────────────────────────────────────────────────────────────
const FORMATIONS: { value: string; label: string }[] = [
  { value: 'PAS',         label: 'PASS' },
  { value: 'LSPS',        label: 'LSPS' },
  { value: 'LAS',         label: 'LAS' },
  { value: 'P-1',         label: 'Terminale Santé (P-1)' },
  { value: 'P-2',         label: 'Première Élite (P-2)' },
  { value: 'APES0',       label: 'PAES FR/EU' },
  { value: 'LAS 2 UPEC',  label: 'LSPS2 UPEC' },
  { value: 'LAS 3 Upec',  label: 'LSPS3 UPEC' },
]

const CLASSES = [
  'Troisième', 'Seconde', 'Première', 'Terminale',
  'PASS', 'LSPS 1', 'LSPS 2', 'LSPS 3',
  'LAS 1', 'LAS 2', 'LAS 3',
  'Etudes médicales', 'Etudes Sup.', 'Autre',
]

// Statuts pertinents pour le suivi télépro (dans l'ordre d'affichage)
const TRACKING_STATUSES: AppointmentStatus[] = [
  'no_show', 'a_travailler', 'pre_positif', 'positif', 'negatif', 'annule', 'confirme', 'non_assigne',
]

// Statuts pour lesquels on propose "Reprendre RDV"
const REPLAN_STATUSES: AppointmentStatus[] = ['no_show', 'a_travailler', 'negatif']

// ─── Constantes HubSpot ────────────────────────────────────────────────────
const HS_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || ''
const HS_BASE_URL = process.env.NEXT_PUBLIC_HUBSPOT_BASE_URL || 'https://app-eu1.hubspot.com'
const SOURCE_LABEL: Record<string, string> = {
  telepro: '📞 Placé par télépro',
  prospect: '🌐 Réservé en ligne',
  admin: '⚙️ Placé en admin',
}

// ─── Styles partagés ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#252840', border: '1px solid #2a2d3e',
  borderRadius: 10, padding: '11px 14px', color: '#e8eaf0',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  fontWeight: 700, fontSize: 12, color: '#8b8fa8', marginBottom: 6,
  display: 'flex', alignItems: 'center', gap: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

function generateJitsiLink() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `https://meet.jit.si/diploma-sante-${rand}`
}

// ─── Modal fiche RDV (lecture seule + note interne éditable) ──────────────
function TeleproRdvModal({
  rdv, noteValue, onNoteChange, onNoteSave, saving, saved, onClose, onConfirm, confirming, onCancel, cancelling, onReset,
}: {
  rdv: MyAppointment
  noteValue: string
  onNoteChange: (val: string) => void
  onNoteSave: () => void
  saving: boolean
  saved: boolean
  onClose: () => void
  onConfirm?: () => void
  confirming?: boolean
  onCancel?: () => void
  cancelling?: boolean
  onReset?: () => void
}) {
  const start = new Date(rdv.start_at)
  const end = new Date(rdv.end_at)
  const meetingColor = rdv.meeting_type === 'visio' ? '#6b87ff' : rdv.meeting_type === 'telephone' ? '#22c55e' : '#f59e0b'
  const meetingLabel = rdv.meeting_type === 'visio' ? 'Visio' : rdv.meeting_type === 'telephone' ? 'Téléphone' : 'Présentiel'
  const mouseDownOnBackdrop = { current: false }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose(); mouseDownOnBackdrop.current = false }}
    >
      <div style={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a2d3e', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 4 }}>{rdv.prospect_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8b8fa8', fontSize: 14 }}>
              <Clock size={14} />
              <span>{format(start, 'EEEE d MMMM', { locale: fr })} · {format(start, 'HH:mm')} – {format(end, 'HH:mm')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={rdv.status} />
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Infos prospect */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
              <Mail size={14} style={{ color: '#4f6ef7', flexShrink: 0 }} />
              <span>{rdv.prospect_email}</span>
            </div>
            {rdv.prospect_phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <Phone size={14} style={{ color: '#4f6ef7', flexShrink: 0 }} />
                <span>{rdv.prospect_phone}</span>
              </div>
            )}
            {rdv.formation_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <Tag size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <span>Filière : <strong style={{ color: '#e8eaf0' }}>{rdv.formation_type}</strong></span>
              </div>
            )}
            {rdv.source && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <span>{SOURCE_LABEL[rdv.source] || rdv.source}</span>
              </div>
            )}
            {rdv.meeting_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                {rdv.meeting_type === 'visio' ? <Video size={14} style={{ color: meetingColor, flexShrink: 0 }} />
                  : rdv.meeting_type === 'telephone' ? <PhoneCall size={14} style={{ color: meetingColor, flexShrink: 0 }} />
                  : <MapPin size={14} style={{ color: meetingColor, flexShrink: 0 }} />}
                <span style={{ color: meetingColor, fontWeight: 600 }}>{meetingLabel}</span>
                {rdv.meeting_type === 'visio' && rdv.meeting_link && (
                  <a href={rdv.meeting_link} target="_blank" rel="noopener noreferrer"
                    style={{ background: 'rgba(79,110,247,0.12)', border: '1px solid rgba(79,110,247,0.3)', borderRadius: 6, padding: '2px 10px', color: '#6b87ff', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Video size={11} /> Rejoindre
                  </a>
                )}
              </div>
            )}
            {rdv.classe_actuelle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <span style={{ color: '#f59e0b', flexShrink: 0 }}>🎓</span>
                <span>Classe actuelle : <strong style={{ color: '#e8eaf0' }}>{rdv.classe_actuelle}</strong></span>
              </div>
            )}
            {rdv.rdv_users && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#8b8fa8' }}>
                <User size={14} style={{ color: '#4f6ef7', flexShrink: 0 }} />
                <span>Closer : <strong style={{ color: '#e8eaf0' }}>{rdv.rdv_users.name}</strong></span>
              </div>
            )}
            {(rdv.hubspot_contact_id || rdv.hubspot_deal_id) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {rdv.hubspot_contact_id && (
                  <a href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/contact/${rdv.hubspot_contact_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '4px 10px', color: '#f59e0b', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    <ExternalLink size={11} /> Contact HubSpot
                  </a>
                )}
                {rdv.hubspot_deal_id && (
                  <a href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/deal/${rdv.hubspot_deal_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.3)', borderRadius: 6, padding: '4px 10px', color: '#6b87ff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    <ExternalLink size={11} /> Transaction HubSpot
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Retour prospect */}
        {(rdv.status === 'confirme' || rdv.status === 'confirme_prospect' || rdv.status === 'annule') && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #2a2d3e' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Retour prospect
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {onConfirm && (
                <button
                  onClick={onConfirm}
                  disabled={confirming || cancelling}
                  style={{
                    flex: 1,
                    background: rdv.status === 'confirme_prospect' ? 'rgba(16,185,129,0.18)' : 'transparent',
                    border: `1px solid ${rdv.status === 'confirme_prospect' ? 'rgba(16,185,129,0.5)' : '#2a2d3e'}`,
                    borderRadius: 8, padding: '9px 14px',
                    color: rdv.status === 'confirme_prospect' ? '#10b981' : '#555870',
                    fontSize: 13, fontWeight: rdv.status === 'confirme_prospect' ? 700 : 400,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: confirming ? 0.7 : 1,
                  }}
                >
                  ✅ {confirming ? 'Confirmation…' : 'Prospect confirmé'}
                  {rdv.status === 'confirme_prospect' && <span style={{ fontSize: 11, marginLeft: 2 }}>✓</span>}
                </button>
              )}
              {onCancel && (
                <button
                  onClick={onCancel}
                  disabled={cancelling || confirming}
                  style={{
                    flex: 1,
                    background: rdv.status === 'annule' ? 'rgba(107,114,128,0.18)' : 'transparent',
                    border: `1px solid ${rdv.status === 'annule' ? 'rgba(107,114,128,0.5)' : '#2a2d3e'}`,
                    borderRadius: 8, padding: '9px 14px',
                    color: rdv.status === 'annule' ? '#9ca3af' : '#555870',
                    fontSize: 13, fontWeight: rdv.status === 'annule' ? 700 : 400,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: cancelling ? 0.7 : 1,
                  }}
                >
                  🚫 {cancelling ? 'Annulation…' : 'Prospect a annulé'}
                  {rdv.status === 'annule' && <span style={{ fontSize: 11, marginLeft: 2 }}>✓</span>}
                </button>
              )}
            </div>
            {(rdv.status === 'confirme_prospect' || rdv.status === 'annule') && onReset && (
              <button
                onClick={onReset}
                disabled={confirming || cancelling}
                style={{
                  marginTop: 8, background: 'none', border: 'none',
                  color: '#555870', fontSize: 11, cursor: 'pointer',
                  textDecoration: 'underline', padding: 0,
                  opacity: (confirming || cancelling) ? 0.5 : 1,
                }}
              >
                ⏳ Remettre en attente de confirmation
              </button>
            )}
          </div>
        )}

        {/* Suivi statut (lecture seule — toujours visible) */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Résultat du RDV
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([
                { status: 'no_show',      label: 'No-show',        icon: '❌', hint: '→ A replanifier' },
                { status: 'annule',       label: 'Annulé',         icon: '🚫', hint: '→ A replanifier' },
                { status: 'a_travailler', label: 'A travailler',   icon: '📧', hint: '→ Mail PI + brochure' },
                { status: 'pre_positif',  label: 'Pré-positif',    icon: '🔥', hint: '→ Mail PI + brochure' },
                { status: 'positif',      label: 'POSITIF',        icon: '🎉', hint: '→ Pré-inscription' },
                { status: 'negatif',      label: 'Négatif',        icon: '💀', hint: '→ Rien à faire' },
              ] as { status: AppointmentStatus; label: string; icon: string; hint: string }[]).map(action => {
                const cfg = STATUS_CONFIG[action.status]
                const isActive = rdv.status === action.status
                return (
                  <div key={action.status} style={{
                    background: isActive ? cfg.bg : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? cfg.border : '#2a2d3e'}`,
                    borderRadius: 10, padding: '10px 14px',
                    opacity: isActive ? 1 : 0.35,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? cfg.color : '#555870', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {action.icon} {action.label}
                      {isActive && <span style={{ marginLeft: 'auto', fontSize: 12 }}>✓</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#555870', marginTop: 2 }}>{action.hint}</div>
                  </div>
                )
              })}
            </div>
        </div>

        {/* Rapport closer (lecture seule) */}
        {(rdv.report_summary || rdv.report_telepro_advice) && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #2a2d3e' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Rapport du RDV
            </div>
            {rdv.report_summary && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b87ff', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Résumé du RDV</div>
                <div style={{ fontSize: 13, color: '#e8eaf0', lineHeight: 1.5, background: '#252840', borderRadius: 8, padding: '10px 14px' }}>{rdv.report_summary}</div>
              </div>
            )}
            {rdv.report_telepro_advice && (
              <div>
                <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conseil pour toi</div>
                <div style={{ fontSize: 13, color: '#e8eaf0', lineHeight: 1.5, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px' }}>{rdv.report_telepro_advice}</div>
              </div>
            )}
          </div>
        )}

        {/* Note interne — ÉDITABLE */}
        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileText size={12} /> Note interne
          </div>
          <textarea
            value={noteValue}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Tes notes d'appel…"
            rows={4}
            style={{ width: '100%', background: '#252840', border: '1px solid #2a2d3e', borderRadius: 10, padding: '11px 14px', color: '#e8eaf0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <button
            onClick={onNoteSave}
            disabled={saving}
            style={{ marginTop: 10, background: saved ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.12)', border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: 8, padding: '8px 18px', color: saved ? '#22c55e' : '#f59e0b', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Check size={13} /> {saved ? 'Sauvegardé !' : saving ? 'Sauvegarde…' : 'Sauvegarder la note'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────
// ─── Sous-composant : note éditable dans l'onglet Historique ───────────────
function HistoriqueNoteEditor({ rdvId, initialNote }: { rdvId: string; initialNote: string }) {
  const [note, setNote] = useState(initialNote)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch(`/api/appointments/${rdvId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: note }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#555870', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Mes notes historiques
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={3}
        style={{
          width: '100%', background: '#0f1117', border: '1px solid #2a2d3e',
          borderRadius: 8, color: '#c8cadb', fontSize: 13, padding: '8px 12px',
          resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
        placeholder="Laisser un compte-rendu ou note de suivi…"
      />
      <button
        onClick={save}
        disabled={saving}
        style={{
          marginTop: 6, background: 'rgba(79,110,247,0.15)',
          border: '1px solid rgba(79,110,247,0.3)', borderRadius: 6,
          padding: '4px 12px', color: '#6b87ff', fontSize: 12,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {saving ? 'Sauvegarde…' : saved ? '✓ Sauvegardé' : 'Sauvegarder'}
      </button>
    </div>
  )
}

export default function TeleproClient({
  teleproUser,
  previewMode = false,
  adminUser,
}: {
  teleproUser: TeleproUser
  previewMode?: boolean
  adminUser?: { name: string }
}) {
  const isAdmin = teleproUser.role === 'admin'
  const [activeTab, setActiveTab] = useState<'form' | 'rdvs' | 'historique'>('rdvs')

  const today = startOfToday()
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i))
    .filter(d => d.getDay() !== 0 && d.getDay() !== 6)
    .slice(0, 10)

  // ── Contact HubSpot ───────────────────────────────────────────────────
  const [lookupInput, setLookupInput] = useState('')
  const [lookupMode, setLookupMode] = useState<'url' | 'phone' | 'new'>('url')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [contact, setContact] = useState<HubSpotContact | null>(null)

  // ── Nouveau contact ──────────────────────────────────────────────────
  const [newFirstname, setNewFirstname] = useState('')
  const [newLastname, setNewLastname] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newFormation, setNewFormation] = useState('')
  const [newClasse, setNewClasse] = useState('')
  const [newDepartement, setNewDepartement] = useState('')
  const [creating, setCreating] = useState(false)

  // ── Champs prospect ───────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [emailSynced, setEmailSynced] = useState(false)
  const emailOriginalRef = useRef('')
  const [phone, setPhone] = useState('')
  const [departement, setDepartement] = useState('')
  const [classeActuelle, setClasseActuelle] = useState('')
  const [formation, setFormation] = useState('')
  const [meetingType, setMeetingType] = useState<'visio' | 'telephone' | 'presentiel'>('visio')
  const [meetingLink, setMeetingLink] = useState(() => generateJitsiLink())
  const [linkCopied, setLinkCopied] = useState(false)
  const [notes, setNotes] = useState('')

  // ── Date / Heure ──────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  // ── Submit ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Planning ──────────────────────────────────────────────────────────
  const [myRdvs, setMyRdvs] = useState<MyAppointment[]>([])
  const [myRdvsLoading, setMyRdvsLoading] = useState(false)
  const [expandedRdv, setExpandedRdv] = useState<string | null>(null)
  const [planningWeekStart, setPlanningWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | null>(null)
  const [rebookLoading, setRebookLoading] = useState<string | null>(null)
  const [planningView, setPlanningView] = useState<'week' | 'chrono'>('chrono')
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [selectedRdv, setSelectedRdv] = useState<MyAppointment | null>(null)
  const [confirmingRdv, setConfirmingRdv] = useState<string | null>(null)
  const [cancellingRdv, setCancellingRdv] = useState<string | null>(null)

  // ── Historique HubSpot ────────────────────────────────────────────────
  type HistRdv = MyAppointment & {
    hs_stage: string | null
    hs_stage_label: string | null
    hs_stage_color: string | null
    telepro_suivi: string | null
    telepro_suivi_at: string | null
  }
  type EngInfo = {
    engagements: Array<{
      id: number; type: string; createdAt: number
      body: string | null; direction: string | null
    }>
  }
  const [histRdvs, setHistRdvs]           = useState<HistRdv[]>([])
  const [histLoading, setHistLoading]     = useState(false)
  const [engData, setEngData]             = useState<Record<string, EngInfo>>({})
  const [loadingEng, setLoadingEng]       = useState<Record<string, boolean>>({})
  const [expandedHistRdv, setExpandedHistRdv] = useState<string | null>(null)
  const [closingDeal, setClosingDeal]     = useState<string | null>(null)
  const [stageFilter, setStageFilter]     = useState<string | null>(null)
  const [savingSuivi, setSavingSuivi]     = useState<string | null>(null)

  // ── HubSpot stats ─────────────────────────────────────────────────────
  const [hsStats, setHsStats] = useState<{ total: number; thisMonth: number; positifs: number; aVenir: number } | null>(null)

  const fetchHsStats = useCallback(async () => {
    if (!teleproUser.hubspot_owner_id) return
    try {
      const res = await fetch(`/api/hubspot/telepro-stats?hubspot_owner_id=${teleproUser.hubspot_owner_id}`)
      if (res.ok) setHsStats(await res.json())
    } catch (_e) { /* silencieux */ }
  }, [teleproUser.hubspot_owner_id])

  const fetchMyRdvs = useCallback(async () => {
    if (isAdmin) return
    setMyRdvsLoading(true)
    try {
      const res = await fetch(`/api/appointments?telepro_id=${teleproUser.id}`)
      if (res.ok) setMyRdvs(await res.json())
    } finally {
      setMyRdvsLoading(false)
    }
  }, [teleproUser.id, isAdmin])

  async function saveNote(rdvId: string) {
    const text = rdvId in editingNotes ? editingNotes[rdvId] : ''
    setSavingNote(rdvId)
    try {
      const res = await fetch(`/api/appointments/${rdvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: text.trim() || null }),
      })
      if (res.ok) {
        setMyRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, notes: text.trim() || null } : r))
        setSavedNote(rdvId)
        setTimeout(() => setSavedNote(null), 2000)
      }
    } finally {
      setSavingNote(null)
    }
  }

  async function confirmRdv(rdvId: string) {
    setConfirmingRdv(rdvId)
    try {
      const res = await fetch(`/api/appointments/${rdvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirme_prospect' }),
      })
      if (res.ok) {
        setMyRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, status: 'confirme_prospect' } : r))
        setSelectedRdv(prev => prev?.id === rdvId ? { ...prev, status: 'confirme_prospect' } : prev)
      }
    } finally {
      setConfirmingRdv(null)
    }
  }

  async function cancelRdv(rdvId: string) {
    setCancellingRdv(rdvId)
    try {
      const res = await fetch(`/api/appointments/${rdvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'annule' }),
      })
      if (res.ok) {
        setMyRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, status: 'annule' } : r))
        setSelectedRdv(prev => prev?.id === rdvId ? { ...prev, status: 'annule' } : prev)
      }
    } finally {
      setCancellingRdv(null)
    }
  }

  async function resetRdv(rdvId: string) {
    try {
      const res = await fetch(`/api/appointments/${rdvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirme' }),
      })
      if (res.ok) {
        setMyRdvs(prev => prev.map(r => r.id === rdvId ? { ...r, status: 'confirme' } : r))
        setSelectedRdv(prev => prev?.id === rdvId ? { ...prev, status: 'confirme' } : prev)
      }
    } catch (_e) { /* silent */ }
  }

  useEffect(() => {
    if (activeTab === 'rdvs') { fetchMyRdvs(); fetchHsStats() }
  }, [activeTab, fetchMyRdvs, fetchHsStats])

  useEffect(() => {
    if (previewMode) { fetchMyRdvs(); fetchHsStats() }
  }, [previewMode, fetchMyRdvs, fetchHsStats])

  // ── Historique : fetch via HubSpot owner → Supabase hubspot_deal_id ──
  const fetchHistorique = useCallback(async () => {
    if (!teleproUser.hubspot_owner_id) return
    setHistLoading(true)
    try {
      const res = await fetch(
        `/api/appointments/historique?hubspot_owner_id=${teleproUser.hubspot_owner_id}`
      )
      if (res.ok) setHistRdvs(await res.json())
    } finally {
      setHistLoading(false)
    }
  }, [teleproUser.hubspot_owner_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEngagements = useCallback(async (rdv: HistRdv) => {
    if (!rdv.hubspot_deal_id || engData[rdv.id]) return
    setLoadingEng(p => ({ ...p, [rdv.id]: true }))
    try {
      const res = await fetch(`/api/hubspot/deal/${rdv.hubspot_deal_id}`)
      if (res.ok) {
        const data = await res.json()
        setEngData(p => ({ ...p, [rdv.id]: { engagements: data.engagements ?? [] } }))
      }
    } finally {
      setLoadingEng(p => ({ ...p, [rdv.id]: false }))
    }
  }, [engData]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'historique') fetchHistorique()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const marquerPerdu = useCallback(async (rdv: HistRdv) => {
    if (!rdv.hubspot_deal_id) return
    setClosingDeal(rdv.id)
    try {
      const res = await fetch(`/api/hubspot/deal/${rdv.hubspot_deal_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'fermePerdu' }),
      })
      if (res.ok) {
        setHistRdvs(prev => prev.map(r =>
          r.id === rdv.id
            ? { ...r, hs_stage_label: 'Fermé / Perdu', hs_stage_color: '#ef4444' }
            : r
        ))
      }
    } finally {
      setClosingDeal(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveSuivi = useCallback(async (rdv: HistRdv, suivi: string | null) => {
    if (rdv.id === rdv.hubspot_deal_id) return // entrée HubSpot-only, pas de Supabase
    setSavingSuivi(rdv.id)
    try {
      const res = await fetch(`/api/appointments/${rdv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telepro_suivi: suivi }),
      })
      if (res.ok) {
        setHistRdvs(prev => prev.map(r =>
          r.id === rdv.id
            ? { ...r, telepro_suivi: suivi, telepro_suivi_at: suivi ? new Date().toISOString() : null }
            : r
        ))
      }
    } finally {
      setSavingSuivi(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const REPRISE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
  const hasReprise = (data: EngInfo) => {
    const cutoff = Date.now() - REPRISE_WINDOW_MS
    return data.engagements.some(e =>
      e.createdAt > cutoff && ['CALL', 'INCOMING_EMAIL', 'EMAIL'].includes(e.type)
    )
  }
  const repriseCount = histRdvs.filter(r => engData[r.id] && hasReprise(engData[r.id])).length

  const uniqueStages = useMemo(() => {
    const map = new Map<string, { color: string; count: number }>()
    histRdvs.forEach(r => {
      if (!r.hs_stage_label || !r.hs_stage_color) return
      const e = map.get(r.hs_stage_label)
      if (e) e.count++
      else map.set(r.hs_stage_label, { color: r.hs_stage_color, count: 1 })
    })
    return [...map.entries()].map(([label, { color, count }]) => ({ label, color, count }))
  }, [histRdvs])

  const filteredHistRdvs = useMemo(() =>
    stageFilter ? histRdvs.filter(r => r.hs_stage_label === stageFilter) : histRdvs,
    [histRdvs, stageFilter]
  )

  const SUIVI_OPTIONS = [
    { value: 'ne_repond_plus', label: '📵 Ne répond plus', color: '#6b7280' },
    { value: 'a_travailler',   label: '🔧 À travailler',   color: '#f59e0b' },
    { value: 'pre_positif',    label: '⭐ Pré-positif',    color: '#06b6d4' },
  ]

  // ── Computed stats ────────────────────────────────────────────────────
  const now = new Date()
  const rdvsThisMonth = myRdvs.filter(r => {
    const d = new Date(r.start_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const rdvsPositifs = myRdvs.filter(r => r.status === 'positif' || r.status === 'preinscription')
  const rdvsAVenir = myRdvs.filter(r => new Date(r.start_at) > now)

  // Counts par statut
  const statusCounts = myRdvs.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ── Planning week ─────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(planningWeekStart, i))
  const rdvsThisWeek = myRdvs.filter(r =>
    isSameWeek(new Date(r.start_at), planningWeekStart, { weekStartsOn: 1 })
  )
  const isCurrentWeek = isSameWeek(planningWeekStart, now, { weekStartsOn: 1 })

  // Filtered list for status view
  const filteredRdvs = statusFilter
    ? [...myRdvs].filter(r => r.status === statusFilter).sort((a, b) =>
        new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
      )
    : []

  // Chrono view: all RDVs sorted by date ascending, grouped by day
  const allRdvsSorted = [...myRdvs].sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  )
  const allChronoGroups: { date: Date; rdvs: MyAppointment[] }[] = []
  for (const rdv of allRdvsSorted) {
    const d = new Date(rdv.start_at)
    const existing = allChronoGroups.find(g => isSameDay(g.date, d))
    if (existing) existing.rdvs.push(rdv)
    else allChronoGroups.push({ date: d, rdvs: [rdv] })
  }

  // ── Slots ─────────────────────────────────────────────────────────────
  async function loadPoolSlots(date: Date) {
    setSlotsLoading(true)
    setSlots([])
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const res = await fetch(`/api/availability/pool?date=${dateStr}`)
      if (res.ok) setSlots(await res.json())
    } finally {
      setSlotsLoading(false)
    }
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setSelectedSlot(null)
    loadPoolSlots(date)
  }

  // ── Recherche HubSpot ─────────────────────────────────────────────────
  async function searchContact() {
    if (!lookupInput.trim()) return
    setLookupLoading(true); setLookupError(null); setContact(null)
    try {
      const param = lookupMode === 'url'
        ? `url=${encodeURIComponent(lookupInput.trim())}`
        : `phone=${encodeURIComponent(lookupInput.trim())}`
      const res = await fetch(`/api/hubspot/contact?${param}`)
      const data = await res.json()
      if (!res.ok) { setLookupError(data.error || 'Erreur'); return }
      const found: HubSpotContact[] = data.results || []
      if (found.length === 0) { setLookupError('Aucun contact trouvé.'); return }
      const c = found[0]; setContact(c)
      const p = c.properties
      const ev = p.email || ''; setEmail(ev); emailOriginalRef.current = ev; setEmailSynced(false)
      if (p.phone) setPhone(p.phone)
      if (p.departement) setDepartement(String(p.departement))
      if (p.classe_actuelle) setClasseActuelle(p.classe_actuelle)
      if (p.diploma_sante___formation_demandee) setFormation(p.diploma_sante___formation_demandee)
    } catch { setLookupError('Erreur réseau') }
    finally { setLookupLoading(false) }
  }

  // ── Créer nouveau contact HubSpot ─────────────────────────────────────
  async function createNewContact() {
    if (!newFirstname.trim() || !newLastname.trim() || !newEmail.trim()) return
    setCreating(true); setLookupError(null)
    try {
      const res = await fetch('/api/hubspot/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstname: newFirstname.trim(), lastname: newLastname.trim(),
          email: newEmail.trim(), phone: newPhone.trim() || undefined,
          departement: newDepartement.trim() || undefined,
          classe_actuelle: newClasse || undefined, formation: newFormation || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setLookupError(data.error || 'Erreur'); return }
      setContact(data)
      setEmail(newEmail); emailOriginalRef.current = newEmail; setEmailSynced(false)
      if (newPhone) setPhone(newPhone)
      if (newDepartement) setDepartement(newDepartement)
      if (newClasse) setClasseActuelle(newClasse)
      if (newFormation) setFormation(newFormation)
    } catch { setLookupError('Erreur réseau') }
    finally { setCreating(false) }
  }

  function resetContact() {
    setContact(null); setLookupInput(''); setLookupError(null)
    setEmail(''); emailOriginalRef.current = ''; setEmailSynced(false)
    setPhone(''); setDepartement(''); setClasseActuelle(''); setFormation('')
    setMeetingType('visio'); setMeetingLink(generateJitsiLink()); setLinkCopied(false)
    setNotes(''); setSelectedDate(null); setSelectedSlot(null); setError(null)
    setNewFirstname(''); setNewLastname(''); setNewEmail(''); setNewPhone('')
    setNewFormation(''); setNewClasse(''); setNewDepartement('')
  }

  async function syncEmail() {
    if (!contact || !email.trim() || email.trim() === emailOriginalRef.current) return
    setEmailSynced(false)
    try {
      const res = await fetch('/api/hubspot/contact', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, properties: { email: email.trim() } }),
      })
      if (res.ok) { emailOriginalRef.current = email.trim(); setEmailSynced(true); setTimeout(() => setEmailSynced(false), 2000) }
    } catch { /* silencieux */ }
  }

  // ── Reprendre un RDV (depuis la vue suivi) ────────────────────────────
  async function handleReprendre(rdv: MyAppointment) {
    resetContact()
    if (rdv.hubspot_contact_id) {
      setRebookLoading(rdv.id)
      try {
        const res = await fetch(`/api/hubspot/contact?url=${rdv.hubspot_contact_id}`)
        const data = await res.json()
        if (res.ok && data.results?.length > 0) {
          const c = data.results[0]; setContact(c)
          const p = c.properties
          const ev = p.email || ''; setEmail(ev); emailOriginalRef.current = ev; setEmailSynced(false)
          if (p.phone) setPhone(p.phone)
          if (p.departement) setDepartement(String(p.departement))
          if (p.classe_actuelle) setClasseActuelle(p.classe_actuelle)
          if (p.diploma_sante___formation_demandee) setFormation(p.diploma_sante___formation_demandee)
        }
      } finally {
        setRebookLoading(null)
      }
    }
    setActiveTab('form')
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const contactName = contact ? [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') : ''
  const contactEmail = email || contact?.properties.email || ''
  const canSubmit = contact && selectedSlot && phone && departement && classeActuelle && formation

  async function submit() {
    if (!canSubmit) { setError('Remplis tous les champs obligatoires (*)'); return }
    setSubmitting(true); setError(null)
    const formationLabel = FORMATIONS.find(f => f.value === formation)?.label || formation
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: contactName || contactEmail,
          prospect_email: contactEmail, prospect_phone: phone,
          start_at: selectedSlot!.start, end_at: selectedSlot!.end,
          source: 'telepro', formation_type: formationLabel, formation_hs_value: formation,
          hubspot_contact_id: contact!.id, departement, classe_actuelle: classeActuelle,
          meeting_type: meetingType,
          meeting_link: meetingType === 'visio' ? meetingLink || null : null,
          telepro_id: teleproUser.id,
          call_notes: [
            `📚 Formation demandée : ${formationLabel}`,
            `📍 Département : ${departement}`,
            `🎓 Classe actuelle : ${classeActuelle}`,
            phone ? `📞 Téléphone : ${phone}` : '',
            notes.trim() ? `\n📝 Notes d'appel :\n${notes.trim()}` : '',
          ].filter(Boolean).join('\n'),
        }),
      })
      if (res.ok) { setSuccess(true) }
      else { const data = await res.json(); setError(data.error || 'Erreur') }
    } finally { setSubmitting(false) }
  }

  function reset() { setSuccess(false); resetContact() }

  // ─── Success screen ────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e8eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#1e2130', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '48px 40px', textAlign: 'center', maxWidth: 440 }}>
          <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: 16 }} />
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>RDV enregistré !</div>
          <div style={{ fontSize: 15, color: '#8b8fa8', marginBottom: 4 }}>{contactName}</div>
          <div style={{ fontSize: 14, color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>
            {selectedSlot && format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
          </div>
          {meetingType === 'visio' && meetingLink && (
            <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Video size={14} style={{ color: '#6b87ff', flexShrink: 0 }} />
              <a href={meetingLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#6b87ff', wordBreak: 'break-all', flex: 1 }}>{meetingLink}</a>
              <button onClick={() => { navigator.clipboard.writeText(meetingLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                style={{ background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(79,110,247,0.15)', border: 'none', borderRadius: 6, padding: '5px 10px', color: linkCopied ? '#22c55e' : '#6b87ff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {linkCopied ? <><Check size={10} /> Copié</> : <><Copy size={10} /> Copier</>}
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#555870', marginBottom: 28, marginTop: 12, padding: '10px 16px', background: 'rgba(79,110,247,0.08)', borderRadius: 8, border: '1px solid rgba(79,110,247,0.15)' }}>
            Le RDV est dans la file d&apos;attente.<br />Pascal va l&apos;assigner à un closer.<br />
            <span style={{ color: '#6b87ff' }}>Les notes sont enregistrées sur la transaction HubSpot.</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reset} style={{ flex: 1, background: '#4f6ef7', color: 'white', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              + Nouveau RDV
            </button>
            <button onClick={() => { reset(); setActiveTab('rdvs'); fetchMyRdvs() }}
              style={{ flex: 1, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Voir mon planning
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main UI ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e8eaf0' }}>

      {/* Preview banner */}
      {previewMode && adminUser && (
        <div style={{ background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.3)', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>👁 Mode aperçu</span>
          <span style={{ color: '#8b8fa8' }}>Tu vois la plateforme telle que</span>
          <span style={{ color: '#e8eaf0', fontWeight: 700 }}>{teleproUser.name}</span>
          <span style={{ color: '#8b8fa8' }}>la voit.</span>
          <a href="/admin" style={{ marginLeft: 'auto', color: '#f59e0b', fontSize: 11, textDecoration: 'none', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
            ← Retour Admin
          </a>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#1a1d27', borderBottom: '1px solid #2a2d3e', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: teleproUser.avatar_color ? `${teleproUser.avatar_color}25` : 'rgba(79,110,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${teleproUser.avatar_color || '#6b87ff'}50` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: teleproUser.avatar_color || '#6b87ff' }}>
              {teleproUser.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Bonjour {teleproUser.name}</div>
            <div style={{ fontSize: 11, color: '#555870' }}>Placement RDV — Télépro</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isAdmin && (
            <>
              <button onClick={() => setActiveTab('form')} style={{
                background: activeTab === 'form' ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTab === 'form' ? 'rgba(79,110,247,0.4)' : '#3a3d50'}`,
                borderRadius: 8, padding: '6px 12px', color: activeTab === 'form' ? '#6b87ff' : '#8b8fa8',
                fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <PlusCircle size={12} /> Nouveau RDV
              </button>
              <button onClick={() => setActiveTab('rdvs')} style={{
                background: activeTab === 'rdvs' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTab === 'rdvs' ? 'rgba(34,197,94,0.4)' : '#3a3d50'}`,
                borderRadius: 8, padding: '6px 12px', color: activeTab === 'rdvs' ? '#22c55e' : '#8b8fa8',
                fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <Calendar size={12} /> Mon planning
                {myRdvs.length > 0 && (
                  <span style={{ background: 'rgba(34,197,94,0.2)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                    {myRdvs.length}
                  </span>
                )}
              </button>
              <button onClick={() => setActiveTab('historique')} style={{
                background: activeTab === 'historique' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTab === 'historique' ? 'rgba(245,158,11,0.4)' : '#3a3d50'}`,
                borderRadius: 8, padding: '6px 12px', color: activeTab === 'historique' ? '#f59e0b' : '#8b8fa8',
                fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'inherit',
              }}>
                <Clock size={12} /> Historique
                {histRdvs.length > 0 && (
                  <span style={{ background: 'rgba(245,158,11,0.2)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                    {histRdvs.length}
                  </span>
                )}
                {repriseCount > 0 && (
                  <span style={{ background: '#f97316', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                    🔔 {repriseCount}
                  </span>
                )}
              </button>
            </>
          )}
          {isAdmin && !previewMode && (
            <a href="/admin" style={{ background: 'transparent', border: '1px solid #2a2d3e', borderRadius: 8, padding: '6px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ArrowLeft size={12} /> Admin
            </a>
          )}
          {!previewMode && <LogoutButton />}
        </div>
      </div>

      {/* ── Modal fiche RDV ─────────────────────────────────────────────── */}
      {selectedRdv && (
        <TeleproRdvModal
          rdv={selectedRdv}
          noteValue={selectedRdv.id in editingNotes ? editingNotes[selectedRdv.id] : (selectedRdv.notes || '')}
          onNoteChange={val => setEditingNotes(prev => ({ ...prev, [selectedRdv.id]: val }))}
          onNoteSave={() => saveNote(selectedRdv.id)}
          saving={savingNote === selectedRdv.id}
          saved={savedNote === selectedRdv.id}
          onClose={() => setSelectedRdv(null)}
          onConfirm={() => confirmRdv(selectedRdv.id)}
          confirming={confirmingRdv === selectedRdv.id}
          onCancel={() => cancelRdv(selectedRdv.id)}
          cancelling={cancellingRdv === selectedRdv.id}
          onReset={() => resetRdv(selectedRdv.id)}
        />
      )}

      {/* ── Onglet Mon Planning ──────────────────────────────────────────── */}
      {activeTab === 'rdvs' && !isAdmin && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={18} style={{ color: '#22c55e' }} />
                Mon Planning
              </div>
              <div style={{ fontSize: 12, color: '#555870', marginTop: 2 }}>
                Suivi de tous tes RDVs placés
              </div>
            </div>
            <button onClick={fetchMyRdvs} style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
              <RefreshCw size={14} style={{ animation: myRdvsLoading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Stats KPI — données HubSpot (toutes périodes) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Total placés', value: hsStats?.total ?? myRdvs.length, color: '#6b87ff', bg: 'rgba(79,110,247,0.1)' },
              { label: 'Ce mois', value: hsStats?.thisMonth ?? rdvsThisMonth.length, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
              { label: 'Positifs 🎉', value: hsStats?.positifs ?? rdvsPositifs.length, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
              { label: 'À venir', value: hsStats?.aVenir ?? rdvsAVenir.length, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
            ].map(stat => (
              <div key={stat.label} style={{ background: stat.bg, border: `1px solid ${stat.color}25`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: '#8b8fa8', marginTop: 4, fontWeight: 600 }}>{stat.label}</div>
              </div>
            ))}
          </div>
          {hsStats && (
            <div style={{ fontSize: 11, color: '#555870', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#f59e0b' }}>●</span> Stats issues de HubSpot (historique complet)
            </div>
          )}

          {/* Filtre par statut */}
          {myRdvs.length > 0 && (
            <div style={{ background: '#1a1d27', border: '1px solid #2a2d3e', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#555870', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Suivi par statut — clique pour filtrer
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {/* Bouton "Tous" */}
                <button
                  onClick={() => setStatusFilter(null)}
                  style={{
                    background: statusFilter === null ? 'rgba(255,255,255,0.1)' : 'transparent',
                    border: `1px solid ${statusFilter === null ? 'rgba(255,255,255,0.3)' : '#2a2d3e'}`,
                    borderRadius: 20, padding: '4px 12px', color: statusFilter === null ? '#e8eaf0' : '#555870',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Tous ({myRdvs.length})
                </button>
                {/* Badges par statut */}
                {TRACKING_STATUSES.map(status => {
                  const count = statusCounts[status] || 0
                  if (count === 0) return null
                  const cfg = STATUS_CONFIG[status]
                  const active = statusFilter === status
                  return (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(active ? null : status)}
                      style={{
                        background: active ? `${cfg.bg}` : 'transparent',
                        border: `1px solid ${active ? cfg.border : '#2a2d3e'}`,
                        borderRadius: 20, padding: '4px 12px',
                        color: active ? cfg.color : '#8b8fa8',
                        fontSize: 12, fontWeight: active ? 700 : 600, cursor: 'pointer',
                        transition: 'all 0.12s',
                      }}
                    >
                      {cfg.label} ({count})
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Toggle vue chronologique / par semaine */}
          {myRdvs.length > 0 && !statusFilter && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <button
                onClick={() => setPlanningView('chrono')}
                style={{
                  background: planningView === 'chrono' ? 'rgba(79,110,247,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${planningView === 'chrono' ? 'rgba(79,110,247,0.4)' : '#3a3d50'}`,
                  borderRadius: 8, padding: '6px 14px',
                  color: planningView === 'chrono' ? '#6b87ff' : '#555870',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <List size={12} /> Chronologique
              </button>
              <button
                onClick={() => setPlanningView('week')}
                style={{
                  background: planningView === 'week' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${planningView === 'week' ? 'rgba(34,197,94,0.4)' : '#3a3d50'}`,
                  borderRadius: 8, padding: '6px 14px',
                  color: planningView === 'week' ? '#22c55e' : '#555870',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <Calendar size={12} /> Par semaine
              </button>
            </div>
          )}

          {myRdvsLoading && myRdvs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#555870' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
              <div>Chargement…</div>
            </div>
          ) : myRdvs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#555870' }}>
              <Calendar size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Aucun RDV placé pour le moment</div>
              <div style={{ fontSize: 13 }}>Place ton premier RDV depuis l&apos;onglet &quot;Nouveau RDV&quot;</div>
            </div>

          ) : statusFilter ? (
            /* ── Vue filtrée par statut ─────────────────────────────── */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: STATUS_CONFIG[statusFilter]?.color }}>
                  {STATUS_CONFIG[statusFilter]?.label} — {filteredRdvs.length} RDV{filteredRdvs.length > 1 ? 's' : ''}
                </div>
                <button onClick={() => setStatusFilter(null)}
                  style={{ background: 'transparent', border: 'none', color: '#555870', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <X size={12} /> Tout voir
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredRdvs.map(rdv => {
                  const expanded = expandedRdv === rdv.id
                  const canReplan = REPLAN_STATUSES.includes(rdv.status)
                  const isRebooking = rebookLoading === rdv.id
                  return (
                    <div key={rdv.id} style={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>

                        {/* Date */}
                        <div style={{ minWidth: 70, flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#6b87ff' }}>
                            {format(new Date(rdv.start_at), 'd MMM', { locale: fr })}
                          </div>
                          <div style={{ fontSize: 12, color: '#555870' }}>
                            {format(new Date(rdv.start_at), 'HH:mm')}
                          </div>
                        </div>

                        {/* Prospect */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0' }}>{rdv.prospect_name}</div>
                          <div style={{ fontSize: 12, color: '#555870', display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                            {rdv.formation_type && <span>{rdv.formation_type}</span>}
                            {rdv.prospect_phone && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#8b8fa8' }}>
                                <Phone size={10} /> {rdv.prospect_phone}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Closer + actions */}
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                          {rdv.rdv_users ? (
                            <div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <User size={10} /> {rdv.rdv_users.name}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: '#555870' }}>Non assigné</div>
                          )}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {canReplan && (
                              <button
                                onClick={() => handleReprendre(rdv)}
                                disabled={isRebooking}
                                style={{ background: 'rgba(79,110,247,0.15)', border: '1px solid rgba(79,110,247,0.3)', borderRadius: 7, padding: '4px 10px', color: '#6b87ff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <RotateCcw size={10} />
                                {isRebooking ? 'Chargement…' : 'Reprendre RDV'}
                              </button>
                            )}
                            <button onClick={() => { setSelectedRdv(rdv); setEditingNotes(prev => ({ ...prev, [rdv.id]: rdv.notes || '' })) }}
                              style={{ background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.25)', borderRadius: 7, padding: '4px 10px', color: '#6b87ff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              Voir fiche
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          ) : planningView === 'chrono' ? (
            /* ── Vue chronologique ──────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allChronoGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#555870' }}>
                  <Calendar size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
                  <div style={{ fontSize: 14 }}>Aucun RDV</div>
                </div>
              ) : allChronoGroups.map(({ date, rdvs: dayRdvs }) => {
                const isPast = date < today && !isSameDay(date, today)
                const isToday = isSameDay(date, today)
                return (
                  <div key={date.toISOString()}>
                    {/* En-tête jour */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 4 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                        color: isToday ? '#6b87ff' : isPast ? '#3d4060' : '#555870',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {isToday && <span style={{ background: '#6b87ff', borderRadius: 4, padding: '1px 6px', color: 'white', fontSize: 9, fontWeight: 800, letterSpacing: 0 }}>AUJOURD&apos;HUI</span>}
                        {isPast && !isToday && <span style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 5px', color: '#3d4060', fontSize: 9, fontWeight: 700, letterSpacing: 0 }}>PASSÉ</span>}
                        {format(date, 'EEEE d MMMM yyyy', { locale: fr })}
                      </div>
                      <div style={{ flex: 1, height: 1, background: isToday ? 'rgba(79,110,247,0.3)' : '#1e2130' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#555870' }}>{dayRdvs.length} rdv</span>
                    </div>
                    {/* Cartes RDV */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {dayRdvs.map(rdv => {
                        const expanded = expandedRdv === rdv.id
                        const canReplan = REPLAN_STATUSES.includes(rdv.status)
                        const isRebooking = rebookLoading === rdv.id
                        return (
                          <div key={rdv.id} style={{
                            background: '#1e2130',
                            border: `1px solid ${isToday ? 'rgba(79,110,247,0.25)' : isPast ? '#252840' : '#2a2d3e'}`,
                            borderRadius: 10, overflow: 'hidden', opacity: isPast ? 0.8 : 1,
                          }}>
                            <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: isToday ? '#6b87ff' : isPast ? '#3d4060' : '#8b8fa8', minWidth: 44, flexShrink: 0 }}>
                                {format(new Date(rdv.start_at), 'HH:mm')}
                              </div>
                              <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: rdv.meeting_type === 'visio' ? 'rgba(79,110,247,0.15)' : rdv.meeting_type === 'telephone' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                              }}>
                                {rdv.meeting_type === 'visio' ? <Video size={11} style={{ color: '#6b87ff' }} />
                                  : rdv.meeting_type === 'telephone' ? <PhoneCall size={11} style={{ color: '#22c55e' }} />
                                  : <MapPin size={11} style={{ color: '#f59e0b' }} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {rdv.prospect_name}
                                </div>
                                <div style={{ fontSize: 11, color: '#555870', display: 'flex', gap: 8 }}>
                                  {rdv.formation_type && <span>{rdv.formation_type}</span>}
                                  {rdv.prospect_phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={9} />{rdv.prospect_phone}</span>}
                                </div>
                              </div>
                              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                {rdv.rdv_users ? (
                                  <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <User size={10} /> {rdv.rdv_users.name}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 11, color: '#555870' }}>Non assigné</div>
                                )}
                                <StatusBadge status={rdv.status} />
                                {canReplan && (
                                  <button
                                    onClick={() => handleReprendre(rdv)}
                                    disabled={isRebooking}
                                    style={{ background: 'rgba(79,110,247,0.15)', border: '1px solid rgba(79,110,247,0.3)', borderRadius: 7, padding: '3px 8px', color: '#6b87ff', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                                  >
                                    <RotateCcw size={9} />
                                    {isRebooking ? '…' : 'Reprendre'}
                                  </button>
                                )}
                              </div>
                              <button onClick={() => { setSelectedRdv(rdv); setEditingNotes(prev => ({ ...prev, [rdv.id]: rdv.notes || '' })) }}
                                style={{ background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.25)', borderRadius: 7, padding: '4px 10px', color: '#6b87ff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                                Voir fiche
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Vue semaine ────────────────────────────────────────── */
            <>
              {/* Navigation semaine */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                <button onClick={() => setPlanningWeekStart(w => subWeeks(w, 1))}
                  style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
                  <ChevronLeft size={16} />
                </button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e8eaf0' }}>
                    {isCurrentWeek ? 'Cette semaine' : `Semaine du ${format(planningWeekStart, 'd MMM', { locale: fr })} au ${format(addDays(planningWeekStart, 4), 'd MMM yyyy', { locale: fr })}`}
                  </div>
                  <div style={{ fontSize: 11, color: '#555870', marginTop: 2 }}>
                    {rdvsThisWeek.length} RDV{rdvsThisWeek.length > 1 ? 's' : ''} cette semaine
                  </div>
                </div>
                <button onClick={() => setPlanningWeekStart(w => addWeeks(w, 1))}
                  style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Jours */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {weekDays.map(day => {
                  const dayRdvs = rdvsThisWeek.filter(r => isSameDay(new Date(r.start_at), day))
                  const isPast = day < today && !isSameDay(day, today)
                  return (
                    <div key={day.toISOString()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', marginBottom: 4 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                          color: isSameDay(day, today) ? '#6b87ff' : isPast ? '#3d4060' : '#555870',
                          minWidth: 120,
                        }}>
                          {isSameDay(day, today) && <span style={{ color: '#6b87ff' }}>Aujourd&apos;hui · </span>}
                          {format(day, 'EEEE d MMM', { locale: fr })}
                        </div>
                        <div style={{ flex: 1, height: 1, background: isSameDay(day, today) ? 'rgba(79,110,247,0.3)' : '#1e2130' }} />
                        {dayRdvs.length > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#555870' }}>{dayRdvs.length} rdv</span>
                        )}
                      </div>

                      {dayRdvs.length === 0 ? (
                        <div style={{ paddingLeft: 12, paddingBottom: 6, fontSize: 12, color: '#2a2d3e', fontStyle: 'italic' }}>—</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                          {dayRdvs.map(rdv => {
                            const expanded = expandedRdv === rdv.id
                            return (
                              <div key={rdv.id} style={{
                                background: '#1e2130',
                                border: `1px solid ${isSameDay(day, today) ? 'rgba(79,110,247,0.25)' : '#2a2d3e'}`,
                                borderRadius: 10, overflow: 'hidden',
                              }}>
                                <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: '#6b87ff', minWidth: 44, flexShrink: 0 }}>
                                    {format(new Date(rdv.start_at), 'HH:mm')}
                                  </div>
                                  <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: rdv.meeting_type === 'visio' ? 'rgba(79,110,247,0.15)' : rdv.meeting_type === 'telephone' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                                  }}>
                                    {rdv.meeting_type === 'visio' ? <Video size={11} style={{ color: '#6b87ff' }} />
                                      : rdv.meeting_type === 'telephone' ? <PhoneCall size={11} style={{ color: '#22c55e' }} />
                                      : <MapPin size={11} style={{ color: '#f59e0b' }} />}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {rdv.prospect_name}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#555870', display: 'flex', gap: 8 }}>
                                      {rdv.formation_type && <span>{rdv.formation_type}</span>}
                                      {rdv.prospect_phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={9} />{rdv.prospect_phone}</span>}
                                    </div>
                                  </div>
                                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                    {rdv.rdv_users ? (
                                      <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <User size={10} /> {rdv.rdv_users.name}
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: 11, color: '#555870' }}>Non assigné</div>
                                    )}
                                    <StatusBadge status={rdv.status} />
                                    <button onClick={() => { setSelectedRdv(rdv); setEditingNotes(prev => ({ ...prev, [rdv.id]: rdv.notes || '' })) }}
                                      style={{ background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.25)', borderRadius: 7, padding: '3px 8px', color: '#6b87ff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                      Voir fiche
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {!isCurrentWeek && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button onClick={() => setPlanningWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                    style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, padding: '7px 16px', fontSize: 12, color: '#8b8fa8', cursor: 'pointer', fontWeight: 600 }}>
                    Revenir à cette semaine
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Onglet Nouveau RDV ─────────────────────────────────────────── */}
      {(activeTab === 'form' || isAdmin) && (
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 20px' }}>

          {/* Étape 1 */}
          <div style={{
            background: '#1e2130',
            border: contact ? '1px solid rgba(34,197,94,0.35)' : '1px solid #2a2d3e',
            borderRadius: 14, padding: '18px 20px', marginBottom: 20, transition: 'border-color 0.2s',
          }}>
            {contact ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={17} style={{ color: '#22c55e' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>{contactName || '(Sans nom)'}</div>
                    <div style={{ fontSize: 12, color: '#555870' }}>{contactEmail} · HubSpot #{contact.id}</div>
                  </div>
                </div>
                <button onClick={resetContact} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 12px', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <X size={11} /> Changer
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Search size={14} style={{ color: '#6b87ff' }} />
                  Étape 1 — Trouver le contact HubSpot
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {([
                    { key: 'url' as const, icon: <Link size={11} />, label: 'Lien HubSpot' },
                    { key: 'phone' as const, icon: <Phone size={11} />, label: 'Téléphone' },
                    { key: 'new' as const, icon: <Plus size={11} />, label: 'Nouveau contact' },
                  ]).map(tab => (
                    <button key={tab.key} onClick={() => { setLookupMode(tab.key); setLookupInput(''); setLookupError(null) }}
                      style={{
                        background: lookupMode === tab.key ? tab.key === 'new' ? 'rgba(34,197,94,0.15)' : 'rgba(79,110,247,0.15)' : 'transparent',
                        border: `1px solid ${lookupMode === tab.key ? tab.key === 'new' ? 'rgba(34,197,94,0.4)' : 'rgba(79,110,247,0.4)' : '#2a2d3e'}`,
                        borderRadius: 8, padding: '5px 12px',
                        color: lookupMode === tab.key ? tab.key === 'new' ? '#22c55e' : '#6b87ff' : '#555870',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>
                {lookupMode !== 'new' && (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={lookupInput} onChange={e => setLookupInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchContact()}
                        placeholder={lookupMode === 'url' ? 'Coller le lien du contact HubSpot…' : 'Ex : 0612345678'}
                        style={{ ...inputStyle, flex: 1 }} autoFocus />
                      <button onClick={searchContact} disabled={lookupLoading || !lookupInput.trim()}
                        style={{ background: lookupInput.trim() ? '#4f6ef7' : '#252840', color: lookupInput.trim() ? 'white' : '#555870', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: lookupInput.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {lookupLoading ? '…' : 'Rechercher'}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#555870', marginTop: 10 }}>
                      Copie-colle le lien depuis la fiche contact HubSpot.
                    </div>
                  </>
                )}
                {lookupMode === 'new' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input value={newFirstname} onChange={e => setNewFirstname(e.target.value)} placeholder="Prénom *" style={inputStyle} autoFocus />
                      <input value={newLastname} onChange={e => setNewLastname(e.target.value)} placeholder="Nom *" style={inputStyle} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email *" style={inputStyle} />
                      <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone" style={inputStyle} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <select value={newFormation} onChange={e => setNewFormation(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Formation souhaitée</option>
                        {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={newClasse} onChange={e => setNewClasse(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Classe actuelle</option>
                        {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <input type="text" value={newDepartement} onChange={e => setNewDepartement(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Département (ex: 75)" maxLength={3} style={inputStyle} />
                    <button onClick={createNewContact} disabled={creating || !newFirstname.trim() || !newLastname.trim() || !newEmail.trim()}
                      style={{ background: (newFirstname.trim() && newLastname.trim() && newEmail.trim()) ? '#22c55e' : '#252840', color: (newFirstname.trim() && newLastname.trim() && newEmail.trim()) ? 'white' : '#555870', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: (newFirstname.trim() && newLastname.trim() && newEmail.trim()) ? 'pointer' : 'default' }}>
                      {creating ? 'Création…' : 'Créer le contact HubSpot'}
                    </button>
                  </div>
                )}
                {lookupError && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '9px 14px', color: '#ef4444', fontSize: 13, marginTop: 10 }}>
                    {lookupError}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Étape 2 */}
          {contact && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ marginBottom: 20 }}>
                  <div style={labelStyle}><Calendar size={12} style={{ color: '#4f6ef7' }} /> Date du RDV *</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {days.map(day => {
                      const sel = selectedDate && isSameDay(day, selectedDate)
                      return (
                        <button key={day.toISOString()} onClick={() => handleSelectDate(day)}
                          style={{ background: sel ? 'rgba(79,110,247,0.12)' : '#1e2130', border: `1px solid ${sel ? 'rgba(79,110,247,0.4)' : '#2a2d3e'}`, borderRadius: 8, padding: '7px 14px', color: sel ? '#6b87ff' : '#8b8fa8', fontSize: 13, fontWeight: sel ? 700 : 400, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ textTransform: 'capitalize' }}>{format(day, 'EEEE', { locale: fr })}</span>
                          <span>{format(day, 'd MMM', { locale: fr })}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                {selectedDate && (
                  <div>
                    <div style={labelStyle}>
                      <Clock size={12} style={{ color: '#22c55e' }} /> Créneau *
                      {slots.length > 0 && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>{slots.length} dispo</span>}
                    </div>
                    {slotsLoading ? (
                      <div style={{ color: '#555870', fontSize: 13, padding: '12px 0' }}>Chargement…</div>
                    ) : slots.length === 0 ? (
                      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>
                        Aucun créneau disponible.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                        {slots.map(slot => {
                          const sel = selectedSlot?.start === slot.start
                          return (
                            <button key={slot.start} onClick={() => setSelectedSlot(slot)}
                              style={{ background: sel ? 'rgba(34,197,94,0.12)' : '#1e2130', border: `1px solid ${sel ? 'rgba(34,197,94,0.4)' : '#2a2d3e'}`, borderRadius: 6, padding: '7px', color: sel ? '#22c55e' : '#8b8fa8', fontSize: 13, fontWeight: sel ? 700 : 400, cursor: 'pointer', position: 'relative' }}>
                              {format(new Date(slot.start), 'HH:mm')}
                              {slot.count && slot.count > 1 && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9, color: '#555870' }}>{slot.count}</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}><Mail size={12} style={{ color: '#06b6d4' }} /> Email
                    {emailSynced && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>MAJ HubSpot OK</span>}
                  </div>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={syncEmail} placeholder="email@exemple.com" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}><Phone size={12} style={{ color: '#6b87ff' }} /> Téléphone *</div>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex : 0612345678" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}><MapPin size={12} style={{ color: '#f59e0b' }} /> Département *</div>
                  <input type="text" value={departement} onChange={e => setDepartement(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ex : 75" maxLength={3} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}><GraduationCap size={12} style={{ color: '#a855f7' }} /> Classe actuelle *</div>
                  <select value={classeActuelle} onChange={e => setClasseActuelle(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Sélectionner…</option>
                    {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}><Tag size={12} style={{ color: '#22c55e' }} /> Formation souhaitée *</div>
                  <select value={formation} onChange={e => setFormation(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Sélectionner…</option>
                    {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}><Video size={12} style={{ color: '#6b87ff' }} /> Type de RDV</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([
                      { key: 'visio' as const, icon: <Video size={12} />, label: 'Visio', color: '#6b87ff' },
                      { key: 'telephone' as const, icon: <PhoneCall size={12} />, label: 'Téléphone', color: '#22c55e' },
                      { key: 'presentiel' as const, icon: <MapPin size={12} />, label: 'Présentiel', color: '#f59e0b' },
                    ]).map(t => (
                      <button key={t.key} type="button" onClick={() => { setMeetingType(t.key); if (t.key === 'visio' && !meetingLink) setMeetingLink(generateJitsiLink()); setLinkCopied(false) }}
                        style={{ flex: 1, background: meetingType === t.key ? `${t.color}18` : '#252840', border: `1px solid ${meetingType === t.key ? `${t.color}60` : '#2a2d3e'}`, borderRadius: 8, padding: '8px 6px', color: meetingType === t.key ? t.color : '#555870', fontSize: 12, fontWeight: meetingType === t.key ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  {meetingType === 'visio' && meetingLink && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 8, padding: '8px 12px' }}>
                      <Video size={13} style={{ color: '#6b87ff', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#8b8fa8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meetingLink}</span>
                      <button type="button" onClick={() => { navigator.clipboard.writeText(meetingLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                        style={{ background: linkCopied ? 'rgba(34,197,94,0.15)' : 'rgba(79,110,247,0.15)', border: 'none', borderRadius: 6, padding: '4px 8px', color: linkCopied ? '#22c55e' : '#6b87ff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {linkCopied ? <><Check size={10} /> Copié</> : <><Copy size={10} /> Copier</>}
                      </button>
                      <button type="button" onClick={() => setMeetingLink(generateJitsiLink())} style={{ background: 'transparent', border: 'none', padding: 4, color: '#555870', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>↻</button>
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={labelStyle}>
                    <FileText size={12} style={{ color: '#06b6d4' }} /> Notes d&apos;appel
                    <span style={{ fontSize: 10, color: '#3d5a80', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>→ HubSpot</span>
                  </div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Situation, motivations, objections…" rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
                {error && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
                    {error}
                  </div>
                )}
                {selectedSlot && (
                  <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 8, padding: '9px 14px', color: '#6b87ff', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>
                    {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
                  </div>
                )}
                <button onClick={submit} disabled={submitting || !canSubmit}
                  style={{ width: '100%', background: canSubmit ? '#4f6ef7' : '#252840', color: canSubmit ? 'white' : '#555870', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default' }}>
                  {submitting ? 'Enregistrement…' : 'Valider le RDV'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Onglet Historique ───────────────────────────────────────────── */}
      {activeTab === 'historique' && !isAdmin && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

          {/* En-tête */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} style={{ color: '#f59e0b' }} />
                Historique RDV
              </div>
              <div style={{ fontSize: 12, color: '#555870', marginTop: 2 }}>
                Diploma Santé 2026-2027 — RDVs passés depuis le 1er oct. 2025
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {histLoading && (
                <span style={{ fontSize: 12, color: '#555870', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
                </span>
              )}
              <button onClick={fetchHistorique} style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
                <RefreshCw size={13} style={{ animation: histLoading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              {!histLoading && (
                <span style={{ fontSize: 12, color: '#555870' }}>
                  {histRdvs.length} RDV{histRdvs.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Filtres par stage */}
          {uniqueStages.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {stageFilter && (
                <button
                  onClick={() => setStageFilter(null)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #3a3d50', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#8b8fa8', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ✕ Tous ({histRdvs.length})
                </button>
              )}
              {uniqueStages.map(s => (
                <button
                  key={s.label}
                  onClick={() => setStageFilter(stageFilter === s.label ? null : s.label)}
                  style={{
                    background: stageFilter === s.label ? `${s.color}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${stageFilter === s.label ? `${s.color}66` : '#3a3d50'}`,
                    borderRadius: 20, padding: '3px 10px',
                    color: stageFilter === s.label ? s.color : '#8b8fa8',
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                  }}
                >
                  {s.label} <span style={{ opacity: 0.7 }}>{s.count}</span>
                </button>
              ))}
            </div>
          )}

          {!histLoading && histRdvs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#555870', fontSize: 13 }}>
              {teleproUser.hubspot_owner_id
                ? 'Aucun RDV trouvé depuis le 1er octobre 2025 sur la pipeline Diploma Santé 2026-2027.'
                : 'Aucun hubspot_owner_id configuré pour ce télépro.'}
            </div>
          )}

          {filteredHistRdvs.length === 0 && stageFilter && !histLoading && (
            <div style={{ textAlign: 'center', padding: '30px 20px', color: '#555870', fontSize: 13 }}>
              Aucun RDV avec le statut «&nbsp;{stageFilter}&nbsp;».
            </div>
          )}

          {filteredHistRdvs.map(rdv => {
            const eng = engData[rdv.id]
            const isExpanded = expandedHistRdv === rdv.id
            const isReprise = eng && hasReprise(eng)
            const isAReplanifier = rdv.hs_stage_label === 'À replanifier'
            const isDelaiReflexion = rdv.hs_stage_label === 'Délai de réflexion'
            const isSupabaseBacked = rdv.id !== rdv.hubspot_deal_id

            return (
              <div key={rdv.id} style={{
                background: '#1a1d27',
                border: `1px solid ${isReprise ? '#f97316' : isAReplanifier ? 'rgba(249,115,22,0.3)' : '#2a2d3e'}`,
                borderRadius: 12, marginBottom: 10, overflow: 'hidden',
              }}>
                {/* Ligne principale : date, nom, closer, stage, reprise */}
                <div
                  onClick={() => {
                    const next = isExpanded ? null : rdv.id
                    setExpandedHistRdv(next)
                    if (next) fetchEngagements(rdv)
                  }}
                  style={{ padding: '14px 20px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <div style={{ minWidth: 80, fontSize: 11, color: '#555870', flexShrink: 0 }}>
                    {new Date(rdv.start_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </div>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: '#e8eaf0', minWidth: 0 }}>
                    {rdv.prospect_name}
                    {rdv.rdv_users && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#555870', fontWeight: 400 }}>
                        → {rdv.rdv_users.name}
                      </span>
                    )}
                  </div>
                  {rdv.hs_stage_label && rdv.hs_stage_color && (
                    <span style={{
                      background: `${rdv.hs_stage_color}22`, border: `1px solid ${rdv.hs_stage_color}66`,
                      color: rdv.hs_stage_color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {rdv.hs_stage_label}
                    </span>
                  )}
                  {isReprise && (
                    <span style={{ fontSize: 11, color: '#f97316', fontWeight: 600, flexShrink: 0 }}>🔔 Reprise</span>
                  )}
                  <span style={{ color: '#555870', fontSize: 12, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Ligne infos prospect (toujours visible) */}
                <div style={{ padding: '0 20px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {rdv.prospect_phone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8b8fa8', background: '#252840', borderRadius: 5, padding: '2px 8px' }}>
                      <Phone size={10} /> {rdv.prospect_phone}
                    </span>
                  )}
                  {rdv.prospect_email && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8b8fa8', background: '#252840', borderRadius: 5, padding: '2px 8px' }}>
                      <Mail size={10} /> {rdv.prospect_email}
                    </span>
                  )}
                  {rdv.formation_type && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8b8fa8', background: '#252840', borderRadius: 5, padding: '2px 8px' }}>
                      <GraduationCap size={10} /> {rdv.formation_type}
                    </span>
                  )}
                  {rdv.classe_actuelle && (
                    <span style={{ fontSize: 11, color: '#8b8fa8', background: '#252840', borderRadius: 5, padding: '2px 8px' }}>
                      {rdv.classe_actuelle}
                    </span>
                  )}
                </div>

                {/* Boutons d'action pour "À replanifier" */}
                {isAReplanifier && (
                  <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8 }}>
                    <button
                      onClick={e => { e.stopPropagation(); handleReprendre(rdv) }}
                      disabled={rebookLoading === rdv.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(79,110,247,0.12)', border: '1px solid rgba(79,110,247,0.35)',
                        borderRadius: 7, padding: '5px 12px', color: '#6b87ff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <RotateCcw size={12} />
                      {rebookLoading === rdv.id ? 'Chargement…' : 'Reprendre RDV'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); marquerPerdu(rdv) }}
                      disabled={closingDeal === rdv.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 7, padding: '5px 12px', color: '#ef4444',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <X size={12} />
                      {closingDeal === rdv.id ? 'En cours…' : 'Marquer comme perdu'}
                    </button>
                  </div>
                )}

                {/* Détails expansibles */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #2a2d3e', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* ── Fiche du closer ─────────────────────────────── */}
                    <div style={{ background: '#0f1117', border: '1px solid #2a2d3e', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#555870', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Fiche RDV
                      </div>
                      {/* Statut du RDV + type de meeting */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        {rdv.status && (
                          <StatusBadge status={rdv.status as AppointmentStatus} />
                        )}
                        {rdv.meeting_type && (
                          <span style={{ fontSize: 11, color: '#8b8fa8', background: '#1a1d27', border: '1px solid #2a2d3e', borderRadius: 5, padding: '2px 8px' }}>
                            {rdv.meeting_type === 'visio' ? '🎥 Visio' : rdv.meeting_type === 'telephone' ? '📞 Téléphone' : '🤝 Présentiel'}
                          </span>
                        )}
                        {rdv.rdv_users && (
                          <span style={{ fontSize: 11, color: '#8b8fa8' }}>Closer : <strong style={{ color: '#c8cadb' }}>{rdv.rdv_users.name}</strong></span>
                        )}
                      </div>
                      {/* Rapport closer */}
                      {(rdv.report_summary || rdv.report_telepro_advice) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {rdv.report_summary && (
                            <p style={{ fontSize: 13, color: '#c8cadb', margin: 0, lineHeight: 1.5 }}>{rdv.report_summary}</p>
                          )}
                          {rdv.report_telepro_advice && (
                            <p style={{ fontSize: 12, color: '#f59e0b', margin: 0 }}>💡 {rdv.report_telepro_advice}</p>
                          )}
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: '#555870', margin: 0, fontStyle: 'italic' }}>
                          {rdv.rdv_users ? 'Aucun rapport laissé par le closer.' : 'RDV non encore assigné à un closer.'}
                        </p>
                      )}
                    </div>

                    {/* ── Suivi post-RDV (Délai de réflexion uniquement) ── */}
                    {isDelaiReflexion && isSupabaseBacked && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#555870', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Suivi post-RDV
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {SUIVI_OPTIONS.map(opt => {
                            const isActive = rdv.telepro_suivi === opt.value
                            return (
                              <button
                                key={opt.value}
                                onClick={() => saveSuivi(rdv, isActive ? null : opt.value)}
                                disabled={savingSuivi === rdv.id}
                                style={{
                                  background: isActive ? `${opt.color}22` : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${isActive ? `${opt.color}66` : '#3a3d50'}`,
                                  borderRadius: 7, padding: '5px 12px',
                                  color: isActive ? opt.color : '#8b8fa8',
                                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                        {rdv.telepro_suivi && rdv.telepro_suivi_at && (
                          <p style={{ fontSize: 11, color: '#555870', margin: '6px 0 0' }}>
                            Mis à jour le {new Date(rdv.telepro_suivi_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Note télépro éditable */}
                    <HistoriqueNoteEditor rdvId={rdv.id} initialNote={rdv.notes ?? ''} />

                    {/* Activité HubSpot */}
                    {loadingEng[rdv.id] && (
                      <p style={{ fontSize: 12, color: '#555870', margin: 0 }}>⏳ Chargement activité HubSpot…</p>
                    )}
                    {eng && eng.engagements.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#555870', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Activité HubSpot
                        </div>
                        {eng.engagements.slice(0, 8).map(e => (
                          <div key={e.id} style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 12 }}>
                            <span style={{ color: '#555870', minWidth: 90, flexShrink: 0 }}>
                              {new Date(e.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </span>
                            <span style={{ color: '#8b8fa8', minWidth: 75, flexShrink: 0 }}>
                              {e.type === 'NOTE' ? '📝 Note'
                                : e.type === 'CALL' ? '📞 Appel'
                                : (e.type === 'EMAIL' || e.type === 'INCOMING_EMAIL') ? '✉️ Email'
                                : e.type}
                            </span>
                            {e.body && (
                              <span style={{ color: '#c8cadb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                                {e.body.replace(/<[^>]+>/g, '').slice(0, 150)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {eng && eng.engagements.length === 0 && !loadingEng[rdv.id] && (
                      <p style={{ fontSize: 12, color: '#555870', margin: 0 }}>Aucune activité HubSpot enregistrée.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
