'use client'

import { useState, useEffect } from 'react'
import { format, addDays, isSameDay, startOfToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Clock, CheckCircle, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'

type Slot = { start: string; end: string }

const FORMATIONS = [
  { label: 'Orthophonie',      emoji: '🗣️' },
  { label: 'Kinésithérapie',   emoji: '💪' },
  { label: 'Sage-femme',       emoji: '🤱' },
  { label: 'Infirmier(e)',     emoji: '🏥' },
  { label: 'Ergothérapie',     emoji: '🖐️' },
  { label: 'Psychomotricité',  emoji: '🧠' },
  { label: 'Ostéopathie',      emoji: '🔬' },
  { label: 'Autre',            emoji: '📋' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, padding: '11px 14px', color: '#e8eaf0',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border-color 0.2s',
}

type Step = 'formation' | 'date' | 'slot' | 'form' | 'success'

export default function BookingPublic() {
  const today = startOfToday()
  const [weekOffset, setWeekOffset] = useState(0)
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1 + weekOffset * 7))
    .filter(d => d.getDay() !== 0 && d.getDay() !== 6)
    .slice(0, 5)

  const [step, setStep] = useState<Step>('formation')
  const [formation, setFormation] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    const base = new Date(selectedDate)
    base.setHours(9, 0, 0, 0)
    const daySlots: Slot[] = []
    while (base.getHours() < 18) {
      const start = new Date(base)
      const end = new Date(base)
      end.setMinutes(base.getMinutes() + 30)
      if (end.getHours() <= 18) daySlots.push({ start: start.toISOString(), end: end.toISOString() })
      base.setMinutes(base.getMinutes() + 30)
    }
    setSlots(daySlots)
    setLoadingSlots(false)
  }, [selectedDate])

  async function submit() {
    if (!selectedSlot || !name || !email || !formation) { setError('Veuillez remplir tous les champs'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_name: name, prospect_email: email, prospect_phone: phone || null, start_at: selectedSlot.start, end_at: selectedSlot.end, source: 'prospect', formation_type: formation }),
      })
      if (res.ok) { setStep('success') }
      else { const d = await res.json(); setError(d.error || 'Erreur lors de la réservation') }
    } finally { setSubmitting(false) }
  }

  const stepIndex = { formation: 1, date: 2, slot: 3, form: 4, success: 5 }[step]

  // ── Succès ──
  if (step === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0b1624 0%, #1d2f4b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: '56px 48px', maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(76,171,219,0.15)', border: '2px solid rgba(76,171,219,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={36} style={{ color: '#4cabdb' }} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 26, margin: '0 auto 24px', display: 'block', filter: 'brightness(10)' }} />
          <div style={{ fontSize: 24, fontWeight: 800, color: '#e8eaf0', marginBottom: 12 }}>Demande envoyée !</div>
          <div style={{ fontSize: 15, color: '#8b8fa8', lineHeight: 1.7 }}>
            Votre demande a bien été enregistrée. Un conseiller Diploma Santé vous contactera pour confirmer le créneau.
          </div>
          {selectedSlot && (
            <div style={{ marginTop: 24, background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 12, padding: '14px 18px', fontSize: 14, color: '#4cabdb', fontWeight: 600 }}>
              📅 {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0b1624 0%, #1a3050 100%)', color: '#e8eaf0' }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 30, filter: 'brightness(10)' }} />
      </div>

      <div style={{ maxWidth: 940, margin: '0 auto', padding: '40px 24px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 32, alignItems: 'start' }}>

        {/* ── Colonne gauche — infos réunion ── */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: '32px 28px', position: 'sticky', top: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(76,171,219,0.15)', border: '1px solid rgba(76,171,219,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎓</div>
            <div>
              <div style={{ fontSize: 11, color: '#4cabdb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Diploma Santé</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#e8eaf0', marginTop: 1 }}>Séance découverte</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8b8fa8' }}>
              <Clock size={14} style={{ color: '#4cabdb', flexShrink: 0 }} />
              30 minutes — Gratuit
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8b8fa8' }}>
              <MapPin size={14} style={{ color: '#4cabdb', flexShrink: 0 }} />
              Visioconférence (lien envoyé par email)
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20 }}>
            <div style={{ fontSize: 12, color: '#555870', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Ce que vous découvrirez</div>
            {['Nos programmes de formations paramédicales', 'Conditions d\'accès et débouchés', 'Financement et accompagnement'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4cabdb', marginTop: 5, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: '#8b8fa8', lineHeight: 1.5 }}>{item}</div>
              </div>
            ))}
          </div>

          {/* Résumé sélections */}
          {(formation || selectedDate || selectedSlot) && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20 }}>
              <div style={{ fontSize: 12, color: '#555870', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Votre sélection</div>
              {formation && <div style={{ fontSize: 12, color: '#ccac71', marginBottom: 5 }}>🎓 {formation}</div>}
              {selectedDate && selectedSlot && (
                <div style={{ fontSize: 12, color: '#4cabdb', marginBottom: 5 }}>
                  📅 {format(new Date(selectedSlot.start), 'EEE d MMM · HH:mm', { locale: fr })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Colonne droite — formulaire step by step ── */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, overflow: 'hidden' }}>
          {/* Progress bar */}
          <div style={{ padding: '20px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {[
                { n: 1, label: 'Filière' },
                { n: 2, label: 'Date' },
                { n: 3, label: 'Créneau' },
                { n: 4, label: 'Coordonnées' },
              ].map(({ n, label }, i) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: stepIndex > n ? '#4cabdb' : stepIndex === n ? '#4cabdb' : 'rgba(255,255,255,0.08)',
                      border: stepIndex === n ? '2px solid rgba(76,171,219,0.5)' : '2px solid transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: stepIndex >= n ? 'white' : '#555870',
                      transition: 'all 0.3s', flexShrink: 0,
                    }}>
                      {stepIndex > n ? '✓' : n}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: stepIndex >= n ? '#4cabdb' : '#555870', whiteSpace: 'nowrap' }}>{label}</div>
                  </div>
                  {i < 3 && (
                    <div style={{ flex: 1, height: 2, background: stepIndex > n ? '#4cabdb' : 'rgba(255,255,255,0.08)', margin: '0 6px', marginBottom: 18, borderRadius: 2, transition: 'background 0.3s' }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '28px 28px' }}>

            {/* ── Étape 1 : Filière ── */}
            {step === 'formation' && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 6 }}>Quelle filière vous intéresse ?</div>
                <div style={{ fontSize: 13, color: '#555870', marginBottom: 24 }}>Sélectionnez la formation que vous souhaitez explorer.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {FORMATIONS.map(f => (
                    <button
                      key={f.label}
                      onClick={() => { setFormation(f.label); setStep('date') }}
                      style={{
                        background: formation === f.label ? 'rgba(76,171,219,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${formation === f.label ? 'rgba(76,171,219,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 12, padding: '14px 16px',
                        color: formation === f.label ? '#4cabdb' : '#8b8fa8',
                        fontSize: 13, fontWeight: formation === f.label ? 700 : 500,
                        cursor: 'pointer', transition: 'all 0.15s',
                        textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{f.emoji}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Étape 2 : Date ── */}
            {step === 'date' && (
              <div>
                <button onClick={() => setStep('formation')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontFamily: 'inherit' }}>
                  <ChevronLeft size={14} /> Retour
                </button>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 6 }}>Choisissez une date</div>
                <div style={{ fontSize: 13, color: '#555870', marginBottom: 24 }}>Sélectionnez un jour de la semaine.</div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e8eaf0' }}>
                    {format(days[0], 'MMMM yyyy', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setWeekOffset(o => Math.max(0, o - 1))}
                      disabled={weekOffset === 0}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: weekOffset === 0 ? 'not-allowed' : 'pointer', color: '#8b8fa8', opacity: weekOffset === 0 ? 0.3 : 1 }}
                    ><ChevronLeft size={14} /></button>
                    <button
                      onClick={() => setWeekOffset(o => o + 1)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}
                    ><ChevronRight size={14} /></button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {days.map(day => {
                    const selected = selectedDate && isSameDay(day, selectedDate)
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => { setSelectedDate(day); setStep('slot') }}
                        style={{
                          background: selected ? '#4cabdb' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${selected ? '#4cabdb' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 14, padding: '14px 8px',
                          cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center', fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: selected ? 'rgba(255,255,255,0.7)' : '#555870', letterSpacing: '0.08em' }}>
                          {format(day, 'EEE', { locale: fr })}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: selected ? 'white' : '#e8eaf0', marginTop: 4, lineHeight: 1 }}>
                          {format(day, 'd')}
                        </div>
                        <div style={{ fontSize: 10, color: selected ? 'rgba(255,255,255,0.6)' : '#555870', marginTop: 3 }}>
                          {format(day, 'MMM', { locale: fr })}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Étape 3 : Créneau ── */}
            {step === 'slot' && selectedDate && (
              <div>
                <button onClick={() => setStep('date')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontFamily: 'inherit' }}>
                  <ChevronLeft size={14} /> Retour
                </button>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 4 }}>Choisissez un créneau</div>
                <div style={{ fontSize: 13, color: '#4cabdb', marginBottom: 24, fontWeight: 600 }}>
                  {format(selectedDate, 'EEEE d MMMM', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                </div>

                {loadingSlots ? (
                  <div style={{ color: '#555870', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Chargement…</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {slots.map(slot => {
                      const isSelected = selectedSlot?.start === slot.start
                      return (
                        <button
                          key={slot.start}
                          onClick={() => { setSelectedSlot(slot); setStep('form') }}
                          style={{
                            background: isSelected ? '#4cabdb' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isSelected ? '#4cabdb' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 10, padding: '10px 6px',
                            cursor: 'pointer', color: isSelected ? 'white' : '#e8eaf0',
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

            {/* ── Étape 4 : Formulaire ── */}
            {step === 'form' && selectedSlot && (
              <div>
                <button onClick={() => setStep('slot')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontFamily: 'inherit' }}>
                  <ChevronLeft size={14} /> Retour
                </button>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 4 }}>Vos coordonnées</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                  <Clock size={14} style={{ color: '#4cabdb', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#4cabdb', fontWeight: 600 }}>
                    {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })} – {format(new Date(selectedSlot.end), 'HH:mm')}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#8b8fa8', marginBottom: 6, display: 'block', letterSpacing: '0.04em' }}>NOM COMPLET *</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Marie Dupont" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#8b8fa8', marginBottom: 6, display: 'block', letterSpacing: '0.04em' }}>EMAIL *</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="marie@exemple.com" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#8b8fa8', marginBottom: 6, display: 'block', letterSpacing: '0.04em' }}>TÉLÉPHONE</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 00 00 00 00" style={inputStyle} />
                  </div>

                  {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>
                      {error}
                    </div>
                  )}

                  <button
                    onClick={submit}
                    disabled={submitting || !name || !email}
                    style={{
                      background: !name || !email ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #4cabdb, #1d2f4b)',
                      color: !name || !email ? '#555870' : 'white',
                      border: 'none', borderRadius: 12, padding: '14px',
                      fontSize: 15, fontWeight: 700,
                      cursor: !name || !email || submitting ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s', fontFamily: 'inherit', width: '100%',
                      marginTop: 4,
                    }}
                  >
                    {submitting ? '⏳ Envoi en cours…' : '✅ Confirmer ma demande de RDV'}
                  </button>

                  <div style={{ textAlign: 'center', fontSize: 11, color: '#3a5070', lineHeight: 1.6 }}>
                    En soumettant ce formulaire, vous acceptez d&apos;être recontacté par un conseiller Diploma Santé.<br />
                    Vos données sont traitées conformément au RGPD.
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '0 0 32px', fontSize: 12, color: '#2d4a6b' }}>
        © Diploma Santé — Tous droits réservés
      </div>
    </div>
  )
}
