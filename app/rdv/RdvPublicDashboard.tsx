'use client'

import { useState } from 'react'
import { format, addDays, startOfToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Clock, ChevronLeft, ChevronRight, CheckCircle, MapPin, ArrowRight } from 'lucide-react'

// ─── Types de rendez-vous ─────────────────────────────────────────────────────
const RDV_TYPES = [
  {
    key: 'parcoursup',
    title: 'Accompagnement Parcoursup',
    subtitle: 'Optimisez votre dossier',
    description: 'Un expert vous accompagne pas-à-pas dans la construction de vos vœux Parcoursup pour maximiser vos chances d\'admission.',
    icon: '🎓',
    color: '#4cabdb',
    colorAlpha: 'rgba(76,171,219,0.12)',
    borderAlpha: 'rgba(76,171,219,0.35)',
    btnLabel: 'Expert Parcoursup',
    formation: 'Accompagnement Parcoursup',
  },
  {
    key: 'medecine',
    title: 'Coaching Orientation Médecine',
    subtitle: 'Spécial PASS / L.AS / 3ème année',
    description: 'Vous êtes étudiant en médecine ou en réorientation ? Découvrez les débouchés paramédicaux adaptés à votre profil.',
    icon: '🩺',
    color: '#ccac71',
    colorAlpha: 'rgba(204,172,113,0.12)',
    borderAlpha: 'rgba(204,172,113,0.35)',
    btnLabel: 'Étudiant en 3ème année de médecine',
    formation: 'Coaching Orientation Médecine',
  },
  {
    key: 'information',
    title: "Rendez-vous d'information",
    subtitle: 'Explorez nos formations',
    description: 'Orthophonie, kinésithérapie, sage-femme… Découvrez nos programmes, les conditions d\'accès et les débouchés professionnels.',
    icon: '💡',
    color: '#22c55e',
    colorAlpha: 'rgba(34,197,94,0.12)',
    borderAlpha: 'rgba(34,197,94,0.35)',
    btnLabel: 'Étudiant en 3ème année de médecine',
    formation: "Rendez-vous d'information",
  },
  {
    key: 'inscription',
    title: "Rendez-vous d'inscription",
    subtitle: 'Rejoindre Diploma Santé',
    description: 'Rencontrez notre responsable des admissions pour finaliser votre dossier d\'inscription et intégrer une formation.',
    icon: '✍️',
    color: '#a78bfa',
    colorAlpha: 'rgba(167,139,250,0.12)',
    borderAlpha: 'rgba(167,139,250,0.35)',
    btnLabel: 'Responsable des admissions',
    formation: "Rendez-vous d'inscription",
  },
]

type RdvType = typeof RDV_TYPES[number]
type Step = 'dashboard' | 'date' | 'slot' | 'form' | 'success'
type Slot = { start: string; end: string }

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, padding: '11px 14px', color: '#e8eaf0',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RdvPublicDashboard({
  defaultType, utmSource, utmMedium, utmCampaign, utmContent, ref: utmRef,
}: {
  defaultType: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  ref: string | null
}) {
  const preselected = RDV_TYPES.find(t => t.key === defaultType) ?? null

  const [step, setStep] = useState<Step>(preselected ? 'date' : 'dashboard')
  const [selectedType, setSelectedType] = useState<RdvType | null>(preselected)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = startOfToday()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1 + weekOffset * 5))
    .filter(d => d.getDay() !== 0 && d.getDay() !== 6)
    .slice(0, 5)

  function pickType(type: RdvType) {
    setSelectedType(type)
    setSelectedDate(null)
    setSlots([])
    setSelectedSlot(null)
    setStep('date')
  }

  async function loadSlots(day: Date) {
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    setSelectedDate(day)
    const base = new Date(day)
    base.setHours(9, 0, 0, 0)
    const result: Slot[] = []
    while (base.getHours() < 18) {
      const start = new Date(base)
      const end = new Date(base)
      end.setMinutes(base.getMinutes() + 30)
      if (end.getHours() <= 18) result.push({ start: start.toISOString(), end: end.toISOString() })
      base.setMinutes(base.getMinutes() + 30)
    }
    setSlots(result)
    setLoadingSlots(false)
    setStep('slot')
  }

  async function submit() {
    if (!selectedSlot || !selectedType || !name || !email) { setError('Veuillez remplir tous les champs'); return }
    setSubmitting(true); setError(null)

    // Construire les notes UTM pour le tracking
    const utmParts = [
      utmSource   && `source=${utmSource}`,
      utmMedium   && `medium=${utmMedium}`,
      utmCampaign && `campaign=${utmCampaign}`,
      utmContent  && `content=${utmContent}`,
      utmRef      && `ref=${utmRef}`,
    ].filter(Boolean)
    const trackingNote = utmParts.length > 0 ? `[Tracking: ${utmParts.join(' | ')}]` : ''

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
          formation_type: selectedType.formation,
          notes: trackingNote || null,
        }),
      })
      if (res.ok) { setStep('success') }
      else { const d = await res.json(); setError(d.error || 'Erreur') }
    } finally { setSubmitting(false) }
  }

  const accentColor = selectedType?.color ?? '#4cabdb'
  const accentAlpha = selectedType?.colorAlpha ?? 'rgba(76,171,219,0.12)'

  // ── Étapes de progression ──
  const stepIndex = { dashboard: 0, date: 1, slot: 2, form: 3, success: 4 }[step]

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(150deg, #0b1624 0%, #12233d 60%, #0e1e35 100%)', color: '#e8eaf0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'sticky', top: 0, background: 'rgba(11,22,36,0.9)', backdropFilter: 'blur(12px)', zIndex: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, filter: 'brightness(10)' }} />
        {utmCampaign && (
          <div style={{ position: 'absolute', right: 20, background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#4cabdb', fontWeight: 600 }}>
            📊 {utmCampaign}
          </div>
        )}
      </div>

      {/* ── Success ── */}
      {step === 'success' && selectedType && selectedSlot && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 57px)', padding: 24 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${selectedType.borderAlpha}`, borderRadius: 24, padding: '56px 48px', maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: accentAlpha, border: `2px solid ${accentColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 32 }}>
              {selectedType.icon}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#e8eaf0', marginBottom: 12 }}>Demande envoyée !</div>
            <div style={{ fontSize: 14, color: '#8b8fa8', lineHeight: 1.7, marginBottom: 24 }}>
              Votre demande de <strong style={{ color: accentColor }}>{selectedType.title}</strong> a bien été reçue. Un conseiller Diploma Santé vous contactera rapidement pour confirmer le créneau.
            </div>
            <div style={{ background: accentAlpha, border: `1px solid ${selectedType.borderAlpha}`, borderRadius: 12, padding: '14px 18px', fontSize: 14, color: accentColor, fontWeight: 600 }}>
              📅 {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
            </div>
            <button
              onClick={() => { setStep('dashboard'); setSelectedType(null); setSelectedDate(null); setSelectedSlot(null); setName(''); setEmail(''); setPhone('') }}
              style={{ marginTop: 20, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 20px', color: '#555870', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ← Retour à l&apos;accueil
            </button>
          </div>
        </div>
      )}

      {/* ── Dashboard — 4 types ── */}
      {step === 'dashboard' && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 13, color: '#4cabdb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Prise de rendez-vous</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#e8eaf0', lineHeight: 1.2, marginBottom: 12 }}>
              Comment pouvons-nous<br />vous accompagner ?
            </div>
            <div style={{ fontSize: 15, color: '#555870', maxWidth: 480, margin: '0 auto' }}>
              Sélectionnez le type de rendez-vous qui correspond à votre situation.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {RDV_TYPES.map((type) => (
              <div
                key={type.key}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid rgba(255,255,255,0.08)`,
                  borderRadius: 20,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.border = `1px solid ${type.color}50`
                  e.currentTarget.style.background = type.colorAlpha
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
                onClick={() => pickType(type)}
              >
                {/* Card header band */}
                <div style={{ background: type.colorAlpha, borderBottom: `1px solid ${type.borderAlpha}`, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${type.color}20`, border: `1px solid ${type.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {type.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#e8eaf0', lineHeight: 1.2 }}>{type.title}</div>
                    <div style={{ fontSize: 12, color: type.color, fontWeight: 600, marginTop: 3 }}>{type.subtitle}</div>
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontSize: 13, color: '#8b8fa8', lineHeight: 1.7, flex: 1 }}>{type.description}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 11, color: '#555870', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> 30 min
                    </div>
                    <div style={{ fontSize: 11, color: '#555870', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} /> Visio
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); pickType(type) }}
                    style={{
                      background: type.colorAlpha,
                      border: `1px solid ${type.borderAlpha}`,
                      borderRadius: 12, padding: '11px 18px',
                      color: type.color, fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'all 0.15s',
                    }}
                  >
                    {type.btnLabel}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 40, fontSize: 12, color: '#2d4a6b' }}>
            🔒 Vos données sont protégées conformément au RGPD · Diploma Santé
          </div>
        </div>
      )}

      {/* ── Wizard booking (date / slot / form) ── */}
      {step !== 'dashboard' && step !== 'success' && selectedType && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

          {/* ── Sidebar info ── */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden', position: 'sticky', top: 80 }}>
            {/* Type header */}
            <div style={{ background: selectedType.colorAlpha, borderBottom: `1px solid ${selectedType.borderAlpha}`, padding: '20px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{selectedType.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#e8eaf0', marginBottom: 4 }}>{selectedType.title}</div>
              <div style={{ fontSize: 12, color: selectedType.color, fontWeight: 600 }}>{selectedType.subtitle}</div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#8b8fa8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={12} style={{ color: accentColor, flexShrink: 0 }} /> 30 minutes — Gratuit
              </div>
              <div style={{ fontSize: 12, color: '#8b8fa8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={12} style={{ color: accentColor, flexShrink: 0 }} /> Visioconférence
              </div>

              {/* Récap sélection */}
              {selectedDate && selectedSlot && (
                <div style={{ marginTop: 8, background: `${selectedType.colorAlpha}`, border: `1px solid ${selectedType.borderAlpha}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, color: accentColor, fontWeight: 700 }}>📅 Votre créneau</div>
                  <div style={{ fontSize: 12, color: '#e8eaf0', marginTop: 4 }}>
                    {format(new Date(selectedSlot.start), 'EEE d MMM · HH:mm', { locale: fr })}
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep('dashboard')}
                style={{ marginTop: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 11, textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ← Changer de type de RDV
              </button>
            </div>
          </div>

          {/* ── Zone principale ── */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden' }}>
            {/* Progress steps */}
            <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {[
                  { n: 1, label: 'Date' },
                  { n: 2, label: 'Créneau' },
                  { n: 3, label: 'Coordonnées' },
                ].map(({ n, label }, i) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: stepIndex > n ? accentColor : stepIndex === n ? accentColor : 'rgba(255,255,255,0.07)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: stepIndex >= n ? 'white' : '#555870',
                        transition: 'all 0.3s',
                      }}>
                        {stepIndex > n ? '✓' : n}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: stepIndex >= n ? accentColor : '#555870', whiteSpace: 'nowrap' }}>{label}</div>
                    </div>
                    {i < 2 && <div style={{ flex: 1, height: 2, background: stepIndex > n ? accentColor : 'rgba(255,255,255,0.07)', margin: '0 8px', marginBottom: 18, borderRadius: 2, transition: 'background 0.3s' }} />}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '28px' }}>

              {/* ── Étape Date ── */}
              {step === 'date' && (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 4 }}>Choisissez une date</div>
                  <div style={{ fontSize: 13, color: '#555870', marginBottom: 24 }}>Disponibilités sur les prochaines semaines</div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#e8eaf0' }}>
                      {format(days[0], 'MMMM yyyy', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8', opacity: weekOffset === 0 ? 0.3 : 1 }}>
                        <ChevronLeft size={13} />
                      </button>
                      <button onClick={() => setWeekOffset(o => o + 1)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                    {days.map(day => {
                      const isSelected = selectedDate ? day.toDateString() === selectedDate.toDateString() : false
                      return (
                        <button
                          key={day.toISOString()}
                          onClick={() => loadSlots(day)}
                          style={{
                            background: isSelected ? accentColor : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isSelected ? accentColor : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 14, padding: '16px 8px',
                            cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: isSelected ? 'rgba(255,255,255,0.7)' : '#555870', letterSpacing: '0.08em' }}>
                            {format(day, 'EEE', { locale: fr })}
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: isSelected ? 'white' : '#e8eaf0', marginTop: 4, lineHeight: 1 }}>
                            {format(day, 'd')}
                          </div>
                          <div style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.6)' : '#555870', marginTop: 3 }}>
                            {format(day, 'MMM', { locale: fr })}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Étape Créneau ── */}
              {step === 'slot' && selectedDate && (
                <div>
                  <button onClick={() => setStep('date')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontFamily: 'inherit' }}>
                    <ChevronLeft size={13} /> Retour
                  </button>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 4 }}>Choisissez un créneau</div>
                  <div style={{ fontSize: 13, color: accentColor, fontWeight: 600, marginBottom: 24 }}>
                    {format(selectedDate, 'EEEE d MMMM', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                  </div>

                  {loadingSlots ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#555870' }}>Chargement…</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {slots.map(slot => {
                        const isSelected = selectedSlot?.start === slot.start
                        return (
                          <button
                            key={slot.start}
                            onClick={() => { setSelectedSlot(slot); setStep('form') }}
                            style={{
                              background: isSelected ? accentColor : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${isSelected ? accentColor : 'rgba(255,255,255,0.1)'}`,
                              borderRadius: 10, padding: '11px 6px',
                              cursor: 'pointer', color: isSelected ? 'white' : '#e8eaf0',
                              fontSize: 14, fontWeight: isSelected ? 700 : 400,
                              transition: 'all 0.15s', fontFamily: 'inherit', textAlign: 'center',
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

              {/* ── Étape Formulaire ── */}
              {step === 'form' && selectedSlot && (
                <div>
                  <button onClick={() => setStep('slot')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontFamily: 'inherit' }}>
                    <ChevronLeft size={13} /> Retour
                  </button>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 4 }}>Vos coordonnées</div>
                  <div style={{ background: `${selectedType.colorAlpha}`, border: `1px solid ${selectedType.borderAlpha}`, borderRadius: 10, padding: '10px 14px', marginBottom: 24, fontSize: 13, color: accentColor, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={13} />
                    {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })} – {format(new Date(selectedSlot.end), 'HH:mm')}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { label: 'NOM COMPLET *', key: 'name', type: 'text', val: name, set: setName, placeholder: 'Marie Dupont' },
                      { label: 'EMAIL *', key: 'email', type: 'email', val: email, set: setEmail, placeholder: 'marie@exemple.com' },
                      { label: 'TÉLÉPHONE', key: 'phone', type: 'tel', val: phone, set: setPhone, placeholder: '06 00 00 00 00' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#8b8fa8', marginBottom: 6, display: 'block', letterSpacing: '0.06em' }}>{f.label}</label>
                        <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={inputStyle} />
                      </div>
                    ))}

                    {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>{error}</div>}

                    <button
                      onClick={submit}
                      disabled={submitting || !name || !email}
                      style={{
                        background: !name || !email ? 'rgba(255,255,255,0.06)' : accentColor,
                        color: !name || !email ? '#555870' : 'white',
                        border: 'none', borderRadius: 12, padding: '14px',
                        fontSize: 15, fontWeight: 700,
                        cursor: !name || !email || submitting ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s', fontFamily: 'inherit', width: '100%', marginTop: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <CheckCircle size={16} />
                      {submitting ? 'Envoi en cours…' : 'Confirmer ma demande de RDV'}
                    </button>

                    <div style={{ textAlign: 'center', fontSize: 11, color: '#2d4a6b', lineHeight: 1.6 }}>
                      En soumettant ce formulaire, vous acceptez d&apos;être recontacté par un conseiller Diploma Santé.<br />
                      Données protégées conformément au RGPD.
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {step !== 'success' && (
        <div style={{ textAlign: 'center', padding: '0 0 32px', fontSize: 12, color: '#1d2f4b' }}>
          © Diploma Santé — Tous droits réservés
        </div>
      )}
    </div>
  )
}
