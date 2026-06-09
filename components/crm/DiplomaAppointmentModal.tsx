'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Calendar, Loader2, MapPin, PhoneCall, Video, X } from 'lucide-react'

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

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 200000 }}
      onClick={onClose}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#0e1e35]/10 text-[#0e1e35] flex items-center justify-center">
              <Calendar size={16} />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Programmer rendez-vous Diploma Santé</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
            <input
              type="date"
              min={minDate}
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Créneaux disponibles</label>
            {slotsLoading ? (
              <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement...</div>
            ) : slotError ? (
              <div className="text-sm text-red-600">{slotError}</div>
            ) : slots.length === 0 ? (
              <div className="text-sm text-slate-500">Aucun créneau disponible sur cette date.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map(slot => {
                  const isSelected = selectedSlot?.start === slot.start
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-3 py-1.5 rounded-md text-sm border ${
                        isSelected
                          ? 'bg-[#0e1e35] text-white border-[#0e1e35]'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-[#0e1e35]'
                      }`}
                    >
                      {format(new Date(slot.start), 'HH:mm', { locale: fr })}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Prénom">
              <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Nom">
              <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="E-mail">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Téléphone">
              <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Études actuelles">
              <select
                value={currentStudies}
                onChange={e => setCurrentStudies(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Sélectionner...</option>
                {CURRENT_STUDIES_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </Field>
            <Field label="Département">
              <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="ex: 75" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Type de RDV</label>
            <div className="flex gap-2">
              {([
                { key: 'visio', icon: <Video size={13} />, label: 'Visio' },
                { key: 'telephone', icon: <PhoneCall size={13} />, label: 'Téléphone' },
                { key: 'presentiel', icon: <MapPin size={13} />, label: 'Présentiel' },
              ] as const).map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMeetingType(m.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${
                    meetingType === m.key
                      ? 'bg-[#0e1e35] text-white border-[#0e1e35]'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-[#0e1e35]'
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            {meetingType === 'visio' && (
              <input
                value={meetingLink}
                onChange={e => setMeetingLink(e.target.value)}
                placeholder="Lien visio…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-2"
              />
            )}
          </div>

          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}
          {success && (
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-sm text-emerald-700">
              RDV Diploma Santé créé avec succès.
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">Fermer</button>
          <button
            onClick={handleSubmit}
            disabled={saving || slotsLoading || !selectedSlot}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0e1e35] text-white disabled:opacity-60"
          >
            {saving ? 'Création...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
