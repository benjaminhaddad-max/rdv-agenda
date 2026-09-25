'use client'

import { useEffect, useRef, useState } from 'react'
import './salon-stand-form.css'
import type { EventLandingEvent } from '@/lib/event-landing/types'
import {
  SALON_STAND_DEFAULT_SUCCESS,
  SALON_STAND_PREPARATIONS_URL,
  SALON_STAND_PRIVACY_URL,
  SALON_STAND_RESET_MS,
  salonStandDates,
  splitSalonTitle,
} from '@/lib/event-landing/salon-stand'
import type { PublicField, PublicForm } from '@/lib/public-forms'
import { buildPublicFormValues, submitPublicForm } from '@/lib/public-form-client'

/** Prénom / Nom puis Email / Téléphone sur une ligne (ordinateur), comme le template. */
const PAIR_GROUPS = [
  ['firstname', 'lastname'],
  ['email', 'phone'],
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

function initialValues(fields: PublicField[]): Record<string, string> {
  const initial: Record<string, string> = {}
  for (const f of fields) {
    if (f.default_value) initial[f.field_key] = f.default_value
  }
  return initial
}

export default function SalonStandForm({
  slug,
  form: initialForm,
  event,
  dateEnd,
}: {
  slug: string
  form: PublicForm
  event: EventLandingEvent
  dateEnd: string | null
}) {
  const [form, setForm] = useState<PublicForm>(initialForm)
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(initialForm.fields))
  const [hp, setHp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rafraîchit champs / libellés modifiés dans le CRM + valeurs passées en URL.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/forms/${encodeURIComponent(slug)}/public`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: PublicForm) => {
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

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    },
    [],
  )

  const title = splitSalonTitle(event.name)
  const dates = salonStandDates(event.event_date, dateEnd)
  const visible = form.fields.filter((f) => f.field_type !== 'hidden')
  const hiddenFields = form.fields.filter((f) => f.field_type === 'hidden')

  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))
  const toggleCheckbox = (key: string, optValue: string, checked: boolean) => {
    const current = (values[key] || '').split(',').filter(Boolean)
    const next = checked ? [...current, optValue] : current.filter((v) => v !== optValue)
    setValue(key, next.join(','))
  }

  const resetForStand = () => {
    setValues(initialValues(form.fields))
    setError(null)
    setSuccess(false)
    window.scrollTo({ top: 0 })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const el = formRef.current
    if (el && !el.checkValidity()) {
      el.reportValidity()
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const data = await submitPublicForm(slug, values, { hp })
      if (!data.ok) {
        setError(data.error)
        return
      }
      setSuccess(true)
      window.scrollTo({ top: 0 })
      // Tablette du stand : retour au formulaire vierge pour le visiteur suivant.
      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(resetForStand, SALON_STAND_RESET_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  const pillText = `${title.accent} · ${dates.pill}`
  const longTitle = title.accent.length > 22

  return (
    <div className="salon-stand">
      <img className="ss-wm" src="/event-landing/serpent-blanc.svg" alt="" aria-hidden="true" />

      <header className="ss-mhead">
        <img src="/event-landing/logo-diploma-blanc.svg" alt="Diploma Santé" />
        <div className="ss-mdate">
          <b>{dates.badgeDay}</b>
          <span>{dates.badgeMonth}</span>
        </div>
        <div className={`ss-mtitle${longTitle ? ' ss-mtitle--long' : ''}`}>
          {title.prefix ? <>{title.prefix} </> : null}
          <em>{title.accent}</em>
        </div>
        <div className="ss-msub">Stand Diploma Santé</div>
      </header>

      <main className="ss-card" data-form-id={form.id} data-form-slug={form.slug}>
        <div className="ss-top">
          <img src="/event-landing/logo-diploma-bleu.svg" alt="Diploma Santé" />
          <span className="ss-pill" title={pillText}>
            {pillText}
          </span>
        </div>

        {success ? (
          <div className="ss-ok" role="status">
            <div className="ss-ic">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4fabdb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2>Merci, c’est noté</h2>
            <p>{form.success_message || SALON_STAND_DEFAULT_SUCCESS}</p>
            <a href={SALON_STAND_PREPARATIONS_URL}>Nos préparations</a>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} noValidate>
            {hiddenFields.map((f) => (
              <input key={f.field_key} type="hidden" name={f.field_key} value={values[f.field_key] || ''} />
            ))}

            {layoutFields(visible).map((item) => {
              if (Array.isArray(item)) {
                return (
                  <div key={item[0].field_key + item[1].field_key} className="ss-row">
                    <Field field={item[0]} value={values[item[0].field_key] || ''} onChange={(v) => setValue(item[0].field_key, v)} onToggle={(o, c) => toggleCheckbox(item[0].field_key, o, c)} />
                    <Field field={item[1]} value={values[item[1].field_key] || ''} onChange={(v) => setValue(item[1].field_key, v)} onToggle={(o, c) => toggleCheckbox(item[1].field_key, o, c)} />
                  </div>
                )
              }
              return (
                <Field key={item.field_key} field={item} value={values[item.field_key] || ''} onChange={(v) => setValue(item.field_key, v)} onToggle={(o, c) => toggleCheckbox(item.field_key, o, c)} />
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

            {error && <div className="ss-error">{error}</div>}

            <button type="submit" className="ss-submit" disabled={submitting}>
              {submitting ? 'Envoi…' : form.submit_label && form.submit_label !== 'Envoyer' ? form.submit_label : 'Soumettre'}
            </button>
            <p className="ss-rgpd">
              En soumettant ce formulaire, vous acceptez d’être recontacté(e) par Diploma Santé au sujet de ses
              préparations.{' '}
              <a href={SALON_STAND_PRIVACY_URL} target="_blank" rel="noreferrer">
                Politique de confidentialité
              </a>
            </p>
            <p className="ss-foot">
              Stand Diploma Santé · {title.prefix ? `${title.prefix} ` : ''}
              {title.accent} {dates.duPhrase}
            </p>
          </form>
        )}
      </main>
    </div>
  )
}

function Field({
  field,
  value,
  onChange,
  onToggle,
}: {
  field: PublicField
  value: string
  onChange: (v: string) => void
  onToggle: (optValue: string, checked: boolean) => void
}) {
  const label = (
    <span className="ss-lbl">
      {field.label}
      {field.required ? <b> *</b> : null}
    </span>
  )
  const options = field.options || []

  if (field.field_type === 'select') {
    return (
      <label className="ss-field">
        {label}
        <select className="ss-input" name={field.field_key} value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
          <option value="">{field.placeholder || 'Sélectionnez'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (field.field_type === 'radio' || field.field_type === 'checkbox') {
    const isRadio = field.field_type === 'radio'
    const selected = isRadio ? [value] : value.split(',').filter(Boolean)
    return (
      <div className="ss-field" role={isRadio ? 'radiogroup' : 'group'} aria-label={field.label}>
        {label}
        <div className="ss-chips">
          {options.map((o, i) => (
            <label key={o.value}>
              <input
                type={isRadio ? 'radio' : 'checkbox'}
                name={field.field_key}
                value={o.value}
                checked={selected.includes(o.value)}
                onChange={(e) => (isRadio ? onChange(o.value) : onToggle(o.value, e.target.checked))}
                required={isRadio && field.required && i === 0 ? true : undefined}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (field.field_type === 'textarea') {
    return (
      <label className="ss-field">
        {label}
        <textarea className="ss-input" name={field.field_key} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ''} required={field.required} rows={3} />
      </label>
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
  const autoComplete =
    field.field_key === 'firstname'
      ? 'given-name'
      : field.field_key === 'lastname'
        ? 'family-name'
        : type === 'email'
          ? 'email'
          : type === 'tel'
            ? 'tel'
            : undefined
  return (
    <label className="ss-field">
      {label}
      <input
        className="ss-input"
        type={type}
        inputMode={type === 'tel' ? 'tel' : type === 'email' ? 'email' : undefined}
        name={field.field_key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || (type === 'tel' ? '06 12 34 56 78' : '')}
        required={field.required}
        autoComplete={autoComplete}
      />
    </label>
  )
}
