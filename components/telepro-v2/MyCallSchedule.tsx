'use client'

/**
 * Espace télépro › « Mes horaires » : sa semaine d'appel du lundi au dimanche.
 * Ordinateur : grille façon agenda, plages déplaçables à la souris
 * (components/planning/ScheduleGrid.tsx) ; mobile : une carte par jour.
 * Clic sur un jour → éditeur avec recopie sur d'autres jours et répétition
 * chaque semaine. Les horaires imposés par la direction (🔒) ne sont pas
 * modifiables. Chaque journée passée montre son bilan Aircall, et les RDV où
 * il est closer s'affichent pour savoir où il est.
 * Semaine entière : « Copier la semaine d’avant », « Répéter cette semaine »
 * (chaque semaine ou 1 sur 2, 3, 4 pour les alternants) et « Semaine
 * d'école » (alternance : jours sans appels, verdict « École »).
 * API : /api/telepro/planning (cf. lib/telepro-planning.ts).
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, GraduationCap, Lock, Pencil, Repeat } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import { AdminModal, AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { addParisDays, parisDateKey, parisWeekStartKey } from '@/lib/date-paris'
import {
  DayScheduleEditor, DayStats, RepeatPicker, SchoolBadge, SlotChip, VerdictPill, dayLabel, fmtMinutes, repeatTargets,
  type DayReport,
} from '@/components/planning/PlanningUi'
import ScheduleGrid, { ScheduleGridLegend, type GridChange } from '@/components/planning/ScheduleGrid'

type WeekAction = 'repeat' | 'school'

export default function MyCallSchedule({ userId, readOnly = false }: { userId?: string; readOnly?: boolean }) {
  const isMobile = useIsMobile()
  const [weekStart, setWeekStart] = useState(() => parisWeekStartKey(new Date()))
  const [days, setDays] = useState<DayReport[]>([])
  const [ready, setReady] = useState(true)
  const [schoolReady, setSchoolReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<DayReport | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [weekAction, setWeekAction] = useState<WeekAction | null>(null)
  const [every, setEvery] = useState(1)
  const [horizon, setHorizon] = useState(13)
  const [busy, setBusy] = useState(false)

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
      setSchoolReady(j.school_ready !== false)
    } finally {
      setLoading(false)
    }
  }, [weekStart, userId])

  useEffect(() => { load() }, [load, tick])

  async function put(body: unknown): Promise<{ ok: boolean; j: Record<string, unknown> & { error?: string } }> {
    const res = await fetch('/api/telepro/planning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: res.ok, j: await res.json().catch(() => ({})) }
  }

  async function save(date: string, slots: Array<{ start: string; end: string }>, applyTo: string[], school: boolean): Promise<string | null> {
    if (school) {
      const { ok, j } = await put({ school: true, dates: [date, ...applyTo] })
      if (!ok) return j.error || 'Enregistrement impossible'
      setEditing(null)
      setInfo(applyTo.length ? `${Number(j.done ?? 0)} jour${Number(j.done ?? 0) > 1 ? 's' : ''} marqué${Number(j.done ?? 0) > 1 ? 's' : ''} « École ».` : null)
      setTick(t => t + 1)
      return null
    }
    const { ok, j } = await put({ date, slots, apply_to: applyTo })
    if (!ok) return j.error || 'Enregistrement impossible'
    const repeated = Number(j.repeated ?? 0)
    const skipped = Number(j.skipped ?? 0)
    setEditing(null)
    setInfo(applyTo.length
      ? `Horaires recopiés sur ${repeated} autre${repeated > 1 ? 's' : ''} jour${repeated > 1 ? 's' : ''}${skipped ? ` (${skipped} ignoré${skipped > 1 ? 's' : ''} : jour passé ou horaires imposés)` : ''}.`
      : null)
    setTick(t => t + 1)
    return null
  }

  /** Recopie une semaine entière (horaires + école) sur d'autres semaines. */
  async function copyWeek(from: string, targets: string[], done: string) {
    setBusy(true)
    setError(null)
    setInfo(null)
    const { ok, j } = await put({ repeat_week: { week: from, targets } })
    setBusy(false)
    if (!ok) { setError(j.error || 'Enregistrement impossible'); return false }
    setInfo(done)
    setTick(t => t + 1)
    return true
  }

  /** Lundi → vendredi de la semaine affichée, encore modifiables. */
  const today = parisDateKey(new Date())
  const schoolDates = days.slice(0, 5).filter(d => d.date >= today && !d.slots.some(s => s.locked)).map(d => d.date)
  const isSchoolWeek = schoolDates.length > 0 && schoolDates.every(date => days.find(d => d.date === date)?.school)

  async function markSchoolWeek() {
    const targets = [weekStart, ...repeatTargets(weekStart, every, horizon)]
    const dates = targets.flatMap(w => Array.from({ length: 5 }, (_, i) => addParisDays(w, i)))
    setBusy(true)
    setError(null)
    setInfo(null)
    const { ok, j } = await put({ school: true, dates })
    setBusy(false)
    if (!ok) { setError(j.error || 'Enregistrement impossible'); return }
    setWeekAction(null)
    setInfo(targets.length > 1
      ? `${targets.length} semaines d'école enregistrées (${every === 1 ? 'chaque semaine' : `1 semaine sur ${every}`}).`
      : "Semaine d'école enregistrée.")
    setTick(t => t + 1)
  }

  async function unmarkSchoolWeek() {
    setBusy(true)
    setError(null)
    const { ok, j } = await put({ school: false, dates: schoolDates })
    setBusy(false)
    if (!ok) { setError(j.error || 'Enregistrement impossible'); return }
    setInfo("Ce n'est plus une semaine d'école : tu peux saisir tes horaires.")
    setTick(t => t + 1)
  }

  /** Glisser-déposer sur la grille : mise à jour immédiate, puis enregistrement. */
  async function commitGrid(changes: GridChange[]) {
    setError(null)
    setInfo(null)
    setDays(prev => prev.map(d => {
      const c = changes.find(x => x.date === d.date)
      if (!c) return d
      const slots = c.slots.map((s, i) => ({
        id: `tmp-${d.date}-${i}`, user_id: '', date: d.date, start: s.start, end: s.end, locked: false,
        created_by: null, alerted_at: null, calls: 0, coverage_pct: null, first_call: null, last_call: null, verdict: 'a_venir' as const,
      }))
      return { ...d, slots, school: false, planned_min: slots.reduce((m, s) => m + minutesBetween(s.start, s.end), 0) }
    }))
    const res = await fetch('/api/telepro/planning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: changes }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Enregistrement impossible')
    }
    setTick(t => t + 1)
  }

  const planned = days.reduce((s, d) => s + d.planned_min, 0)
  const calls = days.reduce((s, d) => s + d.calls, 0)
  const talk2 = days.reduce((s, d) => s + d.talk2, 0)
  const rdv = days.reduce((s, d) => s + d.rdv, 0)
  const isCurrentWeek = weekStart === parisWeekStartKey(new Date())
  const canEdit = !readOnly && ready
  const weekOver = addParisDays(weekStart, 6) < today
  const prevWeek = addParisDays(weekStart, -7)
  const weekShort = `${dayLabel(weekStart)} → ${dayLabel(addParisDays(weekStart, 6))}`
  const repeatPreview = repeatTargets(weekStart, every, horizon)

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

      {canEdit && !weekOver && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <CrmV2Button size="sm" icon={<Copy size={13} />} disabled={busy}
            onClick={() => {
              if ((planned > 0 || days.some(d => d.school)) && !window.confirm('Remplacer les horaires de cette semaine par ceux de la semaine d’avant ?')) return
              copyWeek(prevWeek, [weekStart], 'Horaires de la semaine d’avant recopiés sur cette semaine.')
            }}>
            Copier la semaine d’avant
          </CrmV2Button>
          <CrmV2Button size="sm" icon={<Repeat size={13} />} disabled={busy}
            onClick={() => { setEvery(1); setHorizon(13); setWeekAction('repeat') }}>
            Répéter cette semaine…
          </CrmV2Button>
          {isSchoolWeek ? (
            <CrmV2Button size="sm" icon={<GraduationCap size={13} />} disabled={busy} onClick={unmarkSchoolWeek}>
              Retirer la semaine d&apos;école
            </CrmV2Button>
          ) : (
            <CrmV2Button size="sm" icon={<GraduationCap size={13} />} disabled={busy || !schoolReady || !schoolDates.length}
              title={!schoolReady ? 'Bientôt disponible' : 'Alternant : semaine à l’école, pas d’appels'}
              onClick={() => { setEvery(0); setHorizon(26); setWeekAction('school') }}>
              Semaine d&apos;école
            </CrmV2Button>
          )}
          {busy && <AdminSpin />}
        </div>
      )}

      {readOnly && (
        <AdminNotice tone="info">Mode aperçu : lecture seule. Le télépro saisit lui-même ses horaires ici (grille, recopie d&apos;un jour à l&apos;autre, répétition sur plusieurs semaines, semaines d&apos;école).</AdminNotice>
      )}
      {!ready && <AdminNotice tone="warning">Le planning n&apos;est pas encore activé. Il le sera très bientôt.</AdminNotice>}
      {canEdit && !weekOver && !loading && !error && planned === 0 && !days.some(d => d.school) && (
        <AdminNotice tone="info">
          Aucun horaire cette semaine. {isMobile ? 'Touche un jour' : 'Glisse sur la grille ou clique sur un jour'} pour ajouter tes horaires d&apos;appel, puis recopie-les sur les autres jours. Si c&apos;est comme la semaine d’avant : « Copier la semaine d’avant ».
        </AdminNotice>
      )}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {info && <AdminNotice tone="success">{info}</AdminNotice>}
      {!readOnly && isMobile && (
        <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>
          Indique tes horaires d&apos;appel pour chaque jour (tu peux les répéter chaque semaine). Les horaires <Lock size={11} style={{ verticalAlign: '-1px' }} color="#7c3aed" /> sont fixés par la direction.
        </div>
      )}

      {!isMobile && (
        <>
          <ScheduleGridLegend editable={!readOnly && ready} />
          <ScheduleGrid
            days={days}
            today={today}
            canEditDay={d => !readOnly && ready && d.date >= today && !d.slots.some(s => s.locked)}
            onCommit={commitGrid}
            onOpenDay={d => { if (!readOnly && ready && d.date >= today && !d.slots.some(s => s.locked)) setEditing(d) }}
          />
        </>
      )}

      {isMobile && <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr' }}>
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
              ) : d.school ? (
                <SchoolBadge />
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
              {(d.meetings ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {d.meetings.map(m => (
                    <span key={m.id} title={m.name ? `En RDV avec ${m.name}` : 'En RDV'} style={{
                      padding: '2px 7px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: '#1e40af', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)',
                    }}>
                      RDV {m.start}
                    </span>
                  ))}
                </div>
              )}
              {(past || d.date === today) && <VerdictPill verdict={d.verdict} small />}
              <DayStats day={d} />
            </div>
          )
        })}
      </div>}

      <DayScheduleEditor
        open={!!editing}
        title="Mes horaires d'appel"
        day={editing}
        weekDates={days.map(d => d.date)}
        canImpose={false}
        canRepeat
        canSchool={schoolReady}
        onClose={() => setEditing(null)}
        onSave={(slots, applyTo, school) => editing ? save(editing.date, slots, applyTo, school) : Promise.resolve(null)}
      />

      <AdminModal
        open={weekAction === 'repeat'}
        onClose={() => setWeekAction(null)}
        closeDisabled={busy}
        width={520}
        title="Répéter cette semaine"
        subtitle={weekShort}
        footer={
          <>
            <CrmV2Button onClick={() => setWeekAction(null)} disabled={busy}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" disabled={busy} onClick={async () => {
              const n = repeatPreview.length
              const ok = await copyWeek(weekStart, repeatPreview, `Semaine recopiée sur ${n} semaine${n > 1 ? 's' : ''} (${every === 1 ? 'chaque semaine' : `1 semaine sur ${every}`}).`)
              if (ok) setWeekAction(null)
            }}>
              {busy ? 'Enregistrement…' : 'Répéter'}
            </CrmV2Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.45 }}>
            Tes horaires de cette semaine (et tes jours d&apos;école) sont recopiés jour par jour sur les semaines suivantes, à la place de ce qui y est déjà.
            Alternant ? Choisis « 1 semaine sur 2 » pour tes semaines en entreprise, puis marque l&apos;autre semaine « Semaine d&apos;école ».
          </div>
          <RepeatPicker every={every} setEvery={setEvery} horizon={horizon} setHorizon={setHorizon} />
          <div style={{ fontSize: 12, color: crmV2.textFaint }}>
            {repeatPreview.length} semaine{repeatPreview.length > 1 ? 's' : ''} concernée{repeatPreview.length > 1 ? 's' : ''}, jusqu&apos;à la semaine du {dayLabel(repeatPreview.at(-1) ?? weekStart, true).replace(/^\S+\s/, '')}. Les jours aux horaires imposés ne changent pas.
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={weekAction === 'school'}
        onClose={() => setWeekAction(null)}
        closeDisabled={busy}
        width={520}
        title="Semaine d'école"
        subtitle={`${dayLabel(weekStart)} → ${dayLabel(addParisDays(weekStart, 4))}`}
        footer={
          <>
            <CrmV2Button onClick={() => setWeekAction(null)} disabled={busy}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" disabled={busy} onClick={markSchoolWeek}>{busy ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.45 }}>
            Du lundi au vendredi tu es à l&apos;école : pas d&apos;horaires d&apos;appel ces jours-là (ceux déjà saisis sont retirés).
            Seulement certains jours ? Clique sur le jour et coche « Jour d&apos;école ».
          </div>
          <RepeatPicker allowOnce every={every} setEvery={setEvery} horizon={horizon} setHorizon={setHorizon} />
        </div>
      </AdminModal>
    </div>
  )
}

function minutesBetween(start: string, end: string): number {
  const [h1, m1] = start.split(':').map(Number)
  const [h2, m2] = end.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}
