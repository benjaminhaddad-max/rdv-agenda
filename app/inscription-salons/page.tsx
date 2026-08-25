'use client'

import { useEffect, useState } from 'react'
import { MapPin, Clock, Users, CheckCircle2, XCircle } from 'lucide-react'

type Salon = {
  id: string
  name: string
  description: string | null
  location: string | null
  date_label: string
  time_label: string
  max_capacity: number | null
  remaining: number | null
  is_full: boolean
  form_url: string | null
}

export default function InscriptionSalonsPage() {
  const [salons, setSalons] = useState<Salon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/events-studio/salons-public?brand=diploma')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setSalons(data.salons || [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #e8f6fc 0%, #f7fafc 40%, #fff 100%)',
        fontFamily:
          'ui-rounded, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: '#0c4a6e',
      }}
    >
      <header style={{ padding: '36px 20px 12px', textAlign: 'center' }}>
        <img
          src="https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png"
          alt="Diploma Santé"
          style={{ height: 40, margin: '0 auto 16px', display: 'block' }}
        />
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0c4a6e' }}>
          Inscription aux salons
        </h1>
        <p style={{ margin: '10px auto 0', maxWidth: 520, fontSize: 15, color: '#0369a1', lineHeight: 1.5 }}>
          Choisissez le salon et le lieu qui vous conviennent. Les places sont limitées par
          événement.
        </p>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 64px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chargement…</div>
        )}
        {error && (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && salons.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 40,
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              color: '#64748b',
            }}
          >
            Aucun salon ouvert à l’inscription pour le moment.
          </div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          {salons.map((s) => {
            const full = s.is_full || !s.form_url
            return (
              <article
                key={s.id}
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: `1px solid ${full ? '#e2e8f0' : '#bae6fd'}`,
                  padding: '18px 18px 16px',
                  boxShadow: '0 4px 16px rgba(14, 116, 144, 0.06)',
                  opacity: full ? 0.85 : 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                    {s.name}
                  </h2>
                  {full ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#b91c1c',
                        background: '#fef2f2',
                        padding: '4px 10px',
                        borderRadius: 999,
                      }}
                    >
                      <XCircle size={14} /> Plus de places disponibles
                    </span>
                  ) : s.remaining != null ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#0369a1',
                        background: '#e0f2fe',
                        padding: '4px 10px',
                        borderRadius: 999,
                      }}
                    >
                      <Users size={14} /> {s.remaining} place{s.remaining > 1 ? 's' : ''} restante
                      {s.remaining > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#15803d',
                        background: '#dcfce7',
                        padding: '4px 10px',
                        borderRadius: 999,
                      }}
                    >
                      <CheckCircle2 size={14} /> Places disponibles
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 14, color: '#334155' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Clock size={16} style={{ marginTop: 2, flexShrink: 0, color: '#0284c7' }} />
                    <span>
                      <strong style={{ textTransform: 'capitalize' }}>{s.date_label}</strong>
                      <br />
                      {s.time_label}
                    </span>
                  </div>
                  {s.location && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <MapPin size={16} style={{ marginTop: 2, flexShrink: 0, color: '#0284c7' }} />
                      <span>{s.location}</span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 16 }}>
                  {full || !s.form_url ? (
                    <button
                      type="button"
                      disabled
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 999,
                        border: 'none',
                        background: '#e2e8f0',
                        color: '#64748b',
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: 'not-allowed',
                      }}
                    >
                      Complet
                    </button>
                  ) : (
                    <a
                      href={s.form_url}
                      style={{
                        display: 'block',
                        textAlign: 'center',
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '12px 16px',
                        borderRadius: 999,
                        background: '#0284c7',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                        textDecoration: 'none',
                      }}
                    >
                      S’inscrire à ce salon
                    </a>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </main>
    </div>
  )
}
