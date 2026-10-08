'use client'

/**
 * Briques communes du planning d'appel télépro : pastille de bilan, plages,
 * résumé d'une journée, éditeur d'horaires. Utilisées par la vue admin
 * (components/crm-v2/equipe/PlanningWeek.tsx) et par l'espace télépro
 * (components/telepro-v2/MyCallSchedule.tsx). Données : lib/telepro-planning.ts.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Input } from '@/components/crm-v2/primitives'
import { AdminModal, AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import { addParisDays } from '@/lib/date-paris'
import type { DayReport, DayVerdict, SlotReport } from '@/lib/telepro-planning'

export type { DayReport, SlotReport }

export const VERDICTS: Record<DayVerdict, { label: string; color: string; hint: string }> = {
  ok: { label: 'Bien fait', color: '#16a34a', hint: 'Appels du début à la fin du créneau' },
  partiel: { label: 'Partiel', color: '#d97706', hint: 'Commencé en retard, fini en avance ou trous dans le créneau' },
  absent: { label: "Pas d'appel", color: '#dc2626', hint: 'Aucun appel sortant pendant le créneau' },
  en_cours: { label: 'En cours', color: '#0091ae', hint: 'Créneau en cours' },
  a_venir: { label: 'À venir', color: '#7c98b6', hint: 'Créneau à venir' },
  hors_planning: { label: 'Hors planning', color: '#64748b', hint: 'Des appels sans créneau prévu' },
  repos: { label: '—', color: '#cbd6e2', hint: 'Ni créneau ni appel' },
}

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export function dayLabel(date: string, long = false): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return dt.toLocaleDateString('fr-FR', {
    timeZone: 'UTC', weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : undefined,
  })
}

export function fmtMinutes(min: number): string {
  if (!min) return '0h'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function VerdictPill({ verdict, small = false }: { verdict: DayVerdict; small?: boolean }) {
  if (verdict === 'repos') return null
  const v = VERDICTS[verdict]
  return (
    <span title={v.hint} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, whiteSpace: 'nowrap',
      padding: small ? '1px 7px' : '2px 9px', fontSize: small ? 10 : 11, fontWeight: 700,
      color: v.color, background: `${v.color}17`, border: `1px solid ${v.color}40`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: v.color }} />
      {v.label}
    </span>
  )
}

export function SlotChip({ slot }: { slot: Pick<SlotReport, 'start' | 'end' | 'locked'> }) {
  return (
    <span title={slot.locked ? 'Horaire imposé par la direction' : 'Horaire saisi par le télépro'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 8,
      fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      color: slot.locked ? '#5b21b6' : crmV2.text,
      background: slot.locked ? 'rgba(124,58,237,0.09)' : crmV2.bgSoft,
      border: `1px solid ${slot.locked ? 'rgba(124,58,237,0.28)' : crmV2.border}`,
    }}>
      {slot.locked && <Lock size={10} />}
      {slot.start}–{slot.end}
    </span>
  )
}

/** Résumé chiffré d'une journée (appels, ≥ 2 min, RDV, 1er / dernier appel). */
export function DayStats({ day, compact = false }: { day: DayReport; compact?: boolean }) {
  if (!day.calls && !day.rdv) return null
  const parts: ReactNode[] = [
    <span key="c"><strong>{day.calls}</strong> appel{day.calls > 1 ? 's' : ''}</span>,
    <span key="t"><strong>{day.talk2}</strong> ≥2min</span>,
    <span key="r" style={{ color: day.rdv ? crmV2.goldDark : undefined }}><strong>{day.rdv}</strong> RDV</span>,
  ]
  return (
    <div style={{ fontSize: compact ? 10.5 : 12, color: crmV2.textMuted, lineHeight: 1.35 }}>
      <div style={{ display: 'flex', gap: compact ? 5 : 8, flexWrap: 'wrap' }}>{parts}</div>
      {day.first_call && (
        <div style={{ fontVariantNumeric: 'tabular-nums' }}>
          {day.first_call} → {day.last_call}
        </div>
      )}
    </div>
  )
}

// ── Éditeur d'horaires d'une journée ────────────────────────────────────────

type EditSlot = { start: string; end: string; locked: boolean }

export function DayScheduleEditor({
  open, title, day, weekDates, canImpose, onClose, onSave,
}: {
  open: boolean
  title: ReactNode
  day: DayReport | null
  /** Jours de la semaine affichée (pour « recopier sur ») — admin seulement */
  weekDates?: string[]
  /** Admin : case « imposer » + recopie sur d'autres jours */
  canImpose: boolean
  onClose: () => void
  onSave: (slots: EditSlot[], applyTo: string[]) => Promise<string | null>
}) {
  const [slots, setSlots] = useState<EditSlot[]>([])
  const [applyTo, setApplyTo] = useState<Set<string>>(new Set())
  const [repeatWeeks, setRepeatWeeks] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!day) return
    const existing = day.slots
      .filter(s => canImpose || !s.locked)
      .map(s => ({ start: s.start, end: s.end, locked: s.locked }))
    setSlots(existing.length ? existing : [{ start: '10:00', end: '13:00', locked: canImpose }])
    setApplyTo(new Set())
    setRepeatWeeks(0)
    setError(null)
  }, [day, canImpose])

  function patch(i: number, p: Partial<EditSlot>) {
    setSlots(prev => prev.map((s, j) => j === i ? { ...s, ...p } : s))
  }

  async function save() {
    for (const s of slots) {
      if (!s.start || !s.end || s.start >= s.end) { setError("Chaque plage doit finir après son début."); return }
    }
    setSaving(true)
    setError(null)
    // Répétition : mêmes jours de la semaine sur les N semaines suivantes
    const base = day ? [day.date, ...applyTo] : [...applyTo]
    const dates = new Set(applyTo)
    for (let w = 1; w <= repeatWeeks; w++) for (const d of base) dates.add(addParisDays(d, 7 * w))
    if (day) dates.delete(day.date)
    const err = await onSave(slots, [...dates])
    setSaving(false)
    if (err) setError(err)
  }

  const otherDays = (weekDates ?? []).filter(d => d !== day?.date)

  return (
    <AdminModal
      open={open && !!day}
      onClose={onClose}
      closeDisabled={saving}
      width={520}
      title={title}
      subtitle={day ? dayLabel(day.date, true) : undefined}
      footer={
        <>
          <CrmV2Button onClick={onClose} disabled={saving}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {day && day.slots.some(s => s.verdict !== 'a_venir') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 12, background: crmV2.bgHover, border: `1px solid ${crmV2.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bilan</span>
              <VerdictPill verdict={day.verdict} />
            </div>
            {day.slots.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: crmV2.text, flexWrap: 'wrap' }}>
                <SlotChip slot={s} />
                <span>{s.calls} appel{s.calls > 1 ? 's' : ''}</span>
                {s.first_call && <span style={{ color: crmV2.textMuted }}>1er {s.first_call} · dernier {s.last_call}</span>}
                {s.coverage_pct != null && <span style={{ color: crmV2.textMuted }}>couverture {s.coverage_pct} %</span>}
                <VerdictPill verdict={s.verdict} small />
              </div>
            ))}
            <DayStats day={day} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slots.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Input type="time" step={900} value={s.start} onChange={e => patch(i, { start: e.target.value })} style={{ width: 120 }} />
              <span style={{ color: crmV2.textMuted }}>→</span>
              <CrmV2Input type="time" step={900} value={s.end} onChange={e => patch(i, { end: e.target.value })} style={{ width: 120 }} />
              {canImpose && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: crmV2.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={s.locked} onChange={e => patch(i, { locked: e.target.checked })} style={{ accentColor: '#7c3aed', width: 16, height: 16 }} />
                  <Lock size={12} color="#7c3aed" /> Imposer
                </label>
              )}
              <button type="button" onClick={() => setSlots(prev => prev.filter((_, j) => j !== i))} title="Retirer la plage" style={{
                marginLeft: 'auto', background: 'none', border: 'none', color: '#d13a41', cursor: 'pointer', padding: 4, display: 'inline-flex',
              }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div>
            <CrmV2Button size="sm" icon={<Plus size={13} />} onClick={() => setSlots(prev => [...prev, { start: prev.length ? prev[prev.length - 1].end : '14:00', end: '18:00', locked: canImpose }])}>
              Ajouter une plage
            </CrmV2Button>
          </div>
          {!slots.length && <div style={{ fontSize: 12, color: crmV2.textMuted }}>Aucune plage : journée non travaillée.</div>}
        </div>

        {canImpose && otherDays.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Recopier aussi sur</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {otherDays.map(d => {
                const on = applyTo.has(d)
                return (
                  <button key={d} type="button" onClick={() => setApplyTo(prev => {
                    const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n
                  })} style={{
                    padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${on ? crmV2.goldBorder : crmV2.border}`, background: on ? crmV2.goldSoft : crmV2.bg,
                    color: on ? crmV2.goldDark : crmV2.textMuted,
                  }}>
                    {dayLabel(d)}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {canImpose && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>Répéter chaque semaine</span>
            {[0, 4, 8, 12, 26].map(n => (
              <button key={n} type="button" onClick={() => setRepeatWeeks(n)} style={{
                padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${repeatWeeks === n ? crmV2.goldBorder : crmV2.border}`,
                background: repeatWeeks === n ? crmV2.goldSoft : crmV2.bg, color: repeatWeeks === n ? crmV2.goldDark : crmV2.textMuted,
              }}>
                {n === 0 ? 'Non' : n === 26 ? '6 mois' : `${n} semaines`}
              </button>
            ))}
          </div>
        )}
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
      </div>
    </AdminModal>
  )
}
