'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react'
import {
  CrmV2Body,
  CrmV2Button,
  CrmV2Field,
  CrmV2FormSection,
  CrmV2Header,
  CrmV2Input,
  CrmV2Page,
  CrmV2Select,
  CrmV2Textarea,
} from '@/components/crm-v2/primitives'
import {
  EvBanner,
  EvChoiceCard,
  EvIconButton,
  EvStepper,
} from '@/components/crm-v2/marketing2/events-list/EventsListParts'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
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

export default function NewEventWizardPage() {
  const router = useRouter()
  const search = useSearchParams()
  const isMobile = useIsMobile()
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
    <CrmV2Page style={{ paddingBottom: 32 }}>
      <CrmV2Header
        back={{ href: '/admin/crm/events', label: 'Événements' }}
        title="Nouvel événement"
        subtitle="Parcours en 3 étapes — le formulaire CRM type est créé automatiquement."
      />

      <CrmV2Body>
        <div style={{ maxWidth: 880, width: '100%', display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
          <EvStepper steps={STEPS} current={step} />

          {error && <EvBanner tone="danger">{error}</EvBanner>}

          {step === 0 && (
            <>
              <CrmV2FormSection
                title="Marque"
                description="La marque détermine les types d'événements disponibles et le dossier du formulaire."
                columns={1}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                    gap: 10,
                  }}
                >
                  {(['diploma', 'medibox', 'edumove'] as EventBrand[]).map((b) => (
                    <EvChoiceCard
                      key={b}
                      active={brand === b}
                      onClick={() => setBrand(b)}
                      title={BRAND_CONFIG[b].name}
                      description={brandEventTypes(b)
                        .map((t) => EVENT_TYPES[t].short)
                        .join(' · ')}
                    />
                  ))}
                </div>
              </CrmV2FormSection>

              <CrmV2FormSection title="Type d'événement" columns={1}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {types.map((t) => {
                    const cfg = EVENT_TYPES[t]
                    return (
                      <EvChoiceCard
                        key={t}
                        active={eventType === t}
                        onClick={() => setEventType(t)}
                        title={cfg.label}
                        description={cfg.desc}
                        note={!cfg.comms ? 'Aucun email / SMS à la publication' : undefined}
                      />
                    )
                  })}
                </div>
              </CrmV2FormSection>
            </>
          )}

          {step === 1 && (
            <CrmV2FormSection title="Infos événement" description={`${BRAND_CONFIG[brand].name} · ${typeCfg.label}`}>
              <CrmV2Field label="Nom de l'événement" span={2}>
                <CrmV2Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Ex: ${typeCfg.short} Printemps 2026`}
                />
              </CrmV2Field>
              <CrmV2Field label="Date">
                <CrmV2Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </CrmV2Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, minWidth: 0 }}>
                <CrmV2Field label="Début">
                  <CrmV2Input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
                </CrmV2Field>
                <CrmV2Field label="Fin">
                  <CrmV2Input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
                </CrmV2Field>
              </div>
              {isWebinar ? (
                <CrmV2Field label="Lien Zoom" span={2}>
                  <CrmV2Input
                    value={zoom}
                    onChange={(e) => setZoom(e.target.value)}
                    placeholder="https://zoom.us/j/…"
                  />
                </CrmV2Field>
              ) : useCampus ? (
                <CrmV2Field label="Campus" span={2}>
                  <CrmV2Select value={location} onChange={(e) => setLocation(e.target.value)}>
                    {DIPLOMA_CAMPUSES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </CrmV2Select>
                </CrmV2Field>
              ) : (
                <CrmV2Field label="Lieu" span={2}>
                  <CrmV2Input
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    placeholder={
                      eventType === 'salon'
                        ? "Ex: Salon de l'Étudiant, Porte de Versailles"
                        : 'Adresse complète'
                    }
                  />
                </CrmV2Field>
              )}
              <CrmV2Field label="Capacité (optionnel)">
                <CrmV2Input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Ex: 80"
                />
              </CrmV2Field>
              <CrmV2Field label="Statut initial">
                <CrmV2Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
                >
                  <option value="draft">Brouillon</option>
                  <option value="published">Publié</option>
                </CrmV2Select>
              </CrmV2Field>
              <CrmV2Field label="Description (optionnel)" span={2}>
                <CrmV2Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </CrmV2Field>
            </CrmV2FormSection>
          )}

          {step === 2 && (
            <CrmV2FormSection
              title="Formulaire type"
              description={`Créé automatiquement dans le dossier « ${BRAND_CONFIG[brand].folder} », lié à cet événement.`}
              columns={1}
            >
              <div style={{ display: 'grid', gap: 6 }}>
                {EVENT_FORM_TEMPLATE_FIELDS.map((f) => (
                  <div
                    key={f.field_key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 12px',
                      minHeight: 44,
                      boxSizing: 'border-box',
                      borderRadius: crmV2.radius,
                      border: `1px solid ${crmV2.border}`,
                      background: crmV2.bgSoft,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</span>
                      {f.required && <span style={{ color: crmV2.danger, marginLeft: 4 }}>*</span>}
                      <div style={{ fontSize: 11, color: crmV2.textFaint }}>
                        {f.field_type} → {f.crm_field}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: crmV2.textMuted,
                        background: crmV2.chipBg,
                        border: `1px solid ${crmV2.chipBorder}`,
                        borderRadius: 999,
                        padding: '2px 8px',
                        flexShrink: 0,
                      }}
                    >
                      Type
                    </span>
                  </div>
                ))}
                {extraFields.map((p) => (
                  <div
                    key={p.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 6px 6px 12px',
                      minHeight: 44,
                      boxSizing: 'border-box',
                      borderRadius: crmV2.radius,
                      border: `1px solid ${crmV2.goldBorder}`,
                      background: crmV2.goldSoft,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</span>
                      <div style={{ fontSize: 11, color: crmV2.textFaint }}>
                        {p.field_type} → {p.name}
                      </div>
                    </div>
                    <EvIconButton
                      title="Retirer"
                      onClick={() => setExtraFields((xs) => xs.filter((x) => x.name !== p.name))}
                      style={{ color: '#d13a41' }}
                    >
                      <Trash2 size={14} />
                    </EvIconButton>
                  </div>
                ))}
              </div>

              {!showPropPicker ? (
                <button
                  type="button"
                  onClick={() => setShowPropPicker(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    minHeight: 40,
                    padding: '8px 14px',
                    borderRadius: crmV2.radius,
                    border: `1.5px dashed ${crmV2.borderStrong}`,
                    background: 'transparent',
                    color: crmV2.link,
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} /> Ajouter une propriété CRM
                </button>
              ) : (
                <div
                  style={{
                    border: `1px solid ${crmV2.border}`,
                    borderRadius: crmV2.radiusLg,
                    padding: 12,
                    background: crmV2.bg,
                    boxShadow: crmV2.shadow,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Propriétés contacts</span>
                    <EvIconButton title="Fermer" onClick={() => setShowPropPicker(false)}>
                      <X size={15} />
                    </EvIconButton>
                  </div>
                  <CrmV2Input
                    style={{ marginBottom: 8 }}
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
                          minHeight: 40,
                          borderRadius: crmV2.radiusSm,
                          border: `1px solid ${crmV2.border}`,
                          background: crmV2.bg,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          color: crmV2.text,
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
            </CrmV2FormSection>
          )}

          {/* Pied de page aligné à droite : Retour, puis Continuer / Créer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2Button
              variant="secondary"
              icon={<ArrowLeft size={14} />}
              onClick={back}
              disabled={step === 0 || saving}
              style={isMobile ? { minHeight: 40 } : undefined}
            >
              Retour
            </CrmV2Button>
            {step < 2 ? (
              <CrmV2Button variant="primary" onClick={next} style={isMobile ? { minHeight: 40 } : undefined}>
                Continuer <ArrowRight size={14} />
              </CrmV2Button>
            ) : (
              <CrmV2Button
                variant="primary"
                onClick={submit}
                disabled={saving}
                style={isMobile ? { minHeight: 40 } : undefined}
              >
                {saving ? 'Création…' : 'Créer l’événement + formulaire'}
              </CrmV2Button>
            )}
          </div>
        </div>
      </CrmV2Body>
    </CrmV2Page>
  )
}
