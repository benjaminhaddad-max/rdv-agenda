'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { RefreshCw, Search, X, ClipboardList, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  SUIVI_STATUSES, SUIVI_STATUS_CONFIG, SuiviStatus,
  effectiveSuiviStatus, formationLabel,
} from '@/lib/suivi-rdv'

type SuiviOverride = { suivi_status: string; source_status: string | null; updated_at?: string }

type SuiviAppointment = {
  id: string
  prospect_name: string | null
  prospect_email: string | null
  prospect_phone: string | null
  start_at: string
  created_at: string | null
  status: string | null
  formation_type: string | null
  classe_actuelle: string | null
  telepro_id: string | null
  closer?: { id: string; name: string } | null
  telepro?: { id: string; name: string; avatar_color?: string | null } | null
  suivi_override: SuiviOverride | null
}

// Une ligne = un RDV (mêmes chiffres que « Mon planning »), rattaché au mois de sa date.
type RdvRow = {
  appt: SuiviAppointment
  month: string // 'YYYY-MM' (heure locale, comme « Mon planning »)
  status: SuiviStatus
  manual: boolean
  contactRdvIndex: number // 1er, 2e… RDV de ce contact
  contactRdvCount: number
}

const ALL = 'all'
const CONVERTED: SuiviStatus[] = ['preinscrit']
const ABSENT: SuiviStatus[] = ['absent', 'a_replanifier']
// RDV qui ont effectivement eu lieu (le closer a vu le prospect).
const HONORED: SuiviStatus[] = ['a_relancer', 'negatif', 'attente_preinscription', 'preinscrit']
// Statuts toujours affichés dans l'en-tête de mois (les autres seulement si > 0).
const HEADER_STATUSES: SuiviStatus[] = ['rdv_pris', 'a_relancer', 'absent', 'preinscrit']

function contactKey(a: SuiviAppointment) {
  const email = (a.prospect_email || '').trim().toLowerCase()
  const phone = (a.prospect_phone || '').replace(/\D/g, '').slice(-9)
  const name = (a.prospect_name || '').trim().toLowerCase()
  return `${a.telepro_id || ''}|${email || phone || name || a.id}`
}

function monthKeyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number)
  return monthKeyOf(new Date(y, m - 1 + delta, 1))
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  const s = format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: fr })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function pct(n: number, total: number) {
  return total ? `${Math.round((n / total) * 100)}%` : '—'
}

function countStatuses(rows: RdvRow[]) {
  const c = {} as Record<SuiviStatus, number>
  for (const s of SUIVI_STATUSES) c[s.key] = 0
  for (const r of rows) c[r.status]++
  return c
}

export default function SuiviRdvPanel({
  teleproId,
  showTelepro = false,
}: {
  /** ID du télépro, ou 'all' (admin) */
  teleproId: string
  showTelepro?: boolean
}) {
  const isMobile = useIsMobile()
  const currentMonth = monthKeyOf(new Date())
  const [appointments, setAppointments] = useState<SuiviAppointment[]>([])
  const [overridesAvailable, setOverridesAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<string>(currentMonth)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuiviStatus | null>(null)
  const [formationFilter, setFormationFilter] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/suivi-rdv?telepro_id=${encodeURIComponent(teleproId)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setAppointments(json.appointments ?? [])
      setOverridesAvailable(json.overrides_available !== false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [teleproId])

  useEffect(() => { load() }, [load])

  const rows = useMemo<RdvRow[]>(() => {
    const sorted = [...appointments].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    const perContact = new Map<string, number>()
    for (const a of sorted) perContact.set(contactKey(a), (perContact.get(contactKey(a)) ?? 0) + 1)
    const seen = new Map<string, number>()
    return sorted.map(a => {
      const key = contactKey(a)
      const idx = (seen.get(key) ?? 0) + 1
      seen.set(key, idx)
      const eff = effectiveSuiviStatus(a.status, a.suivi_override)
      return {
        appt: a,
        month: monthKeyOf(new Date(a.start_at)),
        status: eff.status,
        manual: eff.manual,
        contactRdvIndex: idx,
        contactRdvCount: perContact.get(key) ?? 1,
      }
    })
  }, [appointments])

  // Mois disponibles : de la première donnée jusqu'au dernier RDV (au moins le mois en cours).
  const months = useMemo(() => {
    const keys = rows.map(r => r.month).concat(currentMonth).sort()
    const out: string[] = []
    for (let k = keys[0]; k <= keys[keys.length - 1]; k = shiftMonth(k, 1)) out.push(k)
    return out.reverse() // plus récent d'abord
  }, [rows, currentMonth])

  const monthRows = useMemo(
    () => (month === ALL ? rows : rows.filter(r => r.month === month)),
    [rows, month],
  )

  const statusCounts = useMemo(() => countStatuses(monthRows), [monthRows])

  const byFormation = useMemo(() => {
    const m = new Map<string, { total: number; converted: number }>()
    for (const r of monthRows) {
      const f = formationLabel(r.appt.formation_type)
      const e = m.get(f) ?? { total: 0, converted: 0 }
      e.total++
      if (CONVERTED.includes(r.status)) e.converted++
      m.set(f, e)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [monthRows])

  const allFormations = useMemo(
    () => [...new Set(rows.map(r => formationLabel(r.appt.formation_type)))].sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    const q = normalize(search.trim())
    return monthRows.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false
      if (formationFilter && formationLabel(r.appt.formation_type) !== formationFilter) return false
      if (q) {
        const a = r.appt
        const hay = normalize(`${a.prospect_name || ''} ${a.prospect_email || ''} ${a.prospect_phone || ''}`)
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [monthRows, search, statusFilter, formationFilter])

  // Groupes par mois (mois récent en haut, RDV chronologiques dans le mois).
  const groups = useMemo(() => {
    const m = new Map<string, RdvRow[]>()
    for (const r of filtered) {
      const list = m.get(r.month) ?? []
      list.push(r)
      m.set(r.month, list)
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  // Comparatif mensuel (toutes données, indépendant des filtres).
  const monthlyRecap = useMemo(() => {
    const m = new Map<string, RdvRow[]>()
    for (const r of rows) {
      const list = m.get(r.month) ?? []
      list.push(r)
      m.set(r.month, list)
    }
    return [...m.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => ({
        key,
        placed: list.length,
        honored: list.filter(r => HONORED.includes(r.status)).length,
        absent: list.filter(r => ABSENT.includes(r.status)).length,
        converted: list.filter(r => CONVERTED.includes(r.status)).length,
      }))
  }, [rows])
  const maxPlaced = Math.max(1, ...monthlyRecap.map(m => m.placed))

  const total = monthRows.length
  const contactsCount = new Set(monthRows.map(r => contactKey(r.appt))).size
  const now = Date.now()
  const upcoming = monthRows.filter(r => new Date(r.appt.start_at).getTime() > now && r.status === 'rdv_pris').length
  const converted = monthRows.filter(r => CONVERTED.includes(r.status)).length
  const absents = monthRows.filter(r => ABSENT.includes(r.status)).length

  const monthIdx = months.indexOf(month)
  const canPrev = month === ALL || monthIdx < months.length - 1
  const canNext = month !== ALL && monthIdx > 0
  function goPrev() { setMonth(month === ALL ? currentMonth : months[monthIdx + 1]) }
  function goNext() { if (canNext) setMonth(months[monthIdx - 1]) }

  function toggleMonth(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function updateStatus(row: RdvRow, value: string) {
    const appt = row.appt
    const next: SuiviStatus | null = value === '__auto' ? null : (value as SuiviStatus)
    const prevOverride = appt.suivi_override
    const optimistic: SuiviOverride | null = next ? { suivi_status: next, source_status: appt.status ?? null } : null
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, suivi_override: optimistic } : a))
    setSavingId(appt.id)
    try {
      const res = await fetch('/api/suivi-rdv', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appt.id, suivi_status: next }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, suivi_override: prevOverride } : a))
      alert(`Impossible de modifier le statut : ${e instanceof Error ? e.message : 'erreur'}`)
    } finally {
      setSavingId(null)
    }
  }

  const colCount = showTelepro ? 7 : 6
  const card: React.CSSProperties = { background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12 }
  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#4a6070',
    textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0e1e35', verticalAlign: 'middle' }
  const navBtn: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#4a6070',
  }
  const periodLabel = month === ALL ? 'tous les mois' : monthLabel(month).toLowerCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sélecteur de mois */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={goPrev} disabled={!canPrev} title="Mois précédent" style={{ ...navBtn, opacity: canPrev ? 1 : 0.4, cursor: canPrev ? 'pointer' : 'not-allowed' }}>
          <ChevronLeft size={16} />
        </button>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', minWidth: isMobile ? 0 : 200, flex: isMobile ? 1 : undefined, color: '#0e1e35' }}
        >
          <option value={ALL}>Tous les mois</option>
          {months.map(k => <option key={k} value={k}>{monthLabel(k)}{k === currentMonth ? ' (en cours)' : ''}</option>)}
        </select>
        <button onClick={goNext} disabled={!canNext} title="Mois suivant" style={{ ...navBtn, opacity: canNext ? 1 : 0.4, cursor: canNext ? 'pointer' : 'not-allowed' }}>
          <ChevronRight size={16} />
        </button>
        {month !== currentMonth && (
          <button onClick={() => setMonth(currentMonth)} style={{ ...navBtn, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
            Mois en cours
          </button>
        )}
        <button onClick={load} title="Actualiser" style={{ ...navBtn, marginLeft: 'auto' }}>
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {/* Compteurs (période sélectionnée) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
        <Kpi label="RDV placés" value={total} color="#0e1e35" sub={`${contactsCount} contact${contactsCount > 1 ? 's' : ''}`} />
        <Kpi label="RDV à venir" value={upcoming} color={SUIVI_STATUS_CONFIG.rdv_pris.color} />
        <Kpi label="À relancer" value={statusCounts.a_relancer} color={SUIVI_STATUS_CONFIG.a_relancer.color} />
        <Kpi label="Absents" value={absents} color={SUIVI_STATUS_CONFIG.absent.color} />
        <Kpi label="Préinscrits" value={converted} color={SUIVI_STATUS_CONFIG.preinscrit.color} />
        <Kpi label="Taux de conversion" value={pct(converted, total)} color="#C9A84C" sub="préinscrits / RDV placés" />
      </div>

      {!overridesAvailable && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
          La modification manuelle du statut sera disponible après l’exécution de la migration <code>supabase-migration-suivi-rdv.sql</code>. Les statuts automatiques fonctionnent déjà.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
        {/* Tableau principal, regroupé par mois */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f0ebe0' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a89e8a' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un nom, prénom, email, téléphone…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 30px 8px 30px', borderRadius: 8,
                  border: '1px solid #e5ddc8', background: '#f7f4ee', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              value={formationFilter ?? ''}
              onChange={e => setFormationFilter(e.target.value || null)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Toutes formations</option>
              {allFormations.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select
              value={statusFilter ?? ''}
              onChange={e => setStatusFilter((e.target.value || null) as SuiviStatus | null)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Tous statuts</option>
              {SUIVI_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label} ({statusCounts[s.key]})</option>)}
            </select>
          </div>

          {error && <div style={{ padding: 16, color: '#dc2626', fontSize: 13 }}>Erreur : {error}</div>}

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: showTelepro ? 980 : 860 }}>
              <thead>
                <tr style={{ background: '#f7f4ee', borderBottom: '1px solid #e5ddc8' }}>
                  <th style={th}>Nom Prénom</th>
                  <th style={th}>Téléphone</th>
                  <th style={th}>Formation</th>
                  <th style={th}>Date RDV</th>
                  <th style={th}>Closer</th>
                  {showTelepro && <th style={th}>Télépro</th>}
                  <th style={th}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && (
                  <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', padding: 32, color: '#4a6070' }}>Chargement…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', padding: 32, color: '#4a6070' }}>
                    {monthRows.length === 0 ? `Aucun RDV sur ${periodLabel}` : 'Aucun RDV ne correspond aux filtres'}
                  </td></tr>
                )}
                {groups.map(([key, list]) => {
                  const isCollapsed = collapsed.has(key)
                  const c = countStatuses(list)
                  const chips = SUIVI_STATUSES.filter(s => HEADER_STATUSES.includes(s.key) || c[s.key] > 0)
                  return (
                    <Fragment key={key}>
                      <tr onClick={() => toggleMonth(key)} style={{ background: '#fbf8f2', borderBottom: '1px solid #e5ddc8', cursor: 'pointer' }}>
                        <td colSpan={colCount} style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <ChevronDown size={14} style={{ color: '#4a6070', transform: isCollapsed ? 'rotate(-90deg)' : undefined, transition: 'transform 0.15s' }} />
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#0e1e35' }}>
                              {monthLabel(key)} · {list.length} RDV
                            </span>
                            {chips.map(s => (
                              <span key={s.key} style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                                {s.label} {c[s.key]}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && list.map(r => {
                        const a = r.appt
                        const cfg = SUIVI_STATUS_CONFIG[r.status]
                        const past = new Date(a.start_at).getTime() < now
                        return (
                          <tr key={a.id} style={{ borderBottom: '1px solid #f0ebe0', background: search.trim() ? '#fef9c3' : undefined }}>
                            <td style={td}>
                              <div style={{ fontWeight: 600 }}>{a.prospect_name || '—'}</div>
                              {a.prospect_email && <div style={{ fontSize: 11, color: '#4a6070' }}>{a.prospect_email}</div>}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {a.prospect_phone ? <a href={`tel:${a.prospect_phone}`} style={{ color: '#0e1e35', textDecoration: 'none' }}>{a.prospect_phone}</a> : '—'}
                            </td>
                            <td style={td}>{formationLabel(a.formation_type)}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <div style={{ color: past ? '#4a6070' : '#0e1e35', fontWeight: past ? 400 : 600 }}>
                                {format(new Date(a.start_at), 'EEE d MMM yyyy · HH:mm', { locale: fr })}
                              </div>
                              <div style={{ fontSize: 11, color: '#a89e8a' }}>
                                {a.created_at && `pris le ${format(new Date(a.created_at), 'd MMM', { locale: fr })}`}
                                {r.contactRdvCount > 1 && ` · RDV ${r.contactRdvIndex}/${r.contactRdvCount} du contact`}
                              </div>
                            </td>
                            <td style={td}>{a.closer?.name || <span style={{ color: '#a89e8a' }}>Non assigné</span>}</td>
                            {showTelepro && <td style={td}>{a.telepro?.name || '—'}</td>}
                            <td style={td}>
                              <select
                                value={r.status}
                                disabled={savingId === a.id || !overridesAvailable}
                                onChange={e => updateStatus(r, e.target.value)}
                                title={r.manual ? 'Statut modifié manuellement' : 'Statut automatique (agenda)'}
                                style={{
                                  padding: '5px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                  color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}55`,
                                  cursor: overridesAvailable ? 'pointer' : 'default', maxWidth: 210,
                                }}
                              >
                                {SUIVI_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                {r.manual && <option value="__auto">↺ Revenir au statut automatique</option>}
                              </select>
                              {r.manual && <span title="Modifié manuellement" style={{ marginLeft: 4, fontSize: 11, color: '#a89e8a' }}>✎</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: '#a89e8a', borderTop: '1px solid #f0ebe0' }}>
              {filtered.length} RDV affiché{filtered.length > 1 ? 's' : ''} sur {total} ({periodLabel})
            </div>
          )}
        </div>

        {/* Récaps de la période */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <RecapTitle>Par statut · {periodLabel}</RecapTitle>
            {SUIVI_STATUSES.map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(statusFilter === s.key ? null : s.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
                  background: statusFilter === s.key ? s.bg : 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, color: '#0e1e35', textAlign: 'left',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{s.label}</span>
                <span style={{ fontWeight: 700 }}>{statusCounts[s.key]}</span>
                <span style={{ width: 38, textAlign: 'right', color: '#4a6070' }}>{pct(statusCounts[s.key], total)}</span>
              </button>
            ))}
          </div>

          <div style={card}>
            <RecapTitle>Par formation · {periodLabel}</RecapTitle>
            {byFormation.length === 0 && <div style={{ padding: '8px 14px 14px', fontSize: 12, color: '#a89e8a' }}>—</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              {byFormation.length > 0 && (
                <thead>
                  <tr style={{ color: '#4a6070', fontSize: 10, textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', padding: '4px 14px', fontWeight: 700 }}>Formation</th>
                    <th style={{ padding: '4px 6px', fontWeight: 700 }}>RDV</th>
                    <th style={{ padding: '4px 6px', fontWeight: 700 }} title="Préinscrits">Préins.</th>
                    <th style={{ padding: '4px 14px 4px 6px', fontWeight: 700, textAlign: 'right' }} title="Taux de conversion">Conv.</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {byFormation.map(([f, v]) => (
                  <tr
                    key={f}
                    onClick={() => setFormationFilter(formationFilter === f ? null : f)}
                    style={{ cursor: 'pointer', background: formationFilter === f ? '#f7f4ee' : undefined }}
                  >
                    <td style={{ padding: '6px 14px' }}>{f}</td>
                    <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700 }}>{v.total}</td>
                    <td style={{ padding: '6px', textAlign: 'center', color: SUIVI_STATUS_CONFIG.preinscrit.color }}>{v.converted}</td>
                    <td style={{ padding: '6px 14px 6px 6px', textAlign: 'right', color: '#4a6070' }}>{pct(v.converted, v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ height: 8 }} />
          </div>

          <div style={{ fontSize: 11, color: '#a89e8a', lineHeight: 1.5, padding: '0 4px' }}>
            Mis à jour automatiquement depuis l’agenda : no-show → Absent, à travailler → À relancer,
            pré-positif → En attente pré-inscription, positif → Préinscrit. Un statut modifié à la main
            reste tant que le RDV ne change pas de statut dans l’agenda.
          </div>
        </div>
      </div>

      {/* Comparatif mois par mois */}
      {monthlyRecap.length > 0 && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <RecapTitle>Évolution mois par mois</RecapTitle>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ background: '#f7f4ee', borderBottom: '1px solid #e5ddc8' }}>
                  <th style={th}>Mois</th>
                  <th style={{ ...th, textAlign: 'right' }}>RDV placés</th>
                  <th style={{ ...th, width: '30%' }} />
                  <th style={{ ...th, textAlign: 'right' }} title="RDV qui ont eu lieu : à relancer, négatif, en attente pré-inscription, préinscrit">Honorés</th>
                  <th style={{ ...th, textAlign: 'right' }}>Absents</th>
                  <th style={{ ...th, textAlign: 'right' }}>Préinscrits</th>
                  <th style={{ ...th, textAlign: 'right' }}>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRecap.map(m => {
                  const selected = m.key === month
                  return (
                    <tr
                      key={m.key}
                      onClick={() => setMonth(m.key)}
                      style={{ borderBottom: '1px solid #f0ebe0', cursor: 'pointer', background: selected ? '#fbf3df' : undefined }}
                    >
                      <td style={{ ...td, fontWeight: selected ? 800 : 600, whiteSpace: 'nowrap' }}>
                        {monthLabel(m.key)}{m.key === currentMonth && <span style={{ marginLeft: 6, fontSize: 10, color: '#C9A84C', fontWeight: 700, textTransform: 'uppercase' }}>En cours</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{m.placed}</td>
                      <td style={td}>
                        {/* Barre : longueur = RDV placés ; segments honorés / absents */}
                        <div style={{ height: 10, width: `${(m.placed / maxPlaced) * 100}%`, minWidth: 4, background: '#ece6d8', borderRadius: 5, display: 'flex', overflow: 'hidden', gap: 2 }}>
                          <div style={{ width: `${(m.honored / m.placed) * 100}%`, background: '#16a34a' }} />
                          <div style={{ width: `${(m.absent / m.placed) * 100}%`, background: '#dc2626' }} />
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{m.honored} <span style={{ color: '#a89e8a', fontSize: 11 }}>{pct(m.honored, m.placed)}</span></td>
                      <td style={{ ...td, textAlign: 'right' }}>{m.absent} <span style={{ color: '#a89e8a', fontSize: 11 }}>{pct(m.absent, m.placed)}</span></td>
                      <td style={{ ...td, textAlign: 'right', color: SUIVI_STATUS_CONFIG.preinscrit.color, fontWeight: 700 }}>{m.converted}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#C9A84C' }}>{pct(m.converted, m.placed)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px', fontSize: 11, color: '#a89e8a', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#16a34a', marginRight: 4 }} />Honorés</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#dc2626', marginRight: 4 }} />Absents</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ece6d8', marginRight: 4 }} />À venir / en attente / annulés</span>
            <span>Cliquer sur un mois pour l’afficher.</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: '#4a6070', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#a89e8a', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function RecapTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 14px 6px', fontSize: 11, fontWeight: 800, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
      <ClipboardList size={12} /> {children}
    </div>
  )
}
