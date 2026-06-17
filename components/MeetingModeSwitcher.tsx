'use client'

import { useState } from 'react'
import { Video, MapPin, ArrowLeftRight } from 'lucide-react'
import { CAMPUS_OPTIONS, type CampusOption } from '@/lib/campus'

type MeetingMode = 'visio' | 'presentiel'

type Props = {
  appointmentId: string
  meetingType: string | null | undefined
  meetingLink: string | null | undefined
  status: string
  disabled?: boolean
  onUpdated: (updated: { meeting_type: string; meeting_link: string | null }) => void
}

export default function MeetingModeSwitcher({
  appointmentId,
  meetingType,
  meetingLink,
  status,
  disabled,
  onUpdated,
}: Props) {
  const [showCampusPicker, setShowCampusPicker] = useState(false)
  const [selectedCampus, setSelectedCampus] = useState<CampusOption>(CAMPUS_OPTIONS[0])
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const current = meetingType === 'visio' || meetingType === 'presentiel' ? meetingType : null
  if (!current || status === 'annule') return null

  const targetMode: MeetingMode = current === 'visio' ? 'presentiel' : 'visio'

  async function applyChange(campus?: string) {
    setChanging(true)
    setError(null)
    setSuccess(false)
    try {
      const body: Record<string, unknown> = {
        change_meeting_mode: true,
        meeting_type: targetMode,
      }
      if (targetMode === 'presentiel') {
        body.meeting_link = campus || selectedCampus
      }

      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Erreur lors du changement de mode')
        return
      }

      const updated = await res.json()
      onUpdated({
        meeting_type: updated.meeting_type,
        meeting_link: updated.meeting_link ?? null,
      })
      setShowCampusPicker(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Erreur réseau')
    } finally {
      setChanging(false)
    }
  }

  function handleClick() {
    if (targetMode === 'presentiel') {
      setShowCampusPicker(true)
      return
    }
    void applyChange()
  }

  const label = targetMode === 'presentiel' ? 'Passer en présentiel' : 'Passer en visio'
  const Icon = targetMode === 'presentiel' ? MapPin : Video

  return (
    <div style={{ marginTop: 4 }}>
      {current === 'presentiel' && meetingLink && !/^https?:\/\//i.test(meetingLink) && (
        <div style={{ fontSize: 13, color: '#4a6070', marginBottom: 8 }}>
          Campus : <strong style={{ color: '#0f172a' }}>{meetingLink}</strong>
        </div>
      )}

      {showCampusPicker ? (
        <div style={{
          background: '#f7f4ee', border: '1px solid #e5ddc8',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4a6070', marginBottom: 8 }}>
            Choisir le campus
          </div>
          <select
            value={selectedCampus}
            onChange={(e) => setSelectedCampus(e.target.value as CampusOption)}
            style={{
              width: '100%', background: '#ffffff', border: '1px solid #e5ddc8',
              borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#0f172a',
              marginBottom: 10, fontFamily: 'inherit',
            }}
          >
            {CAMPUS_OPTIONS.map((campus) => (
              <option key={campus} value={campus}>{campus}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => void applyChange(selectedCampus)}
              disabled={changing || disabled}
              style={{
                flex: 1, background: '#C9A84C', color: '#0e1e35', border: 'none',
                borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700,
                cursor: changing ? 'wait' : 'pointer', opacity: changing ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {changing ? 'Modification…' : 'Confirmer le présentiel'}
            </button>
            <button
              type="button"
              onClick={() => setShowCampusPicker(false)}
              disabled={changing}
              style={{
                background: 'transparent', border: '1px solid #e5ddc8',
                borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600,
                color: '#4a6070', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={changing || disabled}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.35)',
            borderRadius: 8, padding: '6px 12px',
            color: '#C9A84C', fontSize: 12, fontWeight: 600,
            cursor: changing ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: changing || disabled ? 0.7 : 1,
          }}
        >
          <ArrowLeftRight size={12} />
          {changing ? 'Modification…' : label}
          <Icon size={12} />
        </button>
      )}

      {success && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
          Mode modifié — SMS et email envoyés au prospect
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{error}</div>
      )}
    </div>
  )
}
