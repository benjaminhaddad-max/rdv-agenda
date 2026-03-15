'use client'

import { useState, useEffect } from 'react'
import { format, addDays, startOfToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Clock, ChevronLeft, ChevronRight, CheckCircle, MapPin, Video, Phone, Building2 } from 'lucide-react'

// ─── Brand ────────────────────────────────────────────────────────────────────
const NAVY  = '#1d2f4b'
const BLUE  = '#4cabdb'
const GOLD  = '#ccac71'

// ─── Type DB → local ──────────────────────────────────────────────────────────
type RdvTypeDB = {
  id: number
  key: string
  title: string
  subtitle: string
  description: string
  icon: string
  btn_label: string
  formation: string
  tag: string
  active: boolean
}

type RdvType = {
  key: string
  title: string
  subtitle: string
  description: string
  icon: string
  btnLabel: string
  formation: string
  tag: string
}

function dbToLocal(t: RdvTypeDB): RdvType {
  return { key: t.key, title: t.title, subtitle: t.subtitle, description: t.description, icon: t.icon, btnLabel: t.btn_label, formation: t.formation, tag: t.tag }
}

// Fallback si l'API est indisponible
const FALLBACK_TYPES: RdvType[] = [
  { key: 'parcoursup', title: 'Accompagnement Parcoursup', subtitle: "Optimisez votre dossier d'admission", description: "Un expert vous guide pas-à-pas dans la construction de vos vœux Parcoursup pour maximiser vos chances d'admission.", icon: '🎓', btnLabel: 'Parler à un Expert Parcoursup', formation: 'Accompagnement Parcoursup', tag: 'Parcoursup' },
  { key: 'medecine', title: 'Coaching Orientation Médecine', subtitle: 'Spécial PASS / L.AS / 3ème année', description: 'Vous êtes en reconversion depuis la médecine ? Découvrez les filières paramédicales adaptées à votre profil.', icon: '🩺', btnLabel: 'Étudiant en 3ème année de médecine', formation: 'Coaching Orientation Médecine', tag: 'Médecine' },
  { key: 'information', title: "Rendez-vous d'information", subtitle: 'Découvrez nos formations', description: "Orthophonie, kinésithérapie, sage-femme… Explorez nos programmes, les conditions d'accès et les débouchés.", icon: '💡', btnLabel: "Prendre un RDV d'information", formation: "Rendez-vous d'information", tag: 'Information' },
  { key: 'inscription', title: "Rendez-vous d'inscription", subtitle: 'Rejoindre Diploma Santé', description: 'Rencontrez notre responsable des admissions pour finaliser votre dossier et intégrer une de nos formations.', icon: '✍️', btnLabel: 'Responsable des admissions', formation: "Rendez-vous d'inscription", tag: 'Inscription' },
]
type Step = 'dashboard' | 'date' | 'slot' | 'form' | 'success'
type Slot = { start: string; end: string }
type MeetingType = 'visio' | 'telephone' | 'presentiel'

const MEETING_OPTIONS: { key: MeetingType; label: string; desc: string; Icon: typeof Video }[] = [
  { key: 'visio',      label: 'Visioconférence', desc: 'Lien par e-mail',    Icon: Video },
  { key: 'telephone',  label: 'Téléphone',       desc: 'On vous rappelle',   Icon: Phone },
  { key: 'presentiel', label: 'Présentiel',      desc: 'Dans nos locaux',    Icon: Building2 },
]

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
  const [rdvTypes, setRdvTypes] = useState<RdvType[]>(FALLBACK_TYPES)

  useEffect(() => {
    fetch('/api/rdv-types')
      .then(r => r.json())
      .then((data: RdvTypeDB[]) => {
        if (Array.isArray(data) && data.length > 0) setRdvTypes(data.map(dbToLocal))
      })
      .catch(() => { /* fallback déjà en place */ })
  }, [])

  const preselected = rdvTypes.find(t => t.key === defaultType) ?? null

  const [step, setStep]                 = useState<Step>(preselected ? 'date' : 'dashboard')
  const [selectedType, setSelectedType] = useState<RdvType | null>(preselected)
  const [weekOffset, setWeekOffset]     = useState(0)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots]               = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [meetingType, setMeetingType]   = useState<MeetingType | null>(null)
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [phone, setPhone]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const today = startOfToday()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1 + weekOffset * 5))
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
    <div style={{ fontFamily: "'Inter', 'Open Sans', system-ui, -apple-system, sans-serif", color: NAVY, background: '#f0f4f9', minHeight: '100vh' }}>

      {/* ── Header navy ── */}
      <div style={{
        background: NAVY,
        padding: '0 28px',
        height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 22 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {utmCampaign && (
            <span style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}40`, borderRadius: 5, padding: '2px 8px', fontSize: 11, color: GOLD, fontWeight: 600 }}>
              {utmCampaign}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>Prise de rendez-vous</span>
        </div>
      </div>

      {/* ── Hero band ── */}
      {step === 'dashboard' && (
        <div style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #0d1e34 100%)`,
          padding: '32px 28px 28px',
          textAlign: 'center',
          borderBottom: `3px solid ${GOLD}`,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: `${GOLD}18`, border: `1px solid ${GOLD}40`,
            borderRadius: 20, padding: '4px 14px',
            fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: 14,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
            Entretien gratuit · 30 min
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1.25, marginBottom: 10 }}>
            Comment pouvons-nous<br />vous accompagner ?
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', maxWidth: 400, margin: '0 auto' }}>
            Choisissez le type d&apos;entretien qui correspond à votre situation.
          </div>
        </div>
      )}

      {/* ── Breadcrumb wizard ── */}
      {step !== 'dashboard' && step !== 'success' && (
        <div style={{
          background: NAVY,
          borderBottom: `2px solid ${GOLD}`,
          padding: '10px 28px',
          display: 'flex', alignItems: 'center', gap: 0,
        }}>
          {/* Retour dashboard */}
          <button
            onClick={reset}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px 0 0', marginRight: 14, borderRight: '1px solid rgba(255,255,255,0.12)' }}
          >
            ← Retour
          </button>
          {/* Type sélectionné */}
          <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>
            {selectedType?.icon} {selectedType?.title}
          </span>
          {/* Steps */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {[{ n: 1, label: 'Date' }, { n: 2, label: 'Créneau' }, { n: 3, label: 'Coordonnées' }].map(({ n, label }, i) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: stepIndex > n ? GOLD : stepIndex === n ? '#fff' : 'rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800,
                  color: stepIndex > n ? NAVY : stepIndex === n ? NAVY : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.25s',
                }}>
                  {stepIndex > n ? '✓' : n}
                </div>
                <span style={{ fontSize: 11, color: stepIndex >= n ? '#fff' : 'rgba(255,255,255,0.35)', fontWeight: stepIndex === n ? 700 : 400 }}>{label}</span>
                {i < 2 && <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Success ── */}
      {step === 'success' && selectedType && selectedSlot && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px 40px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 32px rgba(29,47,75,0.1)', border: '1px solid #e6edf5' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${GOLD}18`, border: `2px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>
              {selectedType.icon}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: NAVY, marginBottom: 8 }}>Demande envoyée !</div>
            <div style={{ fontSize: 13, color: '#6b82a0', lineHeight: 1.7, marginBottom: 24 }}>
              Votre demande de <strong style={{ color: NAVY }}>{selectedType.title}</strong> a bien été reçue.<br />
              Un conseiller vous contactera pour confirmer le créneau.
            </div>
            <div style={{ background: '#f6f9fc', border: '1px solid #e2ecf5', borderRadius: 12, padding: '14px 18px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 13, color: NAVY, fontWeight: 700 }}>
                📅 {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })}
              </div>
              {meetingType && (
                <div style={{ fontSize: 12, color: '#6b82a0' }}>
                  {meetingType === 'visio'      && '📹 Visioconférence — lien envoyé par e-mail'}
                  {meetingType === 'telephone'  && '📞 Téléphone — nous vous rappellerons'}
                  {meetingType === 'presentiel' && '🏫 Présentiel — dans nos locaux'}
                </div>
              )}
            </div>
            <button onClick={reset} style={{ marginTop: 18, background: NAVY, border: 'none', borderRadius: 10, padding: '10px 22px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Nouvelle demande
            </button>
          </div>
        </div>
      )}

      {/* ── Dashboard — 4 cartes ── */}
      {step === 'dashboard' && (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {rdvTypes.map(type => (
              <div
                key={type.key}
                onClick={() => pickType(type)}
                style={{
                  background: '#fff',
                  border: '1.5px solid #e2ecf5',
                  borderRadius: 16,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                  display: 'flex', flexDirection: 'column',
                  boxShadow: '0 2px 10px rgba(29,47,75,0.06)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = GOLD
                  e.currentTarget.style.boxShadow = `0 6px 24px rgba(204,172,113,0.18)`
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#e2ecf5'
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(29,47,75,0.06)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {/* Bande top navy */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, ${NAVY})` }} />

                <div style={{ padding: '18px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Icon + titre */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10,
                      background: '#f0f4f9', border: '1px solid #e2ecf5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, flexShrink: 0,
                    }}>
                      {type.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, lineHeight: 1.3 }}>{type.title}</div>
                      <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginTop: 2 }}>{type.subtitle}</div>
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: 12, color: '#6b82a0', lineHeight: 1.7, flex: 1 }}>{type.description}</div>

                  {/* Meta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 10, borderTop: '1px solid #f0f5fa' }}>
                    <div style={{ fontSize: 11, color: '#9aafc4', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} style={{ color: BLUE }} /> 30 min · Gratuit
                    </div>
                    <div style={{ fontSize: 11, color: '#9aafc4', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={10} style={{ color: BLUE }} /> Visio, tél. ou présentiel
                    </div>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={e => { e.stopPropagation(); pickType(type) }}
                    style={{
                      background: NAVY,
                      border: 'none', borderRadius: 9,
                      padding: '10px 16px',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'background 0.15s',
                      letterSpacing: '0.01em',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#0d1e34'}
                    onMouseLeave={e => e.currentTarget.style.background = NAVY}
                  >
                    {type.btnLabel} →
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#b0bfcc' }}>
            🔒 Données protégées conformément au RGPD · Diploma Santé
          </div>
        </div>
      )}

      {/* ── Wizard ── */}
      {step !== 'dashboard' && step !== 'success' && selectedType && (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 24px 32px', display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── Sidebar ── */}
          <div style={{ background: NAVY, borderRadius: 14, overflow: 'hidden', position: 'sticky', top: 0, border: `1px solid rgba(255,255,255,0.07)` }}>
            <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, ${BLUE})` }} />
            <div style={{ padding: '18px 16px' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{selectedType.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{selectedType.tag}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>{selectedType.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.5 }}>{selectedType.subtitle}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={11} style={{ color: BLUE, flexShrink: 0 }} /> 30 minutes · Gratuit
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={11} style={{ color: BLUE, flexShrink: 0 }} /> Visio, tél. ou présentiel
                </div>
              </div>
              {selectedDate && selectedSlot && (
                <div style={{ marginTop: 12, background: `${GOLD}15`, border: `1px solid ${GOLD}30`, borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Votre créneau</div>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{format(new Date(selectedSlot.start), 'EEE d MMM · HH:mm', { locale: fr })}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Zone principale ── */}
          <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(29,47,75,0.07)', border: '1px solid #e2ecf5' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f5fa' }}>

              {/* ── Date ── */}
              {step === 'date' && (
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 2 }}>Choisissez une date</div>
                  <div style={{ fontSize: 12, color: '#9aafc4', marginBottom: 20 }}>Sélectionnez un jour de la semaine ci-dessous.</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>
                      {format(days[0], 'MMMM yyyy', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[{ dir: -1, dis: weekOffset === 0 }, { dir: 1, dis: false }].map(({ dir, dis }, i) => (
                        <button key={i} onClick={() => !dis && setWeekOffset(o => o + dir)} disabled={dis}
                          style={{ background: '#f4f7fb', border: '1.5px solid #e2ecf5', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: dis ? 'not-allowed' : 'pointer', color: '#8ca0b8', opacity: dis ? 0.4 : 1 }}>
                          {dir < 0 ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                    {days.map(day => {
                      const sel = selectedDate ? day.toDateString() === selectedDate.toDateString() : false
                      return (
                        <button key={day.toISOString()} onClick={() => loadSlots(day)}
                          style={{ background: sel ? NAVY : '#f6f9fc', border: `1.5px solid ${sel ? NAVY : '#e2ecf5'}`, borderRadius: 12, padding: '14px 6px', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', transition: 'all 0.15s' }}
                          onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.background = `${GOLD}0a` } }}
                          onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = '#e2ecf5'; e.currentTarget.style.background = '#f6f9fc' } }}
                        >
                          <div style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 700, color: sel ? 'rgba(255,255,255,0.6)' : '#9aafc4', letterSpacing: '0.08em' }}>{format(day, 'EEE', { locale: fr })}</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: sel ? '#fff' : NAVY, marginTop: 4, lineHeight: 1 }}>{format(day, 'd')}</div>
                          <div style={{ fontSize: 9, color: sel ? 'rgba(255,255,255,0.55)' : '#9aafc4', marginTop: 3 }}>{format(day, 'MMM', { locale: fr })}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Créneau ── */}
              {step === 'slot' && selectedDate && (
                <div>
                  <button onClick={() => setStep('date')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9aafc4', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, fontFamily: 'inherit', padding: 0 }}>
                    <ChevronLeft size={12} /> Retour
                  </button>
                  <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 2 }}>Choisissez un créneau</div>
                  <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 20 }}>
                    {format(selectedDate, 'EEEE d MMMM', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                  </div>
                  {loadingSlots ? (
                    <div style={{ textAlign: 'center', padding: '28px 0', color: '#9aafc4', fontSize: 13 }}>Chargement…</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                      {slots.map(slot => {
                        const sel = selectedSlot?.start === slot.start
                        return (
                          <button key={slot.start} onClick={() => { setSelectedSlot(slot); setStep('form') }}
                            style={{ background: sel ? NAVY : '#f6f9fc', border: `1.5px solid ${sel ? NAVY : '#e2ecf5'}`, borderRadius: 9, padding: '10px 4px', cursor: 'pointer', color: sel ? '#fff' : NAVY, fontSize: 13, fontWeight: sel ? 700 : 500, transition: 'all 0.15s', fontFamily: 'inherit', textAlign: 'center' }}
                            onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD } }}
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
                  <button onClick={() => setStep('slot')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9aafc4', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, fontFamily: 'inherit', padding: 0 }}>
                    <ChevronLeft size={12} /> Retour
                  </button>
                  <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Vos coordonnées</div>

                  {/* Récap créneau */}
                  <div style={{ background: '#f6f9fc', border: '1px solid #e2ecf5', borderRadius: 9, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: NAVY, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Clock size={12} style={{ color: GOLD, flexShrink: 0 }} />
                    {format(new Date(selectedSlot.start), 'EEEE d MMMM à HH:mm', { locale: fr })} – {format(new Date(selectedSlot.end), 'HH:mm')}
                  </div>

                  {/* Format */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9aafc4', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Format du rendez-vous *</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {MEETING_OPTIONS.map(m => {
                        const sel = meetingType === m.key
                        return (
                          <button key={m.key} onClick={() => setMeetingType(m.key)}
                            style={{ background: sel ? NAVY : '#f6f9fc', border: `1.5px solid ${sel ? GOLD : '#e2ecf5'}`, borderRadius: 10, padding: '13px 8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all 0.15s' }}
                            onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = GOLD }}
                            onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#e2ecf5' }}
                          >
                            <m.Icon size={18} style={{ color: sel ? GOLD : BLUE, marginBottom: 5 }} />
                            <div style={{ fontSize: 11, fontWeight: 700, color: sel ? '#fff' : NAVY }}>{m.label}</div>
                            <div style={{ fontSize: 10, color: sel ? 'rgba(255,255,255,0.5)' : '#9aafc4', marginTop: 2 }}>{m.desc}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Champs */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Nom complet *',    key: 'name',  type: 'text',  val: name,  set: setName,  ph: 'Marie Dupont' },
                      { label: 'Adresse e-mail *', key: 'email', type: 'email', val: email, set: setEmail, ph: 'marie@exemple.com' },
                      { label: 'Téléphone',        key: 'phone', type: 'tel',   val: phone, set: setPhone, ph: '06 00 00 00 00' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b82a0', marginBottom: 5, display: 'block' }}>{f.label}</label>
                        <input
                          type={f.type} value={f.val}
                          onChange={e => f.set(e.target.value)}
                          placeholder={f.ph}
                          style={{ width: '100%', background: '#f6f9fc', border: '1.5px solid #e2ecf5', borderRadius: 9, padding: '10px 13px', color: NAVY, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.2s' }}
                          onFocus={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.background = '#fff' }}
                          onBlur={e => { e.currentTarget.style.borderColor = '#e2ecf5'; e.currentTarget.style.background = '#f6f9fc' }}
                        />
                      </div>
                    ))}

                    {error && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 9, padding: '9px 13px', color: '#dc2626', fontSize: 12 }}>
                        {error}
                      </div>
                    )}

                    <button
                      onClick={submit}
                      disabled={submitting || !name || !email || !meetingType}
                      style={{
                        background: (!name || !email || !meetingType) ? '#e8f0f8' : GOLD,
                        color: (!name || !email || !meetingType) ? '#9aafc4' : NAVY,
                        border: 'none', borderRadius: 10, padding: '13px',
                        fontSize: 14, fontWeight: 800,
                        cursor: (!name || !email || !meetingType || submitting) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s', fontFamily: 'inherit', width: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: (!name || !email || !meetingType) ? 'none' : '0 4px 16px rgba(204,172,113,0.3)',
                        letterSpacing: '0.01em',
                      }}
                    >
                      <CheckCircle size={15} />
                      {submitting ? 'Envoi en cours…' : 'Confirmer ma demande de RDV'}
                    </button>

                    <div style={{ textAlign: 'center', fontSize: 10, color: '#b0bfcc', lineHeight: 1.6 }}>
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

      {/* ── Footer ── */}
      {step === 'dashboard' && (
        <div style={{ textAlign: 'center', paddingBottom: 24, fontSize: 11, color: '#b0bfcc' }}>
          © Diploma Santé — Tous droits réservés
        </div>
      )}
    </div>
  )
}
