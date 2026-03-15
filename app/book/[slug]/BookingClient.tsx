'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Clock, CheckCircle } from 'lucide-react'
import { format, addDays, subDays, isSameDay, isToday, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'

type Commercial = {
  id: string
  name: string
  slug: string
  avatar_color: string
}

type Slot = {
  start: string
  end: string
  available: boolean
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// Generate next 14 days to navigate
function getNavigableDays(startDate: Date, count = 7): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(startDate, i))
}

export default function BookingClient({ commercial }: { commercial: Commercial }) {
  const [weekStart, setWeekStart] = useState(startOfDay(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [step, setStep] = useState<'date' | 'slot' | 'form' | 'success'>('date')
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
  })

  const days = getNavigableDays(weekStart, 7)

  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)

    fetch(`/api/availability?commercial_id=${commercial.id}&date=${format(selectedDate, 'yyyy-MM-dd')}`)
      .then(r => r.json())
      .then(data => {
        setSlots(data)
        if (data.length > 0) setStep('slot')
      })
      .finally(() => setLoadingSlots(false))
  }, [selectedDate, commercial.id])

  async function handleBook() {
    if (!selectedSlot || !form.name || !form.email) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercial_id: commercial.id,
          prospect_name: form.name,
          prospect_email: form.email,
          prospect_phone: form.phone || undefined,
          start_at: selectedSlot.start,
          end_at: selectedSlot.end,
        }),
      })
      if (res.ok) {
        setStep('success')
      } else {
        const err = await res.json()
        alert(err.error || 'Erreur lors de la réservation')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0b1624',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 560,
        background: '#1d2f4b',
        border: '1px solid #2d4a6b',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '28px 28px 24px',
          borderBottom: '1px solid #2d4a6b',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `${commercial.avatar_color}20`,
            border: `2px solid ${commercial.avatar_color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: commercial.avatar_color,
            flexShrink: 0,
          }}>
            {getInitials(commercial.name)}
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#555870', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Prendre rendez-vous avec
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf0', marginTop: 2 }}>
              {commercial.name}
            </div>
            <div style={{ fontSize: 13, color: '#8b8fa8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} />
              30 minutes · Visioconférence
            </div>
          </div>
        </div>

        {/* Step: Success */}
        {step === 'success' && (
          <div style={{ padding: '48px 28px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle size={32} style={{ color: '#22c55e' }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', marginBottom: 8 }}>
              RDV confirmé !
            </div>
            <div style={{ fontSize: 14, color: '#8b8fa8', lineHeight: 1.6 }}>
              Votre rendez-vous avec <strong style={{ color: '#e8eaf0' }}>{commercial.name}</strong> est confirmé pour le{' '}
              <strong style={{ color: '#ccac71' }}>
                {selectedDate && selectedSlot && `${format(selectedDate, 'EEEE d MMMM', { locale: fr })} à ${format(new Date(selectedSlot.start), 'HH:mm')}`}
              </strong>.
            </div>
            <div style={{ marginTop: 16, fontSize: 13, color: '#555870' }}>
              Un email de confirmation vous sera envoyé à {form.email}.
            </div>
          </div>
        )}

        {/* Step: Pick date */}
        {step !== 'success' && (
          <div style={{ padding: '24px 28px' }}>
            {/* Date picker */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0' }}>
                  {format(weekStart, 'MMMM yyyy', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setWeekStart(subDays(weekStart, 7))}
                    disabled={weekStart <= startOfDay(new Date())}
                    style={{
                      background: '#243d5c', border: '1px solid #2d4a6b',
                      borderRadius: 8, width: 30, height: 30,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#8b8fa8',
                      opacity: weekStart <= startOfDay(new Date()) ? 0.3 : 1,
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                    style={{
                      background: '#243d5c', border: '1px solid #2d4a6b',
                      borderRadius: 8, width: 30, height: 30,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#8b8fa8',
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {days.map(day => {
                  const isSelected = selectedDate && isSameDay(day, selectedDate)
                  const today = isToday(day)
                  const isPast = day < startOfDay(new Date())

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => { setSelectedDate(day); setStep('slot') }}
                      disabled={isPast}
                      style={{
                        background: isSelected ? '#b89450' : today ? 'rgba(204,172,113,0.1)' : '#243d5c',
                        border: `1px solid ${isSelected ? '#b89450' : today ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`,
                        borderRadius: 10, padding: '10px 4px',
                        cursor: isPast ? 'not-allowed' : 'pointer',
                        opacity: isPast ? 0.3 : 1,
                        textAlign: 'center',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.7)' : '#555870', textTransform: 'uppercase', fontWeight: 600 }}>
                        {format(day, 'EEE', { locale: fr })}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: isSelected ? 'white' : today ? '#ccac71' : '#e8eaf0', marginTop: 2 }}>
                        {format(day, 'd')}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Slots */}
            {selectedDate && (step === 'slot' || step === 'form') && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0', marginBottom: 12 }}>
                  Créneaux disponibles — {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
                </div>

                {loadingSlots ? (
                  <div style={{ color: '#555870', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                    Chargement des créneaux…
                  </div>
                ) : slots.filter(s => s.available).length === 0 ? (
                  <div style={{ color: '#555870', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                    Aucun créneau disponible ce jour. Choisissez une autre date.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
                    {slots.filter(s => s.available).map(slot => {
                      const isSelected = selectedSlot?.start === slot.start
                      return (
                        <button
                          key={slot.start}
                          onClick={() => { setSelectedSlot(slot); setStep('form') }}
                          style={{
                            background: isSelected ? '#b89450' : '#243d5c',
                            border: `1px solid ${isSelected ? '#b89450' : '#2d4a6b'}`,
                            borderRadius: 10, padding: '10px',
                            cursor: 'pointer',
                            color: isSelected ? 'white' : '#e8eaf0',
                            fontSize: 14, fontWeight: isSelected ? 700 : 400,
                            transition: 'all 0.15s',
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

            {/* Form */}
            {step === 'form' && selectedSlot && (
              <div>
                <div style={{
                  background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.2)',
                  borderRadius: 10, padding: '12px 14px', marginBottom: 20,
                  fontSize: 13, color: '#ccac71',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Clock size={14} />
                  <span>
                    {format(selectedDate!, 'EEEE d MMMM', { locale: fr })} à {format(new Date(selectedSlot.start), 'HH:mm')} – {format(new Date(selectedSlot.end), 'HH:mm')}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      Nom complet *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Jean Dupont"
                      style={{
                        width: '100%', background: '#243d5c', border: '1px solid #2d4a6b',
                        borderRadius: 10, padding: '10px 14px', color: '#e8eaf0',
                        fontSize: 14, outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="jean@exemple.com"
                      style={{
                        width: '100%', background: '#243d5c', border: '1px solid #2d4a6b',
                        borderRadius: 10, padding: '10px 14px', color: '#e8eaf0',
                        fontSize: 14, outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+33 6 00 00 00 00"
                      style={{
                        width: '100%', background: '#243d5c', border: '1px solid #2d4a6b',
                        borderRadius: 10, padding: '10px 14px', color: '#e8eaf0',
                        fontSize: 14, outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleBook}
                    disabled={submitting || !form.name || !form.email}
                    style={{
                      background: '#b89450', color: 'white',
                      border: 'none', borderRadius: 12,
                      padding: '14px', fontSize: 15, fontWeight: 700,
                      cursor: submitting || !form.name || !form.email ? 'not-allowed' : 'pointer',
                      opacity: submitting || !form.name || !form.email ? 0.6 : 1,
                      marginTop: 4,
                    }}
                  >
                    {submitting ? 'Confirmation…' : 'Confirmer le rendez-vous'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
