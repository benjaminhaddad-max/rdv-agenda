'use client'

/**
 * BookingDiploma — Parcours de prise de RDV type Calendly.
 *
 * Utilisé par :
 *   - /book/diploma   (page autonome, lien envoyé par les télépros)
 *   - /embed/rdv      (iframe ouverte en popup par /api/booking/widget.js)
 *
 * IMPORTANT : composant 100% isolé. Ne partage rien avec le système de
 * formulaires (/api/forms/[slug]/embed.js) pour ne jamais les impacter.
 */

import { useMemo, useState } from 'react'
import {
  format, addMonths, startOfMonth, startOfToday, addDays,
  isSameDay, isSameMonth, getDay,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Clock, Globe2, ChevronLeft, ChevronRight, ArrowLeft, CalendarDays, CheckCircle2, MapPin,
} from 'lucide-react'

// ─── Réglages faciles à modifier ──────────────────────────────────────────────
const EVENT_TITLE = "Rendez-vous d'information - Diploma Santé"
const EVENT_ORG = 'Admissions Diploma Santé'
const EVENT_DURATION_MIN = 30
const EVENT_DESCRIPTION =
  'Nous sommes ravis de pouvoir échanger avec vous sur votre parcours et nos préparations. ' +
  'Merci de vous munir de vos bulletins de première et terminale !'
const ADRESSE_PRESENTIEL = '100 quai de la Rapée 75012 Paris'
const SLOT_START_HOUR = 9
const SLOT_END_HOUR = 22

const CLASSE_OPTIONS = [
  'Seconde',
  'Première',
  'Terminale',
  'Bac+1 / Réorientation',
  'Étudiant en médecine (PASS / L.AS)',
  'Parent d\u2019élève',
  'Autre',
]

const FORMATION_OPTIONS = [
  'Prépa Médecine (PASS / L.AS)',
  'Terminale Santé',
  'Première Santé',
  'Stage de pré-rentrée',
  'Accompagnement Parcoursup',
  'Je ne sais pas encore',
]

// ─── Couleurs (look Calendly) ─────────────────────────────────────────────────
const BLUE = '#0069ff'
const BLUE_LIGHT = '#e8f1fd'
const NAVY = '#1d2f4b'
const GREY = '#6b7a8f'
const BORDER = '#e2e8f0'

type Step = 'date' | 'form' | 'success'
type Slot = { start: string; end: string }
type Lieu = 'presentiel' | 'visio'

export type BookingUtm = {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  ref?: string | null
}

// Petit logo Google Meet (inline, sans dépendance)
function MeetIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.5 72" aria-hidden="true">
      <path fill="#00832d" d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02-2-16.64-11.69 6.44z" />
      <path fill="#0066da" d="M0 51.5V66c0 3.315 2.685 6 6 6h14.5l3-10.96-3-9.54-9.95-3z" />
      <path fill="#e94235" d="M20.5 0L0 20.5l10.55 3 9.95-3 2.95-9.41z" />
      <path fill="#2684fc" d="M20.5 20.5H0v31h20.5z" />
      <path fill="#00ac47" d="M82.6 8.68L69.5 19.42v33.66l13.16 10.79c1.97 1.54 4.85.135 4.85-2.37V11c0-2.535-2.945-3.925-4.91-2.32zM49.5 36v15.5h-29V72h43c3.315 0 6-2.685 6-6V53.08z" />
      <path fill="#ffba00" d="M63.5 0h-43v20.5h29V36l20-16.57V6c0-3.315-2.685-6-6-6z" />
    </svg>
  )
}

export default function BookingDiploma({
  utm,
  embedded = false,
}: {
  utm?: BookingUtm
  embedded?: boolean
}) {
  const today = startOfToday()
  const firstAvailable = addDays(today, 1) // réservation à partir de demain

  const [step, setStep] = useState<Step>('date')
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  // Formulaire
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [lieu, setLieu] = useState<Lieu | null>(null)
  const [phone, setPhone] = useState('')
  const [departement, setDepartement] = useState('')
  const [classe, setClasse] = useState('')
  const [formation, setFormation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Calendrier ──────────────────────────────────────────────────────────────
  const weeks = useMemo(() => {
    const first = startOfMonth(monthCursor)
    // getDay: 0=dim … on veut lundi=0
    const offset = (getDay(first) + 6) % 7
    const cells: (Date | null)[] = Array.from({ length: offset }, () => null)
    let d = first
    while (isSameMonth(d, first)) {
      cells.push(d)
      d = addDays(d, 1)
    }
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [monthCursor])

  const canGoPrev = monthCursor > startOfMonth(today)

  function isAvailable(day: Date) {
    return day >= firstAvailable
  }

  function buildSlots(day: Date): Slot[] {
    const result: Slot[] = []
    const cursor = new Date(day)
    cursor.setHours(SLOT_START_HOUR, 0, 0, 0)
    const limit = new Date(day)
    limit.setHours(SLOT_END_HOUR, 0, 0, 0)
    while (cursor < limit) {
      const end = new Date(cursor)
      end.setMinutes(end.getMinutes() + EVENT_DURATION_MIN)
      if (end > limit) break
      result.push({ start: cursor.toISOString(), end: end.toISOString() })
      cursor.setMinutes(cursor.getMinutes() + EVENT_DURATION_MIN)
    }
    return result
  }

  const slots = useMemo(() => (selectedDate ? buildSlots(selectedDate) : []), [selectedDate])

  function pickDate(day: Date) {
    setSelectedDate(day)
    setPendingSlot(null)
  }

  function confirmSlot(slot: Slot) {
    setSelectedSlot(slot)
    setStep('form')
    setError(null)
  }

  // ── Soumission ──────────────────────────────────────────────────────────────
  const formValid =
    prenom.trim() && nom.trim() && email.trim() && lieu && phone.trim() &&
    /^\d{2,3}$|^2[ABab]$/.test(departement.trim()) && classe && formation

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/[^\d+]/g, '')
    if (digits.startsWith('+')) return digits
    if (digits.startsWith('0')) return '+33' + digits.slice(1)
    return '+33' + digits
  }

  async function submit() {
    if (!formValid || !selectedSlot) {
      setError('Veuillez remplir tous les champs obligatoires.')
      return
    }
    setSubmitting(true)
    setError(null)

    const utmParts = [
      utm?.utm_source && `source=${utm.utm_source}`,
      utm?.utm_medium && `medium=${utm.utm_medium}`,
      utm?.utm_campaign && `campaign=${utm.utm_campaign}`,
      utm?.utm_content && `content=${utm.utm_content}`,
      utm?.ref && `ref=${utm.ref}`,
    ].filter(Boolean)
    const trackingNote = utmParts.length > 0 ? `[Tracking: ${utmParts.join(' | ')}]` : ''
    const lieuNote = lieu === 'presentiel' ? `Lieu : ${ADRESSE_PRESENTIEL}` : 'Lieu : Google Meet'
    const notes = [lieuNote, trackingNote].filter(Boolean).join(' — ')

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          web_booking: true, // → upsert fiche CRM par email + assignation Pascal
          prospect_name: `${prenom.trim()} ${nom.trim()}`,
          prospect_firstname: prenom.trim(),
          prospect_lastname: nom.trim(),
          prospect_email: email.trim(),
          prospect_phone: normalizePhone(phone),
          start_at: selectedSlot.start,
          end_at: selectedSlot.end,
          source: 'prospect',
          formation_type: formation,
          meeting_type: lieu,
          departement: departement.trim(),
          classe_actuelle: classe,
          call_notes: notes || null,
        }),
      })
      if (res.ok) {
        setStep('success')
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Une erreur est survenue. Veuillez réessayer.')
      }
    } catch {
      setError('Erreur réseau. Veuillez réessayer.')
    } finally {
      setSubmitting(false)
    }
  }

  function closeEmbed() {
    try {
      window.parent.postMessage({ type: 'diploma-rdv-close' }, '*')
    } catch { /* standalone : ignore */ }
  }

  function resetAll() {
    setStep('date')
    setSelectedDate(null)
    setPendingSlot(null)
    setSelectedSlot(null)
    setPrenom(''); setNom(''); setEmail(''); setLieu(null)
    setPhone(''); setDepartement(''); setClasse(''); setFormation('')
    setError(null)
  }

  // ── Styles communs ──────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    border: `1px solid ${BORDER}`, borderRadius: 8,
    padding: '11px 12px', fontSize: 15, color: NAVY,
    outline: 'none', fontFamily: 'inherit', background: '#fff',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 6,
  }

  return (
    <div style={{
      fontFamily: "'Inter', 'Open Sans', system-ui, -apple-system, sans-serif",
      background: embedded ? 'transparent' : '#f6f8fa',
      minHeight: embedded ? '100vh' : '100vh',
      height: embedded ? '100vh' : undefined,
      overflowY: embedded ? 'auto' : undefined,
      WebkitOverflowScrolling: 'touch',
      display: 'flex', justifyContent: 'center',
      padding: embedded ? 0 : '24px 12px',
      color: NAVY,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: embedded ? 0 : 12,
        border: embedded ? 'none' : `1px solid ${BORDER}`,
        boxShadow: embedded ? 'none' : '0 1px 8px rgba(20,30,50,0.06)',
        width: '100%',
        maxWidth: 760,
        height: 'fit-content',
        overflow: 'hidden',
      }}>

        {/* ════════ ÉTAPE 1 : DATE + HEURE ════════ */}
        {step === 'date' && (
          <div>
            {/* En-tête événement */}
            <div style={{ padding: '28px 28px 22px', borderBottom: `1px solid ${BORDER}`, textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-diploma-2026.png" alt="Diploma Santé" style={{ height: 44, display: 'block', margin: '0 auto 14px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: GREY, marginBottom: 4 }}>{EVENT_ORG}</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 14px', lineHeight: 1.25 }}>
                {EVENT_TITLE}
              </h1>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: GREY, marginBottom: 16 }}>
                <Clock size={17} /> {EVENT_DURATION_MIN} min
              </div>
              <p style={{ fontSize: 14.5, color: '#3c4a5d', lineHeight: 1.65, maxWidth: 440, margin: '0 auto' }}>
                {EVENT_DESCRIPTION}
              </p>
            </div>

            {/* Sélecteur date / heure */}
            <div style={{ padding: '24px 28px 32px' }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: NAVY, margin: '0 0 18px', textAlign: 'center' }}>
                Sélectionnez la date et l&apos;heure
              </h2>

              <div style={{
                display: 'flex', gap: 28, justifyContent: 'center',
                flexWrap: 'wrap', alignItems: 'flex-start',
              }}>
                {/* ── Calendrier mensuel ── */}
                <div style={{ width: 340, maxWidth: '100%' }}>
                  {/* Navigation mois */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 14 }}>
                    <button
                      onClick={() => canGoPrev && setMonthCursor(m => addMonths(m, -1))}
                      disabled={!canGoPrev}
                      aria-label="Mois précédent"
                      style={{
                        background: 'none', border: 'none', cursor: canGoPrev ? 'pointer' : 'default',
                        color: canGoPrev ? BLUE : '#c3ccd6', padding: 6, display: 'flex',
                      }}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, minWidth: 110, textAlign: 'center' }}>
                      {format(monthCursor, 'MMMM yyyy', { locale: fr })}
                    </div>
                    <button
                      onClick={() => setMonthCursor(m => addMonths(m, 1))}
                      aria-label="Mois suivant"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: BLUE, padding: 6, display: 'flex' }}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>

                  {/* Jours de la semaine */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
                    {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(d => (
                      <div key={d} style={{ textAlign: 'center', fontSize: 11.5, color: GREY, fontWeight: 600, padding: '4px 0' }}>
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Grille */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 4 }}>
                    {weeks.flat().map((day, i) => {
                      if (!day) return <div key={`empty-${i}`} />
                      const avail = isAvailable(day)
                      const sel = selectedDate ? isSameDay(day, selectedDate) : false
                      const isToday = isSameDay(day, today)
                      return (
                        <div key={day.toISOString()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <button
                            onClick={() => avail && pickDate(day)}
                            disabled={!avail}
                            style={{
                              width: 40, height: 40, borderRadius: '50%',
                              border: 'none', fontFamily: 'inherit',
                              fontSize: 14.5, fontWeight: avail ? 700 : 400,
                              cursor: avail ? 'pointer' : 'default',
                              background: sel ? BLUE : avail ? BLUE_LIGHT : 'transparent',
                              color: sel ? '#fff' : avail ? BLUE : '#9aa7b5',
                              transition: 'background 0.12s',
                            }}
                          >
                            {format(day, 'd')}
                          </button>
                          {isToday && (
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: sel ? BLUE : '#9aa7b5', marginTop: 2 }} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Fuseau horaire */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 18, fontSize: 13, color: NAVY, fontWeight: 600 }}>
                    <Globe2 size={15} style={{ color: GREY }} />
                    Heure d&apos;Europe centrale
                  </div>
                </div>

                {/* ── Créneaux du jour sélectionné ── */}
                {selectedDate && (
                  <div style={{ width: 230, maxWidth: '100%' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
                      {format(selectedDate, 'EEEE d MMMM', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
                    </div>
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 9,
                      maxHeight: 380, overflowY: 'auto', paddingRight: 4,
                    }}>
                      {slots.map(slot => {
                        const isPending = pendingSlot?.start === slot.start
                        if (isPending) {
                          return (
                            <div key={slot.start} style={{ display: 'flex', gap: 7 }}>
                              <div style={{
                                flex: 1, background: '#5c6b7d', color: '#fff',
                                borderRadius: 6, padding: '12px 0', textAlign: 'center',
                                fontSize: 14.5, fontWeight: 700,
                              }}>
                                {format(new Date(slot.start), 'HH:mm')}
                              </div>
                              <button
                                onClick={() => confirmSlot(slot)}
                                style={{
                                  flex: 1, background: BLUE, color: '#fff',
                                  border: 'none', borderRadius: 6, padding: '12px 0',
                                  fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                Suivant
                              </button>
                            </div>
                          )
                        }
                        return (
                          <button
                            key={slot.start}
                            onClick={() => setPendingSlot(slot)}
                            style={{
                              background: '#fff', border: `1px solid ${BLUE}88`,
                              borderRadius: 6, padding: '12px 0',
                              color: BLUE, fontSize: 14.5, fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit',
                              transition: 'border-color 0.12s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = BLUE }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = `${BLUE}88` }}
                          >
                            {format(new Date(slot.start), 'HH:mm')}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════ ÉTAPE 2 : FORMULAIRE ════════ */}
        {step === 'form' && selectedSlot && (
          <div>
            {/* En-tête avec retour + récap */}
            <div style={{ padding: '24px 28px 22px', borderBottom: `1px solid ${BORDER}`, position: 'relative', textAlign: 'center' }}>
              <button
                onClick={() => { setStep('date'); setPendingSlot(null) }}
                aria-label="Retour"
                style={{
                  position: 'absolute', top: 22, left: 22,
                  width: 40, height: 40, borderRadius: '50%',
                  border: `1px solid ${BORDER}`, background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: BLUE,
                }}
              >
                <ArrowLeft size={19} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-diploma-2026.png" alt="Diploma Santé" style={{ height: 44, display: 'block', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: GREY, marginBottom: 4 }}>{EVENT_ORG}</div>
              <h1 style={{ fontSize: 23, fontWeight: 800, color: NAVY, margin: '0 0 14px', lineHeight: 1.25 }}>
                {EVENT_TITLE}
              </h1>
              <div style={{
                display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                gap: '8px 22px', fontSize: 13.5, fontWeight: 700, color: GREY, marginBottom: 14,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={16} /> {EVENT_DURATION_MIN} min
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CalendarDays size={16} />
                  {format(new Date(selectedSlot.start), 'HH:mm')} - {format(new Date(selectedSlot.end), 'HH:mm')},{' '}
                  {format(new Date(selectedSlot.start), 'EEEE d MMMM yyyy', { locale: fr })}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Globe2 size={16} /> Heure d&apos;Europe centrale
                </span>
              </div>
              <p style={{ fontSize: 14, color: '#3c4a5d', lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>
                {EVENT_DESCRIPTION}
              </p>
            </div>

            {/* Champs */}
            <div style={{ padding: '26px 28px 32px', maxWidth: 560, margin: '0 auto' }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: NAVY, margin: '0 0 18px' }}>
                Indiquez vos informations
              </h2>

              {/* Prénom / Nom */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Prénom *</label>
                  <input style={inputStyle} value={prenom} onChange={e => setPrenom(e.target.value)} autoComplete="given-name" />
                </div>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input style={inputStyle} value={nom} onChange={e => setNom(e.target.value)} autoComplete="family-name" />
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>E-mail *</label>
                <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
              </div>

              {/* Lieu */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Lieu *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    { key: 'presentiel' as Lieu, label: ADRESSE_PRESENTIEL, icon: <MapPin size={18} style={{ color: '#d63aff' }} /> },
                    { key: 'visio' as Lieu, label: 'Google Meet', icon: <MeetIcon size={18} /> },
                  ]).map(opt => (
                    <label
                      key={opt.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: 14.5, color: NAVY, cursor: 'pointer',
                        border: `1px solid ${lieu === opt.key ? BLUE : 'transparent'}`,
                        background: lieu === opt.key ? BLUE_LIGHT : 'transparent',
                        borderRadius: 8, padding: '8px 10px',
                      }}
                    >
                      <input
                        type="radio"
                        name="lieu"
                        checked={lieu === opt.key}
                        onChange={() => setLieu(opt.key)}
                        style={{ width: 17, height: 17, accentColor: BLUE, cursor: 'pointer' }}
                      />
                      {opt.icon}
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Téléphone */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Numéro de téléphone *</label>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  border: `1px solid ${BORDER}`, borderRadius: 8, background: '#fff',
                }}>
                  <span style={{ padding: '11px 10px 11px 12px', fontSize: 15, borderRight: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 6, color: NAVY }}>
                    🇫🇷 <span style={{ color: GREY }}>+33</span>
                  </span>
                  <input
                    style={{ ...inputStyle, border: 'none', flex: 1 }}
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="6 12 34 56 78"
                    autoComplete="tel-national"
                  />
                </div>
              </div>

              {/* Département */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>DÉPARTEMENT EX : 75 (EN 2 CHIFFRES) *</label>
                <input
                  style={inputStyle}
                  value={departement}
                  onChange={e => setDepartement(e.target.value.slice(0, 3))}
                  inputMode="numeric"
                  placeholder="75"
                />
              </div>

              {/* Classe actuelle */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Votre classe actuelle *</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer', color: classe ? NAVY : GREY }}
                  value={classe}
                  onChange={e => setClasse(e.target.value)}
                >
                  <option value="" disabled>Sélectionnez...</option>
                  {CLASSE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Formation souhaitée */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Formation souhaitée *</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer', color: formation ? NAVY : GREY }}
                  value={formation}
                  onChange={e => setFormation(e.target.value)}
                >
                  <option value="" disabled>Sélectionnez...</option>
                  {FORMATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <p style={{ fontSize: 12.5, color: GREY, lineHeight: 1.6, marginBottom: 18 }}>
                En poursuivant, vous confirmez avoir lu et accepté la politique de confidentialité
                de Diploma Santé. Vos données sont protégées conformément au RGPD.
              </p>

              {error && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
                  padding: '10px 14px', color: '#dc2626', fontSize: 13.5, marginBottom: 14,
                }}>
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting || !formValid}
                style={{
                  background: formValid ? BLUE : '#aac6ee',
                  color: '#fff', border: 'none', borderRadius: 24,
                  padding: '13px 28px', fontSize: 15.5, fontWeight: 700,
                  cursor: formValid && !submitting ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                {submitting ? 'Planification…' : 'Planifier l\u2019événement'}
              </button>
            </div>
          </div>
        )}

        {/* ════════ ÉTAPE 3 : CONFIRMATION ════════ */}
        {step === 'success' && selectedSlot && (
          <div style={{ padding: '48px 28px 44px', textAlign: 'center' }}>
            <CheckCircle2 size={52} style={{ color: '#1ca65a', marginBottom: 16 }} />
            <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>
              Votre rendez-vous est enregistré !
            </h1>
            <p style={{ fontSize: 14.5, color: GREY, margin: '0 0 26px', lineHeight: 1.6 }}>
              Vous recevrez prochainement une confirmation par e-mail et SMS.
            </p>

            <div style={{
              display: 'inline-block', textAlign: 'left',
              border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: '18px 24px', maxWidth: 420, width: '100%', boxSizing: 'border-box',
            }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: NAVY, marginBottom: 12 }}>{EVENT_TITLE}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 14, color: '#3c4a5d', fontWeight: 600 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CalendarDays size={16} style={{ color: GREY, flexShrink: 0 }} />
                  {format(new Date(selectedSlot.start), 'HH:mm')} - {format(new Date(selectedSlot.end), 'HH:mm')},{' '}
                  {format(new Date(selectedSlot.start), 'EEEE d MMMM yyyy', { locale: fr })}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {lieu === 'presentiel'
                    ? <><MapPin size={16} style={{ color: '#d63aff', flexShrink: 0 }} /> {ADRESSE_PRESENTIEL}</>
                    : <><MeetIcon size={16} /> Google Meet — lien envoyé par e-mail</>}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Globe2 size={16} style={{ color: GREY, flexShrink: 0 }} /> Heure d&apos;Europe centrale
                </span>
              </div>
            </div>

            <div style={{ marginTop: 26 }}>
              {embedded ? (
                <button
                  onClick={closeEmbed}
                  style={{
                    background: NAVY, color: '#fff', border: 'none', borderRadius: 24,
                    padding: '12px 30px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Fermer
                </button>
              ) : (
                <button
                  onClick={resetAll}
                  style={{
                    background: 'none', color: BLUE, border: `1px solid ${BLUE}`, borderRadius: 24,
                    padding: '11px 26px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Prendre un autre rendez-vous
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
