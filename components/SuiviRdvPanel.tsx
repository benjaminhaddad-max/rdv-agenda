'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { RefreshCw, Search, X, ClipboardList } from 'lucide-react'
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

type ContactRow = {
  key: string
  latest: SuiviAppointment
  rdvCount: number
  status: SuiviStatus
  manual: boolean
}

const CONVERTED: SuiviStatus[] = ['preinscrit']

function contactKey(a: SuiviAppointment) {
  const email = (a.prospect_email || '').trim().toLowerCase()
  const phone = (a.prospect_phone || '').replace(/\D/g, '').slice(-9)
  const name = (a.prospect_name || '').trim().toLowerCase()
  return `${a.telepro_id || ''}|${email || phone || name || a.id}`
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function pct(n: number, total: number) {
  return total ? `${Math.round((n / total) * 100)}%` : '—'
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
  const [appointments, setAppointments] = useState<SuiviAppointment[]>([])
  const [overridesAvailable, setOverridesAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuiviStatus | null>(null)
  const [formationFilter, setFormationFilter] = useState<string | null>(null)
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

  // Une ligne = un contact (le RDV le plus récent fait foi pour le statut).
  const contacts = useMemo<ContactRow[]>(() => {
    const map = new Map<string, ContactRow>()
    for (const a of appointments) {
      const key = contactKey(a)
      const existing = map.get(key)
      if (!existing) {
        map.set(key, { key, latest: a, rdvCount: 1, status: 'rdv_pris', manual: false })
      } else {
        existing.rdvCount++
        if (new Date(a.start_at) > new Date(existing.latest.start_at)) existing.latest = a
      }
    }
    const rows = [...map.values()]
    for (const r of rows) {
      const eff = effectiveSuiviStatus(r.latest.status, r.latest.suivi_override)
      r.status = eff.status
      r.manual = eff.manual
    }
    return rows.sort((a, b) => new Date(b.latest.start_at).getTime() - new Date(a.latest.start_at).getTime())
  }, [appointments])

  const statusCounts = useMemo(() => {
    const c = {} as Record<SuiviStatus, number>
    for (const s of SUIVI_STATUSES) c[s.key] = 0
    for (const r of contacts) c[r.status]++
    return c
  }, [contacts])

  const byFormation = useMemo(() => {
    const m = new Map<string, { total: number; converted: number; absent: number }>()
    for (const r of contacts) {
      const f = formationLabel(r.latest.formation_type)
      const e = m.get(f) ?? { total: 0, converted: 0, absent: 0 }
      e.total++
      if (CONVERTED.includes(r.status)) e.converted++
      if (r.status === 'absent' || r.status === 'a_replanifier') e.absent++
      m.set(f, e)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [contacts])

  const formations = useMemo(() => byFormation.map(([f]) => f), [byFormation])

  const filtered = useMemo(() => {
    const q = normalize(search.trim())
    return contacts.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false
      if (formationFilter && formationLabel(r.latest.formation_type) !== formationFilter) return false
      if (q) {
        const hay = normalize(`${r.latest.prospect_name || ''} ${r.latest.prospect_email || ''} ${r.latest.prospect_phone || ''}`)
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [contacts, search, statusFilter, formationFilter])

  const total = contacts.length
  const now = Date.now()
  const upcoming = contacts.filter(r => new Date(r.latest.start_at).getTime() > now && r.status === 'rdv_pris').length
  const converted = contacts.filter(r => CONVERTED.includes(r.status)).length

  async function updateStatus(row: ContactRow, value: string) {
    const appt = row.latest
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

  const card: React.CSSProperties = { background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12 }
  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#4a6070',
    textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#0e1e35', verticalAlign: 'middle' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Compteurs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
        <Kpi label="Contacts" value={total} color="#0e1e35" />
        <Kpi label="RDV à venir" value={upcoming} color={SUIVI_STATUS_CONFIG.rdv_pris.color} />
        <Kpi label="À relancer" value={statusCounts.a_relancer} color={SUIVI_STATUS_CONFIG.a_relancer.color} />
        <Kpi label="Absents" value={statusCounts.absent + statusCounts.a_replanifier} color={SUIVI_STATUS_CONFIG.absent.color} />
        <Kpi label="Préinscrits" value={converted} color={SUIVI_STATUS_CONFIG.preinscrit.color} />
        <Kpi label="Taux de conversion" value={pct(converted, total)} color="#C9A84C" />
      </div>

      {!overridesAvailable && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
          La modification manuelle du statut sera disponible après l’exécution de la migration <code>supabase-migration-suivi-rdv.sql</code>. Les statuts automatiques fonctionnent déjà.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
        {/* Tableau principal */}
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
              {formations.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select
              value={statusFilter ?? ''}
              onChange={e => setStatusFilter((e.target.value || null) as SuiviStatus | null)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value="">Tous statuts</option>
              {SUIVI_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label} ({statusCounts[s.key]})</option>)}
            </select>
            <button onClick={load} title="Actualiser" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', cursor: 'pointer', display: 'flex', color: '#4a6070' }}>
              <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
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
                {loading && contacts.length === 0 && (
                  <tr><td colSpan={showTelepro ? 7 : 6} style={{ ...td, textAlign: 'center', padding: 32, color: '#4a6070' }}>Chargement…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={showTelepro ? 7 : 6} style={{ ...td, textAlign: 'center', padding: 32, color: '#4a6070' }}>
                    {contacts.length === 0 ? 'Aucun RDV pris pour le moment' : 'Aucun contact ne correspond'}
                  </td></tr>
                )}
                {filtered.map(r => {
                  const a = r.latest
                  const cfg = SUIVI_STATUS_CONFIG[r.status]
                  const past = new Date(a.start_at).getTime() < now
                  const highlight = !!search.trim()
                  return (
                    <tr key={r.key} style={{ borderBottom: '1px solid #f0ebe0', background: highlight ? '#fef9c3' : undefined }}>
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
                          {r.rdvCount > 1 && ` · ${r.rdvCount} RDV`}
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
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: '#a89e8a', borderTop: '1px solid #f0ebe0' }}>
              {filtered.length} contact{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''} sur {total}
            </div>
          )}
        </div>

        {/* Récaps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <RecapTitle>Par statut</RecapTitle>
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
            <RecapTitle>Par formation</RecapTitle>
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
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: '#4a6070', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
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
