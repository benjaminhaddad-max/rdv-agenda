'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, X } from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  BRAND_CONFIG,
  DIPLOMA_CAMPUSES,
  EVENT_TYPES,
  brandEventTypes,
  type EventBrand,
  type EventTypeId,
} from '@/lib/events-studio/config'
import { EVENT_FORM_TEMPLATE_FIELDS } from '@/lib/events-studio/form-template'

type CrmProp = {
  name: string
  label: string
  group_name: string | null
  field_type: string
  type: string
}

const STEPS = ['Marque & type', 'Infos événement', 'Formulaire CRM']

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: crmV2.radius,
  border: `1px solid ${crmV2.borderStrong}`,
  background: crmV2.bg,
  color: crmV2.text,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: crmV2.textMuted,
  marginBottom: 6,
}

export default function NewEventWizardPage() {
  const router = useRouter()
  const search = useSearchParams()
  const initialBrand = (search.get('brand') as EventBrand) || 'diploma'

  const [step, setStep] = useState(0)
  const [brand, setBrand] = useState<EventBrand>(
    ['diploma', 'medibox', 'edumove'].includes(initialBrand) ? initialBrand : 'diploma',
  )
  const [eventType, setEventType] = useState<EventTypeId>('jpo')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [timeStart, setTimeStart] = useState('14:00')
  const [timeEnd, setTimeEnd] = useState('17:00')
  const [location, setLocation] = useState(DIPLOMA_CAMPUSES[0].value)
  const [locationText, setLocationText] = useState('')
  const [zoom, setZoom] = useState('')
  const [capacity, setCapacity] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [extraFields, setExtraFields] = useState<CrmProp[]>([])
  const [properties, setProperties] = useState<CrmProp[]>([])
  const [propSearch, setPropSearch] = useState('')
  const [showPropPicker, setShowPropPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const types = useMemo(() => brandEventTypes(brand), [brand])
  const typeCfg = EVENT_TYPES[eventType]
  const isWebinar = eventType === 'webinaire'
  const useCampus = brand === 'diploma' && !isWebinar && eventType !== 'salon'

  useEffect(() => {
    if (!types.includes(eventType)) setEventType(types[0])
  }, [types, eventType])

  useEffect(() => {
    if (brand === 'edumove' && BRAND_CONFIG.edumove.defaultZoom) {
      setZoom((z) => z || BRAND_CONFIG.edumove.defaultZoom!)
    }
  }, [brand])

  useEffect(() => {
    fetch('/api/crm/properties?object=contacts&limit=2000')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.properties) setProperties(j.properties as CrmProp[])
      })
      .catch(() => {})
  }, [])

  const filteredProps = useMemo(() => {
    const used = new Set([
      ...EVENT_FORM_TEMPLATE_FIELDS.map((f) => f.crm_field),
      ...extraFields.map((f) => f.name),
    ])
    const q = propSearch.trim().toLowerCase()
    return properties
      .filter((p) => !used.has(p.name))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
      .slice(0, 40)
  }, [properties, extraFields, propSearch])

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!brand || !eventType) return 'Choisissez une marque et un type'
    }
    if (s === 1) {
      if (!name.trim()) return 'Nom obligatoire'
      if (!date) return 'Date obligatoire'
      if (!timeStart || !timeEnd) return 'Horaires obligatoires'
      if (isWebinar) {
        if (!(zoom.trim() || BRAND_CONFIG[brand].defaultZoom)) return 'Lien Zoom obligatoire'
      } else if (useCampus) {
        if (!location) return 'Campus obligatoire'
      } else if (!locationText.trim()) {
        return 'Lieu obligatoire'
      }
    }
    return null
  }

  function next() {
    const err = validateStep(step)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setStep((x) => Math.min(2, x + 1))
  }

  function back() {
    setError(null)
    setStep((x) => Math.max(0, x - 1))
  }

  async function submit() {
    const err = validateStep(1)
    if (err) {
      setError(err)
      setStep(1)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const loc = isWebinar ? 'Visioconference' : useCampus ? location : locationText.trim()

      const res = await fetch('/api/events-studio/events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          event_type: eventType,
          name: name.trim(),
          date,
          time_start: timeStart,
          time_end: timeEnd,
          location: loc,
          zoom_join_url: isWebinar ? zoom.trim() || BRAND_CONFIG[brand].defaultZoom : null,
          max_capacity: capacity || null,
          description: description.trim() || null,
          status,
          extra_crm_fields: extraFields.map((f) => f.name),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Création échouée')
      router.push(`/admin/crm/events/${data.event.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft }}>
      <MarketingNav title="Nouvel événement" />
      <CrmV2Page style={{ padding: '20px 28px 48px', maxWidth: 820, margin: '0 auto' }}>
        <Link
          href="/admin/crm/events"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: crmV2.link,
            textDecoration: 'none',
            marginBottom: 14,
          }}
        >
          <ArrowLeft size={14} /> Retour à la liste
        </Link>

        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 600 }}>Nouvel événement</h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: crmV2.textMuted }}>
          Parcours en 3 étapes — le formulaire CRM type est créé automatiquement.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {STEPS.map((label, i) => {
            const active = i === step
            const done = i < step
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: crmV2.radiusPill,
                  background: active ? crmV2.text : done ? crmV2.goldSoft : crmV2.bg,
                  border: `1px solid ${active ? crmV2.text : done ? crmV2.goldBorder : crmV2.border}`,
                  color: active ? '#fff' : crmV2.text,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? 'rgba(255,255,255,0.2)' : done ? crmV2.gold : crmV2.bgMuted,
                    fontSize: 11,
                  }}
                >
                  {done ? <Check size={12} /> : i + 1}
                </span>
                {label}
              </div>
            )
          })}
        </div>

        {error && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: crmV2.radius,
              background: crmV2.dangerSoft,
              color: crmV2.danger,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <CrmV2Card style={{ padding: 22 }}>
          {step === 0 && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div>
                <div style={labelStyle}>Marque</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {(['diploma', 'medibox', 'edumove'] as EventBrand[]).map((b) => {
                    const active = brand === b
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBrand(b)}
                        style={{
                          padding: 14,
                          borderRadius: crmV2.radiusLg,
                          border: `2px solid ${active ? crmV2.gold : crmV2.border}`,
                          background: active ? crmV2.goldSoft : crmV2.bg,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14, color: crmV2.text }}>{BRAND_CONFIG[b].name}</div>
                        <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 4 }}>
                          {brandEventTypes(b)
                            .map((t) => EVENT_TYPES[t].short)
                            .join(' · ')}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Type d&apos;événement</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {types.map((t) => {
                    const cfg = EVENT_TYPES[t]
                    const active = eventType === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEventType(t)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: crmV2.radius,
                          border: `1px solid ${active ? crmV2.gold : crmV2.borderStrong}`,
                          background: active ? crmV2.goldSoft : crmV2.bg,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{cfg.label}</div>
                        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>{cfg.desc}</div>
                        {!cfg.comms && (
                          <div style={{ fontSize: 11, color: crmV2.gold, marginTop: 4, fontWeight: 600 }}>
                            Aucun email / SMS à la publication
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nom de l&apos;événement</label>
                <input
                  style={inputStyle}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Ex: ${typeCfg.short} Printemps 2026`}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Début</label>
                  <input type="time" style={inputStyle} value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Fin</label>
                  <input type="time" style={inputStyle} value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
                </div>
              </div>
              {isWebinar ? (
                <div>
                  <label style={labelStyle}>Lien Zoom</label>
                  <input
                    style={inputStyle}
                    value={zoom}
                    onChange={(e) => setZoom(e.target.value)}
                    placeholder="https://zoom.us/j/…"
                  />
                </div>
              ) : useCampus ? (
                <div>
                  <label style={labelStyle}>Campus</label>
                  <select style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)}>
                    {DIPLOMA_CAMPUSES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Lieu</label>
                  <input
                    style={inputStyle}
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    placeholder={
                      eventType === 'salon'
                        ? "Ex: Salon de l'Étudiant, Porte de Versailles"
                        : 'Adresse complète'
                    }
                  />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Capacité (optionnel)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="Ex: 80"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Statut initial</label>
                  <select
                    style={inputStyle}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
                  >
                    <option value="draft">Brouillon</option>
                    <option value="published">Publié</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Description (optionnel)</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Formulaire type</div>
                <p style={{ margin: 0, fontSize: 12, color: crmV2.textMuted }}>
                  Créé automatiquement dans le dossier « {BRAND_CONFIG[brand].folder} », lié à cet événement.
                </p>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {EVENT_FORM_TEMPLATE_FIELDS.map((f) => (
                  <div
                    key={f.field_key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: crmV2.radius,
                      border: `1px solid ${crmV2.border}`,
                      background: crmV2.bgSoft,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</span>
                      {f.required && <span style={{ color: crmV2.danger, marginLeft: 4 }}>*</span>}
                      <div style={{ fontSize: 11, color: crmV2.textFaint }}>
                        {f.field_type} → {f.crm_field}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: crmV2.textMuted }}>Type</span>
                  </div>
                ))}
                {extraFields.map((p) => (
                  <div
                    key={p.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: crmV2.radius,
                      border: `1px solid ${crmV2.goldBorder}`,
                      background: crmV2.goldSoft,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</span>
                      <div style={{ fontSize: 11, color: crmV2.textFaint }}>
                        {p.field_type} → {p.name}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExtraFields((xs) => xs.filter((x) => x.name !== p.name))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: crmV2.danger }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {!showPropPicker ? (
                <CrmV2Button variant="secondary" onClick={() => setShowPropPicker(true)}>
                  <Plus size={14} /> Ajouter une propriété CRM
                </CrmV2Button>
              ) : (
                <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Propriétés contacts</span>
                    <button
                      type="button"
                      onClick={() => setShowPropPicker(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <X size={16} color={crmV2.textMuted} />
                    </button>
                  </div>
                  <input
                    style={{ ...inputStyle, marginBottom: 8 }}
                    placeholder="Rechercher…"
                    value={propSearch}
                    onChange={(e) => setPropSearch(e.target.value)}
                  />
                  <div style={{ maxHeight: 220, overflow: 'auto', display: 'grid', gap: 4 }}>
                    {filteredProps.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setExtraFields((xs) => [...xs, p])
                          setShowPropPicker(false)
                          setPropSearch('')
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: crmV2.radiusSm,
                          border: `1px solid ${crmV2.border}`,
                          background: crmV2.bg,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                        <div style={{ fontSize: 11, color: crmV2.textFaint }}>{p.name}</div>
                      </button>
                    ))}
                    {filteredProps.length === 0 && (
                      <div style={{ fontSize: 12, color: crmV2.textMuted, padding: 8 }}>Aucune propriété</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CrmV2Card>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <CrmV2Button variant="secondary" onClick={back} disabled={step === 0 || saving}>
            <ArrowLeft size={14} /> Retour
          </CrmV2Button>
          {step < 2 ? (
            <CrmV2Button variant="primary" onClick={next}>
              Continuer <ArrowRight size={14} />
            </CrmV2Button>
          ) : (
            <CrmV2Button variant="gold" onClick={submit} disabled={saving}>
              {saving ? 'Création…' : 'Créer l’événement + formulaire'}
            </CrmV2Button>
          )}
        </div>
      </CrmV2Page>
    </div>
  )
}
