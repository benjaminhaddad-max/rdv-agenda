'use client'

import { useEffect, useState } from 'react'
import './event-landing.css'
import type { EventDateFormat, EventLandingEvent } from '@/lib/event-landing/types'
import { TIMESLOT_FIELD_KEY, TIMESLOT_SLOTS } from '@/lib/event-timeslot-survey'
import type { PublicForm } from '@/lib/public-forms'
import { submitPublicForm } from '@/lib/public-form-client'

function capitalizeName(raw: string) {
  return raw
    .trim()
    .split(/(\s|-)/)
    .map((part) => {
      if (!part || part === ' ' || part === '-') return part
      return part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1).toLocaleLowerCase('fr-FR')
    })
    .join('')
}

export default function TimeslotSurveyPage({
  slug,
  form,
  event,
  fmt,
}: {
  slug: string
  form: PublicForm
  event: EventLandingEvent
  fmt: EventDateFormat
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [contactToken, setContactToken] = useState<string | null>(null)
  const [greeting, setGreeting] = useState('')
  const [hp, setHp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenChecked, setTokenChecked] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('t')?.trim()
    if (!t) {
      setTokenChecked(true)
      return
    }
    setContactToken(t)
    fetch(`/api/forms/prefill?t=${encodeURIComponent(t)}&slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { values?: Record<string, string>; greeting?: string }) => {
        if (data.values) {
          const next = { ...data.values }
          if (next.firstname) next.firstname = capitalizeName(next.firstname)
          if (next.lastname) next.lastname = capitalizeName(next.lastname)
          setValues((prev) => ({ ...prev, ...next }))
        }
        if (data.greeting) setGreeting(capitalizeName(String(data.greeting)))
      })
      .catch(() => {
        setError('Lien personnalisé invalide ou expiré. Indiquez vos coordonnées ci-dessous.')
        setContactToken(null)
      })
      .finally(() => setTokenChecked(true))
  }, [slug])

  const slot = values[TIMESLOT_FIELD_KEY] || ''
  const identified = Boolean(contactToken)
  const showIdentity = tokenChecked && !identified
  const selectedLabel = TIMESLOT_SLOTS.find((s) => s.value === slot)?.label

  const pickSlot = (value: string) => {
    setValues((prev) => ({ ...prev, [TIMESLOT_FIELD_KEY]: value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slot) {
      setError('Choisissez un créneau.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const data = await submitPublicForm(slug, values, { hp, contactToken })
      if (!data.ok) {
        setError(data.error)
        return
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="event-landing ev-survey">
      <header className="ev-survey-top">
        <img src="/event-landing/logo-diploma-blanc.svg" alt="Diploma Santé" style={{ height: 22 }} />
        <span>
          {fmt.weekday} {fmt.jour} {fmt.mois}
        </span>
      </header>

      <main className="ev-survey-main">
        {success ? (
          <div className="ev-survey-done">
            <div className="ev-survey-check" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#12314d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1>Créneau enregistré</h1>
            {selectedLabel ? <p className="ev-survey-picked">{selectedLabel}</p> : null}
            <p>{form.success_message || 'Merci, à samedi.'}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="ev-survey-kicker">{event.name}</p>
            <h1>Choisissez votre créneau</h1>
            <p className="ev-survey-intro">
              {greeting ? `${greeting}, les` : 'Les'} inscriptions au salon sont très nombreuses. Pour vous accueillir correctement, dites-nous à quelle heure vous pensez venir.
            </p>
            <p className="ev-survey-note">Chaque créneau a un nombre de places limité.</p>

            <div className="ev-slot-grid" role="radiogroup" aria-label="Créneau">
              {TIMESLOT_SLOTS.map((s) => {
                const selected = slot === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    className="ev-slot-btn"
                    data-selected={selected ? 'true' : 'false'}
                    onClick={() => pickSlot(s.value)}
                    aria-pressed={selected}
                  >
                    <span className="ev-slot-hint">{s.hint}</span>
                    <span className="ev-slot-time">{s.label}</span>
                  </button>
                )
              })}
            </div>

            {showIdentity && (
              <div className="ev-survey-id ev-pair">
                <label>
                  <span>Prénom</span>
                  <input
                    className="ev-field"
                    required
                    value={values.firstname || ''}
                    onChange={(e) => setValues((p) => ({ ...p, firstname: e.target.value }))}
                    onBlur={(e) => setValues((p) => ({ ...p, firstname: capitalizeName(e.target.value) }))}
                  />
                </label>
                <label>
                  <span>Nom</span>
                  <input className="ev-field" required value={values.lastname || ''} onChange={(e) => setValues((p) => ({ ...p, lastname: e.target.value }))} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Email</span>
                  <input className="ev-field" type="email" required value={values.email || ''} onChange={(e) => setValues((p) => ({ ...p, email: e.target.value }))} />
                </label>
              </div>
            )}

            {form.honeypot_enabled && (
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                name="website"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
                aria-hidden="true"
              />
            )}

            {error && <div className="ev-survey-error">{error}</div>}

            <button type="submit" disabled={submitting} className="cta cta-gold ev-survey-submit">
              {submitting ? 'Envoi…' : selectedLabel ? `Confirmer ${selectedLabel}` : form.submit_label || 'Confirmer'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
