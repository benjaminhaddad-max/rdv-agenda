'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Check, Clock, Loader2, MapPin, PhoneCall, Video } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import {
  ChoiceButton, CloserSheet, FieldLabel, Notice, SheetHeader, StepBar, StepCard, closerInput,
} from '@/components/crm-v2/closer/ui'

type ContactPreview = {
  id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  classe_actuelle?: string | null
  departement?: string | null
}

type Props = {
  contact: ContactPreview
  onClose: () => void
  onSaved: () => void
}

type PoolSlot = { start: string; end: string; available?: boolean; count?: number }

const CURRENT_STUDIES_OPTIONS = [
  'Troisième',
  'Seconde',
  'Première',
  'Terminale',
  'PASS',
  'LSPS 1',
  'LSPS 2',
  'LSPS 3',
  'LAS 1',
  'LAS 2',
  'LAS 3',
  'Etudes médicales',
  'Etudes Sup.',
  'Autres',
]

function tomorrowIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function generateVisioLink(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)]
  const base = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://rdv-agenda.vercel.app')
  return `${base}/visio/rdv-${id}`
}

export default function DiplomaAppointmentModal({ contact, onClose, onSaved }: Props) {
  const [date, setDate] = useState(tomorrowIsoDate())
  const [slots, setSlots] = useState<PoolSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<PoolSlot | null>(null)

  const [firstName, setFirstName] = useState(contact.firstname || '')
  const [lastName, setLastName] = useState(contact.lastname || '')
  const [email, setEmail] = useState(contact.email || '')
  const [phone, setPhone] = useState(contact.phone || '')
  const [currentStudies, setCurrentStudies] = useState(contact.classe_actuelle || '')
  const [department, setDepartment] = useState(contact.departement ? String(contact.departement) : '')
  const [meetingType, setMeetingType] = useState<'visio' | 'telephone' | 'presentiel'>('visio')
  const [meetingLink, setMeetingLink] = useState(() => generateVisioLink())

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const minDate = useMemo(() => tomorrowIsoDate(), [])

  useEffect(() => {
    let cancelled = false
    async function fetchSlots() {
      setSlotError(null)
      setSelectedSlot(null)
      setSlots([])
      setSlotsLoading(true)
      try {
        const res = await fetch(`/api/availability/pool?date=${encodeURIComponent(date)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Erreur chargement créneaux')
        if (!cancelled) setSlots(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) setSlotError(e instanceof Error ? e.message : 'Erreur chargement créneaux')
      } finally {
        if (!cancelled) setSlotsLoading(false)
      }
    }
    void fetchSlots()
    return () => { cancelled = true }
  }, [date])

  async function handleSubmit() {
    setError(null)
    setSuccess(false)
    if (!selectedSlot) {
      setError('Merci de sélectionner un créneau')
      return
    }
    if (!firstName || !lastName || !email || !phone) {
      setError('Prénom, nom, email et téléphone sont requis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: `${firstName} ${lastName}`.trim(),
          prospect_email: email,
          prospect_phone: phone || null,
          start_at: selectedSlot.start,
          end_at: selectedSlot.end,
          source: 'admin',
          hubspot_contact_id: contact.id,
          departement: department || null,
          classe_actuelle: currentStudies || null,
          meeting_type: meetingType,
          meeting_link: meetingType === 'visio' ? meetingLink : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur création RDV Diploma Santé')
      setSuccess(true)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création RDV Diploma Santé')
    } finally {
      setSaving(false)
    }
  }

  const isMobile = useIsMobile()
  const inp = closerInput(isMobile)
  const prospectOk = !!(firstName && lastName && email && phone)
  const step = !selectedSlot ? 1 : !prospectOk ? 2 : 3
  const contactName = [contact.firstname, contact.lastname].filter(Boolean).join(' ')

  return (
    <CloserSheet
      onClose={onClose}
      zIndex={200000}
      header={(
        <SheetHeader
          kicker="Prendre RDV"
          icon={<Calendar size={12} />}
          title="Rendez-vous Diploma Santé"
          subtitle={contactName || contact.email || undefined}
          onClose={onClose}
        >
          <StepBar labels={['Créneau', 'Prospect', 'Mode']} step={step} done={[!!selectedSlot, prospectOk, false]} />
        </SheetHeader>
      )}
      footer={(
        <>
          <CrmV2Button onClick={onClose} style={{ minHeight: 40 }}>Fermer</CrmV2Button>
          <CrmV2Button
            variant="accent"
            onClick={handleSubmit}
            disabled={saving || slotsLoading || !selectedSlot}
            icon={saving ? <Loader2 size={14} style={{ animation: 'crm-v2-spin 0.9s linear infinite' }} /> : <Check size={14} />}
            style={{ flex: 1, minHeight: 40 }}
          >
            {saving ? 'Création...' : 'Confirmer le RDV'}
          </CrmV2Button>
        </>
      )}
    >
      <div style={{ padding: isMobile ? 12 : 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 1. Date et créneau */}
        <StepCard
          n={1}
          done={!!selectedSlot}
          title="Date et créneau"
          subtitle={selectedSlot
            ? <span style={{ textTransform: 'capitalize' }}>{format(new Date(selectedSlot.start), "EEEE d MMMM 'à' HH:mm", { locale: fr })}</span>
            : 'Choisir un créneau libre dans le planning des closers'}
        >
          <FieldLabel icon={<Calendar size={12} />}>Date</FieldLabel>
          <input
            type="date"
            min={minDate}
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ ...inp, cursor: 'pointer' }}
          />

          <div style={{ marginTop: 14 }}>
            <FieldLabel icon={<Clock size={12} />}>Créneaux disponibles</FieldLabel>
            {slotsLoading ? (
              <div style={{ fontSize: 13, color: crmV2.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={14} style={{ animation: 'crm-v2-spin 0.9s linear infinite' }} /> Chargement...
              </div>
            ) : slotError ? (
              <Notice>{slotError}</Notice>
            ) : slots.length === 0 ? (
              <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun créneau disponible sur cette date.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 76 : 84}px, 1fr))`, gap: 6 }}>
                {slots.map(slot => (
                  <ChoiceButton
                    key={slot.start}
                    active={selectedSlot?.start === slot.start}
                    onClick={() => setSelectedSlot(slot)}
                    style={{ padding: '0 8px' }}
                  >
                    {format(new Date(slot.start), 'HH:mm', { locale: fr })}
                  </ChoiceButton>
                ))}
              </div>
            )}
          </div>
        </StepCard>

        {/* 2. Prospect */}
        <StepCard n={2} done={prospectOk} title="Prospect" subtitle="Prénom, nom, e-mail et téléphone sont requis">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Field label="Prénom">
              <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} />
            </Field>
            <Field label="Nom">
              <input value={lastName} onChange={e => setLastName(e.target.value)} style={inp} />
            </Field>
            <Field label="E-mail">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} />
            </Field>
            <Field label="Téléphone">
              <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" style={inp} />
            </Field>
            <Field label="Études actuelles">
              <select
                value={currentStudies}
                onChange={e => setCurrentStudies(e.target.value)}
                style={{ ...inp, cursor: 'pointer' }}
              >
                <option value="">Sélectionner...</option>
                {CURRENT_STUDIES_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </Field>
            <Field label="Département">
              <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="ex: 75" style={inp} />
            </Field>
          </div>
        </StepCard>

        {/* 3. Mode du RDV */}
        <StepCard n={3} title="Mode du RDV">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {([
              { key: 'visio', icon: <Video size={14} />, label: 'Visio' },
              { key: 'telephone', icon: <PhoneCall size={14} />, label: 'Téléphone' },
              { key: 'presentiel', icon: <MapPin size={14} />, label: 'Présentiel' },
            ] as const).map(m => (
              <ChoiceButton key={m.key} active={meetingType === m.key} onClick={() => setMeetingType(m.key)} style={{ padding: '0 8px', fontSize: 12 }}>
                {m.icon} {m.label}
              </ChoiceButton>
            ))}
          </div>
          {meetingType === 'visio' && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel icon={<Video size={12} />}>Lien visio</FieldLabel>
              <input
                value={meetingLink}
                onChange={e => setMeetingLink(e.target.value)}
                placeholder="Lien visio…"
                style={{ ...inp, fontSize: 12 }}
              />
            </div>
          )}
        </StepCard>

        {error && <Notice>{error}</Notice>}
        {success && <Notice tone="success">RDV Diploma Santé créé avec succès.</Notice>}
      </div>
    </CloserSheet>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  )
}
