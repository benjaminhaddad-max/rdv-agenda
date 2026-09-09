'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

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

  const btn: CSSProperties = {
    background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8,
    padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: '#4a6070',
  }

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Planning des télépros</div>
          <div style={{ fontSize: 12, color: '#4a6070', marginTop: 2 }}>
            Contrat → minimum d’heures (plein 35 h, partiel 12 h, alternant 21 h — modifiable). Si un créneau se termine sans appel sortant, Pascal reçoit un mail.
          </div>
        </div>
        <button onClick={onClose} style={btn}>Fermer</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={btn} title="Semaine précédente">
          <ChevronLeft size={16} />
        </button>
        <div style={{
          background: '#faf8f4', border: '1px solid #e5ddc8', borderRadius: 8,
          padding: '8px 16px', fontSize: 14, fontWeight: 600, minWidth: 220, textAlign: 'center',
        }}>
          {formatWeek(weekStart)}
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={btn} title="Semaine suivante">
          <ChevronRight size={16} />
        </button>
        <button onClick={copyLastWeek} style={btn}>Reprendre la semaine dernière</button>
        <button onClick={save} disabled={saving} style={{ ...btn, fontWeight: 700, color: '#C9A84C' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {available.length > 0 && (
          <select
            value={addId}
            onChange={e => {
              const id = e.target.value
              if (id) addTelepro(id)
            }}
            style={{ ...btn, color: '#0e1e35' }}
          >
            <option value="">+ Ajouter un télépro</option>
            {available.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      {ok && <div style={{ color: '#16a34a', fontSize: 12, marginBottom: 8 }}>{ok}</div>}

      {loading ? (
        <div style={{ color: '#4a6070', fontSize: 13 }}>Chargement…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={thStyle}>Télépro</th>
                {days.map(d => (
                  <th key={d.date} style={thStyle}>
                    {d.label}<div style={{ fontWeight: 400, color: '#a89e8a' }}>{d.date.slice(8)}/{d.date.slice(5, 7)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {telepros.map(tp => {
                const hours = plannedHours(slots.filter(s => s.user_id === tp.id))
                const okHours = hours + 0.05 >= tp.min_hours
                return (
                  <tr key={tp.id} style={{ borderTop: '1px solid #f0ebe0', verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', minWidth: 210 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{tp.name}</span>
                        <button
                          type="button"
                          onClick={() => removeTelepro(tp.id)}
                          title="Retirer du planning"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#a89e8a', padding: 2, display: 'flex' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <select
                        value={tp.contract}
                        onChange={e => setContract(tp.id, e.target.value as Contract)}
                        style={selectStyle}
                      >
                        {CONTRACTS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <input
                          type="number"
                          min={1}
                          max={48}
                          step={0.5}
                          value={tp.min_hours}
                          onChange={e => updatePerson(tp.id, { min_hours: Math.max(0.5, Number(e.target.value) || 0) })}
                          style={hoursInputStyle}
                        />
                        <span style={{ color: '#4a6070', fontSize: 11 }}>h min</span>
                      </div>
                      <div style={{
                        marginTop: 4, fontSize: 11, fontWeight: 600,
                        color: okHours ? '#16a34a' : '#dc2626',
                      }}>
                        {formatHours(hours)} / {formatHours(tp.min_hours)}
                        {okHours ? ' · OK' : ' · sous le minimum'}
                      </div>
                    </td>
                    {days.map(d => {
                      const cell = slotsFor(tp.id, d.date)
                      return (
                        <td key={d.date} style={{ padding: '8px 6px' }}>
                          {cell.map(s => {
                            const missed = s.ended && (s.outbound_calls ?? 0) === 0
                            const okSlot = s.ended && (s.outbound_calls ?? 0) > 0
                            return (
                              <div key={s.id} style={{
                                display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
                                background: missed ? '#fef2f2' : okSlot ? '#f0fdf4' : '#faf8f4',
                                border: '1px solid #eee6d6', borderRadius: 6, padding: '4px 4px',
                              }}>
                                <input type="time" value={s.start} onChange={e => updateSlot(s.id, { start: e.target.value })} style={timeStyle} />
                                <span style={{ color: '#a89e8a' }}>–</span>
                                <input type="time" value={s.end} onChange={e => updateSlot(s.id, { end: e.target.value })} style={timeStyle} />
                                <button type="button" onClick={() => removeSlot(s.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#a89e8a', fontSize: 14, lineHeight: 1 }} title="Retirer">×</button>
                              </div>
                            )
                          })}
                          <button type="button" onClick={() => addSlot(tp.id, d.date)} style={{ ...btn, padding: '3px 8px', fontSize: 11 }}>
                            + créneau
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {telepros.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#4a6070' }}>
                    Aucun télépro dans le planning. Ajoute-les avec le menu ci-dessus.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: CSSProperties = {
  textAlign: 'left', padding: '8px', fontSize: 11, fontWeight: 700,
  color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.03em',
}

const timeStyle: CSSProperties = {
  border: '1px solid #e5ddc8', borderRadius: 4, fontSize: 11, padding: '2px 4px',
  fontFamily: 'inherit', width: 78, background: '#fff', color: '#0e1e35',
}

const selectStyle: CSSProperties = {
  marginTop: 6, width: '100%', border: '1px solid #e5ddc8', borderRadius: 6,
  fontSize: 11, padding: '4px 6px', fontFamily: 'inherit', background: '#fff', color: '#0e1e35',
}

const hoursInputStyle: CSSProperties = {
  width: 56, border: '1px solid #e5ddc8', borderRadius: 6, fontSize: 11,
  padding: '3px 6px', fontFamily: 'inherit', background: '#fff', color: '#0e1e35',
}
