'use client'

import { useState, useRef, useEffect } from 'react'
import { format, startOfToday } from 'date-fns'
import {
  X, Search, CheckCircle, Plus, Video, PhoneCall, MapPin,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

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
    teleprospecteur?: string // HubSpot user ID of télépro
  }
}

interface Telepro {
  id: string
  name: string
  hubspot_user_id?: string
}

interface CloserNewRdvModalProps {
  closerId: string
  closerName: string
  onClose: () => void
  onSuccess: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FORMATIONS = [
  { label: 'Terminale → PASS',  value: 'Terminale → PASS',  hs: 'PAS'  },
  { label: 'Terminale → LAS',   value: 'Terminale → LAS',   hs: 'LAS'  },
  { label: 'Terminale Santé',   value: 'Terminale Santé',   hs: 'PAS'  },
  { label: 'Première Élite',    value: 'Première Élite',    hs: 'PAS'  },
  { label: 'PASS (en cours)',   value: 'PASS',              hs: 'P-1'  },
  { label: 'LAS (en cours)',    value: 'LAS',               hs: 'LAS'  },
  { label: 'P2 (en cours)',     value: 'P2',                hs: 'P-2'  },
  { label: 'LSPS',             value: 'LSPS',              hs: 'LSPS' },
  { label: 'PAES FR/EU',       value: 'PAES FR/EU',        hs: 'PAES' },
  { label: 'Autre',            value: 'Autre',             hs: ''     },
]

const HOURS: string[] = []
for (let h = 8; h <= 18; h++) {
  HOURS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 18) HOURS.push(`${String(h).padStart(2, '0')}:30`)
}

function generateJitsiLink() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const rand = Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `https://meet.ffmuc.net/DiplomaSanteRDV${rand}`
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  background: '#252840',
  border: '1px solid #2a2d3e',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#e8eaf0',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const label: React.CSSProperties = {
  fontSize: 11,
  color: '#555870',
  fontWeight: 600,
  display: 'block',
  marginBottom: 5,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CloserNewRdvModal({
  closerId,
  closerName,
  onClose,
  onSuccess,
}: CloserNewRdvModalProps) {
  // ── HubSpot lookup ──────────────────────────────────────────────────────
  const [hsMode, setHsMode]       = useState<'url' | 'phone' | 'new'>('url')
  const [hsUrl, setHsUrl]         = useState('')
  const [hsPhone, setHsPhone]     = useState('')
  const [hsContact, setHsContact] = useState<HubSpotContact | null>(null)
  const [hsLoading, setHsLoading] = useState(false)
  const [hsError, setHsError]     = useState<string | null>(null)
  const [step, setStep]           = useState<'lookup' | 'form'>('lookup')

  // ── Form fields ─────────────────────────────────────────────────────────
  const [name,          setName]          = useState('')
  const [email,         setEmail]         = useState('')
  const [phone,         setPhone]         = useState('')
  const [formation,     setFormation]     = useState('')
  const [department,    setDepartment]    = useState('')
  const [selectedDate,  setSelectedDate]  = useState('')
  const [selectedHour,  setSelectedHour]  = useState('')
  const [meetingType,   setMeetingType]   = useState<'visio' | 'telephone' | 'presentiel'>('visio')
  const [meetingLink,   setMeetingLink]   = useState(() => generateJitsiLink())

  // ── Télépro ─────────────────────────────────────────────────────────────
  const [hasTelePro,       setHasTelePro]       = useState<boolean | null>(null)
  const [telepros,         setTelepros]         = useState<Telepro[]>([])
  const [selectedTelepro,  setSelectedTelepro]  = useState('')

  // ── Submit ──────────────────────────────────────────────────────────────
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  const backdropRef = useRef<HTMLDivElement>(null)

  // ── Load télépros ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/users?role=telepro')
      .then(r => r.json())
      .then((data: Telepro[]) => setTelepros(data))
      .catch(() => {})
  }, [])

  // ── Auto-gen visio link when switching to visio ──────────────────────────
  useEffect(() => {
    if (meetingType === 'visio' && !meetingLink) {
      setMeetingLink(generateJitsiLink())
    }
  }, [meetingType, meetingLink])

  // ── Fill form from HubSpot contact ───────────────────────────────────────
  function fillFromContact(contact: HubSpotContact) {
    const p = contact.properties
    setName([p.firstname, p.lastname].filter(Boolean).join(' '))
    setEmail(p.email || '')
    setPhone(p.phone || '')
    setDepartment(p.departement || '')

    // Try to map HubSpot teleprospecteur → our DB telepro
    if (p.teleprospecteur) {
      const match = telepros.find(t => t.hubspot_user_id === p.teleprospecteur)
      if (match) {
        setHasTelePro(true)
        setSelectedTelepro(match.id)
      }
    }
  }

  // ── HubSpot lookups ──────────────────────────────────────────────────────
  async function lookupByUrl() {
    if (!hsUrl.trim()) return
    setHsLoading(true)
    setHsError(null)
    try {
      const res = await fetch(`/api/hubspot/contact?url=${encodeURIComponent(hsUrl.trim())}`)
      if (!res.ok) throw new Error('Contact introuvable')
      const data: HubSpotContact = await res.json()
      setHsContact(data)
      fillFromContact(data)
      setStep('form')
    } catch (e) {
      setHsError(e instanceof Error ? e.message : 'Erreur de recherche')
    } finally {
      setHsLoading(false)
    }
  }

  async function lookupByPhone() {
    if (!hsPhone.trim()) return
    setHsLoading(true)
    setHsError(null)
    try {
      const res = await fetch(`/api/hubspot/contact?phone=${encodeURIComponent(hsPhone.trim())}`)
      if (!res.ok) throw new Error('Contact introuvable')
      const data: HubSpotContact = await res.json()
      setHsContact(data)
      fillFromContact(data)
      setStep('form')
    } catch (e) {
      setHsError(e instanceof Error ? e.message : 'Erreur de recherche')
    } finally {
      setHsLoading(false)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !selectedDate || !selectedHour) {
      setSubmitError('Veuillez remplir tous les champs obligatoires (*)')
      return
    }
    if (hasTelePro === null) {
      setSubmitError('Répondez à la question sur le télépro')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const [yr, mo, dy] = selectedDate.split('-').map(Number)
      const [hh, mm]     = selectedHour.split(':').map(Number)
      const startAt = new Date(yr, mo - 1, dy, hh, mm || 0)
      const endAt   = new Date(startAt.getTime() + 60 * 60 * 1000) // +1h

      const formEntry = FORMATIONS.find(f => f.value === formation)

      const body = {
        commercial_id:      closerId,
        prospect_name:      name.trim(),
        prospect_email:     email.trim(),
        prospect_phone:     phone.trim() || null,
        start_at:           startAt.toISOString(),
        end_at:             endAt.toISOString(),
        source:             'admin',
        formation_type:     formation || null,
        formation_hs_value: formEntry?.hs || null,
        departement:        department || null,
        meeting_type:       meetingType,
        meeting_link:       meetingType === 'visio' ? meetingLink : null,
        hubspot_contact_id: hsContact?.id || null,
        telepro_id:         (hasTelePro && selectedTelepro) ? selectedTelepro : null,
      }

      const res = await fetch('/api/appointments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de la création du RDV')
      }

      onSuccess()
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Backdrop close ───────────────────────────────────────────────────────
  function handleBackdropMouseDown(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  const minDate = format(startOfToday(), 'yyyy-MM-dd')

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={backdropRef}
      onMouseDown={handleBackdropMouseDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: '#1a1d27',
          border: '1px solid #2a2d3e',
          borderRadius: 16,
          maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #2a2d3e',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>
              Nouveau RDV
            </div>
            <div style={{ fontSize: 12, color: '#555870', marginTop: 2 }}>
              Assigné à <span style={{ color: '#6b87ff', fontWeight: 600 }}>{closerName}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #2a2d3e',
              borderRadius: 8, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#8b8fa8',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

          {/* ══ STEP 1 : HubSpot lookup ══════════════════════════════ */}
          {step === 'lookup' && (
            <div>
              <div style={{ fontSize: 13, color: '#8b8fa8', marginBottom: 14 }}>
                Rechercher le contact HubSpot du prospect (ou créer manuellement)
              </div>

              {/* Mode tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[
                  { key: 'url',   label: '🔗 Lien HubSpot'  },
                  { key: 'phone', label: '📞 Téléphone'      },
                  { key: 'new',   label: '✨ Nouveau contact' },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setHsMode(m.key as typeof hsMode); setHsError(null) }}
                    style={{
                      flex: 1,
                      background: hsMode === m.key ? 'rgba(79,110,247,0.15)' : '#252840',
                      border: `1px solid ${hsMode === m.key ? 'rgba(79,110,247,0.4)' : '#2a2d3e'}`,
                      borderRadius: 8, padding: '7px 6px',
                      color: hsMode === m.key ? '#6b87ff' : '#8b8fa8',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* URL search */}
              {hsMode === 'url' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    value={hsUrl}
                    onChange={e => setHsUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && lookupByUrl()}
                    placeholder="https://app-eu1.hubspot.com/contacts/…"
                    style={inp}
                  />
                  <button
                    onClick={lookupByUrl}
                    disabled={hsLoading || !hsUrl.trim()}
                    style={{
                      background: hsLoading ? '#353849' : '#4f6ef7',
                      color: 'white', border: 'none',
                      borderRadius: 8, padding: '10px 0',
                      fontSize: 13, fontWeight: 700, cursor: hsLoading ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: !hsUrl.trim() ? 0.5 : 1,
                    }}
                  >
                    <Search size={14} />
                    {hsLoading ? 'Recherche…' : 'Rechercher'}
                  </button>
                </div>
              )}

              {/* Phone search */}
              {hsMode === 'phone' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    value={hsPhone}
                    onChange={e => setHsPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && lookupByPhone()}
                    placeholder="0601020304"
                    style={inp}
                  />
                  <button
                    onClick={lookupByPhone}
                    disabled={hsLoading || !hsPhone.trim()}
                    style={{
                      background: hsLoading ? '#353849' : '#4f6ef7',
                      color: 'white', border: 'none',
                      borderRadius: 8, padding: '10px 0',
                      fontSize: 13, fontWeight: 700, cursor: hsLoading ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: !hsPhone.trim() ? 0.5 : 1,
                    }}
                  >
                    <Search size={14} />
                    {hsLoading ? 'Recherche…' : 'Rechercher'}
                  </button>
                </div>
              )}

              {/* New contact */}
              {hsMode === 'new' && (
                <button
                  onClick={() => { setHsContact(null); setStep('form') }}
                  style={{
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: 8, padding: '11px 0', width: '100%',
                    color: '#22c55e', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Plus size={14} />
                  Saisir manuellement (sans HubSpot)
                </button>
              )}

              {hsError && (
                <div style={{
                  marginTop: 10, padding: '8px 12px',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8, color: '#ef4444', fontSize: 12,
                }}>
                  {hsError}
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 2 : Formulaire ═══════════════════════════════════ */}
          {step === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* HubSpot badge */}
              {hsContact && (
                <div style={{
                  background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)',
                  borderRadius: 10, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <CheckCircle size={15} style={{ color: '#4f6ef7', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b87ff' }}>
                      Contact HubSpot lié
                    </div>
                    <div style={{ fontSize: 11, color: '#555870', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[hsContact.properties.firstname, hsContact.properties.lastname].filter(Boolean).join(' ')}
                      {' '}— ID {hsContact.id}
                    </div>
                  </div>
                  <button
                    onClick={() => { setHsContact(null); setStep('lookup') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555870', padding: 0 }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Prospect info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={label}>Nom complet *</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Prénom Nom"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={label}>Email *</label>
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    type="email"
                    placeholder="email@exemple.com"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={label}>Téléphone</label>
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="06 01 02 03 04"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={label}>Formation</label>
                  <select value={formation} onChange={e => setFormation(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">— Sélectionner —</option>
                    {FORMATIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Département</label>
                  <input
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="ex: 75"
                    style={inp}
                  />
                </div>
              </div>

              {/* Date / Heure */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Date *</label>
                  <input
                    type="date"
                    value={selectedDate}
                    min={minDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    style={{ ...inp, cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <label style={label}>Heure de début *</label>
                  <select
                    value={selectedHour}
                    onChange={e => setSelectedHour(e.target.value)}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="">— Heure —</option>
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {/* Meeting type */}
              <div>
                <label style={label}>Type de RDV</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { key: 'visio',      icon: <Video size={13} />,     label: 'Visio'      },
                    { key: 'telephone',  icon: <PhoneCall size={13} />, label: 'Téléphone'  },
                    { key: 'presentiel', icon: <MapPin size={13} />,    label: 'Présentiel' },
                  ] as const).map(m => (
                    <button
                      key={m.key}
                      onClick={() => setMeetingType(m.key)}
                      style={{
                        flex: 1,
                        background: meetingType === m.key ? 'rgba(79,110,247,0.15)' : '#252840',
                        border: `1px solid ${meetingType === m.key ? 'rgba(79,110,247,0.4)' : '#2a2d3e'}`,
                        borderRadius: 8, padding: '8px 0',
                        color: meetingType === m.key ? '#6b87ff' : '#8b8fa8',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
                {meetingType === 'visio' && (
                  <input
                    value={meetingLink}
                    onChange={e => setMeetingLink(e.target.value)}
                    placeholder="Lien visio…"
                    style={{ ...inp, marginTop: 8, fontSize: 12 }}
                  />
                )}
              </div>

              {/* ── Question télépro ───────────────────────────────── */}
              <div style={{
                background: '#0f1117',
                border: `1px solid ${hasTelePro === null ? '#2a2d3e' : hasTelePro ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
                borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0', marginBottom: 12 }}>
                  Y a-t-il un télépro sur ce dossier ?
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: hasTelePro === true ? 12 : 0 }}>
                  <button
                    onClick={() => setHasTelePro(true)}
                    style={{
                      flex: 1,
                      background: hasTelePro === true ? 'rgba(34,197,94,0.15)' : '#252840',
                      border: `1px solid ${hasTelePro === true ? 'rgba(34,197,94,0.4)' : '#2a2d3e'}`,
                      borderRadius: 8, padding: '9px 0',
                      color: hasTelePro === true ? '#22c55e' : '#8b8fa8',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    ✅ Oui
                  </button>
                  <button
                    onClick={() => { setHasTelePro(false); setSelectedTelepro('') }}
                    style={{
                      flex: 1,
                      background: hasTelePro === false ? 'rgba(239,68,68,0.1)' : '#252840',
                      border: `1px solid ${hasTelePro === false ? 'rgba(239,68,68,0.3)' : '#2a2d3e'}`,
                      borderRadius: 8, padding: '9px 0',
                      color: hasTelePro === false ? '#ef4444' : '#8b8fa8',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    ❌ Non
                  </button>
                </div>

                {hasTelePro === true && (
                  <div>
                    <label style={label}>Sélectionner le télépro</label>
                    <select
                      value={selectedTelepro}
                      onChange={e => setSelectedTelepro(e.target.value)}
                      style={{ ...inp, cursor: 'pointer' }}
                    >
                      <option value="">— Sélectionner —</option>
                      {telepros.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {selectedTelepro && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#22c55e' }}>
                        ✓ {telepros.find(t => t.id === selectedTelepro)?.name} sera lié à ce RDV
                      </div>
                    )}
                  </div>
                )}

                {hasTelePro === false && (
                  <div style={{ fontSize: 12, color: '#555870' }}>
                    RDV sans télépro — dossier traité directement
                  </div>
                )}
              </div>

              {/* Error */}
              {submitError && (
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8, color: '#ef4444', fontSize: 12, textAlign: 'center',
                }}>
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        {step === 'form' && (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid #2a2d3e',
            display: 'flex', gap: 10,
            flexShrink: 0,
          }}>
            <button
              onClick={() => setStep('lookup')}
              style={{
                background: 'transparent', border: '1px solid #2a2d3e',
                borderRadius: 8, padding: '9px 16px',
                color: '#8b8fa8', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              ← Retour
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim() || !email.trim() || !selectedDate || !selectedHour || hasTelePro === null}
              style={{
                flex: 1,
                background: '#4f6ef7', color: 'white', border: 'none',
                borderRadius: 8, padding: '10px 0',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: (submitting || !name.trim() || !email.trim() || !selectedDate || !selectedHour || hasTelePro === null) ? 0.45 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {submitting ? '⏳ Création…' : '✓ Créer le RDV'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
