'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, startOfWeek, startOfToday, isBefore } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Calendar, Clock, Save, X, Plus, ChevronLeft, ChevronRight,
  Ban, CheckCircle, AlertCircle, User,
} from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'
import LogoutButton from '@/components/LogoutButton'

// ─── Types ──────────────────────────────────────────────────────────────
type CloserUser = {
  id: string
  name: string
  slug: string
  avatar_color: string
  role: string
}

type AvailabilityRule = {
  id?: string
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
  created_at: string
}

// ─── Constantes ─────────────────────────────────────────────────────────
const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
]

const TIME_OPTIONS: string[] = []
for (let h = 7; h <= 21; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

const inputStyle: React.CSSProperties = {
  background: '#252840',
  border: '1px solid #2a2d3e',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#e8eaf0',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// ─── Composant principal ────────────────────────────────────────────────
export default function CloserClient({ user }: { user: CloserUser }) {
  const [activeTab, setActiveTab] = useState<'planning' | 'dispos'>('planning')

  // ── Availability rules ──
  const [rules, setRules] = useState<AvailabilityRule[]>(
    DAYS.map(d => ({
      user_id: user.id,
      day_of_week: d.value,
      start_time: '09:00',
      end_time: '18:00',
      is_active: d.value <= 5,
    }))
  )
  const [rulesSaving, setRulesSaving] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)

  // ── Blocked dates ──
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [blockReason, setBlockReason] = useState('')
  const [blockingDate, setBlockingDate] = useState<string | null>(null)
  const [calendarWeekStart, setCalendarWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  // ── Load data ──
  const loadRules = useCallback(async () => {
    const res = await fetch(`/api/availability?mode=rules&user_id=${user.id}`)
    if (!res.ok) return
    const data: AvailabilityRule[] = await res.json()

    if (data.length > 0) {
      setRules(
        DAYS.map(d => {
          const existing = data.find(r => r.day_of_week === d.value)
          return existing || {
            user_id: user.id,
            day_of_week: d.value,
            start_time: '09:00',
            end_time: '18:00',
            is_active: false,
          }
        })
      )
    }
  }, [user.id])

  const loadBlockedDates = useCallback(async () => {
    const res = await fetch(`/api/blocked-dates?user_id=${user.id}`)
    if (res.ok) setBlockedDates(await res.json())
  }, [user.id])

  useEffect(() => {
    loadRules()
    loadBlockedDates()
  }, [loadRules, loadBlockedDates])

  // ── Save rules ──
  async function saveRules() {
    setRulesSaving(true)
    setRulesError(null)
    setRulesSaved(false)

    try {
      const res = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          rules: rules.map(r => ({
            day_of_week: r.day_of_week,
            start_time: r.start_time,
            end_time: r.end_time,
            is_active: r.is_active,
          })),
        }),
      })

      if (res.ok) {
        setRulesSaved(true)
        setTimeout(() => setRulesSaved(false), 3000)
      } else {
        const data = await res.json()
        setRulesError(data.error || 'Erreur lors de la sauvegarde')
      }
    } finally {
      setRulesSaving(false)
    }
  }

  // ── Block/unblock date ──
  async function blockDate(dateStr: string) {
    const res = await fetch('/api/blocked-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        blocked_date: dateStr,
        reason: blockReason.trim() || null,
      }),
    })
    if (res.ok) {
      setBlockReason('')
      setBlockingDate(null)
      loadBlockedDates()
    }
  }

  async function unblockDate(id: string) {
    await fetch(`/api/blocked-dates?id=${id}`, { method: 'DELETE' })
    loadBlockedDates()
  }

  // ── Rule helpers ──
  function updateRule(dayOfWeek: number, field: string, value: string | boolean) {
    setRules(prev =>
      prev.map(r => r.day_of_week === dayOfWeek ? { ...r, [field]: value } : r)
    )
  }

  // ── Calendar helpers ──
  const calendarDays = Array.from({ length: 28 }, (_, i) => addDays(calendarWeekStart, i))
  const blockedSet = new Set(blockedDates.map(b => b.blocked_date))
  const today = startOfToday()

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1117', color: '#e8eaf0' }}>

      {/* Header */}
      <div style={{
        background: '#1a1d27', borderBottom: '1px solid #2a2d3e',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `${user.avatar_color}20`,
            border: `1px solid ${user.avatar_color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={17} style={{ color: user.avatar_color }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: '#555870' }}>Mon espace closer</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#252840', borderRadius: 8, padding: 3, border: '1px solid #2a2d3e' }}>
          {([
            { key: 'planning' as const, label: 'Mon planning', icon: <Calendar size={13} /> },
            { key: 'dispos' as const, label: 'Mes dispos', icon: <Clock size={13} /> },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: activeTab === tab.key ? user.avatar_color : 'transparent',
                border: 'none', borderRadius: 6, padding: '6px 16px',
                color: activeTab === tab.key ? 'white' : '#8b8fa8',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <LogoutButton />
      </div>

      {/* ── Tab: Mon planning ──────────────────────────────────────────── */}
      {activeTab === 'planning' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <WeekCalendar closerId={user.id} closerColor={user.avatar_color} />
        </div>
      )}

      {/* ── Tab: Mes disponibilités ────────────────────────────────────── */}
      {activeTab === 'dispos' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

            {/* Section 1 : Planning hebdomadaire */}
            <div style={{
              background: '#1e2130', border: '1px solid #2a2d3e',
              borderRadius: 14, padding: '20px 24px', marginBottom: 20,
            }}>
              <div style={{
                fontSize: 14, fontWeight: 700, marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Clock size={16} style={{ color: '#4f6ef7' }} />
                Planning hebdomadaire récurrent
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DAYS.map(day => {
                  const rule = rules.find(r => r.day_of_week === day.value)!
                  return (
                    <div
                      key={day.value}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '120px 44px 1fr 20px 1fr',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        background: rule.is_active ? 'rgba(79,110,247,0.05)' : '#252840',
                        border: `1px solid ${rule.is_active ? 'rgba(79,110,247,0.2)' : '#2a2d3e'}`,
                        borderRadius: 10,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{
                        fontWeight: 600, fontSize: 14,
                        color: rule.is_active ? '#e8eaf0' : '#555870',
                      }}>
                        {day.label}
                      </div>

                      <button
                        onClick={() => updateRule(day.value, 'is_active', !rule.is_active)}
                        style={{
                          width: 44, height: 24, borderRadius: 12,
                          background: rule.is_active ? '#4f6ef7' : '#353849',
                          border: 'none', cursor: 'pointer',
                          position: 'relative', transition: 'background 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'white',
                          position: 'absolute', top: 3,
                          left: rule.is_active ? 23 : 3,
                          transition: 'left 0.2s',
                        }} />
                      </button>

                      <select
                        value={rule.start_time}
                        onChange={e => updateRule(day.value, 'start_time', e.target.value)}
                        disabled={!rule.is_active}
                        style={{ ...inputStyle, opacity: rule.is_active ? 1 : 0.3 }}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>

                      <div style={{ textAlign: 'center', color: '#555870', fontSize: 13 }}>→</div>

                      <select
                        value={rule.end_time}
                        onChange={e => updateRule(day.value, 'end_time', e.target.value)}
                        disabled={!rule.is_active}
                        style={{ ...inputStyle, opacity: rule.is_active ? 1 : 0.3 }}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <button
                  onClick={saveRules}
                  disabled={rulesSaving}
                  style={{
                    background: '#4f6ef7', color: 'white', border: 'none',
                    borderRadius: 10, padding: '10px 24px',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    opacity: rulesSaving ? 0.7 : 1,
                  }}
                >
                  <Save size={15} />
                  {rulesSaving ? 'Enregistrement…' : 'Enregistrer le planning'}
                </button>

                {rulesSaved && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
                    <CheckCircle size={15} /> Enregistré
                  </div>
                )}

                {rulesError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 13 }}>
                    <AlertCircle size={15} /> {rulesError}
                  </div>
                )}
              </div>
            </div>

            {/* Section 2 : Jours bloqués */}
            <div style={{
              background: '#1e2130', border: '1px solid #2a2d3e',
              borderRadius: 14, padding: '20px 24px',
            }}>
              <div style={{
                fontSize: 14, fontWeight: 700, marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Ban size={16} style={{ color: '#ef4444' }} />
                Jours bloqués (vacances, indisponibilités)
              </div>

              {/* Mini calendar navigation */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
              }}>
                <button
                  onClick={() => setCalendarWeekStart(prev => addDays(prev, -7))}
                  style={{
                    background: '#252840', border: '1px solid #2a2d3e',
                    borderRadius: 6, width: 28, height: 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#8b8fa8',
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#8b8fa8' }}>
                  {format(calendarWeekStart, 'd MMM', { locale: fr })} — {format(addDays(calendarWeekStart, 27), 'd MMM yyyy', { locale: fr })}
                </div>
                <button
                  onClick={() => setCalendarWeekStart(prev => addDays(prev, 7))}
                  style={{
                    background: '#252840', border: '1px solid #2a2d3e',
                    borderRadius: 6, width: 28, height: 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#8b8fa8',
                  }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Calendar grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                  <div key={d} style={{
                    textAlign: 'center', fontSize: 10, fontWeight: 600,
                    color: '#555870', textTransform: 'uppercase', padding: '4px 0',
                  }}>
                    {d}
                  </div>
                ))}

                {calendarDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const isBlocked = blockedSet.has(dateStr)
                  const isPast = isBefore(day, today)
                  const isSunday = day.getDay() === 0
                  const isConfirming = blockingDate === dateStr

                  return (
                    <div key={dateStr} style={{ position: 'relative' }}>
                      <button
                        onClick={() => {
                          if (isPast || isSunday) return
                          if (isBlocked) {
                            const blocked = blockedDates.find(b => b.blocked_date === dateStr)
                            if (blocked) unblockDate(blocked.id)
                          } else {
                            setBlockingDate(isConfirming ? null : dateStr)
                          }
                        }}
                        disabled={isPast || isSunday}
                        style={{
                          width: '100%', aspectRatio: '1',
                          background: isBlocked
                            ? 'rgba(239,68,68,0.15)'
                            : isConfirming
                              ? 'rgba(245,158,11,0.15)'
                              : '#252840',
                          border: `1px solid ${
                            isBlocked ? 'rgba(239,68,68,0.4)' :
                            isConfirming ? 'rgba(245,158,11,0.4)' :
                            '#2a2d3e'
                          }`,
                          borderRadius: 8,
                          color: isPast || isSunday ? '#353849' :
                            isBlocked ? '#ef4444' :
                            isConfirming ? '#f59e0b' : '#8b8fa8',
                          fontSize: 13, fontWeight: 600,
                          cursor: isPast || isSunday ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {format(day, 'd')}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Block date form */}
              {blockingDate && (
                <div style={{
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 10, padding: '12px 16px', marginBottom: 12,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Bloquer le {format(new Date(blockingDate + 'T00:00:00'), 'EEEE d MMMM', { locale: fr })}
                  </div>
                  <input
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                    placeholder="Raison (optionnel)…"
                    style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                  />
                  <button
                    onClick={() => blockDate(blockingDate)}
                    style={{
                      background: '#f59e0b', color: '#1e2130', border: 'none',
                      borderRadius: 8, padding: '7px 14px',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    <Plus size={12} style={{ display: 'inline', verticalAlign: -2 }} /> Bloquer
                  </button>
                  <button
                    onClick={() => { setBlockingDate(null); setBlockReason('') }}
                    style={{
                      background: 'transparent', border: '1px solid #2a2d3e',
                      borderRadius: 8, padding: '6px 8px',
                      color: '#8b8fa8', cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Blocked dates list */}
              {blockedDates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {blockedDates.map(b => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: '#252840', border: '1px solid #2a2d3e',
                        borderRadius: 8, padding: '8px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Ban size={13} style={{ color: '#ef4444' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0', textTransform: 'capitalize' }}>
                          {format(new Date(b.blocked_date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
                        </span>
                        {b.reason && (
                          <span style={{ fontSize: 12, color: '#555870' }}>— {b.reason}</span>
                        )}
                      </div>
                      <button
                        onClick={() => unblockDate(b.id)}
                        style={{
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: 6, padding: '4px 10px',
                          color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Débloquer
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {blockedDates.length === 0 && !blockingDate && (
                <div style={{ fontSize: 12, color: '#555870', textAlign: 'center', padding: '8px 0' }}>
                  Aucun jour bloqué. Cliquez sur une date ci-dessus pour la bloquer.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
