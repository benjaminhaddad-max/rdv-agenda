'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, startOfToday, isBefore } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  X, Clock, Save, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Ban, Plus, User,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────
type CloserUser = {
  id: string
  name: string
  slug: string
  avatar_color: string
  role: string
}

type AvailabilityRule = {
  user_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

type BlockedDate = {
  id: string
  user_id: string
  blocked_date: string
  reason: string | null
}

// ─── Constantes ─────────────────────────────────────────────────────────
const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
]

const TIME_OPTIONS: string[] = []
for (let h = 7; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

const selectStyle: React.CSSProperties = {
  background: '#243d5c',
  border: '1px solid #2d4a6b',
  borderRadius: 6,
  padding: '5px 8px',
  color: '#e8eaf0',
  fontSize: 12,
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// ─── Composant pour UN closer ───────────────────────────────────────────
function CloserAvailabilityCard({ closer }: { closer: CloserUser }) {
  const [expanded, setExpanded] = useState(false)
  const [rules, setRules] = useState<AvailabilityRule[]>(
    DAYS.map(d => ({
      user_id: closer.id,
      day_of_week: d.value,
      start_time: '09:00',
      end_time: '18:00',
      is_active: d.value <= 5,
    }))
  )
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockDate, setBlockDate] = useState('')
  const [blockReason, setBlockReason] = useState('')

  const loadData = useCallback(async () => {
    // Load rules
    const resRules = await fetch(`/api/availability?mode=rules&user_id=${closer.id}`)
    if (resRules.ok) {
      const data: AvailabilityRule[] = await resRules.json()
      if (data.length > 0) {
        setRules(
          DAYS.map(d => {
            const existing = data.find(r => r.day_of_week === d.value)
            return existing || {
              user_id: closer.id,
              day_of_week: d.value,
              start_time: '09:00',
              end_time: '18:00',
              is_active: false,
            }
          })
        )
      }
    }

    // Load blocked dates
    const resBlocked = await fetch(`/api/blocked-dates?user_id=${closer.id}`)
    if (resBlocked.ok) setBlockedDates(await resBlocked.json())
  }, [closer.id])

  useEffect(() => {
    if (expanded) loadData()
  }, [expanded, loadData])

  function updateRule(dayOfWeek: number, field: string, value: string | boolean) {
    setRules(prev =>
      prev.map(r => r.day_of_week === dayOfWeek ? { ...r, [field]: value } : r)
    )
  }

  async function saveRules() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: closer.id,
          rules: rules.map(r => ({
            day_of_week: r.day_of_week,
            start_time: r.start_time,
            end_time: r.end_time,
            is_active: r.is_active,
          })),
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setError('Erreur sauvegarde')
      }
    } finally {
      setSaving(false)
    }
  }

  async function addBlockedDate() {
    if (!blockDate) return
    const res = await fetch('/api/blocked-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: closer.id,
        blocked_date: blockDate,
        reason: blockReason.trim() || null,
      }),
    })
    if (res.ok) {
      setBlockDate('')
      setBlockReason('')
      loadData()
    }
  }

  async function removeBlockedDate(id: string) {
    await fetch(`/api/blocked-dates?id=${id}`, { method: 'DELETE' })
    loadData()
  }

  // Résumé des jours actifs
  const activeDays = rules.filter(r => r.is_active)
  const summary = activeDays.length > 0
    ? activeDays.map(r => {
        const day = DAYS.find(d => d.value === r.day_of_week)
        return `${day?.label} ${r.start_time}-${r.end_time}`
      }).join(' · ')
    : 'Aucune disponibilité'

  return (
    <div style={{
      background: '#152438',
      border: `1px solid ${expanded ? 'rgba(204,172,113,0.3)' : '#2d4a6b'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header — click to expand */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `${closer.avatar_color}20`,
          border: `1px solid ${closer.avatar_color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: closer.avatar_color,
          flexShrink: 0,
        }}>
          {closer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#e8eaf0' }}>{closer.name}</div>
          <div style={{
            fontSize: 11, color: '#555870', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {summary}
            {blockedDates.length > 0 && (
              <span style={{ color: '#ef4444', marginLeft: 6 }}>
                · {blockedDates.length} jour{blockedDates.length > 1 ? 's' : ''} bloqué{blockedDates.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp size={16} style={{ color: '#555870' }} /> : <ChevronDown size={16} style={{ color: '#555870' }} />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #2d4a6b' }}>

          {/* Planning hebdomadaire compact */}
          <div style={{ paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555870', textTransform: 'uppercase', marginBottom: 8 }}>
              Planning récurrent
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {DAYS.map(day => {
                const rule = rules.find(r => r.day_of_week === day.value)!
                return (
                  <div
                    key={day.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px',
                      background: rule.is_active ? 'rgba(204,172,113,0.05)' : 'transparent',
                      borderRadius: 6,
                    }}
                  >
                    <button
                      onClick={() => updateRule(day.value, 'is_active', !rule.is_active)}
                      style={{
                        width: 36, height: 20, borderRadius: 10,
                        background: rule.is_active ? '#b89450' : '#353849',
                        border: 'none', cursor: 'pointer',
                        position: 'relative', transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%', background: 'white',
                        position: 'absolute', top: 3,
                        left: rule.is_active ? 19 : 3,
                        transition: 'left 0.2s',
                      }} />
                    </button>

                    <span style={{
                      width: 30, fontSize: 12, fontWeight: 600,
                      color: rule.is_active ? '#e8eaf0' : '#555870',
                    }}>
                      {day.label}
                    </span>

                    <select
                      value={rule.start_time}
                      onChange={e => updateRule(day.value, 'start_time', e.target.value)}
                      disabled={!rule.is_active}
                      style={{ ...selectStyle, opacity: rule.is_active ? 1 : 0.3 }}
                    >
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <span style={{ color: '#555870', fontSize: 11 }}>→</span>

                    <select
                      value={rule.end_time}
                      onChange={e => updateRule(day.value, 'end_time', e.target.value)}
                      disabled={!rule.is_active}
                      style={{ ...selectStyle, opacity: rule.is_active ? 1 : 0.3 }}
                    >
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <button
                onClick={saveRules}
                disabled={saving}
                style={{
                  background: '#b89450', color: 'white', border: 'none',
                  borderRadius: 8, padding: '7px 16px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                <Save size={12} />
                {saving ? '…' : 'Enregistrer'}
              </button>
              {saved && <CheckCircle size={14} style={{ color: '#22c55e' }} />}
              {error && <span style={{ color: '#ef4444', fontSize: 11 }}>{error}</span>}
            </div>
          </div>

          {/* Jours bloqués */}
          <div style={{ paddingTop: 14, marginTop: 14, borderTop: '1px solid #2d4a6b' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555870', textTransform: 'uppercase', marginBottom: 8 }}>
              Jours bloqués
            </div>

            {/* Add blocked date */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input
                type="date"
                value={blockDate}
                onChange={e => setBlockDate(e.target.value)}
                min={format(startOfToday(), 'yyyy-MM-dd')}
                style={{ ...selectStyle, flex: 1 }}
              />
              <input
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                placeholder="Raison…"
                style={{ ...selectStyle, flex: 1, cursor: 'text' }}
              />
              <button
                onClick={addBlockedDate}
                disabled={!blockDate}
                style={{
                  background: blockDate ? '#ef4444' : '#353849',
                  color: 'white', border: 'none',
                  borderRadius: 6, padding: '5px 10px',
                  fontSize: 11, fontWeight: 700, cursor: blockDate ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                <Ban size={10} /> Bloquer
              </button>
            </div>

            {/* List */}
            {blockedDates.length === 0 ? (
              <div style={{ fontSize: 11, color: '#555870' }}>Aucun jour bloqué</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {blockedDates.map(b => (
                  <div
                    key={b.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#243d5c', borderRadius: 6, padding: '5px 10px',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#e8eaf0', textTransform: 'capitalize' }}>
                      {format(new Date(b.blocked_date + 'T00:00:00'), 'EEE d MMM', { locale: fr })}
                      {b.reason && <span style={{ color: '#555870' }}> — {b.reason}</span>}
                    </span>
                    <button
                      onClick={() => removeBlockedDate(b.id)}
                      style={{
                        background: 'transparent', border: 'none',
                        color: '#ef4444', cursor: 'pointer', padding: 2,
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ────────────────────────────────────────────────
export default function AdminAvailability({ onClose }: { onClose: () => void }) {
  const [closers, setClosers] = useState<CloserUser[]>([])

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((users: CloserUser[]) => setClosers(users.filter(u => u.role === 'commercial')))
  }, [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#1d2f4b',
        border: '1px solid #2d4a6b',
        borderRadius: 16,
        width: '100%', maxWidth: 640,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #2d4a6b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} style={{ color: '#b89450' }} />
              Disponibilités des closers
            </div>
            <div style={{ fontSize: 12, color: '#555870', marginTop: 4 }}>
              Gérer le planning récurrent et les jours bloqués de chaque closer
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#243d5c', border: '1px solid #2d4a6b',
              borderRadius: 8, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#8b8fa8',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* List of closers */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {closers.length === 0 && (
            <div style={{ textAlign: 'center', color: '#555870', padding: '24px 0', fontSize: 13 }}>
              Chargement…
            </div>
          )}
          {closers.map(closer => (
            <CloserAvailabilityCard key={closer.id} closer={closer} />
          ))}
        </div>
      </div>
    </div>
  )
}
