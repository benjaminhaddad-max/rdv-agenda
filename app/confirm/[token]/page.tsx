'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

type Appointment = {
  id: string
  prospect_name: string
  start_at: string
  meeting_type: string | null
  status: string
}

type Step = 'loading' | 'confirm' | 'declined' | 'success' | 'error'

function getMeetingLabel(type: string | null) {
  if (type === 'visio') return '📹 Visioconférence'
  if (type === 'telephone') return '📞 Entretien téléphonique'
  return '📍 En présentiel — Paris'
}

export default function ConfirmPage() {
  const { token } = useParams<{ token: string }>()
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/confirm/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setStep('error'); return }
        setAppt(data)
        setStep('confirm')
      })
      .catch(() => setStep('error'))
  }, [token])

  async function handleConfirm() {
    setSubmitting(true)
    const res = await fetch(`/api/confirm/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    })
    setSubmitting(false)
    if (res.ok) setStep('success')
  }

  const startDate = appt ? new Date(appt.start_at) : null
  const firstName = appt?.prospect_name.trim().split(/\s+/)[0] ?? ''

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0b1624',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Logo / Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ccac71', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
          Diploma Santé
        </div>
        <div style={{ fontSize: 11, color: '#555870' }}>Prépa médecine d&apos;excellence</div>
      </div>

      <div style={{
        background: '#152438',
        border: '1px solid #2d4a6b',
        borderRadius: 20,
        padding: '32px 28px',
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>

        {/* LOADING */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', color: '#555870', fontSize: 14, padding: '24px 0' }}>
            Chargement…
          </div>
        )}

        {/* ERROR */}
        {step === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>
              Lien invalide
            </div>
            <div style={{ fontSize: 14, color: '#8b8fa8', lineHeight: 1.6 }}>
              Ce lien de confirmation est invalide ou a expiré.<br />
              Contactez-nous pour obtenir un nouveau lien.
            </div>
          </div>
        )}

        {/* CONFIRM — étape principale */}
        {step === 'confirm' && appt && startDate && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 15, color: '#8b8fa8', marginBottom: 4 }}>
                Bonjour <strong style={{ color: '#e8eaf0' }}>{firstName}</strong> 👋
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf0', marginBottom: 6 }}>
                Confirmez votre rendez-vous
              </div>
            </div>

            {/* Carte RDV */}
            <div style={{
              background: '#243d5c',
              border: '1px solid #2d4a6b',
              borderRadius: 14,
              padding: '16px 20px',
              marginBottom: 28,
            }}>
              <div style={{ fontSize: 13, color: '#ccac71', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Votre rendez-vous
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#e8eaf0', fontWeight: 600 }}>
                  📅 {format(startDate, "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
                </div>
                <div style={{ fontSize: 13, color: '#8b8fa8' }}>
                  {getMeetingLabel(appt.meeting_type)}
                </div>
              </div>
            </div>

            {/* Bouton OUI */}
            <button
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                border: 'none',
                borderRadius: 12,
                padding: '16px',
                color: 'white',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 12,
                transition: 'opacity 0.15s',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Confirmation…' : '✅ Oui, je serai présent(e)'}
            </button>

            {/* Bouton NON */}
            <button
              onClick={() => setStep('declined')}
              style={{
                width: '100%',
                background: 'transparent',
                border: '1px solid #ef444440',
                borderRadius: 12,
                padding: '14px',
                color: '#ef4444',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              ❌ Non, je ne pourrai pas venir
            </button>
          </>
        )}

        {/* DECLINED — proposition de report */}
        {step === 'declined' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>📅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 24 }}>
              Reporter mon rendez-vous<br />en cliquant ici
            </div>
            <a
              href={`/reschedule/${token}`}
              style={{
                display: 'block',
                background: 'linear-gradient(135deg, #b89450, #ccac71)',
                borderRadius: 12,
                padding: '16px',
                color: 'white',
                fontSize: 16,
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'opacity 0.15s',
              }}
            >
              Choisir un nouveau créneau →
            </a>
          </div>
        )}

        {/* SUCCESS */}
        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf0', marginBottom: 8 }}>
              Rendez-vous confirmé !
            </div>
            <div style={{ fontSize: 14, color: '#8b8fa8', lineHeight: 1.6 }}>
              Merci {firstName}, nous avons bien enregistré votre confirmation.<br />
              À très bientôt chez Diploma Santé !
            </div>
            {startDate && (
              <div style={{
                marginTop: 20,
                background: '#243d5c',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 14,
                color: '#22c55e',
                fontWeight: 600,
              }}>
                📅 {format(startDate, "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#555870' }}>
        © Diploma Santé — Prépa médecine d&apos;excellence
      </div>
    </div>
  )
}
