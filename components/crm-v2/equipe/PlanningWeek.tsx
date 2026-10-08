'use client'

/**
 * Équipe › Télépros : planning de la semaine, affiché en haut de l'onglet.
 * Une ligne par télépro, du lundi au dimanche :
 * - horaires prévus (imposés 🔒 ou saisis par le télépro) ;
 * - sans horaires : l'activité réelle d'après Aircall (1er → dernier appel) ;
 * - une fois la journée passée : bilan (bien fait / partiel / pas d'appel).
 * En tête de chaque jour : télépros présents (au moins un appel) et prévus.
 * Clic sur une case → modifier, imposer, répéter chaque semaine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Avatar } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { parisDateKey } from '@/lib/date-paris'
import {
  DayScheduleEditor, SlotChip, VERDICTS, VerdictPill, WEEKDAYS, fmtMinutes, type DayReport,
} from '@/components/planning/PlanningUi'

type Member = { id: string; name: string; email: string | null; avatar_color: string | null }
type Data = { week_start: string; ready: boolean; dates: string[]; telepros: Member[]; report: Record<string, DayReport[]> }

export default function PlanningWeek({ weekStart, refreshKey, onSaved }: {
  weekStart: string
  refreshKey: number
  /** Appelé après un enregistrement (pour rafraîchir le reste de la page) */
  onSaved?: () => void
}) {
  const isMobile = useIsMobile()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ member: Member; day: DayReport } | null>(null)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(true)
  const [showIdle, setShowIdle] = useState(false)

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
    onSaved?.()
    return null
  }

  const today = parisDateKey(new Date())

  // Télépros actifs cette semaine (horaires ou appels) en premier
  const { active, idle } = useMemo(() => {
    if (!data) return { active: [] as Member[], idle: [] as Member[] }
    const has = (m: Member) => (data.report[m.id] ?? []).some(d => d.slots.length || d.calls)
    return { active: data.telepros.filter(has), idle: data.telepros.filter(m => !has(m)) }
  }, [data])

  const dayCounts = useMemo(() => {
    if (!data) return []
    return data.dates.map((_, i) => {
      let present = 0, planned = 0
      for (const m of data.telepros) {
        const d = data.report[m.id]?.[i]
        if (!d) continue
        if (d.calls > 0) present++
        if (d.slots.length) planned++
      }
      return { present, planned }
    })
  }, [data])

  const title = (
    <button type="button" onClick={() => setOpen(o => !o)} style={{
      appearance: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
      display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: crmV2.text,
    }}>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Planning de la semaine
      {loading && <AdminSpin />}
    </button>
  )

  if (error) return <AdminNotice tone="error">{error}</AdminNotice>

  const cell = (m: Member, d: DayReport) => {
    const past = d.date < today
    const activityOnly = !d.slots.length && d.calls > 0
    return (
      <button
        type="button"
        onClick={() => setEditing({ member: m, day: d })}
        title={past ? 'Voir le bilan / corriger les horaires' : 'Définir ou imposer les horaires'}
        style={{
          width: '100%', minHeight: 44, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', gap: 3, padding: 5, borderRadius: 8,
          border: `1px solid ${d.date === today ? crmV2.goldBorder : 'transparent'}`,
          background: d.verdict === 'absent' ? 'rgba(220,38,38,0.06)' : d.verdict === 'partiel' ? 'rgba(217,119,6,0.06)' : 'transparent',
        }}
      >
        {d.slots.length > 0 && (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {d.slots.map(s => <SlotChip key={s.id} slot={s} />)}
          </span>
        )}
        {activityOnly && (
          <span title="Pas d'horaires prévus : amplitude réelle d'après Aircall" style={{
            display: 'inline-flex', alignSelf: 'flex-start', padding: '2px 6px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
            color: '#475569', border: '1px dashed #94a3b8', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>
            {d.first_call}–{d.last_call}
          </span>
        )}
        {!d.slots.length && !d.calls && (
          <span style={{ fontSize: 11, color: crmV2.textFaint }}>{past ? '—' : '+'}</span>
        )}
        {d.slots.length > 0 && (past || d.date === today) && <VerdictPill verdict={d.verdict} small />}
        {d.calls > 0 && (
          <span style={{ fontSize: 10.5, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
            {d.calls} app. · {d.talk2} ≥2m · <span style={{ color: d.rdv ? crmV2.goldDark : undefined, fontWeight: d.rdv ? 700 : 400 }}>{d.rdv} RDV</span>
          </span>
        )}
      </button>
    )
  }

  const rows = showIdle ? [...active, ...idle] : active
  const gridCols = isMobile ? '120px repeat(7, 110px) 110px' : '170px repeat(7, minmax(0, 1fr)) 120px'

  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
        {title}
        {open && (
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5, color: crmV2.textMuted }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} color="#7c3aed" /> imposé</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 10, border: '1px dashed #94a3b8', borderRadius: 3 }} /> activité réelle sans horaires
            </span>
            {(['ok', 'partiel', 'absent'] as const).map(v => <span key={v} title={VERDICTS[v].hint}><VerdictPill verdict={v} small /></span>)}
          </span>
        )}
      </div>

      {open && data && (
        <>
          {!data.ready && (
            <div style={{ padding: '0 14px 10px' }}>
              <AdminNotice tone="warning">Planning pas encore activé : la migration BDD v57 est à lancer dans Supabase.</AdminNotice>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: isMobile ? 1000 : 900 }}>
              {/* En-têtes de jours + présents / prévus */}
              <div style={{
                display: 'grid', gridTemplateColumns: gridCols, background: crmV2.thBg,
                borderTop: `1px solid ${crmV2.border}`, borderBottom: `2px solid ${crmV2.thBorder}`,
              }}>
                <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Télépro</div>
                {data.dates.map((d, i) => (
                  <div key={d} style={{ padding: '6px 6px', borderLeft: `1px solid ${crmV2.borderLight}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: d === today ? crmV2.goldDark : crmV2.text }}>
                      {WEEKDAYS[i]} {Number(d.slice(8))}
                    </div>
                    <div style={{ fontSize: 11, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                      {d <= today
                        ? <><strong style={{ color: dayCounts[i]?.present ? crmV2.successStrong : crmV2.textFaint }}>{dayCounts[i]?.present ?? 0}</strong> présent{(dayCounts[i]?.present ?? 0) > 1 ? 's' : ''}</>
                        : null}
                      {dayCounts[i]?.planned ? `${d <= today ? ' · ' : ''}${dayCounts[i].planned} prévu${dayCounts[i].planned > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                ))}
                <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Semaine</div>
              </div>

              {rows.map(m => {
                const days = data.report[m.id] ?? []
                const planned = days.reduce((s, d) => s + d.planned_min, 0)
                const presentDays = days.filter(d => d.calls > 0).length
                const rdv = days.reduce((s, d) => s + d.rdv, 0)
                return (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: `1px solid ${crmV2.borderLight}` }}>
                    <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <CrmV2Avatar name={m.name} color={m.avatar_color ?? crmV2.gold} size={22} radius="36%" />
                      <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                    </div>
                    {days.map(d => (
                      <div key={d.date} style={{ padding: 2, borderLeft: `1px solid ${crmV2.borderLight}` }}>{cell(m, d)}</div>
                    ))}
                    <div style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11.5, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: crmV2.text }}>{presentDays} j présent{presentDays > 1 ? 's' : ''}</div>
                      <div>{planned ? `${fmtMinutes(planned)} prévues` : 'sans horaires'}</div>
                      <div style={{ color: rdv ? crmV2.goldDark : undefined }}>{rdv} RDV</div>
                    </div>
                  </div>
                )
              })}
              {idle.length > 0 && (
                <button type="button" onClick={() => setShowIdle(s => !s)} style={{
                  appearance: 'none', background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 600, color: crmV2.link,
                }}>
                  {showIdle ? 'Masquer' : 'Afficher'} les {idle.length} télépro{idle.length > 1 ? 's' : ''} sans activité ni horaires cette semaine
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <DayScheduleEditor
        open={!!editing}
        title={editing ? `Horaires d'appel · ${editing.member.name}` : ''}
        day={editing?.day ?? null}
        weekDates={data?.dates}
        canImpose
        onClose={() => setEditing(null)}
        onSave={(slots, applyTo) => editing ? save(editing.member, editing.day.date, slots, applyTo) : Promise.resolve(null)}
      />
    </div>
  )
}
