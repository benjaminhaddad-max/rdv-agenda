'use client'

import { useState, useEffect } from 'react'
import { X, Save, ExternalLink, Calendar, ChevronLeft, ChevronRight, Clock, Video, PhoneCall, MapPin, CheckCircle } from 'lucide-react'

// Constantes
const NAVY_BORDER = '#2d4a6b'
const GOLD = '#ccac71'
const BLUE = '#4cabdb'

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: BLUE },
  '3165428981': { label: 'Délai Réflexion',       color: GOLD },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#555870' },
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
              background: 'rgba(255,255,255,0.06)',
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
            style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#8b8fa8', fontSize: 12, cursor: 'pointer' }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{
            padding: '7px 10px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${NAVY_BORDER}`,
            borderRadius: 6,
            color: value ? '#c8cad8' : '#3a5070',
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
  const [saving, setSaving] = useState(false)

  async function handleChange(v: string) {
    setSaving(true)
    try { await onSave(v) } finally { setSaving(false) }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={e => handleChange(e.target.value)}
        disabled={saving}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${NAVY_BORDER}`,
          borderRadius: 6,
          padding: '7px 10px',
          color: colorMap?.[value] || '#c8cad8',
          fontSize: 13,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        {options.map(o => (
          <option key={o.id} value={o.id} style={{ background: '#0d1e34', color: colorMap?.[o.id] || '#c8cad8' }}>
            {o.label}
          </option>
        ))}
      </select>
      {saving && <div style={{ fontSize: 10, color: BLUE, marginTop: 3 }}>Enregistrement…</div>}
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
            `📚 Formation demandée : ${formationLabel}`,
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
        <div style={{ color: '#8b8fa8', fontSize: 12, marginTop: 4 }}>
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
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'none', border: 'none', color: '#8b8fa8', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600 }}>
            {weekDays[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'none', border: 'none', color: '#8b8fa8', cursor: 'pointer', padding: 4 }}>
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
                  background: isSelected ? GOLD : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isSelected ? GOLD : NAVY_BORDER}`,
                  borderRadius: 8,
                  color: isSelected ? '#0d1e34' : disabled ? '#2a3a50' : '#c8cad8',
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
            <div style={{ color: '#555870', fontSize: 12, padding: '8px 0' }}>Chargement…</div>
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
                      background: isSelected ? GOLD : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isSelected ? GOLD : NAVY_BORDER}`,
                      borderRadius: 6,
                      color: isSelected ? '#0d1e34' : '#c8cad8',
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
                width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${NAVY_BORDER}`,
                borderRadius: 6, padding: '7px 10px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit', outline: 'none',
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
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Département *</div>
              <input
                value={departement} onChange={e => setDepartement(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
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
                width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${NAVY_BORDER}`,
                borderRadius: 6, padding: '7px 10px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit', outline: 'none',
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
                      background: active ? 'rgba(204,172,113,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? GOLD : NAVY_BORDER}`,
                      borderRadius: 6, color: active ? GOLD : '#8b8fa8',
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
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#4cabdb', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notes (optionnel)</div>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>}

          {/* Bouton confirmer */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            style={{
              width: '100%', padding: '10px',
              background: canSubmit ? `linear-gradient(135deg, ${GOLD}, #b8963f)` : 'rgba(255,255,255,0.05)',
              border: 'none', borderRadius: 8,
              color: canSubmit ? '#0d1e34' : '#555870',
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
export default function CRMEditDrawer({ contact, closers, telepros, onClose, onRefresh }: Props) {
  // Local optimistic state
  const [localContact, setLocalContact] = useState<CRMContact | null>(null)
  const [showBooking, setShowBooking] = useState(false)

  // Valeurs réelles HubSpot chargées depuis l'API Properties
  const [leadStatusOpts, setLeadStatusOpts] = useState<{ id: string; label: string }[]>([{ id: '', label: '—' }])
  const [sourceOpts, setSourceOpts] = useState<{ id: string; label: string }[]>([{ id: '', label: '—' }])
  const [formationOpts, setFormationOpts] = useState<{ id: string; label: string }[]>([{ id: '', label: '—' }])

  useEffect(() => {
    setLocalContact(contact)
    setShowBooking(false)
  }, [contact])

  useEffect(() => {
    fetch('/api/crm/field-options').then(r => r.json()).then(d => {
      if (d.leadStatuses?.length) {
        setLeadStatusOpts([
          { id: '', label: '—' },
          ...d.leadStatuses.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.sources?.length) {
        setSourceOpts([
          { id: '', label: '—' },
          ...d.sources.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.formations?.length) {
        setFormationOpts([
          { id: '', label: '—' },
          ...d.formations.map((v: string) => ({ id: v, label: v })),
        ])
      }
    })
  }, [])

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

  const closerOptions = [
    { id: '', label: '— Aucun closer —' },
    ...closers.map(u => ({ id: u.hubspot_owner_id || u.id, label: u.name })),
  ]

  const teleproOptions = [
    { id: '', label: '— Aucun télépro —' },
    ...telepros.map(u => ({ id: u.hubspot_user_id || u.id, label: u.name })),
  ]

  const classeOptionList = CLASSE_OPTIONS.map(cl => ({ id: cl, label: cl || '—' }))

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
        background: '#0d1e34',
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
              style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}
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
              <div style={{ fontSize: 14, color: '#e8eaf0', fontWeight: 600, marginBottom: 4 }}>
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
                  <span style={{ fontSize: 11, color: '#8b8fa8' }}>
                    Closer : <span style={{ color: '#c8cad8', fontWeight: 600 }}>{deal!.closer.name}</span>
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
                color: showBooking ? GOLD : '#0d1e34',
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
            <EditField label="Zone / Localité" value={c.zone_localite || ''} onSave={v => patchContact({ zone_localite: v })} />
            <SelectField
              label="Formation demandée"
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
              <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: '#555870', fontSize: 13 }}>
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
              <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, fontSize: 12 }}>
                {c.recent_conversion_event ? (
                  <div>
                    <div style={{ color: '#c8cad8' }}>{c.recent_conversion_event}</div>
                    {c.recent_conversion_date && (
                      <div style={{ color: '#555870', fontSize: 11, marginTop: 2 }}>
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
              value={deal?.teleprospecteur || ''}
              options={teleproOptions}
              onSave={v => patchContact({ teleprospecteur: v || null })}
            />
            <SelectField
              label="Closer (propriétaire contact)"
              value={c.hubspot_owner_id || ''}
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
                  <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: GOLD, fontSize: 13, fontWeight: 700 }}>{deal.formation}</div>
                </div>
              )}
              {deal.closedate && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Date RDV</div>
                  <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: '#c8cad8', fontSize: 13 }}>
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
