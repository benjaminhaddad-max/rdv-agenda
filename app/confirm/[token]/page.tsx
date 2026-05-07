'use client'

import { useEffect, useState } from 'react'
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

type Step = 'loading' | 'success' | 'error'

function getMeetingLabel(type: string | null) {
  if (type === 'visio') return 'En visioconférence (lien envoyé le matin du RDV)'
  if (type === 'telephone') return 'Par téléphone — notre équipe vous appelle au numéro communiqué'
  return 'En présentiel — Paris'
}

export default function ConfirmPage() {
  const { token } = useParams<{ token: string }>()
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [step, setStep] = useState<Step>('loading')

  // Auto-confirm dès l'arrivée sur la page (un seul clic depuis l'email)
  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        // 1. Charger les infos du RDV
        const infoRes = await fetch(`/api/confirm/${token}`)
        const info = await infoRes.json()
        if (cancelled) return
        if (!infoRes.ok || info.error) {
          setStep('error')
          return
        }
        setAppt(info)

        // 2. Confirmer immédiatement (idempotent côté API)
        const confirmRes = await fetch(`/api/confirm/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm' }),
        })
        if (cancelled) return
        if (!confirmRes.ok) {
          setStep('error')
          return
        }
        setStep('success')
      } catch {
        if (!cancelled) setStep('error')
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [token])

  const startDate = appt ? new Date(appt.start_at) : null
  const firstName = appt?.prospect_name.trim().split(/\s+/)[0] ?? ''

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0b1a2d 0%, #12314d 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 18px',
        fontFamily:
          "'Matter', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Eyebrow brand */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#c6aa7c',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Diploma Santé
        </div>
        <div style={{ fontSize: 11, color: '#7e8ca0', fontStyle: 'italic' }}>la prépa médecine</div>
      </div>

      {/* Carte principale */}
      <div
        style={{
          background: '#152840',
          border: '1px solid #25405e',
          borderRadius: 20,
          padding: '36px 30px',
          maxWidth: 460,
          width: '100%',
          boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Petite forme organique dorée en haut à droite — clin d'œil isotype */}
        <svg
          width="86"
          height="26"
          viewBox="0 0 86 26"
          style={{ position: 'absolute', top: 18, right: 18, opacity: 0.45 }}
        >
          <path
            d="M2 13 Q 12 3, 22 13 T 42 13 T 62 13 T 82 13"
            stroke="#4fabdb"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        {/* LOADING */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '14px 0 8px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                border: '3px solid #25405e',
                borderTopColor: '#c6aa7c',
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 0.9s linear infinite',
              }}
            />
            <div style={{ color: '#a8b6c8', fontSize: 14 }}>Confirmation de votre rendez-vous…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ERROR */}
        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#3a1f24',
                color: '#ef4444',
                fontSize: 28,
                fontWeight: 700,
                lineHeight: '56px',
                margin: '0 auto 18px',
              }}
            >
              !
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>
              Lien invalide
            </div>
            <div style={{ fontSize: 14, color: '#8b97aa', lineHeight: 1.6 }}>
              Ce lien de confirmation est invalide ou a expiré. Contactez-nous à
              <br />
              <a
                href="mailto:rdv@diploma-sante.fr"
                style={{ color: '#4fabdb', textDecoration: 'none' }}
              >
                rdv@diploma-sante.fr
              </a>{' '}
              pour obtenir un nouveau lien.
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            {/* Check doré */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#c6aa7c',
                margin: '0 auto 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 30px rgba(198,170,124,0.35)',
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5l4.5 4.5L19 7"
                  stroke="#0b1a2d"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1
              style={{
                margin: '0 0 6px',
                fontSize: 22,
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-0.2px',
              }}
            >
              Votre rendez-vous est confirmé&nbsp;!
            </h1>

            {firstName && (
              <p style={{ margin: '0 0 24px', fontSize: 14, color: '#a8b6c8', lineHeight: 1.6 }}>
                Merci <strong style={{ color: '#e8eaf0' }}>{firstName}</strong>, votre présence est bien
                enregistrée dans notre agenda.
                <br />À très bientôt chez Diploma Santé.
              </p>
            )}

            {/* Récap RDV */}
            {startDate && (
              <div
                style={{
                  background: 'linear-gradient(135deg,#1b324c 0%,#1f3a5b 100%)',
                  borderLeft: '3px solid #c6aa7c',
                  borderRadius: '0 12px 12px 0',
                  padding: '16px 20px',
                  textAlign: 'left',
                  marginBottom: 22,
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    background: '#3b3024',
                    color: '#c6aa7c',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    padding: '4px 10px',
                    borderRadius: 3,
                    marginBottom: 10,
                  }}
                >
                  Votre rendez-vous
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
                  {format(startDate, "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
                </div>
                <div style={{ fontSize: 13, color: '#a8b6c8' }}>
                  <span style={{ color: '#c6aa7c', fontWeight: 700, marginRight: 6 }}>→</span>
                  {getMeetingLabel(appt?.meeting_type ?? null)}
                </div>
              </div>
            )}

            {/* Lien report discret */}
            <a
              href={`/reschedule/${token}`}
              style={{
                display: 'inline-block',
                color: '#7e93ad',
                fontSize: 12,
                textDecoration: 'underline',
              }}
            >
              Un empêchement ? Reporter mon rendez-vous
            </a>
          </div>
        )}
      </div>

      <div style={{ marginTop: 26, fontSize: 11, color: '#5e7088' }}>
        © Diploma Santé — Prépa médecine
      </div>
    </div>
  )
}
