'use client'

/**
 * BookingRenderer — wizard de prise de rendez-vous façon Calendly pour les
 * formulaires de type `form_type='booking'`.
 *
 * Étapes :
 *   1. Calendrier mensuel : sélection de la date (jours dispos en bleu)
 *   2. Slots horaires : créneaux libres du jour sélectionné
 *   3. Coordonnées : tous les champs `form_fields` + radio "Lieu" (visio/présentiel)
 *   4. Succès : récap du RDV avec lien visio si applicable
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, addDays, addMonths, startOfMonth, endOfMonth, isSameMonth, isSameDay, isBefore, startOfDay, isAfter } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MapPin, Video, Phone as PhoneIcon, Clock, Globe, Check } from 'lucide-react'
import type { PublicField, PublicForm } from '@/lib/public-forms'

type Step = 'date' | 'form' | 'success'
type Slot = { start: string; end: string }
type MeetingType = 'visio' | 'presentiel' | 'telephone'

interface BookingMeta {
  duration_minutes: number
  horizon_days: number
  meeting_types: MeetingType[]
  default_meeting_type: MeetingType | null
  location_label: string | null
}

const MEETING_META: Record<MeetingType, { label: string; Icon: typeof Video; description: (loc: string | null) => string }> = {
  visio:      { label: 'Visioconférence', Icon: Video,     description: () => 'Lien envoyé par e-mail' },
  presentiel: { label: 'Présentiel',      Icon: MapPin,    description: (loc) => loc || 'Dans nos locaux' },
  telephone:  { label: 'Téléphone',       Icon: PhoneIcon, description: () => 'Nous vous rappelons' },
}

export default function BookingRenderer({
  slug,
  embed,
  initialForm,
}: {
  slug: string
  embed: boolean
  initialForm: PublicForm
}) {
  const form = initialForm
  const primary = form.primary_color || '#1d2f4b'
  const accent = '#C9A84C'

  // ── Étape courante ──────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('date')

  // ── Calendrier ──────────────────────────────────────────────────────────
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [meta, setMeta] = useState<BookingMeta>({
    duration_minutes: form.booking_duration_minutes || 30,
    horizon_days: form.booking_horizon_days || 30,
    meeting_types: ((form.booking_meeting_types || ['visio', 'presentiel']) as string[]).filter((m): m is MeetingType => m === 'visio' || m === 'presentiel' || m === 'telephone'),
    default_meeting_type: (form.booking_default_meeting_type as MeetingType | null) || null,
    location_label: form.booking_location_label || '100 quai de la rapée, 75012 Paris',
  })
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [meetingType, setMeetingType] = useState<MeetingType | null>(meta.default_meeting_type || (meta.meeting_types[0] || null))

  // ── Formulaire ──────────────────────────────────────────────────────────
  // On exclut le champ "lieu" s'il existe en field_key (radio des meeting_types)
  // car on a une UI dédiée pour ça.
  const fields = useMemo(() => (form.fields || []).filter(f =>
    f.field_key !== 'lieu' && f.field_key !== 'location' && f.field_key !== 'meeting_type',
  ), [form.fields])

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) if (f.default_value) init[f.field_key] = f.default_value
    if (typeof window !== 'undefined') {
      const qs = new URLSearchParams(window.location.search)
      for (const f of fields) {
        const v = qs.get(f.field_key) || qs.get('utm_' + f.field_key)
        if (v) init[f.field_key] = v
      }
    }
    return init
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successPayload, setSuccessPayload] = useState<{
    start_at: string
    end_at: string
    meeting_type: MeetingType
    meeting_link: string | null
    location_label: string | null
  } | null>(null)

  // Auto-resize pour embed iframe
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!embed) return
    const send = () => {
      const h = rootRef.current?.scrollHeight || document.body.scrollHeight
      window.parent.postMessage({ type: 'diploma-form-resize', slug, height: h }, '*')
    }
    send()
    const obs = new ResizeObserver(send)
    if (rootRef.current) obs.observe(rootRef.current)
    return () => obs.disconnect()
  }, [embed, slug, step, slotsLoading, slots.length, successPayload])

  // ── Helpers ─────────────────────────────────────────────────────────────
  const todayStart = startOfDay(new Date())
  const horizonEnd = useMemo(() => addDays(todayStart, meta.horizon_days), [todayStart, meta.horizon_days])

  // Charge les slots d'un jour donné
  const loadSlotsFor = async (date: Date) => {
    setSelectedDate(date)
    setSlotsLoading(true)
    setSlots([])
    setSelectedSlot(null)
    try {
      const iso = format(date, 'yyyy-MM-dd')
      const res = await fetch(`/api/forms/${slug}/booking/slots?date=${iso}`)
      if (!res.ok) {
        setSlots([])
        return
      }
      const data = await res.json()
      setMeta({
        duration_minutes: data.duration_minutes || meta.duration_minutes,
        horizon_days: data.horizon_days || meta.horizon_days,
        meeting_types: (Array.isArray(data.meeting_types) && data.meeting_types.length > 0 ? data.meeting_types : meta.meeting_types) as MeetingType[],
        default_meeting_type: (data.default_meeting_type as MeetingType | null) || meta.default_meeting_type,
        location_label: data.location_label || meta.location_label,
      })
      setSlots(Array.isArray(data.slots) ? data.slots : [])
      if (!meetingType) {
        const dmt = (data.default_meeting_type as MeetingType | null) || (data.meeting_types?.[0] as MeetingType | null) || null
        setMeetingType(dmt)
      }
    } catch {
      setSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }

  // Pré-charge un mois de disponibilités pour mettre en évidence les jours dispos
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set())
  const [, /* monthLoading */ setMonthLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      setMonthLoading(true)
      try {
        const start = startOfMonth(viewMonth)
        const end = endOfMonth(viewMonth)
        // Limite : aujourd'hui et horizon
        const from = isBefore(start, todayStart) ? todayStart : start
        const to = isAfter(end, horizonEnd) ? horizonEnd : end
        const days: Date[] = []
        const cur = new Date(from)
        while (cur <= to) {
          const dow = cur.getDay() // skip dimanche=0 (le calendrier interne montre les rdv en semaine + samedi)
          if (dow !== 0) days.push(new Date(cur))
          cur.setDate(cur.getDate() + 1)
        }
        // Requêtes parallèles légères : on s'arrête au 1er créneau trouvé pour chaque jour
        const results = await Promise.all(days.map(async d => {
          const iso = format(d, 'yyyy-MM-dd')
          try {
            const r = await fetch(`/api/forms/${slug}/booking/slots?date=${iso}`)
            if (!r.ok) return [iso, false] as const
            const j = await r.json()
            return [iso, Array.isArray(j.slots) && j.slots.length > 0] as const
          } catch {
            return [iso, false] as const
          }
        }))
        if (cancelled) return
        const set = new Set<string>()
        for (const [iso, ok] of results) if (ok) set.add(iso)
        setAvailableDays(set)
      } finally {
        if (!cancelled) setMonthLoading(false)
      }
    }
    probe()
    return () => { cancelled = true }
  }, [viewMonth, slug, todayStart.getTime(), horizonEnd.getTime()])

  // ── Soumission ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot || !meetingType) {
      setError('Choisissez un créneau et un format de rendez-vous.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const utm: Record<string, string> = {}
      const qs = new URLSearchParams(window.location.search)
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        const v = qs.get(k)
        if (v) utm[k] = v
      }
      const res = await fetch(`/api/forms/${slug}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data: values,
          source_url: window.location.href,
          booking: {
            start: selectedSlot.start,
            end: selectedSlot.end,
            meeting_type: meetingType,
          },
          ...utm,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Une erreur est survenue.')
        // Si le créneau n'est plus dispo, retourner à l'étape date
        if (res.status === 409) {
          setSelectedSlot(null)
          if (selectedDate) loadSlotsFor(selectedDate)
        }
        return
      }
      const bookingResp = json.booking || null
      setSuccessPayload({
        start_at: bookingResp?.start_at || selectedSlot.start,
        end_at: bookingResp?.end_at || selectedSlot.end,
        meeting_type: (bookingResp?.meeting_type || meetingType) as MeetingType,
        meeting_link: bookingResp?.meeting_link || null,
        location_label: bookingResp?.location_label || meta.location_label,
      })
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Rendu ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={rootRef}
      style={{
        background: '#ffffff',
        color: '#1d2f4b',
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: embed ? 'auto' : '100vh',
        padding: embed ? 0 : '24px 16px',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto', background: '#fff', borderRadius: embed ? 0 : 14, boxShadow: embed ? 'none' : '0 4px 32px rgba(29,47,75,0.08)', overflow: 'hidden', border: embed ? 'none' : '1px solid #e6edf5' }}>
        {step === 'success' && successPayload ? (
          <SuccessPanel
            payload={successPayload}
            formTitle={form.title || 'Rendez-vous confirmé'}
            successMessage={form.success_message || 'Votre rendez-vous est confirmé. Vous allez recevoir un email et un SMS récapitulatif.'}
            primary={primary}
            accent={accent}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', minHeight: embed ? 'auto' : 560 }}>
            {/* ── Sidebar (description du RDV) ── */}
            <div style={{ background: '#f7fafc', padding: 24, borderRight: '1px solid #e6edf5' }}>
              {form.title && (
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>
                  Admissions
                </div>
              )}
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: primary, lineHeight: 1.2 }}>
                {form.title || 'Rendez-vous'}
              </h1>
              {form.subtitle && (
                <p style={{ marginTop: 10, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                  {form.subtitle}
                </p>
              )}

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={14} style={{ color: primary }} />
                  <span>{meta.duration_minutes} min</span>
                </div>
                {meta.meeting_types.includes('presentiel') && meta.location_label && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <MapPin size={14} style={{ color: primary, marginTop: 2 }} />
                    <span>{meta.location_label}</span>
                  </div>
                )}
                {meta.meeting_types.includes('visio') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Video size={14} style={{ color: primary }} />
                    <span>Visioconférence (lien envoyé par email)</span>
                  </div>
                )}
              </div>

              {step === 'form' && selectedSlot && (
                <div style={{ marginTop: 24, background: `${accent}10`, border: `1px solid ${accent}40`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Créneau sélectionné
                  </div>
                  <div style={{ fontSize: 13, color: primary, fontWeight: 700 }}>
                    {format(new Date(selectedSlot.start), "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Étape Date ── */}
            {step === 'date' && (
              <DateStep
                viewMonth={viewMonth}
                setViewMonth={setViewMonth}
                todayStart={todayStart}
                horizonEnd={horizonEnd}
                availableDays={availableDays}
                selectedDate={selectedDate}
                loadSlotsFor={loadSlotsFor}
                slots={slots}
                slotsLoading={slotsLoading}
                onPickSlot={(s) => { setSelectedSlot(s); setStep('form') }}
                primary={primary}
                accent={accent}
              />
            )}

            {/* ── Étape Formulaire ── */}
            {step === 'form' && selectedSlot && (
              <FormStep
                fields={fields}
                values={values}
                setValues={setValues}
                meeting_types={meta.meeting_types}
                meeting_type={meetingType}
                setMeetingType={setMeetingType}
                location_label={meta.location_label}
                submitLabel={form.submit_label || 'Confirmer le rendez-vous'}
                submitting={submitting}
                error={error}
                onBack={() => setStep('date')}
                onSubmit={handleSubmit}
                primary={primary}
                accent={accent}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Étape Date (calendrier mensuel + slots) ─────────────────────────────
function DateStep({
  viewMonth, setViewMonth, todayStart, horizonEnd, availableDays,
  selectedDate, loadSlotsFor, slots, slotsLoading, onPickSlot,
  primary, accent,
}: {
  viewMonth: Date
  setViewMonth: (d: Date) => void
  todayStart: Date
  horizonEnd: Date
  availableDays: Set<string>
  selectedDate: Date | null
  loadSlotsFor: (d: Date) => void
  slots: Slot[]
  slotsLoading: boolean
  onPickSlot: (s: Slot) => void
  primary: string
  accent: string
}) {
  // Construit la grille du mois courant (semaine commence lundi)
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const firstDow = (monthStart.getDay() + 6) % 7 // lun=0
  const cells: Array<Date | null> = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) cells.push(new Date(d))
  while (cells.length % 7 !== 0) cells.push(null)

  const canGoPrev = !isBefore(addMonths(monthStart, -1), startOfMonth(todayStart))
  const canGoNext = !isAfter(addMonths(monthStart, 1), startOfMonth(horizonEnd))

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: selectedDate ? '1fr 220px' : '1fr', gap: 24, alignItems: 'start' }}>
      {/* Calendrier */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: primary, marginBottom: 12 }}>
          Sélectionnez la date et l&apos;heure
        </div>

        {/* Header mois + nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button
            disabled={!canGoPrev}
            onClick={() => canGoPrev && setViewMonth(addMonths(viewMonth, -1))}
            style={{
              background: 'transparent', border: '1px solid #e2ecf5', borderRadius: 8,
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: canGoPrev ? 'pointer' : 'not-allowed', color: canGoPrev ? primary : '#cbd5e1',
            }}
            aria-label="Mois précédent"
          >
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: primary, textTransform: 'capitalize' }}>
            {format(viewMonth, 'MMMM yyyy', { locale: fr })}
          </div>
          <button
            disabled={!canGoNext}
            onClick={() => canGoNext && setViewMonth(addMonths(viewMonth, 1))}
            style={{
              background: 'transparent', border: '1px solid #e2ecf5', borderRadius: 8,
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: canGoNext ? 'pointer' : 'not-allowed', color: canGoNext ? primary : '#cbd5e1',
            }}
            aria-label="Mois suivant"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* En-têtes jours */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{d}</div>
          ))}
        </div>

        {/* Cellules */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const iso = format(d, 'yyyy-MM-dd')
            const isPast = isBefore(d, todayStart)
            const isFuture = isAfter(d, horizonEnd)
            const inMonth = isSameMonth(d, viewMonth)
            const isAvail = availableDays.has(iso)
            const isSel = selectedDate && isSameDay(d, selectedDate)
            const disabled = isPast || isFuture || !inMonth || !isAvail
            return (
              <button
                key={i}
                onClick={() => !disabled && loadSlotsFor(d)}
                disabled={disabled}
                style={{
                  height: 40, borderRadius: 999,
                  border: isSel ? `2px solid ${primary}` : 'none',
                  background: isSel ? primary : isAvail ? '#eaf3fc' : 'transparent',
                  color: isSel ? '#ffffff' : isAvail ? primary : '#cbd5e1',
                  fontSize: 14, fontWeight: isAvail || isSel ? 600 : 400,
                  cursor: disabled ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                }}
              >
                {format(d, 'd')}
              </button>
            )
          })}
        </div>

        {/* Fuseau horaire */}
        <div style={{ marginTop: 18, fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe size={12} />
          Heure d&apos;Europe centrale ({format(new Date(), 'HH:mm')})
        </div>
      </div>

      {/* Colonne créneaux du jour sélectionné */}
      {selectedDate && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: primary, marginBottom: 10, textTransform: 'capitalize' }}>
            {format(selectedDate, 'EEEE, d MMMM', { locale: fr })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
            {slotsLoading ? (
              <div style={{ fontSize: 12, color: '#94a3b8', padding: '20px 0', textAlign: 'center' }}>Chargement…</div>
            ) : slots.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', padding: '20px 0', textAlign: 'center' }}>
                Aucun créneau ce jour.
              </div>
            ) : slots.map(s => (
              <button
                key={s.start}
                onClick={() => onPickSlot(s)}
                style={{
                  background: '#fff', border: `1.5px solid ${primary}40`, color: primary,
                  borderRadius: 8, padding: '12px 16px', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, fontFamily: 'inherit', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = primary; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = primary }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = primary; e.currentTarget.style.borderColor = `${primary}40` }}
              >
                {format(new Date(s.start), 'HH:mm')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Étape Formulaire ─────────────────────────────────────────────────────
function FormStep({
  fields, values, setValues, meeting_types, meeting_type, setMeetingType, location_label,
  submitLabel, submitting, error, onBack, onSubmit, primary, accent,
}: {
  fields: PublicField[]
  values: Record<string, string>
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  meeting_types: MeetingType[]
  meeting_type: MeetingType | null
  setMeetingType: (t: MeetingType) => void
  location_label: string | null
  submitLabel: string
  submitting: boolean
  error: string | null
  onBack: () => void
  onSubmit: (e: React.FormEvent) => void
  primary: string
  accent: string
}) {
  const setField = (key: string, value: string) => setValues(prev => ({ ...prev, [key]: value }))

  return (
    <form onSubmit={onSubmit} style={{ padding: 24 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b',
          fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, padding: 0, marginBottom: 12,
          fontFamily: 'inherit',
        }}
      >
        <ChevronLeft size={14} /> Modifier le créneau
      </button>

      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: primary, marginBottom: 16 }}>
        Indiquez vos informations
      </h2>

      {/* Champs nom/prénom sur deux colonnes si on les détecte */}
      <FieldsGrid fields={fields} values={values} setField={setField} primary={primary} />

      {/* Lieu : radio visio / presentiel / telephone (si > 1 option) */}
      {meeting_types.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
            Lieu <span style={{ color: '#ef4444' }}>*</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {meeting_types.map(mt => {
              const m = MEETING_META[mt]
              const isSel = meeting_type === mt
              return (
                <label
                  key={mt}
                  onClick={() => setMeetingType(mt)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    border: `1.5px solid ${isSel ? primary : '#e2ecf5'}`,
                    borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                    background: isSel ? `${primary}08` : '#fff',
                    transition: 'all 0.12s',
                  }}
                >
                  <input
                    type="radio"
                    name="meeting_type"
                    checked={isSel}
                    onChange={() => setMeetingType(mt)}
                    style={{ accentColor: primary, margin: 0 }}
                  />
                  <m.Icon size={16} style={{ color: isSel ? primary : '#94a3b8' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: primary, fontWeight: 600 }}>
                      {mt === 'presentiel' && location_label ? location_label : m.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{m.description(location_label)}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !meeting_type}
        style={{
          marginTop: 22, background: primary, color: '#fff', border: 'none',
          borderRadius: 999, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: submitting ? 'default' : 'pointer',
          fontFamily: 'inherit', opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? 'Envoi…' : submitLabel}
      </button>

      <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
        En poursuivant, vous confirmez avoir lu et accepté les <strong style={{ color: accent }}>Conditions d&apos;utilisation</strong> et l&apos;<strong style={{ color: accent }}>Avis de confidentialité</strong>.
      </div>
    </form>
  )
}

// ─── Grille de champs (deux colonnes pour prénom/nom) ─────────────────────
function FieldsGrid({ fields, values, setField, primary }: {
  fields: PublicField[]
  values: Record<string, string>
  setField: (k: string, v: string) => void
  primary: string
}) {
  // Regroupe firstname + lastname côte à côte si présents en début de liste
  const items: Array<{ key: string; node: React.ReactNode }> = []
  let i = 0
  while (i < fields.length) {
    const cur = fields[i]
    const next = fields[i + 1]
    if (cur && next && cur.field_key === 'firstname' && next.field_key === 'lastname') {
      items.push({
        key: 'firstname-lastname',
        node: (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SingleField field={cur} value={values[cur.field_key] || ''} onChange={(v) => setField(cur.field_key, v)} primary={primary} />
            <SingleField field={next} value={values[next.field_key] || ''} onChange={(v) => setField(next.field_key, v)} primary={primary} />
          </div>
        ),
      })
      i += 2
      continue
    }
    items.push({
      key: cur.field_key,
      node: <SingleField field={cur} value={values[cur.field_key] || ''} onChange={(v) => setField(cur.field_key, v)} primary={primary} />,
    })
    i++
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(it => <div key={it.key}>{it.node}</div>)}
    </div>
  )
}

function SingleField({ field, value, onChange, primary }: {
  field: PublicField
  value: string
  onChange: (v: string) => void
  primary: string
}) {
  if (field.field_type === 'hidden') {
    return <input type="hidden" name={field.field_key} value={value} />
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e2ecf5', borderRadius: 8,
    fontSize: 14, color: '#1d2f4b', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.12s',
  }
  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = primary
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#e2ecf5'
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
        {field.label}{field.required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {(() => {
        switch (field.field_type) {
          case 'textarea':
            return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} required={field.required} rows={3} style={{ ...inputStyle, resize: 'vertical' }} onFocus={onFocus} onBlur={onBlur} />
          case 'email':
            return <input type="email" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} required={field.required} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          case 'phone':
            return <input type="tel" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} required={field.required} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          case 'number':
            return <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} required={field.required} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          case 'date':
            return <input type="date" value={value} onChange={e => onChange(e.target.value)} required={field.required} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          case 'select':
            return (
              <select value={value} onChange={e => onChange(e.target.value)} required={field.required} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="">{field.placeholder || 'Sélectionnez…'}</option>
                {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )
          case 'radio':
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {field.options.map(o => (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1d2f4b', cursor: 'pointer' }}>
                    <input type="radio" name={field.field_key} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} required={field.required} style={{ accentColor: primary }} />
                    {o.label}
                  </label>
                ))}
              </div>
            )
          case 'checkbox':
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {field.options.map(o => {
                  const sel = (value || '').split(',').filter(Boolean)
                  return (
                    <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1d2f4b', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={sel.includes(o.value)}
                        onChange={e => {
                          const next = e.target.checked ? [...sel, o.value] : sel.filter(v => v !== o.value)
                          onChange(next.join(','))
                        }}
                        style={{ accentColor: primary }}
                      />
                      {o.label}
                    </label>
                  )
                })}
              </div>
            )
          default:
            return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} required={field.required} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        }
      })()}
      {field.help_text && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{field.help_text}</div>}
    </div>
  )
}

// ─── Étape Succès ─────────────────────────────────────────────────────────
function SuccessPanel({
  payload, formTitle, successMessage, primary, accent,
}: {
  payload: { start_at: string; end_at: string; meeting_type: MeetingType; meeting_link: string | null; location_label: string | null }
  formTitle: string
  successMessage: string
  primary: string
  accent: string
}) {
  return (
    <div style={{ padding: '40px 32px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${accent}20`, border: `2px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
        <Check size={26} color={accent} strokeWidth={3} />
      </div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: primary }}>{formTitle}</h2>
      <p style={{ margin: '10px auto 22px', fontSize: 14, color: '#64748b', maxWidth: 460, lineHeight: 1.6 }}>
        {successMessage}
      </p>

      <div style={{ maxWidth: 420, margin: '0 auto', background: '#f7fafc', border: '1px solid #e6edf5', borderRadius: 12, padding: '16px 20px', textAlign: 'left' }}>
        <div style={{ fontSize: 13, color: primary, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Clock size={14} />
          {format(new Date(payload.start_at), "EEEE d MMMM yyyy 'à' HH'h'mm", { locale: fr })}
        </div>
        <div style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
          {payload.meeting_type === 'visio' && <Video size={13} />}
          {payload.meeting_type === 'presentiel' && <MapPin size={13} />}
          {payload.meeting_type === 'telephone' && <PhoneIcon size={13} />}
          {payload.meeting_type === 'visio' && (payload.meeting_link
            ? <a href={payload.meeting_link} target="_blank" rel="noreferrer" style={{ color: accent, textDecoration: 'underline' }}>Rejoindre la visio</a>
            : 'Visioconférence — lien envoyé par e-mail')}
          {payload.meeting_type === 'presentiel' && (payload.location_label || 'Présentiel')}
          {payload.meeting_type === 'telephone' && 'Nous vous appellerons au numéro indiqué'}
        </div>
      </div>
    </div>
  )
}
