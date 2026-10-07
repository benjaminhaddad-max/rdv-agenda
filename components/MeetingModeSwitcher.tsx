'use client'

import { useState } from 'react'
import { Video, MapPin, ArrowLeftRight } from 'lucide-react'
import { CAMPUS_OPTIONS, type CampusOption } from '@/lib/campus'
import { crmV2 } from '@/lib/crm-v2-theme'

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
      {showCampusPicker ? (
        <div style={{
          background: crmV2.bgHover, border: `1px solid ${crmV2.border}`,
          borderRadius: 12, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Choisir le campus
          </div>
          <select
            value={selectedCampus}
            onChange={(e) => setSelectedCampus(e.target.value as CampusOption)}
            style={{
              width: '100%', height: 38, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
              borderRadius: crmV2.radius, padding: '0 12px', fontSize: 13, color: crmV2.text,
              marginBottom: 10, fontFamily: 'inherit', outline: 'none',
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
                flex: 1, background: crmV2.primary, color: '#fff', border: 'none',
                borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 600,
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
                background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
                borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 600,
                color: crmV2.text, cursor: 'pointer', fontFamily: 'inherit',
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
            background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`,
            borderRadius: 999, padding: '6px 12px',
            color: crmV2.goldDark, fontSize: 12, fontWeight: 600,
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
        <div style={{ marginTop: 8, fontSize: 12, color: crmV2.successStrong, fontWeight: 600 }}>
          Mode modifié — SMS et email envoyés au prospect
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#d13a41' }}>{error}</div>
      )}
    </div>
  )
}
