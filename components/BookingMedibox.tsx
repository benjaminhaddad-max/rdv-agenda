'use client'

/**
 * BookingMedibox — Prise de RDV d'entretien Medibox (charte medibox.fr).
 *
 * Utilisé par /book/medibox. Même parcours que BookingDiploma (date → heure →
 * formulaire → confirmation) mais :
 *   - les RDV se font uniquement à distance (Google Meet généré côté serveur) ;
 *   - le RDV est créé avec brand = 'medibox' → badge dédié dans l'agenda,
 *     SMS / emails au nom de Medibox.
 *
 * Composant isolé, comme BookingDiploma : ne partage rien avec les formulaires.
 */

import { useMemo, useState } from 'react'
import {
  format, addMonths, startOfMonth, startOfToday, addDays,
  isSameDay, isSameMonth, getDay,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Clock, Globe2, ChevronLeft, ChevronRight, ArrowLeft, CalendarDays, Check, Video,
} from 'lucide-react'
import type { BookingUtm } from '@/components/BookingDiploma'

// ─── Réglages faciles à modifier ──────────────────────────────────────────────
const EVENT_TITLE = "Rendez-vous d'entretien Medibox"
const EVENT_DURATION_MIN = 30
const EVENT_DESCRIPTION =
  'Un conseiller Medibox fait le point avec vous sur votre projet, votre faculté et ' +
  'l’accompagnement le plus adapté. L’entretien se déroule à distance, en visioconférence.'
const SLOT_START_HOUR = 9
const SLOT_END_HOUR = 22

const CLASSE_OPTIONS = [
  'Seconde',
  'Première',
  'Terminale',
  'Étudiant en PASS / L.AS',
  'Bac+1 / Réorientation',
  'Parent d’élève',
  'Autre',
]

const FORMATION_OPTIONS = [
  'Medibox Excellence (PASS / L.AS)',
  'Medibox Coaching',
  'Terminale Santé',
  'Stage de pré-rentrée',
  'Je ne sais pas encore',
]

// ─── Charte Medibox ───────────────────────────────────────────────────────────
const VIOLET = '#6D4FD0'
const VIOLET_DARK = '#4C2FA8'
const VIOLET_BRIGHT = '#8B5CF6'
const LAVENDER = '#C4B5FD'
const INK = '#140E2E'
const MUTED = '#685E7E'
const PALE = '#F3F0FC'
const INPUT_BG = '#F9F8FE'
const INPUT_BORDER = '#E6E0FA'
const BORDER = '#E4DEEE'
const NIGHT = '#07050D'
const GRADIENT = 'linear-gradient(135deg,#4C2FA8 0%,#6D4FD0 55%,#8B5CF6 100%)'
const FONT = '"Proxima Nova", system-ui, -apple-system, sans-serif'

const FONT_FACES = [400, 600, 700, 800]
  .map(w => `@font-face{font-family:"Proxima Nova";src:url("/fonts/medibox/proxima-nova-${w}.otf") format("opentype");font-weight:${w};font-display:swap;}`)
  .join('') +
  '.mbx-input:focus{background:#fff!important;border-color:#8B5CF6!important;box-shadow:0 0 0 4px rgba(139,92,246,.16);}' +
  '.mbx-input::placeholder{color:#A8A1BC;}' +
  '.mbx-slot:hover{border-color:#6D4FD0!important;background:#F3F0FC!important;}' +
  '.mbx-cta{transition:transform .15s ease;}.mbx-cta:not(:disabled):hover{transform:translateY(-2px);}' +
  '@media (prefers-reduced-motion:reduce){.mbx-cta{transition:none;}.mbx-cta:not(:disabled):hover{transform:none;}}'

type Step = 'date' | 'form' | 'success'
type Slot = { start: string; end: string }

export default function BookingMedibox({ utm }: { utm?: BookingUtm }) {
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
  const [phone, setPhone] = useState('')
  const [departement, setDepartement] = useState('')
  const [classe, setClasse] = useState('')
  const [formation, setFormation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Calendrier ──────────────────────────────────────────────────────────────
  const weeks = useMemo(() => {
    const first = startOfMonth(monthCursor)
    const offset = (getDay(first) + 6) % 7 // lundi = 0
    const cells: (Date | null)[] = Array.from({ length: offset }, () => null)
    let d = first
    while (isSameMonth(d, first)) {
      cells.push(d)
      d = addDays(d, 1)
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [monthCursor])

  const canGoPrev = monthCursor > startOfMonth(today)

  const slots = useMemo(() => {
    if (!selectedDate) return []
    const result: Slot[] = []
    const cursor = new Date(selectedDate)
    cursor.setHours(SLOT_START_HOUR, 0, 0, 0)
    const limit = new Date(selectedDate)
    limit.setHours(SLOT_END_HOUR, 0, 0, 0)
    while (cursor < limit) {
      const end = new Date(cursor)
      end.setMinutes(end.getMinutes() + EVENT_DURATION_MIN)
      if (end > limit) break
      result.push({ start: cursor.toISOString(), end: end.toISOString() })
      cursor.setMinutes(cursor.getMinutes() + EVENT_DURATION_MIN)
    }
    return result
  }, [selectedDate])

  // ── Soumission ──────────────────────────────────────────────────────────────
  const formValid =
    prenom.trim() && nom.trim() && /\S+@\S+\.\S+/.test(email.trim()) && phone.trim() &&
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
    const notes = [
      'RDV Medibox — Visioconférence',
      utmParts.length > 0 ? `[Tracking: ${utmParts.join(' | ')}]` : '',
    ].filter(Boolean).join(' — ')

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          web_booking: true, // → upsert fiche CRM par email + attribution closer
          brand: 'medibox',  // → RDV distinct dans l'agenda, comms Medibox
          prospect_name: `${prenom.trim()} ${nom.trim()}`,
          prospect_firstname: prenom.trim(),
          prospect_lastname: nom.trim(),
          prospect_email: email.trim(),
          prospect_phone: normalizePhone(phone),
          start_at: selectedSlot.start,
          end_at: selectedSlot.end,
          source: 'prospect',
          formation_type: formation,
          meeting_type: 'visio',
          meeting_link: null,
          departement: departement.trim(),
          classe_actuelle: classe,
          call_notes: notes,
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

  function resetAll() {
    setStep('date')
    setSelectedDate(null)
    setPendingSlot(null)
    setSelectedSlot(null)
    setPrenom(''); setNom(''); setEmail('')
    setPhone(''); setDepartement(''); setClasse(''); setFormation('')
    setError(null)
  }

  // ── Styles communs ──────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', minHeight: 52,
    border: `1.5px solid ${INPUT_BORDER}`, borderRadius: 12,
    padding: '13px 16px', fontSize: 15.5, color: INK,
    outline: 'none', fontFamily: 'inherit', background: INPUT_BG,
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '.06em',
    textTransform: 'uppercase', color: VIOLET_DARK, marginBottom: 7,
  }
  const slotRecap = selectedSlot && (
    <>
      {format(new Date(selectedSlot.start), 'HH:mm')} – {format(new Date(selectedSlot.end), 'HH:mm')},{' '}
      {format(new Date(selectedSlot.start), 'EEEE d MMMM yyyy', { locale: fr })}
    </>
  )
  const metaItem: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7 }

  return (
    <div style={{
      fontFamily: FONT,
      minHeight: '100vh',
      backgroundColor: NIGHT,
      backgroundImage:
        'radial-gradient(900px 460px at 100% -12%, rgba(124,58,237,.5), transparent 60%), ' +
        'radial-gradient(700px 420px at -8% 40%, rgba(76,29,149,.35), transparent 62%)',
      padding: '28px 16px 48px',
      color: INK,
      WebkitFontSmoothing: 'antialiased',
    }}>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACES }} />

      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        {/* ── En-tête marque ── */}
        <header style={{ textAlign: 'center', marginBottom: 26 }}>
          <a href="https://www.medibox.fr" aria-label="Medibox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-medibox-blanc.png" alt="Medibox" style={{ height: 34, width: 'auto', display: 'inline-block' }} />
          </a>
          <div style={{
            margin: '22px 0 10px', fontSize: 12, fontWeight: 800, letterSpacing: '.14em',
            textTransform: 'uppercase', color: LAVENDER,
          }}>
            Entretien individuel · 100 % en ligne
          </div>
          <h1 style={{
            margin: 0, fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 800,
            letterSpacing: '-.02em', lineHeight: 1.05, textTransform: 'uppercase',
            color: '#fff', textWrap: 'balance',
          }}>
            Prenez rendez-vous{' '}
            <span style={{
              backgroundImage: 'linear-gradient(90deg,#FFFFFF 0%,#D9CCFF 45%,#A78BFA 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>
              avec un conseiller
            </span>
          </h1>
        </header>

        {/* ── Carte ── */}
        <main style={{
          borderRadius: 26,
          border: '1.5px solid transparent',
          background:
            'linear-gradient(#fff,#fff) padding-box, ' +
            'linear-gradient(140deg,#C4B5FD 0%,#8B5CF6 45%,#E6E0FA 100%) border-box',
          boxShadow: '0 30px 70px -26px rgba(7,5,13,.85), 0 0 70px -24px rgba(167,139,250,.75)',
          overflow: 'hidden',
        }}>

          {/* Récap événement (étapes date + formulaire) */}
          {step !== 'success' && (
            <div style={{ padding: '26px 28px 22px', borderBottom: `1px solid ${BORDER}`, position: 'relative' }}>
              {step === 'form' && (
                <button
                  onClick={() => { setStep('date'); setPendingSlot(null) }}
                  aria-label="Retour au choix du créneau"
                  style={{
                    width: 40, height: 40, borderRadius: '50%', marginBottom: 14,
                    border: `1.5px solid ${BORDER}`, background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: VIOLET_DARK,
                  }}
                >
                  <ArrowLeft size={19} />
                </button>
              )}
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: INK, margin: '0 0 10px' }}>
                {EVENT_TITLE}
              </h2>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '8px 20px',
                fontSize: 14, fontWeight: 700, color: MUTED, marginBottom: 12,
              }}>
                <span style={metaItem}><Clock size={16} style={{ color: VIOLET_BRIGHT }} /> {EVENT_DURATION_MIN} min</span>
                <span style={metaItem}><Video size={16} style={{ color: VIOLET_BRIGHT }} /> Visioconférence Google Meet</span>
                {step === 'form' && (
                  <span style={{ ...metaItem, color: VIOLET_DARK }}>
                    <CalendarDays size={16} style={{ color: VIOLET_BRIGHT }} /> {slotRecap}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 15, color: '#54565F', lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
                {EVENT_DESCRIPTION}
              </p>
            </div>
          )}

          {/* ════════ ÉTAPE 1 : DATE + HEURE ════════ */}
          {step === 'date' && (
            <div style={{ padding: '24px 28px 32px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 18px' }}>
                Choisissez la date et l&apos;heure
              </h3>

              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* ── Calendrier mensuel ── */}
                <div style={{ width: 340, maxWidth: '100%', flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <button
                      onClick={() => canGoPrev && setMonthCursor(m => addMonths(m, -1))}
                      disabled={!canGoPrev}
                      aria-label="Mois précédent"
                      style={{
                        width: 36, height: 36, borderRadius: 10, border: 'none',
                        background: canGoPrev ? PALE : 'transparent',
                        cursor: canGoPrev ? 'pointer' : 'default',
                        color: canGoPrev ? VIOLET_DARK : '#CFC9DD',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div style={{ fontSize: 16, fontWeight: 800, color: INK, textTransform: 'capitalize' }}>
                      {format(monthCursor, 'MMMM yyyy', { locale: fr })}
                    </div>
                    <button
                      onClick={() => setMonthCursor(m => addMonths(m, 1))}
                      aria-label="Mois suivant"
                      style={{
                        width: 36, height: 36, borderRadius: 10, border: 'none', background: PALE,
                        cursor: 'pointer', color: VIOLET_DARK,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
                    {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(d => (
                      <div key={d} style={{ textAlign: 'center', fontSize: 11.5, color: MUTED, fontWeight: 700, padding: '4px 0' }}>
                        {d}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {weeks.map((day, i) => {
                      if (!day) return <div key={`empty-${i}`} />
                      const avail = day >= firstAvailable
                      const sel = selectedDate ? isSameDay(day, selectedDate) : false
                      return (
                        <div key={day.toISOString()} style={{ display: 'flex', justifyContent: 'center' }}>
                          <button
                            onClick={() => { if (avail) { setSelectedDate(day); setPendingSlot(null) } }}
                            disabled={!avail}
                            aria-pressed={sel}
                            style={{
                              width: 40, height: 40, borderRadius: '50%',
                              border: isSameDay(day, today) && !sel ? `1.5px solid ${LAVENDER}` : 'none',
                              fontFamily: 'inherit', fontSize: 14.5, fontWeight: avail ? 700 : 400,
                              cursor: avail ? 'pointer' : 'default',
                              background: sel ? GRADIENT : avail ? PALE : 'transparent',
                              color: sel ? '#fff' : avail ? VIOLET_DARK : '#B5AEC6',
                              boxShadow: sel ? '0 8px 18px -6px rgba(109,79,208,.7)' : 'none',
                            }}
                          >
                            {format(day, 'd')}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 18, fontSize: 13, color: MUTED, fontWeight: 600 }}>
                    <Globe2 size={15} /> Heure de Paris
                  </div>
                </div>

                {/* ── Créneaux du jour sélectionné ── */}
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  {!selectedDate ? (
                    <div style={{
                      border: `1.5px dashed ${INPUT_BORDER}`, borderRadius: 16, padding: '28px 20px',
                      textAlign: 'center', fontSize: 14.5, color: MUTED, lineHeight: 1.5,
                    }}>
                      Sélectionnez un jour pour afficher les créneaux disponibles.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 800, color: INK, marginBottom: 12, textTransform: 'capitalize' }}>
                        {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
                      </div>
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 9,
                        maxHeight: 380, overflowY: 'auto', paddingRight: 4,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {slots.map(slot => {
                          if (pendingSlot?.start === slot.start) {
                            return (
                              <div key={slot.start} style={{ display: 'flex', gap: 7 }}>
                                <div style={{
                                  flex: 1, background: INK, color: '#fff', borderRadius: 12,
                                  padding: '13px 0', textAlign: 'center', fontSize: 15, fontWeight: 700,
                                }}>
                                  {format(new Date(slot.start), 'HH:mm')}
                                </div>
                                <button
                                  className="mbx-cta"
                                  onClick={() => { setSelectedSlot(slot); setStep('form'); setError(null) }}
                                  style={{
                                    flex: 1, background: GRADIENT, color: '#fff', border: 'none',
                                    borderRadius: 12, padding: '13px 0', fontSize: 15, fontWeight: 800,
                                    cursor: 'pointer', fontFamily: 'inherit',
                                    boxShadow: '0 10px 22px -10px rgba(109,79,208,.85)',
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
                              className="mbx-slot"
                              onClick={() => setPendingSlot(slot)}
                              style={{
                                background: '#fff', border: `1.5px solid ${INPUT_BORDER}`,
                                borderRadius: 12, padding: '13px 0',
                                color: VIOLET_DARK, fontSize: 15, fontWeight: 700,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              {format(new Date(slot.start), 'HH:mm')}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ════════ ÉTAPE 2 : FORMULAIRE ════════ */}
          {step === 'form' && selectedSlot && (
            <div style={{ padding: '26px 28px 32px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 18px' }}>
                Vos informations
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle} htmlFor="mbx-prenom">Prénom</label>
                  <input id="mbx-prenom" className="mbx-input" style={inputStyle} value={prenom} onChange={e => setPrenom(e.target.value)} autoComplete="given-name" placeholder="Camille" />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="mbx-nom">Nom</label>
                  <input id="mbx-nom" className="mbx-input" style={inputStyle} value={nom} onChange={e => setNom(e.target.value)} autoComplete="family-name" placeholder="Durand" />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="mbx-email">E-mail</label>
                  <input id="mbx-email" className="mbx-input" style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="camille@exemple.fr" />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="mbx-phone">Téléphone</label>
                  <input id="mbx-phone" className="mbx-input" style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="06 12 34 56 78" />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="mbx-dept">Département</label>
                  <input id="mbx-dept" className="mbx-input" style={inputStyle} value={departement} onChange={e => setDepartement(e.target.value.slice(0, 3))} inputMode="numeric" placeholder="Ex. 33" />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="mbx-classe">Classe actuelle</label>
                  <select id="mbx-classe" className="mbx-input" style={{ ...inputStyle, cursor: 'pointer', color: classe ? INK : '#A8A1BC' }} value={classe} onChange={e => setClasse(e.target.value)}>
                    <option value="" disabled>Sélectionnez…</option>
                    {CLASSE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle} htmlFor="mbx-formation">Accompagnement souhaité</label>
                <select id="mbx-formation" className="mbx-input" style={{ ...inputStyle, cursor: 'pointer', color: formation ? INK : '#A8A1BC' }} value={formation} onChange={e => setFormation(e.target.value)}>
                  <option value="" disabled>Sélectionnez…</option>
                  {FORMATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, background: PALE, borderRadius: 12,
                padding: '12px 14px', fontSize: 14, color: VIOLET_DARK, fontWeight: 600, lineHeight: 1.5, marginBottom: 18,
              }}>
                <Video size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                L&apos;entretien a lieu en visioconférence. Le lien Google Meet vous est envoyé par e-mail dès la réservation.
              </div>

              {error && (
                <div role="alert" style={{
                  background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12,
                  padding: '11px 14px', color: '#b91c1c', fontSize: 14, marginBottom: 14,
                }}>
                  {error}
                </div>
              )}

              <button
                className="mbx-cta"
                onClick={submit}
                disabled={submitting || !formValid}
                style={{
                  width: '100%', minHeight: 58, borderRadius: 14, border: 'none',
                  background: formValid ? GRADIENT : '#ECE8F6',
                  color: formValid ? '#fff' : '#A8A1BC',
                  fontSize: 17, fontWeight: 800, fontFamily: 'inherit',
                  cursor: formValid && !submitting ? 'pointer' : 'not-allowed',
                  boxShadow: formValid ? 'inset 0 1px 0 rgba(255,255,255,.3), 0 14px 30px -10px rgba(109,79,208,.85)' : 'none',
                }}
              >
                {submitting ? 'Réservation en cours…' : 'Confirmer mon rendez-vous'}
              </button>

              <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: '14px 0 0', textAlign: 'center' }}>
                En confirmant, vous acceptez que Medibox utilise ces informations pour organiser votre entretien,
                conformément au RGPD.
              </p>
            </div>
          )}

          {/* ════════ ÉTAPE 3 : CONFIRMATION ════════ */}
          {step === 'success' && selectedSlot && (
            <div style={{ padding: '44px 28px 46px', textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px', padding: 3,
                background: 'conic-gradient(from -90deg,#8B5CF6,#C4B5FD,#8B5CF6)',
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%', background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={30} strokeWidth={3} style={{ color: VIOLET }} />
                </div>
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: INK, margin: '0 0 8px' }}>
                Votre rendez-vous est réservé
              </h2>
              <p style={{ fontSize: 15, color: MUTED, margin: '0 auto 26px', lineHeight: 1.55, maxWidth: 420 }}>
                Une confirmation vous est envoyée par e-mail et par SMS, avec le lien de la visioconférence.
              </p>

              <div style={{
                display: 'inline-block', textAlign: 'left', background: INPUT_BG,
                border: `1.5px solid ${INPUT_BORDER}`, borderRadius: 16,
                padding: '18px 22px', maxWidth: 440, width: '100%', boxSizing: 'border-box',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 12 }}>{EVENT_TITLE}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 14.5, color: '#54565F', fontWeight: 600 }}>
                  <span style={metaItem}><CalendarDays size={16} style={{ color: VIOLET_BRIGHT, flexShrink: 0 }} /> {slotRecap}</span>
                  <span style={metaItem}><Video size={16} style={{ color: VIOLET_BRIGHT, flexShrink: 0 }} /> Visioconférence Google Meet</span>
                  <span style={metaItem}><Globe2 size={16} style={{ color: VIOLET_BRIGHT, flexShrink: 0 }} /> Heure de Paris</span>
                </div>
              </div>

              <div style={{ marginTop: 26 }}>
                <button
                  onClick={resetAll}
                  style={{
                    background: '#fff', color: '#241A36', border: '1.5px solid #D6D7E6', borderRadius: 12,
                    padding: '12px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Prendre un autre rendez-vous
                </button>
              </div>
            </div>
          )}
        </main>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '22px 0 0' }}>
          Une question ? Appelez-nous au{' '}
          <a href="tel:+33978452063" style={{ color: LAVENDER, fontWeight: 700, textDecoration: 'none' }}>09 78 45 20 63</a>
        </p>
      </div>
    </div>
  )
}
