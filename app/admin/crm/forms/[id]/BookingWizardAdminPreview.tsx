'use client'

/**
 * Aperçu admin des étapes 1, 2 et 4 du wizard booking (style Calendly).
 * L'étape 3 reste l'éditeur de champs dans page.tsx.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  format, addDays, addMonths, startOfMonth, endOfMonth, isSameMonth, isSameDay,
  isBefore, startOfDay, isAfter,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Video, Phone as PhoneIcon, Globe, Check,
} from 'lucide-react'

type PreviewStep = 'date' | 'slots' | 'success'
type MeetingType = 'visio' | 'presentiel' | 'telephone'

export type BookingPreviewForm = {
  slug: string
  status: string
  form_type?: string | null
  title: string | null
  subtitle: string | null
  success_message: string | null
  submit_label: string
  primary_color: string
  booking_duration_minutes?: number | null
  booking_horizon_days?: number | null
  booking_meeting_types?: string[] | null
  booking_location_label?: string | null
  booking_default_meeting_type?: string | null
}

const DEMO_SLOTS = ['09:00', '09:30', '10:00', '10:30', '14:00', '14:30', '15:00', '15:30']

export function BookingStepNav({
  step,
  onStepChange,
}: {
  step: 1 | 2 | 3 | 4
  onStepChange: (s: 1 | 2 | 3 | 4) => void
}) {
  const items: Array<{ n: 1 | 2 | 3 | 4; label: string; hint: string }> = [
    { n: 1, label: 'Date', hint: 'Calendrier' },
    { n: 2, label: 'Heure', hint: 'Créneaux' },
    { n: 3, label: 'Coordonnées', hint: 'Champs éditables' },
    { n: 4, label: 'Confirmation', hint: 'Après envoi' },
  ]
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {items.map(s => {
        const active = step === s.n
        return (
          <button
            key={s.n}
            type="button"
            onClick={() => onStepChange(s.n)}
            style={{
              flex: '1 1 140px',
              minWidth: 120,
              background: active ? '#06b6d4' : '#ffffff',
              border: `1px solid ${active ? '#06b6d4' : 'rgba(6,182,212,0.35)'}`,
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: active ? '#ffffff' : '#06b6d4',
                color: active ? '#06b6d4' : '#ffffff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
              }}>{s.n}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: active ? '#ffffff' : '#0e1e35' }}>{s.label}</div>
                <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.85)' : '#64748b' }}>{s.hint}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function BookingWizardAdminPreview({
  form,
  previewStep,
}: {
  form: BookingPreviewForm
  previewStep: PreviewStep
}) {
  const primary = form.primary_color || '#1d2f4b'
  const accent = '#C9A84C'
  const duration = form.booking_duration_minutes ?? 30
  const horizon = form.booking_horizon_days ?? 30
  const meetingTypes = (form.booking_meeting_types?.length
    ? form.booking_meeting_types
    : ['visio', 'presentiel']) as MeetingType[]
  const locationLabel = form.booking_location_label || '100 quai de la rapée, 75012 Paris'

  const todayStart = startOfDay(new Date())
  const horizonEnd = useMemo(() => addDays(todayStart, horizon), [todayStart, horizon])
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set())
  const [useDemo, setUseDemo] = useState(false)

  const isBooking = form.form_type === 'booking'
  const canFetchLive = isBooking && form.status === 'published'

  // Jours dispos (live ou démo)
  useEffect(() => {
    if (!canFetchLive) {
      const demo = new Set<string>()
      let d = new Date(todayStart)
      let n = 0
      while (n < 12 && d <= horizonEnd) {
        if (d.getDay() !== 0) demo.add(format(d, 'yyyy-MM-dd'))
        d = addDays(d, 1)
        n++
      }
      setAvailableDays(demo)
      setUseDemo(true)
      return
    }
    let cancelled = false
    const probe = async () => {
      const start = startOfMonth(viewMonth)
      const end = endOfMonth(viewMonth)
      const from = isBefore(start, todayStart) ? todayStart : start
      const to = isAfter(end, horizonEnd) ? horizonEnd : end
      const days: Date[] = []
      const cur = new Date(from)
      while (cur <= to) {
        if (cur.getDay() !== 0) days.push(new Date(cur))
        cur.setDate(cur.getDate() + 1)
      }
      const results = await Promise.all(days.map(async d => {
        const iso = format(d, 'yyyy-MM-dd')
        try {
          const r = await fetch(`/api/forms/${form.slug}/booking/slots?date=${iso}`)
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
      setUseDemo(set.size === 0)
    }
    probe()
    return () => { cancelled = true }
  }, [viewMonth, form.slug, canFetchLive, todayStart, horizonEnd])

  const loadSlots = async (date: Date) => {
    setSelectedDate(date)
    setSlotsLoading(true)
    const iso = format(date, 'yyyy-MM-dd')
    if (canFetchLive) {
      try {
        const r = await fetch(`/api/forms/${form.slug}/booking/slots?date=${iso}`)
        if (r.ok) {
          const j = await r.json()
          if (Array.isArray(j.slots) && j.slots.length > 0) {
            setSlots(j.slots)
            setSlotsLoading(false)
            return
          }
        }
      } catch { /* démo */ }
    }
    const base = new Date(`${iso}T00:00:00`)
    setSlots(DEMO_SLOTS.map(t => {
      const [h, m] = t.split(':').map(Number)
      const start = new Date(base)
      start.setHours(h, m, 0, 0)
      const end = new Date(start.getTime() + duration * 60_000)
      return { start: start.toISOString(), end: end.toISOString() }
    }))
    setUseDemo(true)
    setSlotsLoading(false)
  }

  // Étape 2 : pré-sélectionner un jour avec créneaux
  useEffect(() => {
    if (previewStep !== 'slots' || selectedDate) return
    const first = [...availableDays][0]
    if (first) loadSlots(new Date(`${first}T12:00:00`))
    else {
      const d = addDays(todayStart, 1)
      if (d.getDay() === 0) d.setDate(d.getDate() + 1)
      loadSlots(d)
    }
  }, [previewStep, availableDays]) // eslint-disable-line react-hooks/exhaustive-deps

  const demoSlot = useMemo(() => {
    const d = selectedDate || addDays(todayStart, 1)
    const start = new Date(d)
    start.setHours(10, 0, 0, 0)
    const end = new Date(start.getTime() + duration * 60_000)
    return { start: start.toISOString(), end: end.toISOString(), meeting_type: (meetingTypes[0] || 'visio') as MeetingType }
  }, [selectedDate, todayStart, duration, meetingTypes])

  if (previewStep === 'success') {
    return (
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e6edf5', overflow: 'hidden' }}>
        <SuccessPreview
          formTitle={form.title || 'Rendez-vous confirmé'}
          successMessage={form.success_message || 'Votre rendez-vous est confirmé. Vous allez recevoir un email et un SMS récapitulatif.'}
          payload={demoSlot}
          locationLabel={locationLabel}
          primary={primary}
          accent={accent}
        />
      </div>
    )
  }

  const showSlotsColumn = previewStep === 'slots'

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e6edf5', overflow: 'hidden' }}>
      {useDemo && (
        <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '8px 14px', fontSize: 11, color: '#92400e' }}>
          {canFetchLive
            ? 'Aucun créneau réel ce mois-ci — aperçu avec des horaires fictifs. Vérifie les disponibilités de Pascal dans l’agenda.'
            : 'Aperçu démo — publie le formulaire en mode « Prise de rendez-vous » pour voir les vrais créneaux.'}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', minHeight: 480 }}>
        <Sidebar
          form={form}
          primary={primary}
          duration={duration}
          meetingTypes={meetingTypes}
          locationLabel={locationLabel}
          selectedSlot={showSlotsColumn && selectedDate ? demoSlot : null}
        />
        <DateSlotsPreview
          previewStep={previewStep}
          viewMonth={viewMonth}
          setViewMonth={setViewMonth}
          todayStart={todayStart}
          horizonEnd={horizonEnd}
          availableDays={availableDays}
          selectedDate={selectedDate}
          loadSlots={loadSlots}
          slots={slots}
          slotsLoading={slotsLoading}
          showSlotsColumn={showSlotsColumn}
          primary={primary}
        />
      </div>
    </div>
  )
}

function Sidebar({
  form, primary, duration, meetingTypes, locationLabel, selectedSlot,
}: {
  form: BookingPreviewForm
  primary: string
  duration: number
  meetingTypes: MeetingType[]
  locationLabel: string
  selectedSlot: { start: string } | null
}) {
  return (
    <div style={{ background: '#f7fafc', padding: 24, borderRight: '1px solid #e6edf5' }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Admissions</div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: primary, lineHeight: 1.2 }}>
        {form.title || form.slug || 'Rendez-vous'}
      </h2>
      {form.subtitle && (
        <p style={{ marginTop: 10, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{form.subtitle}</p>
      )}
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#475569' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={14} style={{ color: primary }} />
          <span>{duration} min</span>
        </div>
        {meetingTypes.includes('presentiel') && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <MapPin size={14} style={{ color: primary, marginTop: 2 }} />
            <span>{locationLabel}</span>
          </div>
        )}
        {meetingTypes.includes('visio') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Video size={14} style={{ color: primary }} />
            <span>Visioconférence</span>
          </div>
        )}
      </div>
      {selectedSlot && (
        <div style={{ marginTop: 24, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#C9A84C', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Créneau sélectionné</div>
          <div style={{ fontSize: 13, color: primary, fontWeight: 700 }}>
            {format(new Date(selectedSlot.start), "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
          </div>
        </div>
      )}
    </div>
  )
}

function DateSlotsPreview({
  previewStep, viewMonth, setViewMonth, todayStart, horizonEnd, availableDays,
  selectedDate, loadSlots, slots, slotsLoading, showSlotsColumn, primary,
}: {
  previewStep: PreviewStep
  viewMonth: Date
  setViewMonth: (d: Date) => void
  todayStart: Date
  horizonEnd: Date
  availableDays: Set<string>
  selectedDate: Date | null
  loadSlots: (d: Date) => void
  slots: Array<{ start: string; end: string }>
  slotsLoading: boolean
  showSlotsColumn: boolean
  primary: string
}) {
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const firstDow = (monthStart.getDay() + 6) % 7
  const cells: Array<Date | null> = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) cells.push(new Date(d))
  while (cells.length % 7 !== 0) cells.push(null)

  const canGoPrev = !isBefore(addMonths(monthStart, -1), startOfMonth(todayStart))
  const canGoNext = !isAfter(addMonths(monthStart, 1), startOfMonth(horizonEnd))

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: showSlotsColumn ? '1fr 200px' : '1fr', gap: 24 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: primary, marginBottom: 12 }}>
          {previewStep === 'date' ? 'Étape 1 — Sélectionnez une date' : 'Étape 2 — Sélectionnez l’heure'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button type="button" disabled={!canGoPrev} onClick={() => canGoPrev && setViewMonth(addMonths(viewMonth, -1))} style={navBtn(!canGoPrev)}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: primary, textTransform: 'capitalize' }}>
            {format(viewMonth, 'MMMM yyyy', { locale: fr })}
          </div>
          <button type="button" disabled={!canGoNext} onClick={() => canGoNext && setViewMonth(addMonths(viewMonth, 1))} style={navBtn(!canGoNext)}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{d}</div>
          ))}
        </div>
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
                type="button"
                onClick={() => !disabled && loadSlots(d)}
                disabled={disabled}
                style={{
                  height: 40, borderRadius: 999, border: isSel ? `2px solid ${primary}` : 'none',
                  background: isSel ? primary : isAvail ? '#eaf3fc' : 'transparent',
                  color: isSel ? '#fff' : isAvail ? primary : '#cbd5e1',
                  fontSize: 14, fontWeight: isAvail || isSel ? 600 : 400,
                  cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {format(d, 'd')}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 18, fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe size={12} />
          Heure d&apos;Europe centrale
        </div>
      </div>

      {showSlotsColumn && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: primary, marginBottom: 10, textTransform: 'capitalize' }}>
            {selectedDate ? format(selectedDate, 'EEEE, d MMMM', { locale: fr }) : '—'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {slotsLoading ? (
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Chargement…</div>
            ) : slots.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Aucun créneau</div>
            ) : slots.map(s => (
              <div
                key={s.start}
                style={{
                  background: '#fff', border: `1.5px solid ${primary}40`, color: primary,
                  borderRadius: 8, padding: '12px 16px', fontWeight: 700, fontSize: 14, textAlign: 'center',
                }}
              >
                {format(new Date(s.start), 'HH:mm')}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 12, lineHeight: 1.4 }}>
            En production, un clic sur l&apos;heure ouvre l&apos;étape 3.
          </p>
        </div>
      )}
    </div>
  )
}

function SuccessPreview({
  formTitle, successMessage, payload, locationLabel, primary, accent,
}: {
  formTitle: string
  successMessage: string
  payload: { start_at?: string; start: string; meeting_type: MeetingType; meeting_link?: string | null }
  locationLabel: string
  primary: string
  accent: string
}) {
  const startAt = payload.start_at || payload.start
  const mt = payload.meeting_type
  return (
    <div style={{ padding: '40px 32px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${accent}20`, border: `2px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
        <Check size={26} color={accent} strokeWidth={3} />
      </div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: primary }}>{formTitle}</h2>
      <p style={{ margin: '10px auto 22px', fontSize: 14, color: '#64748b', maxWidth: 460, lineHeight: 1.6 }}>{successMessage}</p>
      <div style={{ maxWidth: 420, margin: '0 auto', background: '#f7fafc', border: '1px solid #e6edf5', borderRadius: 12, padding: '16px 20px', textAlign: 'left' }}>
        <div style={{ fontSize: 13, color: primary, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Clock size={14} />
          {format(new Date(startAt), "EEEE d MMMM yyyy 'à' HH'h'mm", { locale: fr })}
        </div>
        <div style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
          {mt === 'visio' && <Video size={13} />}
          {mt === 'presentiel' && <MapPin size={13} />}
          {mt === 'telephone' && <PhoneIcon size={13} />}
          {mt === 'visio' && 'Visioconférence — lien envoyé par e-mail'}
          {mt === 'presentiel' && locationLabel}
          {mt === 'telephone' && 'Rappel téléphonique'}
        </div>
      </div>
    </div>
  )
}

function navBtn(disabled: boolean) {
  return {
    background: 'transparent', border: '1px solid #e2ecf5', borderRadius: 8,
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#cbd5e1' : '#1d2f4b',
  }
}
