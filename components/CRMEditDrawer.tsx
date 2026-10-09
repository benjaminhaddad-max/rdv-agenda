'use client'

import { allInscriptionLeadStatuses } from '@/lib/inscription-status'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, ExternalLink, Calendar, ChevronLeft, ChevronRight, Clock, Video, MapPin, CheckCircle, ChevronDown, Check, Pencil, User, Users, Tag, Briefcase } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Button, CrmV2Input, CrmV2SectionLabel, CrmV2Segmented, CrmV2Select, CrmV2StatusPill, CrmV2Textarea,
} from '@/components/crm-v2/primitives'
import { CrmV2ModalHeader, CrmV2ModalShell, CrmV2Notice, crmV2FieldStyle } from '@/components/crm-v2/modals/ModalShell'
import LinovaAppointmentModal from '@/components/crm/LinovaAppointmentModal'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'

// Constantes
const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: '#4cabdb' },
  '3165428981': { label: 'Délai Réflexion',       color: '#b8963e' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#7c98b6' },
}

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

const ZONE_OPTIONS_LIST = [
  { id: '', label: '—' },
  ...['Aix / Marseille','Antilles','Autre','Bordeaux / Pau',
     'IDF','Lille','Montpellier / Nimes','Proche IDF'].map(z => ({ id: z, label: z })),
]

const LEAD_STATUS_LIST = [
  { id: '', label: '—' },
  ...["A garder pour l'an prochain",'A relancer','A replanifier','Autre prépa concurrente',
     'Disqualifié','Doublon','En attente / Réfléchit','En cours','Inscrit','Mauvais numéro',
     'NRP1','NRP2','NRP3','NRP4','Nouveau','Nouveau - Chaud',
     'Pré-inscrit 2025/2026','Pré-inscrit 2026/2027','Pré-inscrit 2027/2028','Raccroche au nez','Rdv pris',
  ].map(v => ({ id: v, label: v })),
  // Statuts pilotés par la plateforme d'inscription (Diploma + Medibox)
  ...allInscriptionLeadStatuses()
    .filter(v => !['Pré-inscrit 2025/2026', 'Pré-inscrit 2026/2027', 'Pré-inscrit 2027/2028'].includes(v))
    .map(v => ({ id: v, label: v })),
]

const SOURCE_LIST = [
  { id: '', label: '—' },
  ...["Anciens salons L'étudiant",'Anciens salons Lycée','Anciens salons Studyrama',
     'Appel Diploma Santé','Autre','Bouche à oreille - Diploma Santé','Campagne ADS Google',
     'Campagne Ads - Snapchat','Campagne réseaux sociaux - Tiktok','Diplomeo (Partenaire)',
     'Déjà étudiant','Edumove','Extrastudent','Figaro étudiant','Hermione (Partenaire)',
     'Hippocast (Partenaire)','Influenceur',"L'Etudiant [leads]",'Lycée George Leven',
     'Lycée Maimonide Rambam','Lycée Yabné','Nomad Education (Partenaire)','Nomad Spéciaux',
     'Campagne ADS META','Salon étudiant 2024-2025 (AFEM)','Salon étudiant 2024-2025 (Diploma)',
     'Salons','Site AFEM','Site Diploma Santé','Special Premium','Studyrama',
     'Thotis (Partenaire)','Thotis - Medibox','Twitter','Vecteur Bac',
  ].map(v => ({ id: v, label: v })),
]

const FORMATION_LIST = [
  { id: '', label: '—' },
  ...['APES0','LAS','LAS 2 UPEC','LAS 3 Upec','LSPS','P-1','P-2','PAS',
  ].map(v => ({ id: v, label: v })),
]

const CLASSE_OPTIONS = [
  '', 'Terminale', 'Première', 'Seconde', 'Troisième',
  'PASS', 'LSPS 1', 'LSPS 2', 'LSPS 3', 'LAS 1', 'LAS 2', 'LAS 3',
  'Etudes médicales', 'Etudes Sup.', 'Autres',
]

const MEETING_TYPES = [
  { value: 'visio', label: 'Visio', icon: Video },
  { value: 'presentiel', label: 'Présentiel', icon: MapPin },
]

const CAMPUS_OPTIONS = [
  '100 quai de la Rapée 75012 Paris',
  '29 rue Lauriston 75016 Paris',
]

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

interface RdvUser {
  id: string
  name: string
  email?: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
  role: string
  avatar_color?: string
}

interface CRMContact {
  hubspot_contact_id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  departement?: string | null
  classe_actuelle?: string | null
  zone_localite?: string | null
  formation_demandee?: string | null
  contact_createdate?: string | null
  hubspot_owner_id?: string | null
  telepro_user_id?: string | null
  closer_du_contact_owner_id?: string | null
  extra_props?: Record<string, unknown> | null
  recent_conversion_date?: string | null
  recent_conversion_event?: string | null
  hs_lead_status?: string | null
  origine?: string | null
  contact_owner?: { id: string; name: string; role: string; avatar_color: string } | null
  deal?: {
    hubspot_deal_id: string
    dealstage?: string | null
    formation?: string | null
    closedate?: string | null
    createdate?: string | null
    supabase_appt_id?: string | null
    hubspot_owner_id?: string | null
    teleprospecteur?: string | null
    closer?: { id: string; name: string; avatar_color: string } | null
    telepro?: { id: string; name: string; avatar_color: string } | null
  } | null
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getContactClasseValue(contact: CRMContact): string {
  const direct = normalizeClasseActuelle(contact.classe_actuelle) || pickString(contact.classe_actuelle)
  if (direct) return direct

  const extra = (contact.extra_props && typeof contact.extra_props === 'object')
    ? contact.extra_props as Record<string, unknown>
    : {}

  return (
    normalizeClasseActuelle(extra.classe_actuelle) ||
    normalizeClasseActuelle(extra.classe) ||
    normalizeClasseActuelle(extra.hs_classe_actuelle) ||
    normalizeClasseActuelle(extra.current_class) ||
    pickString(extra.classe_actuelle) ||
    pickString(extra.classe) ||
    pickString(extra.hs_classe_actuelle) ||
    pickString(extra.current_class) ||
    ''
  )
}

interface HubspotOwnerMeta {
  hubspot_owner_id: string
  firstname?: string
  lastname?: string
  email?: string
}

interface CurrentApiUser {
  crm_brand?: string | null
  role?: string | null
}

interface Props {
  contact: CRMContact | null
  closers: RdvUser[]
  telepros: RdvUser[]
  // Tous les rdv_users (tous rôles confondus). Optionnel pour rétro-compatibilité :
  // si non fourni, on retombe sur la fusion historique closers + telepros.
  // Permet aux dropdowns Closer/Télépro de proposer TOUS les utilisateurs du CRM
  // (comme la propriété "Owner" de HubSpot), tout en préservant les heuristiques
  // d'affichage basées sur le rôle (closers vs telepros).
  allUsers?: RdvUser[]
  hubspotOwners?: HubspotOwnerMeta[]
  onClose: () => void
  onRefresh: () => void
  preloadedLeadStatuses?: string[]
  preloadedSources?: string[]
  preloadedFormations?: string[]
  preloadedZones?: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────
function generateJitsiLink() {
  // Nom historique conservé pour éviter une refacto massive — génère
  // désormais une URL LiveKit (self-hosted ou Cloud) pointant sur /visio/{room}.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)]
  const base = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://rdv-agenda.vercel.app')
  return `${base}/visio/rdv-${id}`
}

function getWeekDays(weekOffset: number): Date[] {
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7) // Monday
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

function formatDateKey(d: Date) {
  return d.toISOString().split('T')[0]
}

// ── Styles V2 partagés ─────────────────────────────────────────────────────
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }
const fieldBox: React.CSSProperties = {
  ...crmV2FieldStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}
const readOnlyBox: React.CSSProperties = {
  ...fieldBox,
  background: crmV2.bgHover,
  borderColor: crmV2.border,
  color: crmV2.textMuted,
}

function DrawerSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <CrmV2SectionLabel
        icon={<span style={{ color: crmV2.gold, display: 'inline-flex' }}>{icon}</span>}
        style={{ marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${crmV2.borderLight}` }}
      >
        {title}
      </CrmV2SectionLabel>
      {children}
    </div>
  )
}

// ── Inline editable field ──────────────────────────────────────────────────
function EditField({
  label,
  value,
  onSave,
  type = 'text',
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'email' | 'tel'
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setVal(value) }, [value])

  async function handleSave() {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(val) } finally { setSaving(false); setEditing(false) }
  }

  const iconBtn: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ marginBottom: 12, minWidth: 0 }}>
      <div style={fieldLabel}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            type={type}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setEditing(false); setVal(value) } }}
            style={{ ...crmV2FieldStyle, flex: 1, minWidth: 0, borderColor: crmV2.gold, boxShadow: `0 0 0 3px ${crmV2.goldSoft}` }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            title="Enregistrer"
            aria-label="Enregistrer"
            style={{ ...iconBtn, background: crmV2.primary, border: `1px solid ${crmV2.primary}`, color: '#fff', opacity: saving ? 0.6 : 1 }}
          >
            <Save size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setVal(value) }}
            title="Annuler"
            aria-label="Annuler"
            style={{ ...iconBtn, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.textMuted }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{
            ...fieldBox,
            color: value ? crmV2.text : crmV2.textFaint,
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = crmV2.gold)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = crmV2.borderStrong)}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{value || '—'}</span>
          <Pencil size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
        </div>
      )}
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onSave,
  colorMap,
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onSave: (v: string) => Promise<void>
  colorMap?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 240, upward: false })

  const selectedLabel = options.find(o => o.id === value)?.label || '—'

  const recompute = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const upward = spaceBelow < 200
    setPos({
      top: upward ? rect.top : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxH: Math.min(260, upward ? rect.top - 8 : spaceBelow - 8),
      upward,
    })
  }, [])

  function handleToggle() {
    if (open) { setOpen(false); return }
    recompute()
    setOpen(true)
  }

  async function handleSelect(id: string) {
    setOpen(false)
    if (id === value) return
    setSaving(true)
    try { await onSave(id) } finally { setSaving(false) }
  }

  // Close on outside click — pointerdown couvre souris ET tactile (iPad).
  useEffect(() => {
    if (!open) return
    function handler(e: Event) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (dropdownRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  // Close on scroll in drawer
  useEffect(() => {
    if (!open) return
    function onScroll() { setOpen(false) }
    const scrollParent = triggerRef.current?.closest('[style*="overflow"]') || document
    scrollParent.addEventListener('scroll', onScroll, true)
    return () => scrollParent.removeEventListener('scroll', onScroll, true)
  }, [open])

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      onPointerDown={e => e.stopPropagation()}
      className="crm-v2"
      style={{
        position: 'fixed',
        top: pos.upward ? undefined : pos.top,
        bottom: pos.upward ? window.innerHeight - pos.top + 4 : undefined,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxH,
        zIndex: 99999,
        background: crmV2.bg,
        border: `1px solid ${crmV2.border}`,
        borderRadius: 12,
        overflowY: 'auto',
        boxShadow: '0 12px 32px rgba(15,31,61,0.18)',
        padding: 4,
        fontFamily: crmV2.font,
      }}
    >
      {options.map(o => {
        const active = o.id === value
        const dot = colorMap?.[o.id]
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => handleSelect(o.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              minHeight: 36,
              padding: '7px 10px',
              background: active ? crmV2.goldSoft : 'transparent',
              border: 'none',
              borderRadius: 8,
              color: active ? crmV2.goldDark : crmV2.text,
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              fontWeight: active ? 600 : 500,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = active ? crmV2.goldSoft : crmV2.bgHover)}
            onMouseLeave={e => (e.currentTarget.style.background = active ? crmV2.goldSoft : 'transparent')}
          >
            {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
            <span style={{ minWidth: 0, flex: 1 }}>{o.label}</span>
            {active && <Check size={14} color={crmV2.gold} style={{ flexShrink: 0 }} />}
          </button>
        )
      })}
    </div>,
    document.body,
  ) : null

  const currentColor = colorMap?.[value]

  return (
    <div style={{ marginBottom: 12, minWidth: 0 }}>
      <div style={fieldLabel}>{label}</div>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={saving}
        style={{
          ...fieldBox,
          borderColor: open ? crmV2.gold : crmV2.borderStrong,
          boxShadow: open ? `0 0 0 3px ${crmV2.goldSoft}` : 'none',
          color: value ? (currentColor || crmV2.text) : crmV2.textFaint,
          fontWeight: currentColor ? 700 : 400,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          {currentColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: currentColor, flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLabel}</span>
        </span>
        <ChevronDown size={14} style={{ color: crmV2.textFaint, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {saving && <div style={{ fontSize: 11, color: crmV2.link, marginTop: 4 }}>Enregistrement…</div>}
      {dropdown}
    </div>
  )
}

// ── Inline Booking Widget ──────────────────────────────────────────────────
function InlineBookingWidget({ contact, onSuccess }: { contact: CRMContact; onSuccess: () => void }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<{ start: string; end: string; count?: number }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null)

  const [phone, setPhone] = useState(contact.phone || '')
  const [departement, setDepartement] = useState(contact.departement || '')
  const [classeActuelle, setClasseActuelle] = useState(getContactClasseValue(contact))
  const [formation, setFormation] = useState(contact.formation_demandee || '')
  const [meetingType, setMeetingType] = useState('visio')
  const [meetingLink, setMeetingLink] = useState(generateJitsiLink())
  const [meetingCampus, setMeetingCampus] = useState(CAMPUS_OPTIONS[0])
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Keep booking fields in sync with the currently opened contact.
  useEffect(() => {
    const classeFromContact = getContactClasseValue(contact)
    setPhone(contact.phone || '')
    setDepartement(contact.departement || '')
    setClasseActuelle(classeFromContact)
    setFormation(contact.formation_demandee || '')
  }, [
    contact.hubspot_contact_id,
    contact.phone,
    contact.departement,
    contact.classe_actuelle,
    contact.extra_props,
    contact.formation_demandee,
  ])

  const weekDays = getWeekDays(weekOffset)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  async function loadSlots(date: Date) {
    setSlotsLoading(true)
    setSlots([])
    setSelectedSlot(null)
    try {
      const res = await fetch(`/api/availability/pool?date=${formatDateKey(date)}`)
      if (res.ok) setSlots(await res.json())
    } finally {
      setSlotsLoading(false)
    }
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    loadSlots(date)
  }

  const fullName = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || ''
  const contactEmail = contact.email || ''
  const formationLabel = FORMATIONS.find(f => f.value === formation)?.label || formation
  const canSubmit = selectedSlot && phone && departement && classeActuelle && formation && (meetingType !== 'presentiel' || !!meetingCampus)

  async function handleSubmit() {
    if (!canSubmit) { setError('Remplis tous les champs obligatoires'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: fullName || contactEmail,
          prospect_email: contactEmail,
          prospect_phone: phone,
          start_at: selectedSlot!.start,
          end_at: selectedSlot!.end,
          source: 'admin',
          formation_type: formationLabel,
          formation_hs_value: formation,
          hubspot_contact_id: contact.hubspot_contact_id,
          departement,
          classe_actuelle: classeActuelle,
          meeting_type: meetingType,
          meeting_link: meetingType === 'visio' ? meetingLink : (meetingType === 'presentiel' ? meetingCampus : null),
          call_notes: [
            `📚 Formation souhaitée : ${formationLabel}`,
            `📍 Département : ${departement}`,
            `🎓 Classe actuelle : ${classeActuelle}`,
            phone ? `📞 Téléphone : ${phone}` : '',
            meetingType === 'presentiel' && meetingCampus ? `🏫 Campus : ${meetingCampus}` : '',
            notes.trim() ? `\n📝 Notes :\n${notes.trim()}` : '',
          ].filter(Boolean).join('\n'),
          booking_note: notes.trim() || null,
        }),
      })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => onSuccess(), 1500)
      } else {
        const data = await res.json()
        setError(data.error || 'Erreur lors de la création du RDV')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={{
        padding: '20px',
        background: 'rgba(22,163,74,0.08)',
        border: '1px solid rgba(22,163,74,0.25)',
        borderRadius: 12,
        textAlign: 'center',
      }}>
        <CheckCircle size={32} color={crmV2.successStrong} style={{ marginBottom: 8 }} />
        <div style={{ color: crmV2.successStrong, fontSize: 14, fontWeight: 700 }}>RDV confirmé !</div>
        <div style={{ color: crmV2.textMuted, fontSize: 13, marginTop: 4 }}>
          {selectedSlot && new Date(selectedSlot.start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          {' à '}
          {selectedSlot && new Date(selectedSlot.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    )
  }

  const navBtn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
    color: crmV2.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div>
      {/* ── Étape 1 : Calendrier semaine ─────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button type="button" onClick={() => setWeekOffset(w => w - 1)} style={navBtn} aria-label="Semaine précédente">
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 13, color: crmV2.text, fontWeight: 600 }}>
            {weekDays[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
          <button type="button" onClick={() => setWeekOffset(w => w + 1)} style={navBtn} aria-label="Semaine suivante">
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {weekDays.map(day => {
            const isPast = day < today
            const isSelected = selectedDate && formatDateKey(day) === formatDateKey(selectedDate)
            const disabled = isPast
            return (
              <button
                key={formatDateKey(day)}
                type="button"
                onClick={() => !disabled && handleSelectDate(day)}
                disabled={disabled}
                style={{
                  padding: '6px 2px',
                  minHeight: 44,
                  background: isSelected ? crmV2.primary : crmV2.bg,
                  border: `1px solid ${isSelected ? crmV2.primary : crmV2.border}`,
                  borderRadius: 10,
                  color: isSelected ? '#ffffff' : crmV2.text,
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 600,
                  cursor: disabled ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'center',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <div style={{ fontSize: 10, marginBottom: 2, fontWeight: 600, color: isSelected ? 'rgba(255,255,255,0.75)' : crmV2.textFaint }}>{DAY_NAMES[day.getDay()]}</div>
                <div>{day.getDate()}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Étape 2 : Créneaux ───────────────────────────────────────────── */}
      {selectedDate && (
        <div style={{ marginBottom: 14 }}>
          <CrmV2SectionLabel icon={<Clock size={14} color={crmV2.gold} />} style={{ marginBottom: 8 }}>
            Créneaux disponibles
          </CrmV2SectionLabel>
          {slotsLoading ? (
            <div style={{ color: crmV2.textMuted, fontSize: 13, padding: '8px 0' }}>Chargement…</div>
          ) : slots.length === 0 ? (
            <div style={{ color: '#d13a41', fontSize: 13, padding: '8px 0' }}>Aucun créneau disponible ce jour</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {slots.filter(s => {
                // Hide past slots for today
                if (selectedDate && formatDateKey(selectedDate) === formatDateKey(new Date())) {
                  return new Date(s.start) > new Date()
                }
                return true
              }).map(slot => {
                const isSelected = selectedSlot?.start === slot.start
                const time = new Date(slot.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                return (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      height: 36,
                      background: isSelected ? crmV2.goldGradient : crmV2.bg,
                      border: `1px solid ${isSelected ? 'transparent' : crmV2.borderStrong}`,
                      borderRadius: 999,
                      color: isSelected ? '#ffffff' : crmV2.text,
                      fontSize: 13,
                      fontWeight: isSelected ? 700 : 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {time}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Étape 3 : Champs complémentaires ─────────────────────────────── */}
      {selectedSlot && (
        <div style={{ marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Formation */}
          <div>
            <div style={fieldLabel}>Formation *</div>
            <CrmV2Select value={formation} onChange={e => setFormation(e.target.value)}>
              <option value="">— Choisir —</option>
              {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </CrmV2Select>
          </div>

          {/* Phone + Dept row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={fieldLabel}>Téléphone *</div>
              <CrmV2Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={fieldLabel}>Département *</div>
              <CrmV2Input value={departement} onChange={e => setDepartement(e.target.value)} />
            </div>
          </div>

          {/* Classe */}
          <div>
            <div style={fieldLabel}>Classe actuelle *</div>
            <CrmV2Select value={classeActuelle} onChange={e => setClasseActuelle(e.target.value)}>
              <option value="">— Choisir —</option>
              {CLASSE_OPTIONS.filter(Boolean).map(cl => <option key={cl} value={cl}>{cl}</option>)}
            </CrmV2Select>
          </div>

          {/* Type de RDV */}
          <div>
            <div style={fieldLabel}>Type de RDV</div>
            <CrmV2Segmented
              stretch
              value={meetingType}
              onChange={v => {
                setMeetingType(v)
                if (v === 'visio' && !meetingLink) setMeetingLink(generateJitsiLink())
                if (v === 'presentiel' && !meetingCampus) setMeetingCampus(CAMPUS_OPTIONS[0])
              }}
              items={MEETING_TYPES.map(mt => {
                const Icon = mt.icon
                return {
                  id: mt.value,
                  label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {mt.label}</span>,
                }
              })}
            />
          </div>

          {/* Campus présentiel */}
          {meetingType === 'presentiel' && (
            <div>
              <div style={fieldLabel}>Campus (présentiel)</div>
              <CrmV2Select value={meetingCampus} onChange={e => setMeetingCampus(e.target.value)}>
                {CAMPUS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </CrmV2Select>
            </div>
          )}

          {/* Lien visio */}
          {meetingType === 'visio' && (
            <div>
              <div style={fieldLabel}>Lien visio</div>
              <CrmV2Input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} style={{ color: crmV2.link }} />
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={fieldLabel}>Notes (optionnel)</div>
            <CrmV2Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ minHeight: 64 }} />
          </div>

          {error && <CrmV2Notice tone="error">{error}</CrmV2Notice>}

          {/* Bouton confirmer */}
          <CrmV2Button
            variant={canSubmit ? 'accent' : 'secondary'}
            size="lg"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            icon={<CheckCircle size={16} />}
            style={{ width: '100%' }}
          >
            {submitting ? 'Création en cours…' : 'Confirmer le rendez-vous'}
          </CrmV2Button>
        </div>
      )}
    </div>
  )
}

// ── Main Drawer Component ──────────────────────────────────────────────────
export default function CRMEditDrawer({ contact, closers, telepros, allUsers, hubspotOwners: hubspotOwnersProp = [], onClose, onRefresh, preloadedLeadStatuses, preloadedSources, preloadedFormations, preloadedZones }: Props) {
  // Liste effective des utilisateurs pour les dropdowns Closer/Télépro.
  // Si `allUsers` est fourni (page CRM admin), on l'utilise pour exposer TOUS
  // les utilisateurs du CRM (toute roles confondus). Sinon, fallback historique :
  // closers + telepros (pour ne rien casser dans les usages qui ne passent pas
  // encore `allUsers`).
  const dropdownUsers: RdvUser[] = allUsers && allUsers.length > 0
    ? allUsers
    : [...closers, ...telepros]
  // Local optimistic state
  const [localContact, setLocalContact] = useState<CRMContact | null>(null)
  const [showBooking, setShowBooking] = useState(false)
  const [showLinovaModal, setShowLinovaModal] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentApiUser | null>(null)

  // Le drawer fetch ses propres owners si la prop est vide ou pas fournie —
  // sinon des fiches ouvertes avant que la page parent ait fini de charger
  // hubspotOwners affichent "—" pour les sales HubSpot (ex. Elsa Chemouni).
  const [fetchedOwners, setFetchedOwners] = useState<HubspotOwnerMeta[]>([])
  useEffect(() => {
    if (hubspotOwnersProp.length > 0) return
    let alive = true
    fetch('/api/crm/owners').then(r => r.json()).then((d: { owners?: HubspotOwnerMeta[] }) => {
      if (alive && Array.isArray(d?.owners)) setFetchedOwners(d.owners)
    }).catch(() => {})
    return () => { alive = false }
  }, [hubspotOwnersProp.length])
  const hubspotOwners = hubspotOwnersProp.length > 0 ? hubspotOwnersProp : fetchedOwners

  // Options initialisées avec valeurs hardcodées → disponibles immédiatement, mises à jour par fetch
  const [leadStatusOpts, setLeadStatusOpts] = useState<{ id: string; label: string }[]>(LEAD_STATUS_LIST)
  const [sourceOpts, setSourceOpts] = useState<{ id: string; label: string }[]>(SOURCE_LIST)
  const [formationOpts, setFormationOpts] = useState<{ id: string; label: string }[]>(FORMATION_LIST)
  const [zoneOpts, setZoneOpts] = useState<{ id: string; label: string }[]>(ZONE_OPTIONS_LIST)

  useEffect(() => {
    setLocalContact(contact)
    setShowBooking(false)
  }, [contact])

  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then((d: CurrentApiUser | null) => { if (alive) setCurrentUser(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const apply = (d: { leadStatuses?: string[]; sources?: string[]; formations?: string[]; zones?: string[] }) => {
      if (d.leadStatuses?.length) setLeadStatusOpts([{ id: '', label: '—' }, ...d.leadStatuses.map(v => ({ id: v, label: v }))])
      if (d.sources?.length)      setSourceOpts([{ id: '', label: '—' }, ...d.sources.map(v => ({ id: v, label: v }))])
      if (d.formations?.length)   setFormationOpts([{ id: '', label: '—' }, ...d.formations.map(v => ({ id: v, label: v }))])
      if (d.zones?.length)        setZoneOpts(prev => prev.length > 1 ? prev : [{ id: '', label: '—' }, ...d.zones!.map(v => ({ id: v, label: v }))])
    }
    if (preloadedLeadStatuses?.length || preloadedFormations?.length || preloadedSources?.length) {
      apply({ leadStatuses: preloadedLeadStatuses, sources: preloadedSources, formations: preloadedFormations, zones: preloadedZones })
    } else {
      fetch('/api/crm/field-options').then(r => r.json()).then(apply).catch(() => {})
    }
  }, [preloadedLeadStatuses, preloadedSources, preloadedFormations, preloadedZones])

  if (!localContact) return null

  const c = localContact
  const deal = c.deal
  const norm = (v: unknown): string =>
    String(v ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')

  // Règle métier demandée:
  // Flux Linova UNIQUEMENT quand le lead est attribué à Meryeme.
  const assignedTeleproRaw =
    c.telepro_user_id
    || deal?.teleprospecteur
    || ''
  const assignedTelepro = telepros.find(u =>
    String(u.id || '') === String(assignedTeleproRaw)
    || String(u.hubspot_user_id || '') === String(assignedTeleproRaw)
    || String(u.hubspot_owner_id || '') === String(assignedTeleproRaw)
  )
  const meryemeUser = telepros.find(u => {
    const email = String(u.email || '').toLowerCase().trim()
    if (email === 'meryeme.benramdane@linova-education.fr') return true
    const n = norm(u.name)
    return n.includes('meryeme') && (n.includes('benramdane') || n.includes('benramdae'))
  })
  const assignedNameNorm = norm(assignedTelepro?.name || '')
  const isAssignedToMeryeme =
    !!meryemeUser && (
      String(meryemeUser.id || '') === String(assignedTeleproRaw)
      || String(meryemeUser.hubspot_user_id || '') === String(assignedTeleproRaw)
      || String(meryemeUser.hubspot_owner_id || '') === String(assignedTeleproRaw)
      || String(assignedTelepro?.id || '') === String(meryemeUser.id || '')
      || (assignedNameNorm.includes('meryeme') && (assignedNameNorm.includes('benramdane') || assignedNameNorm.includes('benramdae')))
    )
  const isLinovaBrandUser = String(currentUser?.crm_brand || '').toLowerCase() === 'linova'
  const isAdminUser = String(currentUser?.role || '').toLowerCase() === 'admin'
  // L'admin voit les DEUX boutons (Diploma + Linova) sur n'importe quel contact.
  // Les autres profils suivent la regle metier : flux Linova uniquement quand
  // le lead est attribue a Meryeme (ou que l'utilisateur est sur la marque Linova).
  const shouldUseLinovaBooking = !isAdminUser && (isAssignedToMeryeme || isLinovaBrandUser)
  const showLinovaButton = isAdminUser || shouldUseLinovaBooking
  // Le CTA "Prendre rendez-vous Diploma" est toujours disponible (closer/telepro
  // inclus), même quand le flux Linova s'applique : on propose alors les deux.
  const showDiplomaButton = true

  async function patchContact(fields: Record<string, string | null>) {
    const res = await fetch(`/api/crm/contacts/${c.hubspot_contact_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error('Erreur lors de la sauvegarde')
    // Optimistic update
    setLocalContact(prev => prev ? { ...prev, ...fields } : prev)
    onRefresh()
  }

  async function patchDeal(fields: Record<string, string | null>) {
    if (!deal) return
    const res = await fetch(`/api/crm/deals/${deal.hubspot_deal_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error('Erreur deal')
    setLocalContact(prev => prev ? { ...prev, deal: prev.deal ? { ...prev.deal, ...fields } : null } : prev)
    onRefresh()
  }

  const fullName = [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Contact sans nom'

  const stageOptions = [
    { id: '', label: '— Aucune étape —' },
    ...Object.entries(STAGE_MAP).map(([id, s]) => ({ id, label: s.label })),
  ]
  const stageColorMap = Object.fromEntries(Object.entries(STAGE_MAP).map(([id, s]) => [id, s.color]))

  // CRITIQUE : on normalise TOUS les IDs en STRING. La colonne
  // crm_contacts.telepro_user_id est BIGINT côté Postgres → JS renvoie un
  // number (ex. 78337826), mais hubspot_user_id de rdv_users est TEXT → string
  // ("78337826"). Le === strict de JS fait que 78337826 !== "78337826" et le
  // resolver ne trouve rien — d'où le champ Téléprospecteur qui affichait "—"
  // alors que la valeur est bien stockée.
  const S = (v: unknown): string => v == null ? '' : String(v)

  const closerOptions = (() => {
    const seen = new Set<string>()
    const arr: { id: string; label: string }[] = [{ id: '', label: '— Aucun closer —' }]
    for (const u of dropdownUsers) {
      const key = S(u.hubspot_owner_id || u.id)
      if (!key || seen.has(key)) continue
      seen.add(key)
      arr.push({ id: key, label: u.name })
    }
    for (const o of hubspotOwners) {
      const key = S(o.hubspot_owner_id)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const label = [o.firstname, o.lastname].filter(Boolean).join(' ').trim()
        || o.email || key
      arr.push({ id: key, label })
    }
    return arr
  })()
  const teleproOptions = (() => {
    const seen = new Set<string>()
    const arr: { id: string; label: string }[] = [{ id: '', label: '— Aucun télépro —' }]
    for (const u of dropdownUsers) {
      const key = S(u.hubspot_user_id || u.hubspot_owner_id || u.id)
      if (!key || seen.has(key)) continue
      seen.add(key)
      arr.push({ id: key, label: u.name })
    }
    for (const o of hubspotOwners) {
      const key = S(o.hubspot_owner_id)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const label = [o.firstname, o.lastname].filter(Boolean).join(' ').trim()
        || o.email || key
      arr.push({ id: key, label })
    }
    return arr
  })()

  const teleproIdResolver = (raw: unknown): string => {
    const rawStr = S(raw)
    if (!rawStr) return ''
    const u = dropdownUsers.find(t =>
      S(t.id) === rawStr || S(t.hubspot_user_id) === rawStr || S(t.hubspot_owner_id) === rawStr
    )
    if (u) return S(u.hubspot_user_id || u.hubspot_owner_id || u.id)
    const o = hubspotOwners.find(h => S(h.hubspot_owner_id) === rawStr)
    if (o) return S(o.hubspot_owner_id)
    return rawStr
  }
  const closerIdResolver = (raw: unknown): string => {
    const rawStr = S(raw)
    if (!rawStr) return ''
    const u = dropdownUsers.find(t =>
      S(t.id) === rawStr || S(t.hubspot_user_id) === rawStr || S(t.hubspot_owner_id) === rawStr
    )
    if (u) return S(u.hubspot_owner_id || u.id)
    const o = hubspotOwners.find(h => S(h.hubspot_owner_id) === rawStr)
    if (o) return S(o.hubspot_owner_id)
    return rawStr
  }

  const classeOptionList = CLASSE_OPTIONS.map(cl => ({ id: cl, label: cl || '—' }))
  const zoneOptionList = ZONE_OPTIONS_LIST

  // Detect existing RDV
  const hasRdv = deal?.closedate
  const stageInfo = deal?.dealstage ? STAGE_MAP[deal.dealstage] : null

  const closerLine = (role: string, name: string) => (
    <span style={{ fontSize: 12, color: crmV2.textMuted }}>
      {role} : <span style={{ color: crmV2.text, fontWeight: 600 }}>{name}</span>
    </span>
  )

  return (
    <>
      <CrmV2ModalShell
        variant="drawer"
        onClose={onClose}
        zIndex={200}
        header={
          <CrmV2ModalHeader
            title={fullName}
            subtitle={c.email ? <span style={{ color: crmV2.link }}>{c.email}</span> : undefined}
            onClose={onClose}
            extra={
              <a
                href={`/admin/crm/contacts/${c.hubspot_contact_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 12px',
                  border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text,
                  fontSize: 12, fontWeight: 600, textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} /> Ouvrir la fiche
              </a>
            }
          />
        }
      >
          {/* ── Encart RDV existant (en haut, bien visible) ──────────────── */}
          {hasRdv && (
            <div style={{
              marginBottom: 16,
              padding: '12px 14px',
              background: 'rgba(22,163,74,0.06)',
              border: '1px solid rgba(22,163,74,0.22)',
              borderRadius: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Calendar size={14} color={crmV2.successStrong} />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.successStrong }}>Rendez-vous planifié</span>
              </div>
              <div style={{ fontSize: 14, color: crmV2.text, fontWeight: 600, marginBottom: 8 }}>
                {new Date(deal!.closedate!).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {stageInfo && <CrmV2StatusPill label={stageInfo.label} color={stageInfo.color} />}
                {/* Closer : on lit prioritairement closer_du_contact_owner_id
                    (le vrai closer assigné côté contact) et on résout le nom
                    via la liste des closers. On évite d'afficher "Closer: X"
                    quand X est en fait un télépro (ex. Elsa Chemouni) — dans
                    ce cas on bascule sur "Télépro: X" pour ne pas induire en
                    erreur. */}
                {(() => {
                  const rawCloserId = c.closer_du_contact_owner_id || deal!.hubspot_owner_id || ''
                  if (!rawCloserId) return null
                  // 1) Vrai closer (role=closer/admin) → "Closer : X"
                  const closerUser = [...closers].find(u =>
                    u.id === rawCloserId || u.hubspot_user_id === rawCloserId || u.hubspot_owner_id === rawCloserId
                  )
                  if (closerUser) return closerLine('Closer', closerUser.name)
                  // 2) Télépro mal placé dans closer_du_contact_owner_id → "Télépro : X"
                  const teleproUser = [...telepros].find(u =>
                    u.id === rawCloserId || u.hubspot_user_id === rawCloserId || u.hubspot_owner_id === rawCloserId
                  )
                  if (teleproUser) return closerLine('Télépro', teleproUser.name)
                  // 3) Autre utilisateur (manager, équipe externe, etc.) → "Closer : X"
                  // (le champ closer_du_contact_owner_id reflète le closer assigné)
                  const otherUser = dropdownUsers.find(u =>
                    u.id === rawCloserId || u.hubspot_user_id === rawCloserId || u.hubspot_owner_id === rawCloserId
                  )
                  if (otherUser) return closerLine('Closer', otherUser.name)
                  const hsOwner = hubspotOwners.find(o => String(o.hubspot_owner_id) === String(rawCloserId))
                  if (hsOwner) {
                    const label = [hsOwner.firstname, hsOwner.lastname].filter(Boolean).join(' ').trim()
                      || hsOwner.email || String(hsOwner.hubspot_owner_id)
                    return closerLine('Closer', label)
                  }
                  return null
                })()}
                {deal!.formation && (
                  <CrmV2StatusPill label={deal!.formation} color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} />
                )}
              </div>
            </div>
          )}

          {/* ── Boutons Prendre un RDV ───────────────────────────────────── */}
          <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {showDiplomaButton && (
              <CrmV2Button
                variant={showBooking ? 'gold' : 'accent'}
                size="lg"
                onClick={() => setShowBooking(b => !b)}
                icon={<Calendar size={16} />}
                style={{ width: '100%' }}
              >
                {isAdminUser
                  ? (showBooking ? 'Fermer le formulaire de RDV' : 'Programmer RDV Diploma')
                  : (showBooking
                      ? 'Fermer le formulaire de RDV'
                      : (showLinovaButton ? 'Prendre rendez-vous Diploma' : 'Prendre un rendez-vous'))}
              </CrmV2Button>
            )}
            {showLinovaButton && (
              <CrmV2Button
                variant="primary"
                size="lg"
                onClick={() => setShowLinovaModal(true)}
                icon={<Calendar size={16} />}
                style={{ width: '100%' }}
              >
                Programmer RDV admission Linova
              </CrmV2Button>
            )}
          </div>

          {/* ── Formulaire de booking inline ──────────────────────────────── */}
          {showBooking && showDiplomaButton && (
            <div style={{
              marginBottom: 20,
              padding: 14,
              background: crmV2.bgHover,
              border: `1px solid ${crmV2.border}`,
              borderRadius: 16,
            }}>
              <CrmV2SectionLabel icon={<Calendar size={14} color={crmV2.gold} />} style={{ marginBottom: 12 }}>
                Nouveau rendez-vous
              </CrmV2SectionLabel>
              <InlineBookingWidget
                contact={c}
                onSuccess={() => {
                  setShowBooking(false)
                  onRefresh()
                }}
              />
            </div>
          )}

          {/* Section : Identité */}
          <DrawerSection title="Identité" icon={<User size={14} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <EditField label="Prénom" value={c.firstname || ''} onSave={v => patchContact({ firstname: v })} />
              <EditField label="Nom" value={c.lastname || ''} onSave={v => patchContact({ lastname: v })} />
            </div>
            <EditField label="Téléphone" value={c.phone || ''} type="tel" onSave={v => patchContact({ phone: v })} />
            <EditField label="Email" value={c.email || ''} type="email" onSave={v => patchContact({ email: v })} />
            <SelectField
              label="Classe actuelle"
              value={getContactClasseValue(c)}
              options={classeOptionList}
              onSave={v => patchContact({ classe_actuelle: v })}
            />
            <SelectField
              label="Zone / Localité"
              value={c.zone_localite || ''}
              options={zoneOptionList}
              onSave={v => patchContact({ zone_localite: v })}
            />
            <SelectField
              label="Formation souhaitée"
              value={c.formation_demandee || ''}
              options={formationOpts}
              onSave={v => patchContact({ formation_demandee: v })}
            />
          </DrawerSection>

          {/* Section : Qualification */}
          <DrawerSection title="Qualification" icon={<Tag size={14} />}>
            <SelectField
              label="Statut du lead"
              value={c.hs_lead_status || ''}
              options={leadStatusOpts}
              onSave={v => patchContact({ hs_lead_status: v })}
            />
            {/* Date de création (read-only) */}
            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabel}>Date de création</div>
              <div style={readOnlyBox}>
                {(deal?.createdate ?? c.contact_createdate)
                  ? new Date((deal?.createdate ?? c.contact_createdate)!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </div>
            </div>
            <SelectField
              label="Origine"
              value={c.origine || ''}
              options={sourceOpts}
              onSave={v => patchContact({ origine: v })}
            />
            {/* Soumission de formulaire (read-only) */}
            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabel}>Soumission formulaire</div>
              <div style={{ ...readOnlyBox, height: 'auto', minHeight: 38, padding: '8px 12px', display: 'block' }}>
                {c.recent_conversion_event ? (
                  <div>
                    <div style={{ color: crmV2.text }}>{c.recent_conversion_event}</div>
                    {c.recent_conversion_date && (
                      <div style={{ color: crmV2.textFaint, fontSize: 12, marginTop: 2 }}>
                        {new Date(c.recent_conversion_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
          </DrawerSection>

          {/* Section : Attribution */}
          <DrawerSection title="Attribution" icon={<Users size={14} />}>
            {(() => {
              // Détermine la valeur courante du télépro en essayant TOUTES les
              // sources possibles, puis injecte l'option dans la liste si elle
              // manque (cas où Elsa Chemouni est uniquement dans hubspotOwners
              // qui n'est pas encore chargé). Garantit que le nom s'affiche.
              const extraTelepro = (c.extra_props?.teleprospecteur as string | undefined) ?? ''
              const rawTelepro =
                c.telepro_user_id
                || (deal?.telepro?.id ?? '')
                || deal?.teleprospecteur
                || extraTelepro
                || ''
              const teleproEnrichedName =
                (deal?.telepro?.name)
                || (c.contact_owner?.id === rawTelepro ? c.contact_owner?.name : null)
                || null
              const resolvedKey = teleproIdResolver(rawTelepro)
              // Si la valeur a un nom connu mais pas dans les options → injecte
              const effectiveOptions = teleproEnrichedName && resolvedKey
                && !teleproOptions.some(o => o.id === resolvedKey)
                ? [...teleproOptions, { id: resolvedKey, label: teleproEnrichedName }]
                : teleproOptions
              return (
                <SelectField
                  label="Téléprospecteur"
                  value={resolvedKey}
                  options={effectiveOptions}
                  onSave={v => patchContact({ telepro_user_id: v || null })}
                />
              )
            })()}
            <SelectField
              label="Closer du contact"
              value={closerIdResolver(c.closer_du_contact_owner_id)}
              options={closerOptions}
              onSave={v => patchContact({ closer_du_contact_owner_id: v || null })}
            />
            <SelectField
              label="Propriétaire du contact"
              value={closerIdResolver(c.hubspot_owner_id)}
              options={closerOptions}
              onSave={v => patchContact({ hubspot_owner_id: v || null })}
            />
          </DrawerSection>

          {/* Section : Transaction */}
          {deal && (
            <DrawerSection title="Transaction" icon={<Briefcase size={14} />}>
              <SelectField
                label="Phase de la transaction"
                value={deal.dealstage || ''}
                options={stageOptions}
                onSave={v => patchDeal({ dealstage: v })}
                colorMap={stageColorMap}
              />
              {deal.formation && (
                <div style={{ marginBottom: 12 }}>
                  <div style={fieldLabel}>Formation</div>
                  <div style={{ ...readOnlyBox, color: crmV2.goldDark, fontWeight: 700 }}>{deal.formation}</div>
                </div>
              )}
              {deal.closedate && (
                <div style={{ marginBottom: 12 }}>
                  <div style={fieldLabel}>Date RDV</div>
                  <div style={readOnlyBox}>
                    {new Date(deal.closedate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              )}
              <a
                href={`/admin/crm/deals/${deal.hubspot_deal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '7px 14px',
                  border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text,
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} /> Ouvrir la fiche transaction
              </a>
            </DrawerSection>
          )}
      </CrmV2ModalShell>

      {showLinovaModal && (
        <LinovaAppointmentModal
          contact={{
            id: c.hubspot_contact_id,
            firstname: c.firstname,
            lastname: c.lastname,
            email: c.email,
            phone: c.phone,
            classe_actuelle: c.classe_actuelle,
          }}
          onClose={() => setShowLinovaModal(false)}
          onSaved={() => {
            setShowLinovaModal(false)
            onRefresh()
          }}
        />
      )}
    </>
  )
}
