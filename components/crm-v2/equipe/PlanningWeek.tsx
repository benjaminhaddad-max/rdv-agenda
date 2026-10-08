'use client'

/**
 * Équipe › Télépros › Planning : pour chaque télépro, du lundi au dimanche,
 * ses horaires d'appel (imposés 🔒 ou saisis par lui) et, une fois la journée
 * passée, le bilan Aircall (bien fait / partiel / pas d'appel, appels, ≥ 2 min,
 * RDV, 1er → dernier appel). Clic sur une case → modifier / imposer.
 */

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Avatar, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { parisDateKey } from '@/lib/date-paris'
import {
  DayScheduleEditor, DayStats, SlotChip, VERDICTS, VerdictPill, WEEKDAYS, fmtMinutes, type DayReport,
} from '@/components/planning/PlanningUi'

type Member = { id: string; name: string; email: string | null; avatar_color: string | null }
type Data = { week_start: string; ready: boolean; dates: string[]; telepros: Member[]; report: Record<string, DayReport[]> }

export default function PlanningWeek({ weekStart, refreshKey, search }: { weekStart: string; refreshKey: number; search: string }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ member: Member; day: DayReport } | null>(null)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/planning?week=${weekStart}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Planning indisponible'); return }
      setData(j as Data)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load, refreshKey, tick])

  async function save(member: Member, date: string, slots: Array<{ start: string; end: string; locked: boolean }>, applyTo: string[]) {
    const res = await fetch('/api/admin/planning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.id, date, slots, apply_to: applyTo }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return j.error || 'Enregistrement impossible'
    setEditing(null)
    setTick(t => t + 1)
    return null
  }

  if (loading && !data) return <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><AdminSpin size={20} /></div>
  if (error) return <AdminNotice tone="error">{error}</AdminNotice>
  if (!data) return null

  const today = parisDateKey(new Date())
  const q = search.trim().toLowerCase()
  const members = q ? data.telepros.filter(m => m.name.toLowerCase().includes(q)) : data.telepros

  const weekTotals = (days: DayReport[]) => {
    const t = { planned: 0, calls: 0, talk2: 0, rdv: 0, ok: 0, partiel: 0, absent: 0 }
    for (const d of days) {
      t.planned += d.planned_min; t.calls += d.calls; t.talk2 += d.talk2; t.rdv += d.rdv
      if (d.verdict === 'ok') t.ok++
      else if (d.verdict === 'partiel') t.partiel++
      else if (d.verdict === 'absent') t.absent++
    }
    return t
  }

  const cell = (m: Member, d: DayReport) => {
    const past = d.date < today
    return (
      <button
        type="button"
        onClick={() => setEditing({ member: m, day: d })}
        title={past ? 'Voir le bilan / modifier' : 'Définir ou imposer les horaires'}
        style={{
          width: '100%', minHeight: 64, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', gap: 4, padding: 6, borderRadius: 10,
          border: `1px solid ${d.date === today ? crmV2.goldBorder : 'transparent'}`,
          background: d.verdict === 'absent' ? 'rgba(220,38,38,0.05)' : d.verdict === 'partiel' ? 'rgba(217,119,6,0.05)' : 'transparent',
        }}
      >
        {d.slots.length > 0 ? (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {d.slots.map(s => <SlotChip key={s.id} slot={s} />)}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: crmV2.textFaint }}>{past ? 'Pas de créneau' : '+ horaires'}</span>
        )}
        {(past || d.date === today) && <VerdictPill verdict={d.verdict} small />}
        <DayStats day={d} compact />
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!data.ready && (
        <AdminNotice tone="warning">Planning pas encore activé : la migration BDD v57 est à lancer dans Supabase.</AdminNotice>
      )}

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map(m => {
            const days = data.report[m.id] ?? []
            const t = weekTotals(days)
            return (
              <div key={m.id} style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CrmV2Avatar name={m.name} color={m.avatar_color ?? crmV2.gold} size={26} radius="36%" />
                  <span style={{ fontWeight: 700 }}>{m.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: crmV2.textMuted }}>{fmtMinutes(t.planned)} · {t.calls} appels · {t.rdv} RDV</span>
                </div>
                {days.map((d, i) => (
                  <div key={d.date} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 4 }}>
                    <span style={{ width: 34, fontSize: 12, fontWeight: 700, color: crmV2.textMuted, paddingTop: 8 }}>{WEEKDAYS[i]}</span>
                    <div style={{ flex: 1 }}>{cell(m, d)}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : (
        <CrmV2TableCard
          footer={
            <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={12} color="#7c3aed" /> imposé par la direction</span>
              {(['ok', 'partiel', 'absent', 'hors_planning'] as const).map(v => (
                <span key={v} title={VERDICTS[v].hint}><VerdictPill verdict={v} small /></span>
              ))}
              <span>· un créneau est « bien fait » s&apos;il y a des appels du début à la fin (±20 min) et au moins 70 % des demi-heures couvertes.</span>
            </span>
          }
        >
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Télépro</CrmV2Th>
                {data.dates.map((d, i) => (
                  <CrmV2Th key={d} style={{ minWidth: 112, color: d === today ? crmV2.goldDark : undefined }}>
                    {WEEKDAYS[i]} {Number(d.slice(8))}
                  </CrmV2Th>
                ))}
                <CrmV2Th style={{ textAlign: 'right' }}>Semaine</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr><CrmV2Td colSpan={9} style={{ color: crmV2.textMuted }}>Aucun télépro.</CrmV2Td></tr>
              )}
              {members.map(m => {
                const days = data.report[m.id] ?? []
                const t = weekTotals(days)
                return (
                  <Fragment key={m.id}>
                    <tr>
                      <CrmV2Td style={{ verticalAlign: 'top', paddingTop: 10, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <CrmV2Avatar name={m.name} color={m.avatar_color ?? crmV2.gold} size={24} radius="36%" />
                          <span style={{ fontWeight: 600 }}>{m.name}</span>
                        </span>
                      </CrmV2Td>
                      {days.map(d => (
                        <CrmV2Td key={d.date} style={{ height: 'auto', padding: '4px 4px', verticalAlign: 'top', borderLeft: `1px solid ${crmV2.borderLight}` }}>
                          {cell(m, d)}
                        </CrmV2Td>
                      ))}
                      <CrmV2Td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 10, whiteSpace: 'nowrap', fontSize: 12, color: crmV2.textMuted }}>
                        <div style={{ fontWeight: 700, color: crmV2.text }}>{fmtMinutes(t.planned)} prévues</div>
                        <div>{t.calls} appels · {t.talk2} ≥2min</div>
                        <div style={{ color: t.rdv ? crmV2.goldDark : undefined }}>{t.rdv} RDV placés</div>
                        {(t.ok + t.partiel + t.absent) > 0 && (
                          <div>
                            <span style={{ color: VERDICTS.ok.color }}>{t.ok} ✓</span>{' · '}
                            <span style={{ color: VERDICTS.partiel.color }}>{t.partiel} ~</span>{' · '}
                            <span style={{ color: VERDICTS.absent.color }}>{t.absent} ✗</span>
                          </div>
                        )}
                      </CrmV2Td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </CrmV2Table>
        </CrmV2TableCard>
      )}

      <DayScheduleEditor
        open={!!editing}
        title={editing ? `Horaires d'appel · ${editing.member.name}` : ''}
        day={editing?.day ?? null}
        weekDates={data.dates}
        canImpose
        onClose={() => setEditing(null)}
        onSave={(slots, applyTo) => editing ? save(editing.member, editing.day.date, slots, applyTo) : Promise.resolve(null)}
      />
    </div>
  )
}

