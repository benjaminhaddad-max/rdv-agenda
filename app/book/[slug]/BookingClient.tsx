'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Clock, CheckCircle, MapPin } from 'lucide-react'
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

  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  const days = getNavigableDays(weekStart, 7)

  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    fetch(`/api/availability?commercial_id=${commercial.id}&date=${format(selectedDate, 'yyyy-MM-dd')}`)
      .then(r => r.json())
      .then(data => { setSlots(data); if (data.length > 0) setStep('slot') })
      .finally(() => setLoadingSlots(false))
  }, [selectedDate, commercial.id])

  async function handleBook() {
    if (!selectedSlot || !form.name || !form.email) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commercial_id: commercial.id, prospect_name: form.name, prospect_email: form.email, prospect_phone: form.phone || undefined, start_at: selectedSlot.start, end_at: selectedSlot.end }),
      })
      if (res.ok) { setStep('success') }
      else { const err = await res.json(); alert(err.error || 'Erreur lors de la réservation') }
    } finally { setSubmitting(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0b1624 0%, #1a3050 100%)', color: '#e8eaf0' }}>

      {/* Logo header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 30 }} />
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 28, alignItems: 'start' }}>

        {/* Colonne gauche — infos conseiller */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: '28px 24px', position: 'sticky', top: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `${commercial.avatar_color}20`, border: `2px solid ${commercial.avatar_color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: commercial.avatar_color, marginBottom: 16 }}>
            {getInitials(commercial.name)}
          </div>
          <div style={{ fontSize: 11, color: '#4cabdb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Prendre RDV avec</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 12 }}>{commercial.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#8b8fa8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} style={{ color: '#4cabdb', flexShrink: 0 }} /> 30 minutes
            </div>
            <div style={{ fontSize: 13, color: '#8b8fa8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} style={{ color: '#4cabdb', flexShrink: 0 }} /> Visioconférence
            </div>
          </div>

          {selectedDate && selectedSlot && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
              <div style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#4cabdb', fontWeight: 600 }}>
                📅 {format(new Date(selectedSlot.start), 'EEE d MMM · HH:mm', { locale: fr })}
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, overflow: 'hidden' }}>

          {/* Success */}
          {step === 'success' && (
            <div style={{ padding: '56px 32px', textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(76,171,219,0.15)', border: '2px solid rgba(76,171,219,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <CheckCircle size={36} style={{ color: '#4cabdb' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#e8eaf0', marginBottom: 12 }}>RDV confirmé !</div>
              <div style={{ fontSize: 14, color: '#8b8fa8', lineHeight: 1.7 }}>
                Votre rendez-vous avec <strong style={{ color: '#e8eaf0' }}>{commercial.name}</strong> est confirmé pour le{' '}
                <strong style={{ color: '#4cabdb' }}>
                  {selectedDate && selectedSlot && `${format(selectedDate, 'EEEE d MMMM', { locale: fr })} à ${format(new Date(selectedSlot.start), 'HH:mm')}`}
                </strong>.
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: '#555870' }}>Un email de confirmation sera envoyé à {form.email}.</div>
            </div>
          )}

          {step !== 'success' && (
            <div style={{ padding: '28px' }}>

              {/* Date picker */}
              <div style={{ marginBottom: step === 'slot' || step === 'form' ? 24 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>
                    {format(weekStart, 'MMMM yyyy', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setWeekStart(subDays(weekStart, 7))}
                      disabled={weekStart <= startOfDay(new Date())}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: weekStart <= startOfDay(new Date()) ? 'not-allowed' : 'pointer', color: '#8b8fa8', opacity: weekStart <= startOfDay(new Date()) ? 0.3 : 1 }}
                    ><ChevronLeft size={14} /></button>
                    <button
                      onClick={() => setWeekStart(addDays(weekStart, 7))}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}
                    ><ChevronRight size={14} /></button>
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
                          background: isSelected ? '#4cabdb' : today ? 'rgba(76,171,219,0.1)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isSelected ? '#4cabdb' : today ? 'rgba(76,171,219,0.4)' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 12, padding: '10px 4px',
                          cursor: isPast ? 'not-allowed' : 'pointer', opacity: isPast ? 0.3 : 1,
                          textAlign: 'center', transition: 'all 0.15s', fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.7)' : '#555870', textTransform: 'uppercase', fontWeight: 600 }}>
                          {format(day, 'EEE', { locale: fr })}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: isSelected ? 'white' : today ? '#4cabdb' : '#e8eaf0', marginTop: 2 }}>
                          {format(day, 'd')}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Créneaux */}
              {selectedDate && (step === 'slot' || step === 'form') && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0', marginBottom: 12 }}>
                    Créneaux — {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
                  </div>
                  {loadingSlots ? (
                    <div style={{ color: '#555870', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Chargement…</div>
                  ) : slots.filter(s => s.available).length === 0 ? (
                    <div style={{ color: '#555870', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucun créneau disponible. Choisissez une autre date.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {slots.filter(s => s.available).map(slot => {
                        const isSelected = selectedSlot?.start === slot.start
                        return (
                          <button
                            key={slot.start}
                            onClick={() => { setSelectedSlot(slot); setStep('form') }}
                            style={{
                              background: isSelected ? '#4cabdb' : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${isSelected ? '#4cabdb' : 'rgba(255,255,255,0.1)'}`,
                              borderRadius: 10, padding: '10px', cursor: 'pointer',
                              color: isSelected ? 'white' : '#e8eaf0',
                              fontSize: 14, fontWeight: isSelected ? 700 : 400,
                              transition: 'all 0.15s', fontFamily: 'inherit',
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

              {/* Formulaire */}
              {step === 'form' && selectedSlot && (
                <div>
                  <div style={{ background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#4cabdb', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={13} />
                    {format(selectedDate!, 'EEEE d MMMM', { locale: fr })} à {format(new Date(selectedSlot.start), 'HH:mm')} – {format(new Date(selectedSlot.end), 'HH:mm')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'NOM COMPLET *', key: 'name', type: 'text', placeholder: 'Jean Dupont' },
                      { label: 'EMAIL *', key: 'email', type: 'email', placeholder: 'jean@exemple.com' },
                      { label: 'TÉLÉPHONE', key: 'phone', type: 'tel', placeholder: '+33 6 00 00 00 00' },
                    ].map(field => (
                      <div key={field.key}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#8b8fa8', marginBottom: 6, display: 'block', letterSpacing: '0.06em' }}>{field.label}</label>
                        <input
                          type={field.type}
                          value={form[field.key as keyof typeof form]}
                          onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '11px 14px', color: '#e8eaf0', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                      </div>
                    ))}
                    <button
                      onClick={handleBook}
                      disabled={submitting || !form.name || !form.email}
                      style={{
                        background: !form.name || !form.email ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #4cabdb, #1d2f4b)',
                        color: !form.name || !form.email ? '#555870' : 'white',
                        border: 'none', borderRadius: 12, padding: '14px',
                        fontSize: 15, fontWeight: 700,
                        cursor: submitting || !form.name || !form.email ? 'not-allowed' : 'pointer',
                        opacity: submitting ? 0.7 : 1, transition: 'all 0.15s',
                        fontFamily: 'inherit', marginTop: 4,
                      }}
                    >
                      {submitting ? '⏳ Confirmation…' : '✅ Confirmer le rendez-vous'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '0 0 32px', fontSize: 12, color: '#2d4a6b' }}>
        © Diploma Santé — Tous droits réservés
      </div>
    </div>
  )
}
