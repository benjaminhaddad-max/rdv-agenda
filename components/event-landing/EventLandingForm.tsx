'use client'

import { useEffect, useState } from 'react'
import type { PublicField, PublicForm } from '@/lib/public-forms'
import type { EventCapacityView } from '@/lib/event-landing/types'
import { buildPublicFormValues, submitPublicForm } from '@/lib/public-form-client'

type PublicFormWithCapacity = PublicForm & {
  event_capacity?: EventCapacityView | null
}

function triggerBrowserDownload(url: string, filename?: string | null) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  if (filename) a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const PAIR_GROUPS = [
  ['firstname', 'lastname'],
  ['email', 'phone'],
  ['departement', 'classe_actuelle'],
]

function layoutFields(fields: PublicField[]): Array<PublicField | [PublicField, PublicField]> {
  const remaining = [...fields]
  const out: Array<PublicField | [PublicField, PublicField]> = []
  for (const pair of PAIR_GROUPS) {
    const a = remaining.findIndex((f) => f.field_key === pair[0])
    const b = remaining.findIndex((f) => f.field_key === pair[1])
    if (a >= 0 && b >= 0) {
      const fa = remaining[a]
      const fb = remaining[b]
      remaining.splice(Math.max(a, b), 1)
      remaining.splice(Math.min(a, b), 1)
      out.push([fa, fb])
    }
  }
  out.push(...remaining)
  return out
}

export default function EventLandingForm({
  slug,
  form: initialForm,
  remainingText,
  isFull,
  kicker,
  title,
  successTitle,
  successText,
  submitLabel,
}: {
  slug: string
  form: PublicFormWithCapacity
  remainingText: string | null
  isFull: boolean
  kicker: string
  title: string
  successTitle: string
  successText: string
  submitLabel: string
}) {
  const [form, setForm] = useState<PublicFormWithCapacity>(initialForm)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of initialForm.fields) {
      if (f.default_value) initial[f.field_key] = f.default_value
    }
    return initial
  })
  const [hiddenFieldKeys, setHiddenFieldKeys] = useState<Set<string>>(new Set())
  const [contactToken, setContactToken] = useState<string | null>(null)
  const [hp, setHp] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/forms/${encodeURIComponent(slug)}/public`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: PublicFormWithCapacity) => {
        if (cancelled) return
        setForm(data)
        setValues((prev) => ({ ...buildPublicFormValues(data.fields), ...prev }))
      })
      .catch(() => {
        /* on garde le formulaire SSR */
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('t')?.trim()
    if (!t) return
    setContactToken(t)
    fetch(`/api/forms/prefill?t=${encodeURIComponent(t)}&slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { values?: Record<string, string>; hidden_field_keys?: string[] }) => {
        if (data.values) setValues((prev) => ({ ...prev, ...data.values }))
        if (data.hidden_field_keys?.length) setHiddenFieldKeys(new Set(data.hidden_field_keys))
      })
      .catch(() => {
        setError('Lien personnalisé invalide ou expiré.')
        setContactToken(null)
      })
  }, [slug])

  const full = isFull || !!form.event_capacity?.is_full
  const visible = form.fields.filter((f) => f.field_type !== 'hidden' && !hiddenFieldKeys.has(f.field_key))
  const hiddenFields = form.fields.filter((f) => f.field_type === 'hidden')

  const handleCheckboxChange = (key: string, optValue: string, checked: boolean) => {
    const current = (values[key] || '').split(',').filter(Boolean)
    const next = checked ? [...current, optValue] : current.filter((v) => v !== optValue)
    setValues((prev) => ({ ...prev, [key]: next.join(',') }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (full) {
      setError('Plus de places disponibles pour cet événement.')
      return
    }
    if (!consent) {
      setError('Merci d’accepter d’être contacté au sujet de cet événement.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const data = await submitPublicForm(slug, values, {
        hp,
        contactToken,
      })
      if (!data.ok) {
        setError(data.error)
        return
      }
      if (data.download_url) {
        triggerBrowserDownload(data.download_url, data.download_filename)
        setDownloadUrl(data.download_url)
        setDownloadFilename(data.download_filename || 'document.pdf')
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      id="ev-inscription"
      data-form-id={form.id}
      data-form-slug={form.slug}
      onSubmit={handleSubmit}
      style={{
        background: '#fff',
        borderRadius: 32,
        padding: 'clamp(24px,2.4vw,30px)',
        boxShadow: '0 30px 70px rgba(0,0,0,.3)',
      }}
    >
      <div
        style={{
          fontFamily: "'Clash Display',sans-serif",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
          color: '#4fabdb',
          marginBottom: 10,
        }}
      >
        {kicker}
      </div>
      <h2
        style={{
          fontFamily: "'PP Pangaia',serif",
          fontWeight: 700,
          fontSize: 24,
          color: '#12314d',
          margin: '0 0 6px',
          lineHeight: 1.15,
        }}
      >
        {full ? 'Événement complet' : title}
      </h2>
      {full ? (
        <p style={{ fontSize: 13.5, color: '#12314d', opacity: 0.7, lineHeight: 1.55, margin: '0 0 8px' }}>
          Les inscriptions sont closes pour cette date. Appelez-nous pour être orienté vers la prochaine session.
        </p>
      ) : remainingText ? (
        <p style={{ fontSize: 13.5, color: '#12314d', opacity: 0.7, lineHeight: 1.55, margin: '0 0 20px' }}>
          {remainingText}.
        </p>
      ) : (
        <p style={{ fontSize: 13.5, color: '#12314d', opacity: 0.7, lineHeight: 1.55, margin: '0 0 20px' }}>
          Confirmation immédiate. Aucun tarif.
        </p>
      )}

      {success ? (
        <div style={{ textAlign: 'center', padding: '22px 0' }}>
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#12314d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span style={{ display: 'block', fontFamily: "'PP Pangaia',serif", fontWeight: 700, fontSize: 21, color: '#12314d', marginBottom: 8 }}>
            {successTitle}
          </span>
          <span style={{ display: 'block', fontSize: 14, color: '#12314d', opacity: 0.75, lineHeight: 1.6 }}>{successText}</span>
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={downloadFilename || undefined}
              style={{
                display: 'inline-block',
                marginTop: 16,
                fontFamily: "'Clash Display',sans-serif",
                fontWeight: 600,
                fontSize: 14,
                color: '#12314d',
              }}
            >
              Télécharger le document
            </a>
          )}
        </div>
      ) : full ? (
        <div>
          <a
            href="tel:+33176410173"
            className="cta cta-gold"
            style={{
              display: 'block',
              textAlign: 'center',
              background: '#d3ab67',
              color: '#12314d',
              fontFamily: "'Clash Display',sans-serif",
              fontWeight: 600,
              fontSize: 15.5,
              borderRadius: 999,
              padding: '17px 24px',
              marginTop: 8,
            }}
          >
            01 76 41 01 73
          </a>
          <p style={{ fontSize: 11.5, color: '#12314d', opacity: 0.6, lineHeight: 1.5, textAlign: 'center', margin: '10px 0 0' }}>
            Du lundi au vendredi, 9h–13h et 14h–18h
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {hiddenFields.map((field) => (
            <input key={field.field_key} type="hidden" name={field.field_key} value={values[field.field_key] || ''} />
          ))}
          {layoutFields(visible).map((item) => {
            if (Array.isArray(item)) {
              return (
                <div key={item[0].field_key + item[1].field_key} className="ev-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                  <Field
                    field={item[0]}
                    value={values[item[0].field_key] || ''}
                    onChange={(v) => setValues((p) => ({ ...p, [item[0].field_key]: v }))}
                    onCheckboxChange={(o, c) => handleCheckboxChange(item[0].field_key, o, c)}
                  />
                  <Field
                    field={item[1]}
                    value={values[item[1].field_key] || ''}
                    onChange={(v) => setValues((p) => ({ ...p, [item[1].field_key]: v }))}
                    onCheckboxChange={(o, c) => handleCheckboxChange(item[1].field_key, o, c)}
                  />
                </div>
              )
            }
            return (
              <Field
                key={item.field_key}
                field={item}
                value={values[item.field_key] || ''}
                onChange={(v) => setValues((p) => ({ ...p, [item.field_key]: v }))}
                onCheckboxChange={(o, c) => handleCheckboxChange(item.field_key, o, c)}
              />
            )
          })}
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
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: '#12314d', opacity: 0.7, lineHeight: 1.5, marginTop: 2 }}>
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#4fabdb', flex: 'none' }}
            />
            <span>J’accepte d’être contacté par Diploma Santé au sujet de cet événement.</span>
          </label>
          {error && (
            <div style={{ padding: 10, background: 'rgba(185,28,28,0.08)', border: '1px solid #fecaca', borderRadius: 12, color: '#b91c1c', fontSize: 13 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="cta cta-gold"
            style={{
              background: '#d3ab67',
              color: '#12314d',
              fontFamily: "'Clash Display',sans-serif",
              fontWeight: 600,
              fontSize: 15.5,
              border: 'none',
              borderRadius: 999,
              padding: '17px 24px',
              cursor: submitting ? 'default' : 'pointer',
              width: '100%',
              marginTop: 4,
              opacity: submitting ? 0.65 : 1,
            }}
          >
            {submitting ? 'Envoi…' : submitLabel}
          </button>
          <p style={{ fontSize: 11.5, color: '#12314d', opacity: 0.6, lineHeight: 1.5, textAlign: 'center', margin: '2px 0 0' }}>
            Gratuit · confirmation immédiate
          </p>
        </div>
      )}
    </form>
  )
}

function Field({
  field,
  value,
  onChange,
  onCheckboxChange,
}: {
  field: PublicField
  value: string
  onChange: (v: string) => void
  onCheckboxChange: (optValue: string, checked: boolean) => void
}) {
  const label = (
    <span style={{ display: 'block', fontSize: 11.5, letterSpacing: '0.04em', color: '#12314d', opacity: 0.6, marginBottom: 6 }}>
      {field.label}
      {field.required ? ' *' : ''}
    </span>
  )
  const options = field.options || []

  if (field.field_type === 'textarea') {
    return (
      <label style={{ display: 'block' }}>
        {label}
        <textarea className="ev-field" name={field.field_key} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ''} required={field.required} rows={3} />
      </label>
    )
  }
  if (field.field_type === 'select') {
    return (
      <label style={{ display: 'block' }}>
        {label}
        <select className="ev-field" name={field.field_key} value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
          <option value="">{field.placeholder || 'Choisir'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (field.field_type === 'radio') {
    return (
      <div>
        {label}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((o) => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#12314d', cursor: 'pointer' }}>
              <input type="radio" name={field.field_key} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} required={field.required} style={{ accentColor: '#4fabdb' }} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (field.field_type === 'checkbox') {
    const selected = value.split(',').filter(Boolean)
    return (
      <div>
        {label}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((o) => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#12314d', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.includes(o.value)} onChange={(e) => onCheckboxChange(o.value, e.target.checked)} style={{ accentColor: '#4fabdb' }} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    )
  }
  const type =
    field.field_type === 'email'
      ? 'email'
      : field.field_type === 'phone'
        ? 'tel'
        : field.field_type === 'number'
          ? 'number'
          : field.field_type === 'date'
            ? 'date'
            : 'text'
  return (
    <label style={{ display: 'block' }}>
      {label}
      <input
        className="ev-field"
        type={type}
        name={field.field_key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ''}
        required={field.required}
      />
    </label>
  )
}
