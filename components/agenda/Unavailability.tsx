'use client'

/**
 * Indisponibilités closers dans l'agenda (façon Google Agenda) :
 * - plages grisées sur la grille (lecture pour tous, télépros compris) ;
 * - glisser sur une zone vide de la grille → « Je ne suis pas disponible » ;
 * - un admin (Pascal) choisit pour qui : lui seul, des closers, ou toute
 *   l'équipe ; un closer ne bloque que pour lui.
 * API : /api/unavailability (cf. lib/unavailability.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ban, Trash2, Users } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Field, CrmV2Input } from '@/components/crm-v2/primitives'
import { AdminModal, AdminNotice } from '@/components/crm-v2/admin/AdminUi'

export type UnavailabilityBlock = {
  id: string
  user_id: string | null
  start_at: string
  end_at: string
  reason: string | null
  group_id: string | null
  created_by: string | null
  legacy?: boolean
}

export type PoolMember = { id: string; name: string; role: string }

export type UnavailabilityState = {
  blocks: UnavailabilityBlock[]
  pool: PoolMember[]
  me: string | null
  canManageOthers: boolean
  canManageSelf: boolean
  reload: () => void
}

const HATCH = 'repeating-linear-gradient(135deg, rgba(100,116,139,0.16) 0 6px, rgba(100,116,139,0.07) 6px 12px)'
const SNAP = 15

/** Charge les indisponibilités qui chevauchent la période affichée. */
export function useUnavailability(from: Date, to: Date): UnavailabilityState {
  const [blocks, setBlocks] = useState<UnavailabilityBlock[]>([])
  const [pool, setPool] = useState<PoolMember[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [canManageOthers, setCanManageOthers] = useState(false)
  const [canManageSelf, setCanManageSelf] = useState(false)
  const [tick, setTick] = useState(0)
  const fromIso = from.toISOString()
  const toIso = to.toISOString()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/unavailability?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled || !j) return
        setBlocks(Array.isArray(j.blocks) ? j.blocks : [])
        setPool(Array.isArray(j.pool) ? j.pool : [])
        setMe(j.me ?? null)
        setCanManageOthers(!!j.can_manage_others)
        setCanManageSelf(!!j.can_manage_self)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [fromIso, toIso, tick])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { blocks, pool, me, canManageOthers, canManageSelf, reload }
}

function nameOf(state: UnavailabilityState, userId: string | null): string {
  if (userId === null) return "Toute l'équipe"
  return state.pool.find(p => p.id === userId)?.name ?? 'Closer'
}

function canDelete(state: UnavailabilityState, b: UnavailabilityBlock): boolean {
  if (b.legacy) return false
  if (state.canManageOthers) return true
  return state.canManageSelf && b.user_id !== null && b.user_id === state.me
}

/** Blocs visibles selon le closer filtré dans l'agenda ('all' = tous). */
export function visibleBlocks(blocks: UnavailabilityBlock[], selected: string): UnavailabilityBlock[] {
  if (selected === 'all') return blocks
  return blocks.filter(b => b.user_id === null || b.user_id === selected)
}

type Segment = { startMs: number; endMs: number; blocks: UnavailabilityBlock[] }

function daySegments(blocks: UnavailabilityBlock[], dayStart: number, dayEnd: number): Segment[] {
  const clipped = blocks
    .map(b => ({ b, s: Math.max(new Date(b.start_at).getTime(), dayStart), e: Math.min(new Date(b.end_at).getTime(), dayEnd) }))
    .filter(x => x.e > x.s)
    .sort((a, b) => a.s - b.s)
  const out: Segment[] = []
  for (const x of clipped) {
    const last = out[out.length - 1]
    if (last && x.s < last.endMs) {
      last.endMs = Math.max(last.endMs, x.e)
      last.blocks.push(x.b)
    } else {
      out.push({ startMs: x.s, endMs: x.e, blocks: [x.b] })
    }
  }
  return out
}

function gridBounds(day: Date, startHour: number, endHour: number): { start: number; end: number } {
  const s = new Date(day); s.setHours(startHour, 0, 0, 0)
  const e = new Date(day); e.setHours(endHour, 0, 0, 0)
  return { start: s.getTime(), end: e.getTime() }
}

/** Plages grisées d'une colonne de jour (positionnées en % de la grille). */
export function UnavailabilityLayer({
  state, selected, day, startHour, endHour, compact, onOpen,
}: {
  state: UnavailabilityState
  selected: string
  day: Date
  startHour: number
  endHour: number
  compact: boolean
  onOpen: (blocks: UnavailabilityBlock[]) => void
}) {
  const { start, end } = gridBounds(day, startHour, endHour)
  const total = end - start
  const segments = daySegments(visibleBlocks(state.blocks, selected), start, end)
  if (!segments.length) return null
  return (
    <>
      {segments.map(seg => {
        const names = [...new Set(seg.blocks.map(b => nameOf(state, b.user_id)))]
        const team = seg.blocks.some(b => b.user_id === null)
        const label = team ? "Indispo · toute l'équipe" : `Indispo · ${names.join(', ')}`
        const reason = seg.blocks.map(b => b.reason).filter(Boolean)[0]
        return (
          <div
            key={`${seg.startMs}-${seg.blocks[0].id}`}
            onClick={e => { e.stopPropagation(); onOpen(seg.blocks) }}
            onMouseDown={e => e.stopPropagation()}
            title={`${label}${reason ? ` — ${reason}` : ''}\n${format(seg.startMs, 'HH:mm')} – ${format(seg.endMs, 'HH:mm')}`}
            style={{
              position: 'absolute', left: 0, right: 0, zIndex: 1,
              top: `${((seg.startMs - start) / total) * 100}%`,
              height: `${((seg.endMs - seg.startMs) / total) * 100}%`,
              background: HATCH, backgroundColor: team ? 'rgba(100,116,139,0.14)' : 'rgba(100,116,139,0.06)',
              borderTop: '1px solid rgba(100,116,139,0.35)', borderBottom: '1px solid rgba(100,116,139,0.35)',
              cursor: 'pointer', overflow: 'hidden', boxSizing: 'border-box',
            }}
          >
            {!compact && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#475569', padding: '2px 5px', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Ban size={10} style={{ flexShrink: 0 }} /> {label}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Sélection à la souris d'une plage sur la grille ─────────────────────────

type Draft = { dayKey: string; day: Date; aMin: number; bMin: number }

/**
 * Glisser verticalement sur une zone vide d'une colonne de jour. Renvoie les
 * props à poser sur la colonne et l'aperçu à afficher dedans.
 */
export function useRangeSelect({
  enabled, startHour, endHour, onSelect,
}: {
  enabled: boolean
  startHour: number
  endHour: number
  onSelect: (start: Date, end: Date) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const totalMin = (endHour - startHour) * 60

  const minuteAt = (clientY: number, rect: DOMRect) => {
    const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return Math.round((frac * totalMin) / SNAP) * SNAP
  }

  function columnProps(day: Date): {
    onMouseDown?: (e: ReactMouseEvent<HTMLDivElement>) => void
    style?: CSSProperties
  } {
    if (!enabled) return {}
    return {
      onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => {
        if (e.button !== 0 || e.target !== e.currentTarget) return
        e.preventDefault()
        const col = e.currentTarget
        const rect = col.getBoundingClientRect()
        const rawStart = minuteAt(e.clientY, rect)
        const startMin = Math.min(rawStart, totalMin - SNAP)
        const d: Draft = { dayKey: day.toDateString(), day, aMin: startMin, bMin: startMin + 30 > totalMin ? totalMin : startMin + 30 }
        draftRef.current = d
        setDraft(d)
        let moved = false
        const onMove = (ev: MouseEvent) => {
          const cur = draftRef.current
          if (!cur) return
          const m = minuteAt(ev.clientY, col.getBoundingClientRect())
          if (Math.abs(m - startMin) >= SNAP) moved = true
          const next = { ...cur, bMin: m === startMin ? startMin + SNAP : m }
          draftRef.current = next
          setDraft(next)
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          const cur = draftRef.current
          draftRef.current = null
          setDraft(null)
          if (!cur) return
          let a = Math.min(cur.aMin, cur.bMin)
          let b = Math.max(cur.aMin, cur.bMin)
          if (!moved) { a = startMin; b = Math.min(totalMin, startMin + 60) } // simple clic = 1 h
          if (b - a < SNAP) b = a + SNAP
          const s = new Date(cur.day); s.setHours(startHour, 0, 0, 0); s.setMinutes(a)
          const en = new Date(cur.day); en.setHours(startHour, 0, 0, 0); en.setMinutes(b)
          onSelect(s, en)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      },
      style: { cursor: 'crosshair' },
    }
  }

  function preview(day: Date) {
    if (!draft || draft.dayKey !== day.toDateString()) return null
    const a = Math.min(draft.aMin, draft.bMin)
    const b = Math.max(draft.aMin, draft.bMin)
    const s = new Date(day); s.setHours(startHour, 0, 0, 0); s.setMinutes(a)
    const e = new Date(day); e.setHours(startHour, 0, 0, 0); e.setMinutes(b)
    return (
      <div style={{
        position: 'absolute', left: 2, right: 2, zIndex: 6, pointerEvents: 'none',
        top: `${(a / totalMin) * 100}%`, height: `${((b - a) / totalMin) * 100}%`,
        background: 'rgba(100,116,139,0.22)', border: '1.5px dashed #64748b', borderRadius: 6,
        fontSize: 11, fontWeight: 700, color: '#334155', padding: '2px 6px', boxSizing: 'border-box',
      }}>
        Indispo {format(s, 'HH:mm')} – {format(e, 'HH:mm')}
      </div>
    )
  }

  return { columnProps, preview }
}

// ── Création ────────────────────────────────────────────────────────────────

type Scope = 'me' | 'some' | 'team'

export function UnavailabilityCreateDialog({
  state, initial, onClose, onSaved,
}: {
  state: UnavailabilityState
  initial: { start: Date; end: Date } | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [reason, setReason] = useState('')
  const [scope, setScope] = useState<Scope>('me')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initial) return
    setDate(format(initial.start, 'yyyy-MM-dd'))
    setStartTime(format(initial.start, 'HH:mm'))
    setEndTime(format(initial.end, 'HH:mm'))
    setReason('')
    setScope('me')
    setPicked(new Set(state.me ? [state.me] : []))
    setError(null)
  }, [initial, state.me])

  const others = useMemo(
    () => state.pool.filter(p => p.id !== state.me).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [state.pool, state.me],
  )
  const meInPool = state.pool.some(p => p.id === state.me)

  async function save() {
    const start = new Date(`${date}T${startTime}:00`)
    const end = new Date(`${date}T${endTime}:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError("L'heure de fin doit être après l'heure de début.")
      return
    }
    const body: Record<string, unknown> = { start_at: start.toISOString(), end_at: end.toISOString(), reason: reason.trim() || null }
    if (state.canManageOthers && scope === 'team') body.team = true
    if (state.canManageOthers && scope === 'some') {
      if (picked.size === 0) { setError('Choisis au moins un closer.'); return }
      body.user_ids = [...picked]
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/unavailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Enregistrement impossible'); return }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const scopeOption = (id: Scope, label: string, hint: string) => (
    <label key={id} style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
      border: `1px solid ${scope === id ? crmV2.goldBorder : crmV2.border}`, background: scope === id ? crmV2.goldSoft : crmV2.bg,
    }}>
      <input type="radio" name="unav-scope" checked={scope === id} onChange={() => setScope(id)} style={{ marginTop: 3, accentColor: crmV2.gold }} />
      <span>
        <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>{hint}</span>
      </span>
    </label>
  )

  return (
    <AdminModal
      open={!!initial}
      onClose={onClose}
      closeDisabled={saving}
      width={500}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Ban size={16} color="#64748b" /> Pas disponible</span>}
      subtitle="Les télépros peuvent placer des RDV sur tous les créneaux de 9h à 21h, sauf quand toute l'équipe est indisponible."
      footer={
        <>
          <CrmV2Button onClick={onClose} disabled={saving}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={save} disabled={saving || !date}>{saving ? 'Enregistrement…' : 'Bloquer la plage'}</CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
          <CrmV2Field label="Jour">
            <CrmV2Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </CrmV2Field>
          <CrmV2Field label="De">
            <CrmV2Input type="time" step={900} value={startTime} onChange={e => setStartTime(e.target.value)} />
          </CrmV2Field>
          <CrmV2Field label="À">
            <CrmV2Input type="time" step={900} value={endTime} onChange={e => setEndTime(e.target.value)} />
          </CrmV2Field>
        </div>
        <CrmV2Field label="Motif (facultatif)">
          <CrmV2Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Réunion, congé, formation…" />
        </CrmV2Field>

        {state.canManageOthers && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={13} /> Qui n&apos;est pas disponible ?
            </div>
            {scopeOption('me', 'Seulement moi', meInPool ? 'Les RDV pris sur ce créneau iront à un autre closer disponible.' : 'Plage personnelle.')}
            {scopeOption('some', 'Moi et/ou d’autres closers', 'Choisis les closers concernés.')}
            {scope === 'some' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 4px 4px 34px' }}>
                {[...(state.me ? [{ id: state.me, name: 'Moi', role: '' }] : []), ...others].map(p => {
                  const on = picked.has(p.id)
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: crmV2.text, cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} style={{ accentColor: crmV2.gold, width: 16, height: 16 }} onChange={() => setPicked(prev => {
                        const n = new Set(prev)
                        if (n.has(p.id)) n.delete(p.id); else n.add(p.id)
                        return n
                      })} />
                      {p.name}
                    </label>
                  )
                })}
              </div>
            )}
            {scopeOption('team', "Toute l'équipe", 'Le créneau est fermé aux télépros (aucun RDV possible).')}
          </div>
        )}
        {!state.canManageOthers && (
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>Cette plage ne concerne que toi.</div>
        )}
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
      </div>
    </AdminModal>
  )
}

// ── Détail / suppression ────────────────────────────────────────────────────

export function UnavailabilityDetailDialog({
  state, blocks, onClose, onChanged,
}: {
  state: UnavailabilityState
  blocks: UnavailabilityBlock[] | null
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(b: UnavailabilityBlock, wholeGroup: boolean) {
    setBusy(b.id)
    setError(null)
    try {
      const q = wholeGroup && b.group_id ? `group_id=${b.group_id}` : `id=${b.id}`
      const res = await fetch(`/api/unavailability?${q}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Suppression impossible'); return }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const groupSize = (g: string | null) => (g ? state.blocks.filter(x => x.group_id === g).length : 1)

  return (
    <AdminModal
      open={!!blocks}
      onClose={onClose}
      width={460}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Ban size={16} color="#64748b" /> Indisponibilités</span>}
      footer={<CrmV2Button onClick={onClose}>Fermer</CrmV2Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(blocks ?? []).map(b => (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
            border: `1px solid ${crmV2.border}`, background: crmV2.bgHover,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>{nameOf(state, b.user_id)}</div>
              <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                {b.legacy
                  ? `Journée entière · ${format(new Date(b.start_at), 'EEEE d MMMM', { locale: fr })}`
                  : `${format(new Date(b.start_at), 'EEEE d MMMM · HH:mm', { locale: fr })} – ${format(new Date(b.end_at), 'HH:mm')}`}
                {b.reason ? ` · ${b.reason}` : ''}
              </div>
            </div>
            {canDelete(state, b) && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {state.canManageOthers && groupSize(b.group_id) > 1 && (
                  <CrmV2Button size="sm" onClick={() => remove(b, true)} disabled={busy === b.id} title="Supprimer cette plage pour tous les closers saisis ensemble">
                    Tous ({groupSize(b.group_id)})
                  </CrmV2Button>
                )}
                <CrmV2Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => remove(b, false)} disabled={busy === b.id}>
                  Retirer
                </CrmV2Button>
              </div>
            )}
          </div>
        ))}
        {(blocks ?? []).some(b => b.legacy) && (
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>Les journées entières se gèrent dans « Disponibilités ».</div>
        )}
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
      </div>
    </AdminModal>
  )
}
