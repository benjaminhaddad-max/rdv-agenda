'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, ExternalLink, Calendar, ChevronLeft, ChevronRight, Clock, Video, PhoneCall, MapPin, CheckCircle, ChevronDown } from 'lucide-react'

// Constantes
const NAVY_BORDER = '#cbd6e2'
const GOLD = '#ccac71'
const BLUE = '#4cabdb'

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: BLUE },
  '3165428981': { label: 'Délai Réflexion',       color: GOLD },
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
     'Pré-inscrit 2025/2026','Pré-inscrit 2026/2027','Raccroche au nez','Rdv pris',
  ].map(v => ({ id: v, label: v })),
]

const SOURCE_LIST = [
  { id: '', label: '—' },
  ...["Anciens salons L'étudiant",'Anciens salons Lycée','Anciens salons Studyrama',
     'Appel Diploma Santé','Autre','Bouche à oreille - Diploma Santé','Campagne ADS',
     'Campagne Ads - Snapchat','Campagne réseaux sociaux - Tiktok','Diplomeo (Partenaire)',
     'Déjà étudiant','Extrastudent','Figaro étudiant','Hermione (Partenaire)',
     'Hippocast (Partenaire)','Influenceur',"L'Etudiant [leads]",'Lycée George Leven',
     'Lycée Maimonide Rambam','Lycée Yabné','Nomad Education (Partenaire)','Nomad Spéciaux',
     'Réseaux sociaux','Salon étudiant 2024-2025 (AFEM)','Salon étudiant 2024-2025 (Diploma)',
     'Salons','Site AFEM','Site Diploma Santé','Special Premium','Studyrama',
     'Thotis (Partenaire)','Twitter','Vecteur Bac',
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
  'Etudes médicales', 'Etudes Sup.', 'Autre',
]

const MEETING_TYPES = [
  { value: 'visio', label: 'Visio', icon: Video },
  { value: 'telephone', label: 'Téléphone', icon: PhoneCall },
  { value: 'presentiel', label: 'Présentiel', icon: MapPin },
]

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

interface RdvUser { id: string; name: string; hubspot_owner_id?: string; hubspot_user_id?: string; role: string; avatar_color?: string }

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

interface Props {
  contact: CRMContact | null
  closers: RdvUser[]
  telepros: RdvUser[]
  onClose: () => void
  onRefresh: () => void
  preloadedLeadStatuses?: string[]
  preloadedSources?: string[]
  preloadedFormations?: string[]
  preloadedZones?: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────
function generateJitsiLink() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `https://meet.jit.si/rdv-${id}`
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

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            type={type}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setEditing(false); setVal(value) } }}
            style={{
              flex: 1,
              background: '#f5f8fa',
              border: `1px solid ${BLUE}`,
              borderRadius: 6,
              padding: '6px 10px',
              color: '#fff',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: BLUE, border: 'none', borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Save size={12} />
          </button>
          <button
            onClick={() => { setEditing(false); setVal(value) }}
            style={{ background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#516f90', fontSize: 12, cursor: 'pointer' }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{
            padding: '7px 10px',
            background: '#f5f8fa',
            border: `1px solid ${NAVY_BORDER}`,
            borderRadius: 6,
            color: value ? '#516f90' : '#3a5070',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = BLUE)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = NAVY_BORDER)}
        >
          <span>{value || '—'}</span>
          <span style={{ fontSize: 10, color: '#3a5070' }}>✎</span>
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
      top: upward ? rect.top : rect.bottom + 2,
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

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (dropdownRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.upward ? undefined : pos.top,
        bottom: pos.upward ? window.innerHeight - pos.top + 2 : undefined,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxH,
        zIndex: 99999,
        background: '#ffffff',
        border: `1px solid ${NAVY_BORDER}`,
        borderRadius: 8,
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      }}
    >
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onMouseDown={() => handleSelect(o.id)}
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 12px',
            background: o.id === value ? 'rgba(204,172,113,0.1)' : 'transparent',
            border: 'none',
            borderBottom: '1px solid #eaf0f6',
            color: colorMap?.[o.id] || (o.id === value ? '#ccac71' : '#516f90'),
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
            fontWeight: o.id === value ? 600 : 400,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#eaf0f6')}
          onMouseLeave={e => (e.currentTarget.style.background = o.id === value ? 'rgba(204,172,113,0.1)' : 'transparent')}
        >
          {o.label}
        </button>
      ))}
    </div>,
    document.body,
  ) : null

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={saving}
        style={{
          width: '100%',
          background: '#f5f8fa',
          border: `1px solid ${open ? BLUE : NAVY_BORDER}`,
          borderRadius: 6,
          padding: '7px 10px',
          color: colorMap?.[value] || (value ? '#516f90' : '#7c98b6'),
          fontSize: 13,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
          transition: 'border-color 0.15s',
        }}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={12} style={{ color: '#3a5070', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {saving && <div style={{ fontSize: 10, color: BLUE, marginTop: 3 }}>Enregistrement…</div>}
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
  const [classeActuelle, setClasseActuelle] = useState(contact.classe_actuelle || '')
  const [formation, setFormation] = useState(contact.formation_demandee || '')
  const [meetingType, setMeetingType] = useState('visio')
  const [meetingLink, setMeetingLink] = useState(generateJitsiLink())
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
  const canSubmit = selectedSlot && phone && departement && classeActuelle && formation

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
          meeting_link: meetingType === 'visio' ? meetingLink : null,
          call_notes: [
            `📚 Formation souhaitée : ${formationLabel}`,
            `📍 Département : ${departement}`,
            `🎓 Classe actuelle : ${classeActuelle}`,
            phone ? `📞 Téléphone : ${phone}` : '',
            notes.trim() ? `\n📝 Notes :\n${notes.trim()}` : '',
          ].filter(Boolean).join('\n'),
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
        background: 'rgba(34,197,94,0.1)',
        border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 10,
        textAlign: 'center',
      }}>
        <CheckCircle size={32} color="#22c55e" style={{ marginBottom: 8 }} />
        <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 700 }}>RDV confirmé !</div>
        <div style={{ color: '#516f90', fontSize: 12, marginTop: 4 }}>
          {selectedSlot && new Date(selectedSlot.start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          {' à '}
          {selectedSlot && new Date(selectedSlot.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Étape 1 : Calendrier semaine ─────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'none', border: 'none', color: '#516f90', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 11, color: '#516f90', fontWeight: 600 }}>
            {weekDays[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'none', border: 'none', color: '#516f90', cursor: 'pointer', padding: 4 }}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {weekDays.map(day => {
            const isPast = day < today
            const isSelected = selectedDate && formatDateKey(day) === formatDateKey(selectedDate)
            const isSunday = day.getDay() === 0
            const disabled = isPast || isSunday
            return (
              <button
                key={formatDateKey(day)}
                onClick={() => !disabled && handleSelectDate(day)}
                disabled={disabled}
                style={{
                  padding: '6px 2px',
                  background: isSelected ? GOLD : '#f5f8fa',
                  border: `1px solid ${isSelected ? GOLD : NAVY_BORDER}`,
                  borderRadius: 8,
                  color: isSelected ? '#ffffff' : disabled ? '#2a3a50' : '#516f90',
                  fontSize: 11,
                  fontWeight: isSelected ? 700 : 500,
                  cursor: disabled ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'center',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <div style={{ fontSize: 9, marginBottom: 2 }}>{DAY_NAMES[day.getDay()]}</div>
                <div>{day.getDate()}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Étape 2 : Créneaux ───────────────────────────────────────────── */}
      {selectedDate && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            <Clock size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Créneaux disponibles
          </div>
          {slotsLoading ? (
            <div style={{ color: '#7c98b6', fontSize: 12, padding: '8px 0' }}>Chargement…</div>
          ) : slots.length === 0 ? (
            <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 0' }}>Aucun créneau disponible ce jour</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
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
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: '6px 4px',
                      background: isSelected ? GOLD : '#f5f8fa',
                      border: `1px solid ${isSelected ? GOLD : NAVY_BORDER}`,
                      borderRadius: 6,
                      color: isSelected ? '#ffffff' : '#516f90',
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 400,
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
        <div style={{ marginBottom: 14 }}>
          {/* Formation */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Formation *</div>
            <select
              value={formation}
              onChange={e => setFormation(e.target.value)}
              style={{
                width: '100%', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`,
                borderRadius: 6, padding: '7px 10px', color: '#516f90', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                appearance: 'none', WebkitAppearance: 'none',
              }}
            >
              <option value="">— Choisir —</option>
              {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          {/* Phone + Dept row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Téléphone *</div>
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                style={{ width: '100%', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Département *</div>
              <input
                value={departement} onChange={e => setDepartement(e.target.value)}
                style={{ width: '100%', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Classe */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Classe actuelle *</div>
            <select
              value={classeActuelle}
              onChange={e => setClasseActuelle(e.target.value)}
              style={{
                width: '100%', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`,
                borderRadius: 6, padding: '7px 10px', color: '#516f90', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                appearance: 'none', WebkitAppearance: 'none',
              }}
            >
              <option value="">— Choisir —</option>
              {CLASSE_OPTIONS.filter(Boolean).map(cl => <option key={cl} value={cl}>{cl}</option>)}
            </select>
          </div>

          {/* Type de RDV */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Type de RDV</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {MEETING_TYPES.map(mt => {
                const Icon = mt.icon
                const active = meetingType === mt.value
                return (
                  <button
                    key={mt.value}
                    onClick={() => { setMeetingType(mt.value); if (mt.value === 'visio' && !meetingLink) setMeetingLink(generateJitsiLink()) }}
                    style={{
                      flex: 1, padding: '6px 8px',
                      background: active ? 'rgba(204,172,113,0.15)' : '#f5f8fa',
                      border: `1px solid ${active ? GOLD : NAVY_BORDER}`,
                      borderRadius: 6, color: active ? GOLD : '#516f90',
                      fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  >
                    <Icon size={12} /> {mt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Lien visio */}
          {meetingType === 'visio' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Lien visio</div>
              <input
                value={meetingLink} onChange={e => setMeetingLink(e.target.value)}
                style={{ width: '100%', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#4cabdb', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notes (optionnel)</div>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ width: '100%', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>}

          {/* Bouton confirmer */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            style={{
              width: '100%', padding: '10px',
              background: canSubmit ? `linear-gradient(135deg, ${GOLD}, #b8963f)` : '#f5f8fa',
              border: 'none', borderRadius: 8,
              color: canSubmit ? '#ffffff' : '#7c98b6',
              fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
              fontFamily: 'inherit',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Création en cours…' : '✓ Confirmer le rendez-vous'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Drawer Component ──────────────────────────────────────────────────
export default function CRMEditDrawer({ contact, closers, telepros, onClose, onRefresh, preloadedLeadStatuses, preloadedSources, preloadedFormations, preloadedZones }: Props) {
  // Local optimistic state
  const [localContact, setLocalContact] = useState<CRMContact | null>(null)
  const [showBooking, setShowBooking] = useState(false)

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

  // Closer/Télépro options : on inclut TOUS les owners (closers + télépros)
  // car en pratique le champ télépro stocke parfois un closer (ex. Judith
  // Diploma) et inversement. La liste globale fait pareil (teleproSelectOptions
  // = merge owners + users). Sans ça le select n'a pas l'option et affiche "—".
  const closerOptions = (() => {
    const seen = new Set<string>()
    const arr: { id: string; label: string }[] = [{ id: '', label: '— Aucun closer —' }]
    for (const u of [...closers, ...telepros]) {
      const key = u.hubspot_owner_id || u.id
      if (!key || seen.has(key)) continue
      seen.add(key)
      arr.push({ id: key, label: u.name })
    }
    return arr
  })()
  const teleproOptions = (() => {
    const seen = new Set<string>()
    const arr: { id: string; label: string }[] = [{ id: '', label: '— Aucun télépro —' }]
    for (const u of [...telepros, ...closers]) {
      const key = u.hubspot_user_id || u.hubspot_owner_id || u.id
      if (!key || seen.has(key)) continue
      seen.add(key)
      arr.push({ id: key, label: u.name })
    }
    return arr
  })()

  // Résout n'importe quel format d'ID (rdv_users.id, hubspot_user_id,
  // hubspot_owner_id) vers la clé d'option utilisée dans le select.
  const teleproIdResolver = (raw: string | null | undefined): string => {
    if (!raw) return ''
    const u = [...telepros, ...closers].find(t =>
      t.id === raw || t.hubspot_user_id === raw || t.hubspot_owner_id === raw
    )
    if (!u) return raw
    return u.hubspot_user_id || u.hubspot_owner_id || u.id
  }
  const closerIdResolver = (raw: string | null | undefined): string => {
    if (!raw) return ''
    const u = [...closers, ...telepros].find(t =>
      t.id === raw || t.hubspot_user_id === raw || t.hubspot_owner_id === raw
    )
    if (!u) return raw
    return u.hubspot_owner_id || u.id
  }

  const classeOptionList = CLASSE_OPTIONS.map(cl => ({ id: cl, label: cl || '—' }))
  const zoneOptionList = ZONE_OPTIONS_LIST

  // Detect existing RDV
  const hasRdv = deal?.closedate
  const stageInfo = deal?.dealstage ? STAGE_MAP[deal.dealstage] : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: '#ffffff',
        borderLeft: `1px solid ${NAVY_BORDER}`,
        zIndex: 201,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${NAVY_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{fullName}</div>
            {c.email && <div style={{ fontSize: 12, color: '#4cabdb', marginTop: 2 }}>{c.email}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* HubSpot link */}
            <a
              href={`https://app.hubspot.com/contacts/43296174/contact/${c.hubspot_contact_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f97316', fontSize: 11, textDecoration: 'none', padding: '4px 8px', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 6 }}
            >
              <ExternalLink size={10} /> HubSpot
            </a>
            <button
              onClick={onClose}
              style={{ background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#516f90' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── Encart RDV existant (en haut, bien visible) ──────────────── */}
          {hasRdv && (
            <div style={{
              marginBottom: 16,
              padding: '12px 14px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Calendar size={14} color="#22c55e" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Rendez-vous planifié</span>
              </div>
              <div style={{ fontSize: 14, color: '#33475b', fontWeight: 600, marginBottom: 4 }}>
                {new Date(deal!.closedate!).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {stageInfo && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: stageInfo.color,
                    background: `${stageInfo.color}18`, padding: '2px 8px', borderRadius: 4,
                  }}>
                    {stageInfo.label}
                  </span>
                )}
                {deal!.closer && (
                  <span style={{ fontSize: 11, color: '#516f90' }}>
                    Closer : <span style={{ color: '#516f90', fontWeight: 600 }}>{deal!.closer.name}</span>
                  </span>
                )}
                {deal!.formation && (
                  <span style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{deal!.formation}</span>
                )}
              </div>
            </div>
          )}

          {/* ── Bouton Prendre un RDV ────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowBooking(b => !b)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: showBooking ? 'rgba(204,172,113,0.15)' : `linear-gradient(135deg, ${GOLD}, #b8963f)`,
                border: showBooking ? `1px solid ${GOLD}` : 'none',
                borderRadius: 10,
                color: showBooking ? GOLD : '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Calendar size={14} />
              {showBooking ? 'Fermer le formulaire de RDV' : 'Prendre un rendez-vous'}
            </button>
          </div>

          {/* ── Formulaire de booking inline ──────────────────────────────── */}
          {showBooking && (
            <div style={{
              marginBottom: 20,
              padding: '14px',
              background: 'rgba(204,172,113,0.05)',
              border: `1px solid rgba(204,172,113,0.2)`,
              borderRadius: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Nouveau rendez-vous
              </div>
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
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ccac71', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(204,172,113,0.2)', paddingBottom: 6 }}>
              Identité
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <EditField label="Prénom" value={c.firstname || ''} onSave={v => patchContact({ firstname: v })} />
              <EditField label="Nom" value={c.lastname || ''} onSave={v => patchContact({ lastname: v })} />
            </div>
            <EditField label="Téléphone" value={c.phone || ''} type="tel" onSave={v => patchContact({ phone: v })} />
            <EditField label="Email" value={c.email || ''} type="email" onSave={v => patchContact({ email: v })} />
            <SelectField
              label="Classe actuelle"
              value={c.classe_actuelle || ''}
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
          </div>

          {/* Section : Qualification */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4cabdb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(76,171,219,0.2)', paddingBottom: 6 }}>
              Qualification
            </div>
            <SelectField
              label="Statut du lead"
              value={c.hs_lead_status || ''}
              options={leadStatusOpts}
              onSave={v => patchContact({ hs_lead_status: v })}
            />
            {/* Date de création (read-only) */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Date de création</div>
              <div style={{ padding: '7px 10px', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: '#7c98b6', fontSize: 13 }}>
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
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Soumission formulaire</div>
              <div style={{ padding: '7px 10px', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, fontSize: 12 }}>
                {c.recent_conversion_event ? (
                  <div>
                    <div style={{ color: '#516f90' }}>{c.recent_conversion_event}</div>
                    {c.recent_conversion_date && (
                      <div style={{ color: '#7c98b6', fontSize: 11, marginTop: 2 }}>
                        {new Date(c.recent_conversion_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{ color: '#3a5070' }}>—</span>
                )}
              </div>
            </div>
          </div>

          {/* Section : Attribution */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(34,197,94,0.2)', paddingBottom: 6 }}>
              Attribution
            </div>
            <SelectField
              label="Téléprospecteur"
              // Source de vérité = colonne native telepro_user_id, avec fallback
              // sur l'ancien champ deal.teleprospecteur. On résout n'importe
              // quel format d'ID stocké (user.id / hubspot_user_id / owner_id)
              // vers la clé d'option pour que le select affiche bien la valeur.
              value={teleproIdResolver(c.telepro_user_id || deal?.teleprospecteur)}
              options={teleproOptions}
              onSave={v => patchContact({ telepro_user_id: v || null, teleprospecteur: v || null })}
            />
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
          </div>

          {/* Section : Transaction */}
          {deal && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(168,85,247,0.2)', paddingBottom: 6 }}>
                Transaction
              </div>
              <SelectField
                label="Phase de la transaction"
                value={deal.dealstage || ''}
                options={stageOptions}
                onSave={v => patchDeal({ dealstage: v })}
                colorMap={stageColorMap}
              />
              {deal.formation && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Formation</div>
                  <div style={{ padding: '7px 10px', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: GOLD, fontSize: 13, fontWeight: 700 }}>{deal.formation}</div>
                </div>
              )}
              {deal.closedate && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Date RDV</div>
                  <div style={{ padding: '7px 10px', background: '#f5f8fa', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: '#516f90', fontSize: 13 }}>
                    {new Date(deal.closedate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              )}
              <a
                href={`https://app.hubspot.com/contacts/43296174/deal/${deal.hubspot_deal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#f97316', fontSize: 12, textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8 }}
              >
                <ExternalLink size={11} /> Voir la transaction HubSpot
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
