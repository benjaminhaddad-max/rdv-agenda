'use client'

import { useEffect, useRef, useState } from 'react'

interface PublicField {
  field_type: string
  field_key: string
  label: string
  placeholder: string | null
  help_text: string | null
  default_value: string | null
  required: boolean
  options: Array<{ value: string; label: string }>
  validation: Record<string, unknown>
}

interface PublicForm {
  id: string
  slug: string
  title: string | null
  subtitle: string | null
  submit_label: string
  success_message: string | null
  redirect_url: string | null
  primary_color: string
  bg_color: string
  text_color: string
  // Style des champs de réponse (optionnel, fallback aux valeurs par défaut)
  field_border_color?: string | null
  field_border_width?: number | null
  field_border_radius?: number | null
  field_bg_color?: string | null
  honeypot_enabled: boolean
  fields: PublicField[]
}

export default function FormRenderer({ slug, embed }: { slug: string; embed: boolean }) {
  const [form, setForm] = useState<PublicForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [hp, setHp] = useState('') // honeypot
  const formRef = useRef<HTMLFormElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  // 1. Charge le formulaire
  useEffect(() => {
    fetch(`/api/forms/${slug}/public`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: PublicForm) => {
        setForm(data)
        // Initialise les valeurs par défaut + récupère les UTM depuis l'URL
        const initial: Record<string, string> = {}
        for (const f of data.fields) {
          if (f.default_value) initial[f.field_key] = f.default_value
        }
        // UTM auto
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          for (const f of data.fields) {
            const urlVal = params.get(f.field_key) || params.get('utm_' + f.field_key)
            if (urlVal) initial[f.field_key] = urlVal
          }
        }
        setValues(initial)
      })
      .catch(() => setError("Formulaire introuvable ou non publié"))
      .finally(() => setLoading(false))
  }, [slug])

  // 2. Auto-resize pour l'embed
  useEffect(() => {
    if (!embed) return
    const send = () => {
      const h = (formRef.current || successRef.current)?.scrollHeight || document.body.scrollHeight
      window.parent.postMessage({ type: 'diploma-form-resize', slug, height: h }, '*')
    }
    send()
    const obs = new ResizeObserver(send)
    const target = formRef.current || successRef.current
    if (target) obs.observe(target)
    return () => obs.disconnect()
  }, [embed, slug, form, success])

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  const handleCheckboxChange = (key: string, optValue: string, checked: boolean) => {
    const current = (values[key] || '').split(',').filter(Boolean)
    const next = checked ? [...current, optValue] : current.filter(v => v !== optValue)
    setValues(prev => ({ ...prev, [key]: next.join(',') }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const utm: Record<string, string> = {}
      const params = new URLSearchParams(window.location.search)
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        const v = params.get(k)
        if (v) utm[k] = v
      }

      const res = await fetch(`/api/forms/${slug}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data: values,
          hp,
          source_url: window.location.href,
          ...utm,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur inconnue')
        return
      }

      if (data.redirect_url) {
        window.location.href = data.redirect_url
        return
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────
  if (loading) {
    return <Wrapper embed={embed}><div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Chargement…</div></Wrapper>
  }
  if (error && !form) {
    return <Wrapper embed={embed}><div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>{error}</div></Wrapper>
  }
  if (!form) return null

  const primary = form.primary_color || '#ccac71'
  const bg = form.bg_color || '#ffffff'
  const text = form.text_color || '#1d2f4b'

  if (success) {
    return (
      <Wrapper embed={embed} bg={bg}>
        <div ref={successRef} style={{ textAlign: 'center', padding: '40px 20px', color: text }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 700 }}>Merci !</h2>
          <p style={{ margin: 0, fontSize: 15, opacity: 0.85 }}>
            {form.success_message || 'Votre message a bien été envoyé.'}
          </p>
        </div>
      </Wrapper>
    )
  }

  return (
    <Wrapper embed={embed} bg={bg}>
      <form ref={formRef} onSubmit={handleSubmit} style={{ padding: embed ? 16 : '40px 24px', maxWidth: 560, margin: '0 auto' }}>
        {form.title && <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: text }}>{form.title}</h2>}
        {form.subtitle && <p style={{ margin: '0 0 24px', fontSize: 15, color: text, opacity: 0.7 }}>{form.subtitle}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {form.fields.map(f => (
            <FieldRenderer
              key={f.field_key}
              field={f}
              value={values[f.field_key] || ''}
              onChange={v => handleChange(f.field_key, v)}
              onCheckboxChange={(o, c) => handleCheckboxChange(f.field_key, o, c)}
              text={text}
              primary={primary}
              hideLabel={embed}
              fieldStyle={{
                borderColor: form.field_border_color,
                borderWidth: form.field_border_width,
                borderRadius: form.field_border_radius,
                bgColor: form.field_bg_color,
              }}
            />
          ))}

          {/* Honeypot invisible */}
          {form.honeypot_enabled && (
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={e => setHp(e.target.value)}
              name="website"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
              aria-hidden="true"
            />
          )}
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ marginTop: 24, background: primary, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, fontSize: 15, cursor: submitting ? 'default' : 'pointer', width: '100%', opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Envoi…' : (form.submit_label || 'Envoyer')}
        </button>

        {!embed && (
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: text, opacity: 0.5 }}>
            Formulaire sécurisé • Vos données sont traitées par Diploma Santé
          </div>
        )}
      </form>
    </Wrapper>
  )
}

// ─── Wrapper qui change selon page standalone vs embed ────────────────────
function Wrapper({ children, embed, bg = '#ffffff' }: { children: React.ReactNode; embed: boolean; bg?: string }) {
  if (embed) {
    return (
      <div style={{ background: bg, fontFamily: 'Inter, system-ui, sans-serif', margin: 0, padding: 0 }}>
        {children}
      </div>
    )
  }
  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f7', fontFamily: 'Inter, system-ui, sans-serif', padding: '40px 20px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto', background: bg, borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Rendu d'un champ ────────────────────────────────────────────────────
function FieldRenderer({ field, value, onChange, onCheckboxChange, text, primary, hideLabel, fieldStyle }: {
  field: PublicField
  value: string
  onChange: (v: string) => void
  onCheckboxChange: (optValue: string, checked: boolean) => void
  text: string
  primary: string
  hideLabel?: boolean
  fieldStyle?: {
    borderColor?: string | null
    borderWidth?: number | null
    borderRadius?: number | null
    bgColor?: string | null
  }
}) {
  const labelColor = text
  const borderColor = fieldStyle?.borderColor || '#dddddd'
  const borderWidth = fieldStyle?.borderWidth ?? 1
  const borderRadius = fieldStyle?.borderRadius ?? 8
  const fieldBg = fieldStyle?.bgColor || '#ffffff'
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: `${borderWidth}px solid ${borderColor}`,
    borderRadius,
    fontSize: 14, color: '#222', background: fieldBg, fontFamily: 'inherit', boxSizing: 'border-box',
    outline: 'none',
  }

  if (field.field_type === 'hidden') {
    return <input type="hidden" name={field.field_key} value={value} />
  }

  // En mode embed, on utilise le label comme placeholder fallback pour garder la lisibilité
  const effectivePlaceholder = field.placeholder || (hideLabel ? field.label : '')

  return (
    <div>
      {!hideLabel && (
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: labelColor, marginBottom: 6 }}>
          {field.label}{field.required && <span style={{ color: '#ef4444' }}> *</span>}
        </label>
      )}

      {(() => {
        switch (field.field_type) {
          case 'textarea':
            return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={effectivePlaceholder} rows={4} required={field.required} style={{ ...inputStyle, resize: 'vertical' }} />
          case 'email':
            return <input type="email" value={value} onChange={e => onChange(e.target.value)} placeholder={effectivePlaceholder} required={field.required} style={inputStyle} />
          case 'phone':
            return <input type="tel" value={value} onChange={e => onChange(e.target.value)} placeholder={effectivePlaceholder} required={field.required} style={inputStyle} />
          case 'number':
            return <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={effectivePlaceholder} required={field.required} style={inputStyle} />
          case 'date':
            return <input type="date" value={value} onChange={e => onChange(e.target.value)} required={field.required} style={inputStyle} />
          case 'select':
            return (
              <select value={value} onChange={e => onChange(e.target.value)} required={field.required} style={inputStyle}>
                <option value="">{effectivePlaceholder || '— Choisir —'}</option>
                {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )
          case 'radio':
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {field.options.map(o => (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: labelColor, cursor: 'pointer' }}>
                    <input type="radio" name={field.field_key} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} required={field.required} style={{ accentColor: primary }} />
                    {o.label}
                  </label>
                ))}
              </div>
            )
          case 'checkbox':
            const selected = value.split(',').filter(Boolean)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {field.options.map(o => (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: labelColor, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.includes(o.value)} onChange={e => onCheckboxChange(o.value, e.target.checked)} style={{ accentColor: primary }} />
                    {o.label}
                  </label>
                ))}
              </div>
            )
          default:
            return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={effectivePlaceholder} required={field.required} style={inputStyle} />
        }
      })()}

      {field.help_text && <div style={{ fontSize: 12, color: labelColor, opacity: 0.6, marginTop: 4 }}>{field.help_text}</div>}
    </div>
  )
}
