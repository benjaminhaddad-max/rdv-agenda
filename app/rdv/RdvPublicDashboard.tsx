'use client'

import { useState } from 'react'
import { format, addDays, startOfToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Clock, ChevronLeft, ChevronRight, CheckCircle, MapPin, ArrowRight, Video, Phone, Building2 } from 'lucide-react'

// ─── Types de rendez-vous ─────────────────────────────────────────────────────
const RDV_TYPES = [
  {
    key: 'parcoursup',
    title: 'Accompagnement Parcoursup',
    subtitle: 'Optimisez votre dossier d\'admission',
    description: 'Un expert vous guide pas-à-pas dans la construction de vos vœux Parcoursup pour maximiser vos chances d\'admission.',
    icon: '🎓',
    btnLabel: 'Parler à un Expert Parcoursup',
    formation: 'Accompagnement Parcoursup',
    tag: 'Parcoursup',
  },
  {
    key: 'medecine',
    title: 'Coaching Orientation Médecine',
    subtitle: 'Spécial PASS / L.AS / 3ème année',
    description: 'Vous êtes en reconversion depuis la médecine ? Découvrez les filières paramédicales adaptées à votre profil.',
    icon: '🩺',
    btnLabel: 'Étudiant en 3ème année de médecine',
    formation: 'Coaching Orientation Médecine',
    tag: 'Médecine',
  },
  {
    key: 'information',
    title: "Rendez-vous d'information",
    subtitle: 'Découvrez nos formations',
    description: 'Orthophonie, kinésithérapie, sage-femme… Explorez nos programmes, les conditions d\'accès et les débouchés professionnels.',
    icon: '💡',
    btnLabel: 'Prendre un RDV d\'information',
    formation: "Rendez-vous d'information",
    tag: 'Information',
  },
  {
    key: 'inscription',
    title: "Rendez-vous d'inscription",
    subtitle: 'Rejoindre Diploma Santé',
    description: 'Rencontrez notre responsable des admissions pour finaliser votre dossier et intégrer une de nos formations.',
    icon: '✍️',
    btnLabel: 'Responsable des admissions',
    formation: "Rendez-vous d'inscription",
    tag: 'Inscription',
  },
]

type RdvType = typeof RDV_TYPES[number]
type Step = 'dashboard' | 'date' | 'slot' | 'form' | 'success'
type Slot = { start: string; end: string }
type MeetingType = 'visio' | 'telephone' | 'presentiel'

const MEETING_OPTIONS: { key: MeetingType; label: string; desc: string; Icon: typeof Video }[] = [
  { key: 'visio',      label: 'Visioconférence', desc: 'Lien envoyé par e-mail', Icon: Video },
  { key: 'telephone',  label: 'Téléphone',       desc: 'On vous rappelle',       Icon: Phone },
  { key: 'presentiel', label: 'Présentiel',      desc: 'Dans nos locaux',        Icon: Building2 },
]

// ─── Styles communs ───────────────────────────────────────────────────────────
const NAVY  = '#1d2f4b'
const BLUE  = '#4cabdb'
const GOLD  = '#ccac71'
const LIGHT = '#f4f7fb'

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #d8e3ef',
  borderRadius: 10, padding: '11px 14px', color: NAVY,
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border-color 0.2s',
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

  const [step, setStep]               = useState<Step>(preselected ? 'date' : 'dashboard')
  const [selectedType, setSelectedType] = useState<RdvType | null>(preselected)
  const [weekOffset, setWeekOffset]   = useState(0)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots]             = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [meetingType, setMeetingType] = useState<MeetingType | null>(null)
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = startOfToday()
  const days  = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1 + weekOffset * 5))
    .filter(d => d.getDay() !== 0 && d.getDay() !== 6).slice(0, 5)

  function pickType(type: RdvType) {
    setSelectedType(type); setSelectedDate(null); setSlots([]); setSelectedSlot(null); setStep('date')
  }

  async function loadSlots(day: Date) {
    setLoadingSlots(true); setSlots([]); setSelectedSlot(null); setSelectedDate(day)
    const base = new Date(day); base.setHours(9, 0, 0, 0)
    const result: Slot[] = []
    while (base.getHours() < 18) {
      const start = new Date(base), end = new Date(base)
      end.setMinutes(base.getMinutes() + 30)
      if (end.getHours() <= 18) result.push({ start: start.toISOString(), end: end.toISOString() })
      base.setMinutes(base.getMinutes() + 30)
    }
    setSlots(result); setLoadingSlots(false); setStep('slot')
  }

  async function submit() {
    if (!selectedSlot || !selectedType || !name || !email || !meetingType) {
      setError('Veuillez remplir tous les champs et choisir un format'); return
    }
    setSubmitting(true); setError(null)
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
          prospect_name: name, prospect_email: email, prospect_phone: phone || null,
          start_at: selectedSlot.start, end_at: selectedSlot.end,
          source: 'prospect', formation_type: selectedType.formation,
          meeting_type: meetingType, notes: trackingNote || null,
        }),
      })
      if (res.ok) setStep('success')
      else { const d = await res.json(); setError(d.error || 'Erreur') }
    } finally { setSubmitting(false) }
  }

  function reset() {
    setStep('dashboard'); setSelectedType(null); setSelectedDate(null)
    setSelectedSlot(null); setMeetingType(null); setName(''); setEmail(''); setPhone('')
  }

  const stepIndex = { dashboard: 0, date: 1, slot: 2, form: 3, success: 4 }[step]

  return (
    <div style={{ minHeight: '100vh', background: LIGHT, color: NAVY, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2ecf5', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 4px rgba(29,47,75,0.07)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 26 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {utmCampaign && (
            <span style={{ background: `${BLUE}15`, border: `1px solid ${BLUE}30`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: BLUE, fontWeight: 600 }}>
              📊 {utmCampaign}
            </span>
          )}
          <div style={{ fontSize: 12, color: '#8ca0b8' }}>Prise de rendez-vous</div>
        </div>
      </div>

      {/* ── Succès ── */}
      {step === 'success' && selectedType && selectedSlot && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 57px)', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '56px 48px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(29,47,75,0.1)' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${BLUE}15`, border: `2px solid ${BLUE}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 32 }}>
              {selectedType.icon}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Demande envoyée !</div>
            <div style={{ fontSize: 14, color: '#6b82a0', lineHeight: 1.7, marginBottom: 28 }}>
              Votre demande de <strong style={{ color: NAVY }}>{selectedType.title}</strong> a bien été reçue.<br />
              Un conseiller vous contactera pour confirmer le créneau.
            </div>
            <div style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}30`, borderRadius: 14, padding: '16px 20px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 14, color: NAVY, fontWeight: 600 }}>
                📅 {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
              </div>
              {meetingType && (
                <div style={{ fontSize: 13, color: '#6b82a0' }}>
                  {meetingType === 'visio'      && '📹 Visioconférence — lien envoyé par e-mail'}
                  {meetingType === 'telephone'  && '📞 Téléphone — nous vous rappellerons'}
                  {meetingType === 'presentiel' && '🏫 Présentiel — dans nos locaux'}
                </div>
              )}
            </div>
            <button onClick={reset} style={{ marginTop: 20, background: 'transparent', border: `1px solid #d8e3ef`, borderRadius: 10, padding: '9px 20px', color: '#6b82a0', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Retour à l&apos;accueil
            </button>
          </div>
        </div>
      )}

      {/* ── Dashboard ── */}
      {step === 'dashboard' && (
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '52px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-block', background: `${BLUE}15`, border: `1px solid ${BLUE}30`, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
              Prise de rendez-vous
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, color: NAVY, lineHeight: 1.2, marginBottom: 14 }}>
              Comment pouvons-nous<br />vous accompagner ?
            </div>
            <div style={{ fontSize: 15, color: '#6b82a0', maxWidth: 460, margin: '0 auto' }}>
              Choisissez le type d&apos;entretien qui correspond à votre situation.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
            {RDV_TYPES.map(type => (
              <div
                key={type.key}
                onClick={() => pickType(type)}
                style={{ background: '#fff', border: '1.5px solid #e2ecf5', borderRadius: 18, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(29,47,75,0.06)' }}
                onMouseEnter={e => { e.currentTarget.style.border = `1.5px solid ${BLUE}60`; e.currentTarget.style.boxShadow = `0 8px 28px rgba(76,171,219,0.15)`; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.border = '1.5px solid #e2ecf5'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(29,47,75,0.06)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {/* Bande colorée en haut */}
                <div style={{ height: 4, background: `linear-gradient(90deg, ${BLUE}, ${NAVY})` }} />

                <div style={{ padding: '22px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: `${BLUE}12`, border: `1px solid ${BLUE}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {type.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, lineHeight: 1.3 }}>{type.title}</div>
                      <div style={{ fontSize: 12, color: BLUE, fontWeight: 600, marginTop: 3 }}>{type.subtitle}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: '#6b82a0', lineHeight: 1.7, flex: 1 }}>{type.description}</div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4, borderTop: '1px solid #f0f5fa' }}>
                    <div style={{ fontSize: 11, color: '#8ca0b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> 30 min · Gratuit
                    </div>
                    <div style={{ fontSize: 11, color: '#8ca0b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} /> Visio, téléphone ou présentiel
                    </div>
                  </div>

                  <button
                    onClick={e => { e.stopPropagation(); pickType(type) }}
                    style={{ background: NAVY, border: 'none', borderRadius: 10, padding: '11px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = BLUE}
                    onMouseLeave={e => e.currentTarget.style.background = NAVY}
                  >
                    {type.btnLabel} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 40, fontSize: 12, color: '#b0bfcc' }}>
            🔒 Vos données sont protégées conformément au RGPD · Diploma Santé
          </div>
        </div>
      )}

      {/* ── Wizard ── */}
      {step !== 'dashboard' && step !== 'success' && selectedType && (
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 22, alignItems: 'start' }}>

          {/* ── Sidebar ── */}
          <div style={{ background: '#fff', border: '1.5px solid #e2ecf5', borderRadius: 18, overflow: 'hidden', position: 'sticky', top: 76, boxShadow: '0 2px 8px rgba(29,47,75,0.06)' }}>
            <div style={{ height: 4, background: `linear-gradient(90deg, ${BLUE}, ${NAVY})` }} />
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{selectedType.icon}</div>
              <div style={{ display: 'inline-block', background: `${BLUE}12`, border: `1px solid ${BLUE}25`, borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700, color: BLUE, marginBottom: 10 }}>
                {selectedType.tag}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 4 }}>{selectedType.title}</div>
              <div style={{ fontSize: 12, color: '#6b82a0', marginBottom: 14, lineHeight: 1.5 }}>{selectedType.subtitle}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #f0f5fa', paddingTop: 14 }}>
                <div style={{ fontSize: 12, color: '#8ca0b8', display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={12} style={{ color: BLUE, flexShrink: 0 }} /> 30 minutes · Gratuit</div>
                <div style={{ fontSize: 12, color: '#8ca0b8', display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={12} style={{ color: BLUE, flexShrink: 0 }} /> Visio, téléphone ou présentiel</div>
              </div>
              {selectedDate && selectedSlot && (
                <div style={{ marginTop: 14, background: `${BLUE}10`, border: `1px solid ${BLUE}30`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: BLUE, fontWeight: 700, marginBottom: 3 }}>Votre créneau</div>
                  <div style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>{format(new Date(selectedSlot.start), 'EEE d MMM · HH:mm', { locale: fr })}</div>
                </div>
              )}
              <button onClick={() => setStep('dashboard')} style={{ marginTop: 14, background: 'transparent', border: 'none', cursor: 'pointer', color: '#8ca0b8', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                ← Changer de type de RDV
              </button>
            </div>
          </div>

          {/* ── Zone principale ── */}
          <div style={{ background: '#fff', border: '1.5px solid #e2ecf5', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 8px rgba(29,47,75,0.06)' }}>
            {/* Progress */}
            <div style={{ padding: '18px 28px', borderBottom: '1px solid #f0f5fa' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {[{ n: 1, label: 'Date' }, { n: 2, label: 'Créneau' }, { n: 3, label: 'Coordonnées' }].map(({ n, label }, i) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: stepIndex > n ? BLUE : stepIndex === n ? NAVY : '#e8f0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: stepIndex >= n ? '#fff' : '#8ca0b8', transition: 'all 0.3s' }}>
                        {stepIndex > n ? '✓' : n}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: stepIndex >= n ? NAVY : '#8ca0b8', whiteSpace: 'nowrap' }}>{label}</div>
                    </div>
                    {i < 2 && <div style={{ flex: 1, height: 2, background: stepIndex > n ? BLUE : '#e8f0f8', margin: '0 8px', marginBottom: 18, borderRadius: 2, transition: 'background 0.3s' }} />}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '28px' }}>

              {/* ── Date ── */}
              {step === 'date' && (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Choisissez une date</div>
                  <div style={{ fontSize: 13, color: '#6b82a0', marginBottom: 24 }}>Sélectionnez un jour de la semaine ci-dessous.</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>
                      {format(days[0], 'MMMM yyyy', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[{ dir: -1, dis: weekOffset === 0 }, { dir: 1, dis: false }].map(({ dir, dis }, i) => (
                        <button key={i} onClick={() => !dis && setWeekOffset(o => o + dir)} disabled={dis} style={{ background: '#f4f7fb', border: '1.5px solid #e2ecf5', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: dis ? 'not-allowed' : 'pointer', color: '#8ca0b8', opacity: dis ? 0.4 : 1 }}>
                          {dir < 0 ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                    {days.map(day => {
                      const sel = selectedDate ? day.toDateString() === selectedDate.toDateString() : false
                      return (
                        <button key={day.toISOString()} onClick={() => loadSlots(day)} style={{ background: sel ? NAVY : '#f4f7fb', border: `1.5px solid ${sel ? NAVY : '#e2ecf5'}`, borderRadius: 14, padding: '16px 8px', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', transition: 'all 0.15s' }}
                          onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.background = `${BLUE}10` } }}
                          onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = '#e2ecf5'; e.currentTarget.style.background = '#f4f7fb' } }}
                        >
                          <div style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: sel ? 'rgba(255,255,255,0.7)' : '#8ca0b8', letterSpacing: '0.08em' }}>{format(day, 'EEE', { locale: fr })}</div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: sel ? '#fff' : NAVY, marginTop: 4, lineHeight: 1 }}>{format(day, 'd')}</div>
                          <div style={{ fontSize: 10, color: sel ? 'rgba(255,255,255,0.6)' : '#8ca0b8', marginTop: 3 }}>{format(day, 'MMM', { locale: fr })}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Créneau ── */}
              {step === 'slot' && selectedDate && (
                <div>
                  <button onClick={() => setStep('date')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8ca0b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontFamily: 'inherit', padding: 0 }}>
                    <ChevronLeft size={13} /> Retour
                  </button>
                  <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Choisissez un créneau</div>
                  <div style={{ fontSize: 13, color: BLUE, fontWeight: 600, marginBottom: 24 }}>
                    {format(selectedDate, 'EEEE d MMMM', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                  </div>
                  {loadingSlots ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#8ca0b8' }}>Chargement…</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {slots.map(slot => {
                        const sel = selectedSlot?.start === slot.start
                        return (
                          <button key={slot.start} onClick={() => { setSelectedSlot(slot); setStep('form') }} style={{ background: sel ? NAVY : '#f4f7fb', border: `1.5px solid ${sel ? NAVY : '#e2ecf5'}`, borderRadius: 10, padding: '11px 6px', cursor: 'pointer', color: sel ? '#fff' : NAVY, fontSize: 14, fontWeight: sel ? 700 : 500, transition: 'all 0.15s', fontFamily: 'inherit', textAlign: 'center' }}
                            onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.color = BLUE } }}
                            onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = '#e2ecf5'; e.currentTarget.style.color = NAVY } }}
                          >
                            {format(new Date(slot.start), 'HH:mm')}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Formulaire ── */}
              {step === 'form' && selectedSlot && (
                <div>
                  <button onClick={() => setStep('slot')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8ca0b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontFamily: 'inherit', padding: 0 }}>
                    <ChevronLeft size={13} /> Retour
                  </button>
                  <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Vos coordonnées</div>
                  <div style={{ background: `${BLUE}10`, border: `1.5px solid ${BLUE}30`, borderRadius: 10, padding: '10px 14px', marginBottom: 24, fontSize: 13, color: BLUE, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={13} />
                    {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })} – {format(new Date(selectedSlot.end), 'HH:mm')}
                  </div>

                  {/* Format de réunion */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#8ca0b8', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Format du rendez-vous *</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {MEETING_OPTIONS.map(m => {
                        const sel = meetingType === m.key
                        return (
                          <button key={m.key} onClick={() => setMeetingType(m.key)} style={{ background: sel ? NAVY : '#f4f7fb', border: `1.5px solid ${sel ? NAVY : '#e2ecf5'}`, borderRadius: 12, padding: '14px 10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all 0.15s' }}
                            onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = BLUE } }}
                            onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = '#e2ecf5' } }}
                          >
                            <m.Icon size={20} style={{ color: sel ? '#fff' : BLUE, marginBottom: 6 }} />
                            <div style={{ fontSize: 12, fontWeight: 700, color: sel ? '#fff' : NAVY }}>{m.label}</div>
                            <div style={{ fontSize: 10, color: sel ? 'rgba(255,255,255,0.65)' : '#8ca0b8', marginTop: 2 }}>{m.desc}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Champs */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { label: 'Nom complet *',    key: 'name',  type: 'text',  val: name,  set: setName,  ph: 'Marie Dupont' },
                      { label: 'Adresse e-mail *', key: 'email', type: 'email', val: email, set: setEmail, ph: 'marie@exemple.com' },
                      { label: 'Téléphone',        key: 'phone', type: 'tel',   val: phone, set: setPhone, ph: '06 00 00 00 00' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b82a0', marginBottom: 6, display: 'block' }}>{f.label}</label>
                        <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={inputStyle}
                          onFocus={e => e.currentTarget.style.borderColor = BLUE}
                          onBlur={e => e.currentTarget.style.borderColor = '#d8e3ef'}
                        />
                      </div>
                    ))}

                    {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>{error}</div>}

                    <button
                      onClick={submit}
                      disabled={submitting || !name || !email || !meetingType}
                      style={{
                        background: (!name || !email || !meetingType) ? '#e8f0f8' : GOLD,
                        color: (!name || !email || !meetingType) ? '#8ca0b8' : '#fff',
                        border: 'none', borderRadius: 12, padding: '14px',
                        fontSize: 15, fontWeight: 700,
                        cursor: (!name || !email || !meetingType || submitting) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s', fontFamily: 'inherit', width: '100%', marginTop: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: (!name || !email || !meetingType) ? 'none' : '0 4px 14px rgba(204,172,113,0.35)',
                      }}
                    >
                      <CheckCircle size={16} />
                      {submitting ? 'Envoi en cours…' : 'Confirmer ma demande de RDV'}
                    </button>

                    <div style={{ textAlign: 'center', fontSize: 11, color: '#b0bfcc', lineHeight: 1.6 }}>
                      En soumettant ce formulaire, vous acceptez d&apos;être recontacté par Diploma Santé.<br />
                      Données protégées conformément au RGPD.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step !== 'success' && step !== 'dashboard' && (
        <div style={{ textAlign: 'center', padding: '0 0 32px', fontSize: 12, color: '#b0bfcc' }}>
          © Diploma Santé — Tous droits réservés
        </div>
      )}
      {step === 'dashboard' && (
        <div style={{ textAlign: 'center', paddingBottom: 32, fontSize: 12, color: '#b0bfcc' }}>
          © Diploma Santé — Tous droits réservés
        </div>
      )}
    </div>
  )
}
