'use client'

/**
 * Espace télépro › « Mes horaires » : sa semaine d'appel du lundi au dimanche.
 * Il saisit son amplitude jour par jour ; les horaires imposés par la
 * direction (🔒) s'affichent sans pouvoir être modifiés. Chaque journée passée
 * montre son bilan Aircall (appels, ≥ 2 min, RDV, 1er → dernier appel).
 * API : /api/telepro/planning (cf. lib/telepro-planning.ts).
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, Pencil } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { addParisDays, parisDateKey, parisWeekStartKey } from '@/lib/date-paris'
import {
  DayScheduleEditor, DayStats, SlotChip, VerdictPill, dayLabel, fmtMinutes, type DayReport,
} from '@/components/planning/PlanningUi'

export default function MyCallSchedule({ userId, readOnly = false }: { userId?: string; readOnly?: boolean }) {
  const isMobile = useIsMobile()
  const [weekStart, setWeekStart] = useState(() => parisWeekStartKey(new Date()))
  const [days, setDays] = useState<DayReport[]>([])
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<DayReport | null>(null)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ week: weekStart })
      if (userId) params.set('user_id', userId)
      const res = await fetch(`/api/telepro/planning?${params}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Planning indisponible'); return }
      setDays(Array.isArray(j.days) ? j.days : [])
      setReady(j.ready !== false)
    } finally {
      setLoading(false)
    }
  }, [weekStart, userId])

  useEffect(() => { load() }, [load, tick])

  async function save(date: string, slots: Array<{ start: string; end: string }>): Promise<string | null> {
    const res = await fetch('/api/telepro/planning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, slots }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return j.error || 'Enregistrement impossible'
    setEditing(null)
    setTick(t => t + 1)
    return null
  }

  const today = parisDateKey(new Date())
  const planned = days.reduce((s, d) => s + d.planned_min, 0)
  const calls = days.reduce((s, d) => s + d.calls, 0)
  const talk2 = days.reduce((s, d) => s + d.talk2, 0)
  const rdv = days.reduce((s, d) => s + d.rdv, 0)
  const isCurrentWeek = weekStart === parisWeekStartKey(new Date())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: isMobile ? 12 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <CrmV2Button size="sm" icon={<ChevronLeft size={13} />} onClick={() => setWeekStart(w => addParisDays(w, -7))}>{''}</CrmV2Button>
          <CrmV2Button size="sm" onClick={() => setWeekStart(parisWeekStartKey(new Date()))} disabled={isCurrentWeek}>Cette semaine</CrmV2Button>
          <CrmV2Button size="sm" icon={<ChevronRight size={13} />} onClick={() => setWeekStart(w => addParisDays(w, 7))}>{''}</CrmV2Button>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>
          Semaine du {dayLabel(weekStart, true).replace(/^\S+\s/, '')}
        </span>
        {loading && <AdminSpin />}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: crmV2.textMuted }}>
          <strong style={{ color: crmV2.text }}>{fmtMinutes(planned)}</strong> prévues · {calls} appels · {talk2} ≥2min · <strong style={{ color: crmV2.goldDark }}>{rdv} RDV</strong>
        </span>
      </div>

      {!ready && <AdminNotice tone="warning">Le planning n&apos;est pas encore activé. Il le sera très bientôt.</AdminNotice>}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {!readOnly && (
        <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>
          Indique tes horaires d&apos;appel pour chaque jour. Les horaires <Lock size={11} style={{ verticalAlign: '-1px' }} color="#7c3aed" /> sont fixés par la direction.
        </div>
      )}

      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))',
      }}>
        {days.map(d => {
          const past = d.date < today
          const locked = d.slots.some(s => s.locked)
          const editable = !readOnly && !past && !locked && ready
          return (
            <div key={d.date} style={{
              background: crmV2.bg, borderRadius: crmV2.radiusLg, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
              border: `1px solid ${d.date === today ? crmV2.goldBorder : crmV2.border}`, boxShadow: crmV2.shadow,
              opacity: past && !d.slots.length && !d.calls ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: d.date === today ? crmV2.goldDark : crmV2.text, textTransform: 'capitalize' }}>
                  {dayLabel(d.date)}{d.date === today ? ' · aujourd’hui' : ''}
                </span>
                {editable && (
                  <button type="button" onClick={() => setEditing(d)} title="Modifier mes horaires" style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: crmV2.link, display: 'inline-flex', padding: 2,
                  }}>
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              {d.slots.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {d.slots.map(s => <SlotChip key={s.id} slot={s} />)}
                </div>
              ) : editable ? (
                <button type="button" onClick={() => setEditing(d)} style={{
                  border: `1px dashed ${crmV2.borderStrong}`, borderRadius: 10, background: 'none', padding: '8px 6px',
                  fontSize: 12.5, color: crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  + Ajouter mes horaires
                </button>
              ) : (
                <span style={{ fontSize: 12, color: crmV2.textFaint }}>Pas de créneau</span>
              )}
              {locked && <span style={{ fontSize: 11, color: '#6d28d9' }}>Fixé par la direction</span>}
              {(past || d.date === today) && <VerdictPill verdict={d.verdict} small />}
              <DayStats day={d} />
            </div>
          )
        })}
      </div>

      <DayScheduleEditor
        open={!!editing}
        title="Mes horaires d'appel"
        day={editing}
        canImpose={false}
        onClose={() => setEditing(null)}
        onSave={slots => editing ? save(editing.date, slots) : Promise.resolve(null)}
      />
    </div>
  )
}
