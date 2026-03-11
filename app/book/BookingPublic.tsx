'use client'

import { useState, useEffect } from 'react'
import { format, addDays, isSameDay, startOfToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Clock, User, Mail, Phone, Tag, CheckCircle } from 'lucide-react'

type Slot = { start: string; end: string }

const FORMATIONS = [
  'Orthophonie',
  'Kinésithérapie',
  'Sage-femme',
  'Infirmier(e)',
  'Ergothérapie',
  'Psychomotricité',
  'Ostéopathie',
  'Autre',
]

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#252840', border: '1px solid #2a2d3e',
  borderRadius: 10, padding: '12px 14px', color: '#e8eaf0',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export default function BookingPublic() {
  const today = startOfToday()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1))
    .filter(d => d.getDay() !== 0 && d.getDay() !== 6) // exclure week-end
    .slice(0, 7)

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [formation, setFormation] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Charger les créneaux depuis la disponibilité de tous les closers
  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)

    // Générer des créneaux 30min de 9h à 18h pour le jour sélectionné
    const daySlots: Slot[] = []
    const base = new Date(selectedDate)
    base.setHours(9, 0, 0, 0)
    const endHour = 18

    while (base.getHours() < endHour) {
      const start = new Date(base)
      const end = new Date(base)
      end.setMinutes(base.getMinutes() + 30)
      if (end.getHours() <= endHour) {
        daySlots.push({ start: start.toISOString(), end: end.toISOString() })
      }
      base.setMinutes(base.getMinutes() + 30)
    }

    setSlots(daySlots)
    setLoadingSlots(false)
  }, [selectedDate])

  async function submit() {
    if (!selectedSlot || !name || !email || !formation) {
      setError('Veuillez remplir tous les champs obligatoires')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: name,
          prospect_email: email,
          prospect_phone: phone || null,
          start_at: selectedSlot.start,
          end_at: selectedSlot.end,
          source: 'prospect',
          formation_type: formation,
          notes: notes || null,
        }),
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Erreur lors de la réservation')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f1117',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          background: '#1e2130', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 20, padding: '48px 40px', maxWidth: 480, width: '100%',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>
            Demande reçue !
          </div>
          <div style={{ fontSize: 15, color: '#8b8fa8', lineHeight: 1.6 }}>
            Votre demande de rendez-vous a bien été enregistrée.
            Un conseiller Diploma Santé vous contactera pour confirmer le créneau.
          </div>
          <div style={{ marginTop: 24, fontSize: 14, color: '#555870' }}>
            📅 {selectedSlot && format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e8eaf0' }}>
      {/* Header */}
      <div style={{
        background: '#1a1d27', borderBottom: '1px solid #2a2d3e',
        padding: '20px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b87ff', marginBottom: 4 }}>
          Diploma Santé
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#e8eaf0' }}>
          Prendre rendez-vous
        </div>
        <div style={{ fontSize: 14, color: '#555870', marginTop: 4 }}>
          Séance de découverte avec un conseiller en orientation — 30 minutes
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        {/* Étape 1 : Filière */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#e8eaf0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag size={16} style={{ color: '#f59e0b' }} />
            Votre filière souhaitée *
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {FORMATIONS.map(f => (
              <button
                key={f}
                onClick={() => setFormation(f)}
                style={{
                  background: formation === f ? 'rgba(245,158,11,0.15)' : '#1e2130',
                  border: `1px solid ${formation === f ? 'rgba(245,158,11,0.5)' : '#2a2d3e'}`,
                  borderRadius: 10, padding: '10px 12px',
                  color: formation === f ? '#f59e0b' : '#8b8fa8',
                  fontSize: 13, fontWeight: formation === f ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Étape 2 : Date */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#e8eaf0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} style={{ color: '#4f6ef7' }} />
            Choisir une date *
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {days.map(day => {
              const selected = selectedDate && isSameDay(day, selectedDate)
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  style={{
                    background: selected ? 'rgba(79,110,247,0.15)' : '#1e2130',
                    border: `1px solid ${selected ? 'rgba(79,110,247,0.5)' : '#2a2d3e'}`,
                    borderRadius: 10, padding: '10px 16px',
                    color: selected ? '#6b87ff' : '#8b8fa8',
                    fontSize: 13, fontWeight: selected ? 700 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                    textAlign: 'center', minWidth: 72,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
                    {format(day, 'EEE', { locale: fr })}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{format(day, 'd')}</div>
                  <div style={{ fontSize: 11, color: '#555870', marginTop: 1 }}>{format(day, 'MMM', { locale: fr })}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Étape 3 : Créneau */}
        {selectedDate && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e8eaf0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} style={{ color: '#22c55e' }} />
              Choisir un créneau *
            </div>
            {loadingSlots ? (
              <div style={{ color: '#555870', fontSize: 13 }}>Chargement des créneaux…</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {slots.map(slot => {
                  const isSelected = selectedSlot?.start === slot.start
                  return (
                    <button
                      key={slot.start}
                      onClick={() => setSelectedSlot(slot)}
                      style={{
                        background: isSelected ? 'rgba(34,197,94,0.15)' : '#1e2130',
                        border: `1px solid ${isSelected ? 'rgba(34,197,94,0.5)' : '#2a2d3e'}`,
                        borderRadius: 8, padding: '8px 16px',
                        color: isSelected ? '#22c55e' : '#8b8fa8',
                        fontSize: 14, fontWeight: isSelected ? 700 : 400,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {format(new Date(slot.start), 'HH:mm')}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Étape 4 : Infos prospect */}
        {selectedSlot && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e8eaf0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={16} style={{ color: '#a855f7' }} />
              Vos coordonnées
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8b8fa8', marginBottom: 6, display: 'block' }}>
                  Nom complet *
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Marie Dupont"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8b8fa8', marginBottom: 6, display: 'block' }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="marie@email.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8b8fa8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={11} /> Téléphone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="06 00 00 00 00"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8b8fa8', marginBottom: 6, display: 'block' }}>
                  Message (optionnel)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Précisez votre situation, votre parcours…"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Récap + Bouton */}
        {selectedSlot && name && email && formation && (
          <div style={{
            background: '#1e2130', border: '1px solid #2a2d3e',
            borderRadius: 14, padding: '20px 24px', marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={16} style={{ color: '#22c55e' }} />
              Récapitulatif
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#8b8fa8' }}>
              <div>📅 {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}</div>
              <div>🎓 {formation}</div>
              <div>👤 {name} — {email}</div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '12px 16px',
            color: '#ef4444', fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {selectedSlot && (
          <button
            onClick={submit}
            disabled={submitting || !name || !email || !formation}
            style={{
              width: '100%', background: name && email && formation ? '#4f6ef7' : '#252840',
              color: name && email && formation ? 'white' : '#555870',
              border: 'none', borderRadius: 12, padding: '14px',
              fontSize: 15, fontWeight: 700, cursor: name && email && formation ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
          >
            {submitting ? 'Envoi en cours…' : 'Confirmer ma demande de RDV'}
          </button>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#555870' }}>
          Vous recevrez une confirmation par email après validation par notre équipe.
        </div>
      </div>
    </div>
  )
}
