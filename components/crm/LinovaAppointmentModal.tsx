'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Calendar, Loader2, X } from 'lucide-react'

type ContactPreview = {
  id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  classe_actuelle?: string | null
}

type Props = {
  contact: ContactPreview
  onClose: () => void
  onSaved: () => void
}

type CreateResponse = {
  appointmentId: string
  scheduledAt: string
  googleEventId?: string
}

const CURRENT_STUDIES_OPTIONS = [
  '',
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
  'Etudes supérieures',
  'Autres',
]

function tomorrowIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function LinovaAppointmentModal({ contact, onClose, onSaved }: Props) {
  const [date, setDate] = useState(tomorrowIsoDate())
  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState('')

  const [appointmentType, setAppointmentType] = useState<'initial' | 'alternance'>('initial')
  const [firstName, setFirstName] = useState(contact.firstname || '')
  const [lastName, setLastName] = useState(contact.lastname || '')
  const [email, setEmail] = useState(contact.email || '')
  const [phone, setPhone] = useState(contact.phone || '')
  const [currentStudies, setCurrentStudies] = useState(contact.classe_actuelle || '')
  const [message, setMessage] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<CreateResponse | null>(null)

  const minDate = useMemo(() => tomorrowIsoDate(), [])

  useEffect(() => {
    let cancelled = false
    async function fetchSlots() {
      setSlotError(null)
      setSelectedSlot('')
      setSlots([])
      setSlotsLoading(true)
      try {
        const res = await fetch(`/api/linova/slots?date=${encodeURIComponent(date)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Erreur chargement créneaux')
        if (!cancelled) setSlots(Array.isArray(data?.slots) ? data.slots : [])
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
    setSuccess(null)
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
      const res = await fetch('/api/linova/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          appointmentType,
          date,
          timeSlot: selectedSlot,
          firstName,
          lastName,
          email,
          phone,
          currentStudies: currentStudies || undefined,
          message: message || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur création RDV Linova')
      setSuccess(data as CreateResponse)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création RDV Linova')
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#ccac71]/10 text-[#ccac71] flex items-center justify-center">
              <Calendar size={16} />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Programmer RDV admission Linova</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">Type de RDV</label>
              <div className="flex items-center gap-4 pt-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="linova-appointment-type"
                    value="initial"
                    checked={appointmentType === 'initial'}
                    onChange={() => setAppointmentType('initial')}
                  />
                  Initial
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="linova-appointment-type"
                    value="alternance"
                    checked={appointmentType === 'alternance'}
                    onChange={() => setAppointmentType('alternance')}
                  />
                  Alternance
                </label>
              </div>
            </div>
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
                {slots.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`px-3 py-1.5 rounded-md text-sm border ${
                      selectedSlot === slot
                        ? 'bg-[#0038f0] text-white border-[#0038f0]'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-[#2ea3f2]'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
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
                {CURRENT_STUDIES_OPTIONS.filter(Boolean).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </Field>
            <Field label="Message (optionnel)">
              <input value={message} onChange={e => setMessage(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>

          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}
          {success && (
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-sm text-emerald-700">
              RDV créé avec succès. Appointment ID: <span className="font-mono">{success.appointmentId}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">Fermer</button>
          <button
            onClick={handleSubmit}
            disabled={saving || slotsLoading || !selectedSlot}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#ccac71] text-white disabled:opacity-60"
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
