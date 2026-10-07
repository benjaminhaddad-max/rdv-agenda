'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react'
import {
  CrmV2Avatar, CrmV2Button, CrmV2Card, CrmV2CloseButton, CrmV2Input, CrmV2Select, CrmV2Spinner, CrmV2StatusPill,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

type Contract = 'full' | 'part' | 'alternant'
type Telepro = {
  id: string
  name: string
  email: string | null
  contract: Contract
  min_hours: number
}
type Available = { id: string; name: string }
type Slot = {
  id: string
  user_id: string
  date: string
  start: string
  end: string
  outbound_calls?: number
  ended?: boolean
  alerted_at?: string | null
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const CONTRACTS: Array<{ value: Contract; label: string; hours: number }> = [
  { value: 'full', label: 'Temps plein', hours: 35 },
  { value: 'part', label: 'Temps partiel', hours: 12 },
  { value: 'alternant', label: 'Alternant', hours: 21 },
]

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}

function formatWeek(weekStart: string): string {
  const end = addDays(weekStart, 6)
  const fmt = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', {
      timeZone: 'UTC', day: 'numeric', month: 'long',
    })
  }
  return `${fmt(weekStart)} → ${fmt(end)}`
}

function newId(): string {
  return crypto.randomUUID()
}

function slotHours(start: string, end: string): number {
  const hm = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const mins = hm(end) - hm(start)
  return mins > 0 ? mins / 60 : 0
}

function plannedHours(slots: Slot[]): number {
  return Math.round(slots.reduce((acc, s) => acc + slotHours(s.start, s.end), 0) * 10) / 10
}

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h'
  const rounded = Math.round(h * 60) / 60
  if (rounded % 1 === 0) return `${rounded}h`
  const hInt = Math.floor(rounded)
  const m = Math.round((rounded - hInt) * 60)
  return `${hInt}h${String(m).padStart(2, '0')}`
}

export default function PlanningPanel({
  weekStart: initialWeek,
  onClose,
}: {
  weekStart: string
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [weekStart, setWeekStart] = useState(initialWeek)
  const [telepros, setTelepros] = useState<Telepro[]>([])
  const [available, setAvailable] = useState<Available[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [addId, setAddId] = useState('')

  const days = useMemo(() => DAYS.map((label, i) => ({ label, date: addDays(weekStart, i) })), [weekStart])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/reports/suivi-commercial/planning?week=${weekStart}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setTelepros((json.telepros ?? []).map((t: Telepro) => ({
        id: t.id,
        name: t.name,
        email: t.email ?? null,
        contract: t.contract === 'part' || t.contract === 'alternant' ? t.contract : 'full',
        min_hours: Number(t.min_hours) > 0 ? Number(t.min_hours) : 35,
      })))
      setAvailable(json.available ?? [])
      setSlots(json.slots ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const slotsFor = (userId: string, date: string) =>
    slots.filter(s => s.user_id === userId && s.date === date)

  const addSlot = (userId: string, date: string) => {
    setSlots(cur => [...cur, { id: newId(), user_id: userId, date, start: '09:00', end: '18:00' }])
    setOk(null)
  }

  const updateSlot = (id: string, patch: Partial<Slot>) => {
    setSlots(cur => cur.map(s => s.id === id ? { ...s, ...patch } : s))
    setOk(null)
  }

  const removeSlot = (id: string) => {
    setSlots(cur => cur.filter(s => s.id !== id))
    setOk(null)
  }

  const updatePerson = (id: string, patch: Partial<Telepro>) => {
    setTelepros(cur => cur.map(t => t.id === id ? { ...t, ...patch } : t))
    setOk(null)
  }

  const setContract = (id: string, contract: Contract) => {
    const hours = CONTRACTS.find(c => c.value === contract)?.hours ?? 35
    updatePerson(id, { contract, min_hours: hours })
  }

  const removeTelepro = (id: string) => {
    const row = telepros.find(t => t.id === id)
    setTelepros(cur => cur.filter(t => t.id !== id))
    setSlots(cur => cur.filter(s => s.user_id !== id))
    if (row) setAvailable(cur => [...cur, { id: row.id, name: row.name }].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    setOk(null)
  }

  const addTelepro = (id: string) => {
    const row = available.find(t => t.id === id)
    if (!row) return
    setAvailable(cur => cur.filter(t => t.id !== id))
    setTelepros(cur => [...cur, { id: row.id, name: row.name, email: null, contract: 'full', min_hours: 35 }])
    setAddId('')
    setOk(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const res = await fetch('/api/crm/reports/suivi-commercial/planning', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          week: weekStart,
          slots: slots.map(s => ({ user_id: s.user_id, date: s.date, start: s.start, end: s.end })),
          people: telepros.map(t => ({ user_id: t.id, contract: t.contract, min_hours: t.min_hours })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible')
      setOk(`${json.saved} créneau${json.saved > 1 ? 'x' : ''} · ${telepros.length} télépro${telepros.length > 1 ? 's' : ''}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const copyLastWeek = async () => {
    const prev = addDays(weekStart, -7)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/reports/suivi-commercial/planning?week=${prev}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      const keep = new Set(telepros.map(t => t.id))
      const copied: Slot[] = (json.slots ?? [])
        .filter((s: Slot) => keep.has(s.user_id))
        .map((s: Slot) => ({
          id: newId(),
          user_id: s.user_id,
          date: addDays(s.date, 7),
          start: s.start,
          end: s.end,
        }))
      setSlots(copied)
      setOk('Semaine précédente recopiée — pense à Enregistrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const hoursState = (tp: Telepro) => {
    const hours = plannedHours(slots.filter(s => s.user_id === tp.id))
    return { hours, okHours: hours + 0.05 >= tp.min_hours }
  }

  // Bloc « personne » : nom, contrat, minimum d'heures, total planifié
  const personCell = (tp: Telepro) => {
    const { hours, okHours } = hoursState(tp)
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <CrmV2Avatar name={tp.name} color={crmV2.goldGradient} size={24} radius="36%" />
            <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tp.name}</span>
          </span>
          <IconBtn onClick={() => removeTelepro(tp.id)} title="Retirer du planning" danger>
            <Trash2 size={14} />
          </IconBtn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <CrmV2Select
            value={tp.contract}
            onChange={e => setContract(tp.id, e.target.value as Contract)}
            style={{ height: 30, fontSize: 12, padding: '0 8px', flex: 1, minWidth: 0 }}
          >
            {CONTRACTS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </CrmV2Select>
          <CrmV2Input
            type="number"
            min={1}
            max={48}
            step={0.5}
            value={tp.min_hours}
            onChange={e => updatePerson(tp.id, { min_hours: Math.max(0.5, Number(e.target.value) || 0) })}
            aria-label="Minimum d’heures"
            style={{ height: 30, fontSize: 12, padding: '0 8px', width: 60, flexShrink: 0 }}
          />
          <span style={{ color: crmV2.textMuted, fontSize: 12, flexShrink: 0 }}>h min</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <CrmV2StatusPill
            color={okHours ? crmV2.successStrong : '#dc2626'}
            label={`${formatHours(hours)} / ${formatHours(tp.min_hours)}${okHours ? ' · OK' : ' · sous le minimum'}`}
            style={{ fontSize: 11 }}
          />
        </div>
      </>
    )
  }

  // Créneaux d'une journée + bouton d'ajout
  const dayCell = (tp: Telepro, date: string) => (
    <>
      {slotsFor(tp.id, date).map(s => {
        const missed = s.ended && (s.outbound_calls ?? 0) === 0
        const okSlot = s.ended && (s.outbound_calls ?? 0) > 0
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
            background: missed ? 'rgba(239,68,68,0.08)' : okSlot ? 'rgba(22,163,74,0.08)' : crmV2.bgHover,
            border: `1px solid ${missed ? 'rgba(239,68,68,0.30)' : okSlot ? 'rgba(22,163,74,0.30)' : crmV2.border}`,
            borderRadius: 8, padding: '3px 4px',
          }}>
            <input type="time" value={s.start} onChange={e => updateSlot(s.id, { start: e.target.value })} style={timeStyle} />
            <span style={{ color: crmV2.textFaint }}>–</span>
            <input type="time" value={s.end} onChange={e => updateSlot(s.id, { end: e.target.value })} style={timeStyle} />
            <IconBtn onClick={() => removeSlot(s.id)} title="Retirer" small>
              <X size={13} />
            </IconBtn>
          </div>
        )
      })}
      <button type="button" onClick={() => addSlot(tp.id, date)} style={addSlotStyle}>
        <Plus size={12} /> créneau
      </button>
    </>
  )

  return (
    <CrmV2Card style={{ padding: isMobile ? 12 : 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Planning des télépros</div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4, lineHeight: 1.45 }}>
            Contrat → minimum d’heures (plein 35 h, partiel 12 h, alternant 21 h — modifiable). Si un créneau se termine sans appel sortant, Pascal reçoit un mail.
          </div>
        </div>
        <CrmV2CloseButton onClick={onClose} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isMobile ? '100%' : undefined }}>
          <RoundBtn onClick={() => setWeekStart(addDays(weekStart, -7))} title="Semaine précédente">
            <ChevronLeft size={16} />
          </RoundBtn>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999,
            height: 36, padding: '0 16px', boxSizing: 'border-box', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            minWidth: isMobile ? 0 : 220, flex: isMobile ? 1 : undefined,
          }}>
            <CalendarDays size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatWeek(weekStart)}</span>
          </div>
          <RoundBtn onClick={() => setWeekStart(addDays(weekStart, 7))} title="Semaine suivante">
            <ChevronRight size={16} />
          </RoundBtn>
        </div>
        <CrmV2Button variant="secondary" icon={<Copy size={14} />} onClick={copyLastWeek}>Reprendre la semaine dernière</CrmV2Button>
        {available.length > 0 && (
          <CrmV2Select
            value={addId}
            onChange={e => {
              const id = e.target.value
              if (id) addTelepro(id)
            }}
            aria-label="Ajouter un télépro"
            style={{ width: 'auto', height: 36, borderRadius: 999, fontWeight: 600, maxWidth: '100%' }}
          >
            <option value="">+ Ajouter un télépro</option>
            {available.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </CrmV2Select>
        )}
        <CrmV2Button variant="primary" onClick={save} disabled={saving} style={{ marginLeft: isMobile ? undefined : 'auto' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </CrmV2Button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      {ok && <div style={{ color: crmV2.successStrong, fontSize: 12, marginBottom: 8 }}>{ok}</div>}

      {loading ? (
        <CrmV2Spinner />
      ) : isMobile ? (
        // Mobile : une carte par télépro, jours empilés (pas de défilement horizontal)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {telepros.map(tp => (
            <div key={tp.id} style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: 12 }}>
              {personCell(tp)}
              <div style={{ marginTop: 10, borderTop: `1px solid ${crmV2.borderLight}` }}>
                {days.map(d => (
                  <div key={d.date} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${crmV2.borderLight}` }}>
                    <div style={{ width: 44, flexShrink: 0, fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>
                      {d.label}
                      <div style={{ fontWeight: 500, color: crmV2.textFaint }}>{d.date.slice(8)}/{d.date.slice(5, 7)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>{dayCell(tp, d.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {telepros.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>
              Aucun télépro dans le planning. Ajoute-les avec le menu ci-dessus.
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${crmV2.border}`, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={thStyle}>Télépro</th>
                {days.map(d => (
                  <th key={d.date} style={thStyle}>
                    {d.label}<div style={{ fontWeight: 500, color: crmV2.textFaint, textTransform: 'none' }}>{d.date.slice(8)}/{d.date.slice(5, 7)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {telepros.map(tp => (
                <tr key={tp.id} style={{ verticalAlign: 'top' }}>
                  <td style={{ ...tdStyle, padding: '10px 12px', minWidth: 220 }}>
                    {personCell(tp)}
                  </td>
                  {days.map(d => (
                    <td key={d.date} style={{ ...tdStyle, padding: '8px 6px' }}>
                      {dayCell(tp, d.date)}
                    </td>
                  ))}
                </tr>
              ))}
              {telepros.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: crmV2.textMuted }}>
                    Aucun télépro dans le planning. Ajoute-les avec le menu ci-dessus.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </CrmV2Card>
  )
}

function RoundBtn({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 36, height: 36, borderRadius: 999, flexShrink: 0,
        background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.text,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function IconBtn({ children, onClick, title, danger, small }: { children: ReactNode; onClick: () => void; title: string; danger?: boolean; small?: boolean }) {
  const [hover, setHover] = useState(false)
  const size = small ? 22 : 28
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      aria-label={title}
      style={{
        width: size, height: size, borderRadius: 999, border: 'none', flexShrink: 0, cursor: 'pointer',
        background: hover ? (danger ? crmV2.dangerSoft : crmV2.bgSoft) : 'transparent',
        color: hover && danger ? crmV2.danger : crmV2.textFaint,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}
    >
      {children}
    </button>
  )
}

const thStyle: CSSProperties = {
  textAlign: 'left', padding: '10px 8px', fontSize: 11, fontWeight: 700,
  color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em',
  background: crmV2.thBg, borderBottom: `2px solid ${crmV2.thBorder}`, whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  borderBottom: `1px solid ${crmV2.borderLight}`,
}

const timeStyle: CSSProperties = {
  border: `1px solid ${crmV2.borderStrong}`, borderRadius: 6, fontSize: 12, padding: '2px 4px',
  fontFamily: 'inherit', width: 78, background: crmV2.bg, color: crmV2.text, minWidth: 0,
}

const addSlotStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: crmV2.bg, border: `1px dashed ${crmV2.borderStrong}`, borderRadius: 999,
  padding: '3px 10px', fontSize: 11, fontWeight: 600, color: crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
}
