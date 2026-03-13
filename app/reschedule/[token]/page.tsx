'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { format, addDays, isSameDay, startOfToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Clock } from 'lucide-react'

type OriginalAppt = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  formation_type: string | null
  meeting_type: string | null
}

type Slot = { start: string; end: string }

export default function ReschedulePage() {
  const { token } = useParams<{ token: string }>()

  const [original, setOriginal] = useState<OriginalAppt | null>(null)
  const [loadingOriginal, setLoadingOriginal] = useState(true)
  const [tokenError, setTokenError] = useState(false)

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = startOfToday()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1))
    .filter(d => d.getDay() !== 0 && d.getDay() !== 6)
    .slice(0, 7)

  // Charger le RDV original via le token
  useEffect(() => {
    fetch(`/api/reschedule/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setTokenError(true); return }
        setOriginal(data)
      })
      .catch(() => setTokenError(true))
      .finally(() => setLoadingOriginal(false))
  }, [token])

  // Charger les créneaux disponibles pour la date sélectionnée
  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)

    const dateStr = format(selectedDate, 'yyyy-MM-dd')

    // Récupérer les créneaux disponibles de tous les closers pour ce jour
    fetch(`/api/availability/pool?date=${dateStr}`)
      .then(r => r.json())
      .then((data: Slot[]) => setSlots(data))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate])

  async function submit() {
    if (!selectedSlot || !original) return
    setSubmitting(true)
    setError(null)

    try {
      // 1. Créer le nouveau RDV (non assigné — Pascal réassignera)
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: original.prospect_name,
          prospect_email: original.prospect_email,
          prospect_phone: original.prospect_phone,
          start_at: selectedSlot.start,
          end_at: selectedSlot.end,
          source: 'prospect',
          formation_type: original.formation_type,
          meeting_type: original.meeting_type,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erreur lors de la réservation')
        return
      }

      // 2. Annuler l'ancien RDV
      await fetch(`/api/reschedule/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_original' }),
      })

      setSuccess(true)
    } finally {
      setSubmitting(false)
    }
  }

  // États de chargement / erreur
  if (loadingOriginal) {
    return (
      <div style={pageWrap}>
        <div style={{ color: '#555870', fontSize: 14 }}>Chargement…</div>
      </div>
    )
  }

  if (tokenError) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>Lien invalide</div>
            <div style={{ fontSize: 14, color: '#8b8fa8' }}>Ce lien est invalide ou a expiré.</div>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={pageWrap}>
        <Header />
        <div style={card}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf0', marginBottom: 8 }}>
              Demande enregistrée !
            </div>
            <div style={{ fontSize: 14, color: '#8b8fa8', lineHeight: 1.7 }}>
              Votre demande de report a bien été prise en compte.<br />
              Notre équipe vous confirmera le nouveau créneau.
            </div>
            {selectedSlot && (
              <div style={{
                marginTop: 20, background: '#252840', borderRadius: 10,
                padding: '12px 16px', fontSize: 14, color: '#6b87ff', fontWeight: 600,
              }}>
                📅 {format(new Date(selectedSlot.start), "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#e8eaf0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Header />

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '28px 16px' }}>

        {/* Titre */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf0', marginBottom: 6 }}>
            Choisissez un nouveau créneau
          </div>
          <div style={{ fontSize: 14, color: '#8b8fa8' }}>
            Bonjour {original?.prospect_name.split(' ')[0]}, sélectionnez la date et l&apos;heure qui vous conviennent.
          </div>
        </div>

        {/* Sélection date */}
        <div style={{ marginBottom: 28 }}>
          <div style={sectionTitle}>
            <Calendar size={15} style={{ color: '#4f6ef7' }} />
            Choisir une date
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {days.map(day => {
              const sel = selectedDate && isSameDay(day, selectedDate)
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  style={{
                    background: sel ? 'rgba(79,110,247,0.15)' : '#1e2130',
                    border: `1px solid ${sel ? 'rgba(79,110,247,0.5)' : '#2a2d3e'}`,
                    borderRadius: 10, padding: '10px 14px',
                    color: sel ? '#6b87ff' : '#8b8fa8',
                    fontSize: 13, fontWeight: sel ? 700 : 400,
                    cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
                    {format(day, 'EEE', { locale: fr })}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{format(day, 'd')}</div>
                  <div style={{ fontSize: 10, color: '#555870', marginTop: 1 }}>{format(day, 'MMM', { locale: fr })}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Sélection créneau */}
        {selectedDate && (
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>
              <Clock size={15} style={{ color: '#22c55e' }} />
              Choisir un créneau
            </div>
            {loadingSlots ? (
              <div style={{ color: '#555870', fontSize: 13 }}>Chargement des créneaux…</div>
            ) : slots.length === 0 ? (
              <div style={{ color: '#f59e0b', fontSize: 13, padding: '12px 0' }}>
                Aucun créneau disponible ce jour — essayez une autre date.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {slots.map(slot => {
                  const isSel = selectedSlot?.start === slot.start
                  return (
                    <button
                      key={slot.start}
                      onClick={() => setSelectedSlot(slot)}
                      style={{
                        background: isSel ? 'rgba(34,197,94,0.15)' : '#1e2130',
                        border: `1px solid ${isSel ? 'rgba(34,197,94,0.5)' : '#2a2d3e'}`,
                        borderRadius: 8, padding: '8px 16px',
                        color: isSel ? '#22c55e' : '#8b8fa8',
                        fontSize: 14, fontWeight: isSel ? 700 : 400,
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

        {/* Erreur */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '12px 16px', color: '#ef4444', fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Bouton valider */}
        {selectedSlot && (
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #4f6ef7, #6b87ff)',
              border: 'none', borderRadius: 12, padding: '16px',
              color: 'white', fontSize: 16, fontWeight: 700,
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {submitting ? 'Envoi en cours…' : 'Confirmer ce nouveau créneau →'}
          </button>
        )}

        <Footer inline />
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{
      background: '#1a1d27', borderBottom: '1px solid #2a2d3e',
      padding: '16px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b87ff', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
        Diploma Santé
      </div>
      <div style={{ fontSize: 11, color: '#555870' }}>Prépa médecine d&apos;excellence</div>
    </div>
  )
}

function Footer({ inline }: { inline?: boolean }) {
  return (
    <div style={{ textAlign: 'center', marginTop: inline ? 24 : 0, fontSize: 11, color: '#555870', padding: inline ? 0 : 24 }}>
      © Diploma Santé — Prépa médecine d&apos;excellence
    </div>
  )
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh', background: '#0f1117',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', padding: '24px 16px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const card: React.CSSProperties = {
  background: '#1e2130', border: '1px solid #2a2d3e',
  borderRadius: 20, padding: '32px 28px', maxWidth: 420, width: '100%',
}

const sectionTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 14, color: '#e8eaf0', marginBottom: 12,
  display: 'flex', alignItems: 'center', gap: 8,
}
