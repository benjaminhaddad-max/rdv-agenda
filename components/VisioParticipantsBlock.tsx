'use client'

import { useEffect, useState } from 'react'
import { Mail, UserPlus, Users } from 'lucide-react'
import { parseExtraParticipants, type ExtraParticipant } from '@/lib/appointment-participants'
import { validateEmailDomain } from '@/lib/email-validation'
import { crmV2 } from '@/lib/crm-v2-theme'

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 38,
  boxSizing: 'border-box',
  background: crmV2.bg,
  border: `1px solid ${crmV2.borderStrong}`,
  borderRadius: crmV2.radius,
  padding: '0 12px',
  color: crmV2.text,
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

export default function VisioParticipantsBlock({
  appointmentId,
  extraParticipants,
  disabled,
  onUpdated,
}: {
  appointmentId: string
  extraParticipants?: unknown
  disabled?: boolean
  onUpdated: (updated: { extra_participants: ExtraParticipant[] }) => void
}) {
  const [participants, setParticipants] = useState<ExtraParticipant[]>(() =>
    parseExtraParticipants(extraParticipants),
  )
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    setParticipants(parseExtraParticipants(extraParticipants))
  }, [extraParticipants])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/appointments/${appointmentId}/participants`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        setParticipants(parseExtraParticipants(data.extra_participants))
      } catch {
        // best-effort
      }
    })()
    return () => { cancelled = true }
  }, [appointmentId])

  async function addParticipant() {
    const trimmedEmail = email.trim()
    const domainError = validateEmailDomain(trimmedEmail)
    if (domainError) {
      setError(domainError)
      setOk(false)
      return
    }

    setSaving(true)
    setError(null)
    setOk(false)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add_participant: {
            email: trimmedEmail,
            name: name.trim() || null,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Impossible d\'ajouter le participant')
        return
      }
      const next = parseExtraParticipants(data.extra_participants)
      setParticipants(next)
      onUpdated({ extra_participants: next })
      setEmail('')
      setName('')
      setOpen(false)
      setOk(true)
      setTimeout(() => setOk(false), 3000)
    } catch {
      setError('Impossible d\'ajouter le participant')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: crmV2.textMuted }}>
        <Users size={14} style={{ color: crmV2.gold, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: crmV2.text }}>
          {participants.length === 0
            ? 'Aucun participant supplémentaire'
            : `${participants.length} participant${participants.length > 1 ? 's' : ''} supplémentaire${participants.length > 1 ? 's' : ''}`}
        </span>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => { setOpen(v => !v); setError(null) }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: crmV2.bg,
            border: `1px solid ${crmV2.borderStrong}`,
            borderRadius: 999,
            padding: '4px 10px',
            color: crmV2.text,
            fontSize: 12,
            fontWeight: 700,
            cursor: disabled || saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <UserPlus size={12} />
          Ajouter un participant
        </button>
        {ok && (
          <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.successStrong }}>
            Invitation envoyée
          </span>
        )}
      </div>

      {participants.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 24 }}>
          {participants.map(p => (
            <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: crmV2.textMuted, minWidth: 0 }}>
              <Mail size={12} style={{ color: crmV2.gold, flexShrink: 0 }} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name ? <strong style={{ color: crmV2.text }}>{p.name}</strong> : null}
                {p.name ? ' · ' : ''}
                {p.email}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 12,
          background: crmV2.bgHover,
          border: `1px solid ${crmV2.border}`,
          borderRadius: 12,
        }}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Prénom / nom (facultatif)"
            disabled={saving}
            style={inputStyle}
          />
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null) }}
            placeholder="Email du participant"
            disabled={saving}
            style={{
              ...inputStyle,
              border: error ? '1px solid rgba(239,68,68,0.5)' : inputStyle.border,
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addParticipant()
              }
            }}
          />
          {error && (
            <span style={{ fontSize: 12, color: '#d13a41', fontWeight: 600 }}>{error}</span>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setOpen(false); setError(null) }}
              style={{
                background: crmV2.bg,
                border: `1px solid ${crmV2.borderStrong}`,
                borderRadius: 999,
                padding: '6px 14px',
                color: crmV2.text,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={saving || !email.trim()}
              onClick={() => void addParticipant()}
              style={{
                background: crmV2.primary,
                border: 'none',
                borderRadius: 999,
                padding: '6px 14px',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                opacity: saving || !email.trim() ? 0.55 : 1,
                cursor: saving || !email.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Envoi…' : 'Inviter à la visio'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
