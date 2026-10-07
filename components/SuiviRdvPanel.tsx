'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  RefreshCw, Search, X, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, PencilLine,
  CalendarCheck, CalendarClock, PhoneCall, UserX, GraduationCap, TrendingUp, BookOpen, BarChart3,
} from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Button, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { AdminIconButton, AdminNotice, AdminPillSelect } from '@/components/crm-v2/admin/AdminUi'
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
  const periodLabel = month === ALL ? 'tous les mois' : monthLabel(month).toLowerCase()
  const searching = !!search.trim()

  /** Liste déroulante de statut en pastille colorée (modifiable). */
  const statusSelect = (r: RdvRow) => {
    const cfg = SUIVI_STATUS_CONFIG[r.status]
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
        <AdminPillSelect
          color={cfg.color}
          value={r.status}
          disabled={savingId === r.appt.id || !overridesAvailable}
          onChange={e => updateStatus(r, e.target.value)}
          title={r.manual ? 'Statut modifié manuellement' : 'Statut automatique (agenda)'}
          aria-label="Statut de suivi"
          style={{ background: cfg.bg, maxWidth: 230, minHeight: isMobile ? 36 : 28, cursor: overridesAvailable ? 'pointer' : 'default' }}
        >
          {SUIVI_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          {r.manual && <option value="__auto">Revenir au statut automatique</option>}
        </AdminPillSelect>
        {r.manual && (
          <span title="Modifié manuellement" style={{ display: 'inline-flex', color: crmV2.textFaint, flexShrink: 0 }}>
            <PencilLine size={13} />
          </span>
        )}
      </span>
    )
  }

  const rdvDate = (a: SuiviAppointment) => format(new Date(a.start_at), 'EEE d MMM yyyy · HH:mm', { locale: fr })
  const rdvSub = (r: RdvRow) => (
    <>
      {r.appt.created_at && `pris le ${format(new Date(r.appt.created_at), 'd MMM', { locale: fr })}`}
      {r.contactRdvCount > 1 && ` · RDV ${r.contactRdvIndex}/${r.contactRdvCount} du contact`}
    </>
  )

  const monthHeader = (key: string, list: RdvRow[]) => {
    const isCollapsed = collapsed.has(key)
    const c = countStatuses(list)
    const chips = SUIVI_STATUSES.filter(s => HEADER_STATUSES.includes(s.key) || c[s.key] > 0)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ChevronDown size={14} color={crmV2.textMuted} style={{ transform: isCollapsed ? 'rotate(-90deg)' : undefined, transition: 'transform 0.15s', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap' }}>
          {monthLabel(key)} · {list.length} RDV
        </span>
        {chips.map(s => (
          <span key={s.key} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: s.color,
            background: s.bg, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
            {s.label} {c[s.key]}
          </span>
        ))}
      </div>
    )
  }

  const emptyText = monthRows.length === 0 ? `Aucun RDV sur ${periodLabel}` : 'Aucun RDV ne correspond aux filtres'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
      {/* Sélecteur de mois */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <AdminIconButton icon={<ChevronLeft size={16} />} title="Mois précédent" onClick={goPrev} disabled={!canPrev} />
        <span style={{ flex: isMobile ? 1 : undefined, minWidth: 0, display: 'flex' }}>
          <AdminPillSelect
            value={month}
            onChange={e => setMonth(e.target.value)}
            aria-label="Mois"
            style={{ fontSize: 14, fontWeight: 700, minWidth: isMobile ? 0 : 200, width: isMobile ? '100%' : undefined, minHeight: isMobile ? 40 : 36 }}
          >
            <option value={ALL}>Tous les mois</option>
            {months.map(k => <option key={k} value={k}>{monthLabel(k)}{k === currentMonth ? ' (en cours)' : ''}</option>)}
          </AdminPillSelect>
        </span>
        <AdminIconButton icon={<ChevronRight size={16} />} title="Mois suivant" onClick={goNext} disabled={!canNext} />
        {month !== currentMonth && (
          <CrmV2Button size="sm" variant="secondary" onClick={() => setMonth(currentMonth)}>Mois en cours</CrmV2Button>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <AdminIconButton
            icon={<RefreshCw size={14} style={loading ? { animation: 'crm-v2-spin 1s linear infinite' } : undefined} />}
            title="Actualiser"
            onClick={load}
          />
        </span>
      </div>

      {/* Compteurs (période sélectionnée) */}
      <CrmV2KpiGrid style={isMobile ? undefined : { gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <CrmV2KpiCard label="RDV placés" value={total} icon={<CalendarCheck size={15} />} color={crmV2.text} detail={`${contactsCount} contact${contactsCount > 1 ? 's' : ''}`} />
        <CrmV2KpiCard label="RDV à venir" value={upcoming} icon={<CalendarClock size={15} />} color={SUIVI_STATUS_CONFIG.rdv_pris.color} />
        <CrmV2KpiCard label="À relancer" value={statusCounts.a_relancer} icon={<PhoneCall size={15} />} color={SUIVI_STATUS_CONFIG.a_relancer.color} />
        <CrmV2KpiCard label="Absents" value={absents} icon={<UserX size={15} />} color={SUIVI_STATUS_CONFIG.absent.color} />
        <CrmV2KpiCard label="Préinscrits" value={converted} icon={<GraduationCap size={15} />} color={SUIVI_STATUS_CONFIG.preinscrit.color} />
        <CrmV2KpiCard label="Taux de conversion" value={pct(converted, total)} icon={<TrendingUp size={15} />} color={crmV2.goldDark} detail="préinscrits / RDV placés" />
      </CrmV2KpiGrid>

      {!overridesAvailable && (
        <AdminNotice tone="warning">
          La modification manuelle du statut sera disponible après l’exécution de la migration <code>supabase-migration-suivi-rdv.sql</code>. Les statuts automatiques fonctionnent déjà.
        </AdminNotice>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 300px', gap: isMobile ? 12 : 16, alignItems: 'start' }}>
        {/* Tableau principal, regroupé par mois */}
        <CrmV2TableCard
          toolbar={
            <>
              <div style={{
                position: 'relative', flex: '1 1 220px', minWidth: isMobile ? 0 : 220, display: 'flex', alignItems: 'center',
                height: isMobile ? 40 : 36, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999, background: crmV2.bg, padding: '0 8px 0 14px', gap: 8,
              }}>
                <Search size={15} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un nom, prénom, email, téléphone…"
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: crmV2.text, fontFamily: 'inherit', height: '100%' }}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche" style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: crmV2.textFaint, display: 'inline-flex', padding: 4,
                  }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <AdminPillSelect
                value={formationFilter ?? ''}
                onChange={e => setFormationFilter(e.target.value || null)}
                aria-label="Formation"
                style={isMobile ? { minHeight: 40 } : undefined}
              >
                <option value="">Toutes formations</option>
                {allFormations.map(f => <option key={f} value={f}>{f}</option>)}
              </AdminPillSelect>
              <AdminPillSelect
                value={statusFilter ?? ''}
                onChange={e => setStatusFilter((e.target.value || null) as SuiviStatus | null)}
                aria-label="Statut"
                style={isMobile ? { minHeight: 40 } : undefined}
              >
                <option value="">Tous statuts</option>
                {SUIVI_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label} ({statusCounts[s.key]})</option>)}
              </AdminPillSelect>
            </>
          }
          footer={filtered.length > 0 ? (
            <span style={{ fontSize: 12 }}>{filtered.length} RDV affiché{filtered.length > 1 ? 's' : ''} sur {total} ({periodLabel})</span>
          ) : undefined}
        >
          {error && <div style={{ padding: 16 }}><AdminNotice tone="error">Erreur : {error}</AdminNotice></div>}

          {isMobile ? (
            /* Mobile : une carte par RDV */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {loading && rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>Chargement…</div>}
              {!loading && filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>{emptyText}</div>}
              {groups.map(([key, list]) => (
                <Fragment key={key}>
                  <div
                    onClick={() => toggleMonth(key)}
                    style={{ padding: '10px 12px', minHeight: 44, boxSizing: 'border-box', background: crmV2.thBg, borderBottom: `1px solid ${crmV2.thBorder}`, cursor: 'pointer' }}
                  >
                    {monthHeader(key, list)}
                  </div>
                  {!collapsed.has(key) && list.map(r => {
                    const a = r.appt
                    const past = new Date(a.start_at).getTime() < now
                    return (
                      <div key={a.id} style={{
                        padding: '10px 12px', borderBottom: `1px solid ${crmV2.borderLight}`,
                        background: searching ? crmV2.rowHover : undefined,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            {a.prospect_name || '—'}
                          </span>
                          <span style={{ fontSize: 12, color: past ? crmV2.textFaint : crmV2.text, fontWeight: past ? 500 : 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {format(new Date(a.start_at), 'EEE d MMM · HH:mm', { locale: fr })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formationLabel(a.formation_type)} · {a.closer?.name ? `Closer ${a.closer.name}` : 'Non assigné'}
                          {showTelepro && a.telepro?.name ? ` · ${a.telepro.name}` : ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                          {statusSelect(r)}
                          {a.prospect_phone && (
                            <a href={`tel:${a.prospect_phone}`} aria-label={`Appeler ${a.prospect_name || ''}`} style={{
                              width: 40, height: 40, borderRadius: 999, background: crmV2.successStrong, color: '#fff', flexShrink: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <PhoneCall size={16} />
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Nom Prénom</CrmV2Th>
                  <CrmV2Th>Téléphone</CrmV2Th>
                  <CrmV2Th>Formation</CrmV2Th>
                  <CrmV2Th>Date RDV</CrmV2Th>
                  <CrmV2Th>Closer</CrmV2Th>
                  {showTelepro && <CrmV2Th>Télépro</CrmV2Th>}
                  <CrmV2Th>Statut</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && (
                  <tr><CrmV2Td colSpan={colCount} style={{ textAlign: 'center', padding: 32, color: crmV2.textMuted }}>Chargement…</CrmV2Td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><CrmV2Td colSpan={colCount} style={{ textAlign: 'center', padding: 32, color: crmV2.textMuted }}>{emptyText}</CrmV2Td></tr>
                )}
                {groups.map(([key, list]) => (
                  <Fragment key={key}>
                    <tr onClick={() => toggleMonth(key)} style={{ cursor: 'pointer' }}>
                      <CrmV2Td colSpan={colCount} style={{ background: crmV2.bgHover, padding: '8px 14px' }}>
                        {monthHeader(key, list)}
                      </CrmV2Td>
                    </tr>
                    {!collapsed.has(key) && list.map(r => {
                      const a = r.appt
                      const past = new Date(a.start_at).getTime() < now
                      return (
                        <CrmV2Tr key={a.id} style={searching ? { background: crmV2.rowHover } : undefined}>
                          <CrmV2Td>
                            <div style={{ fontWeight: 600 }}>{a.prospect_name || '—'}</div>
                            {a.prospect_email && <div style={{ fontSize: 11, color: crmV2.textMuted }}>{a.prospect_email}</div>}
                          </CrmV2Td>
                          <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                            {a.prospect_phone ? <a href={`tel:${a.prospect_phone}`} style={{ color: crmV2.link, textDecoration: 'none' }}>{a.prospect_phone}</a> : '—'}
                          </CrmV2Td>
                          <CrmV2Td>{formationLabel(a.formation_type)}</CrmV2Td>
                          <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ color: past ? crmV2.textMuted : crmV2.text, fontWeight: past ? 400 : 600 }}>{rdvDate(a)}</div>
                            <div style={{ fontSize: 11, color: crmV2.textFaint }}>{rdvSub(r)}</div>
                          </CrmV2Td>
                          <CrmV2Td>{a.closer?.name || <span style={{ color: crmV2.textFaint }}>Non assigné</span>}</CrmV2Td>
                          {showTelepro && <CrmV2Td>{a.telepro?.name || '—'}</CrmV2Td>}
                          <CrmV2Td>{statusSelect(r)}</CrmV2Td>
                        </CrmV2Tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>

        {/* Récaps de la période */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
          <div style={card}>
            <RecapTitle icon={<ClipboardList size={13} />}>Par statut · {periodLabel}</RecapTitle>
            <div style={{ padding: '0 6px 8px' }}>
              {SUIVI_STATUSES.map(s => {
                const on = statusFilter === s.key
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatusFilter(on ? null : s.key)}
                    aria-pressed={on}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', minHeight: isMobile ? 40 : 32,
                      background: on ? s.bg : 'transparent', border: 'none', borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 13, color: crmV2.text, textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontWeight: on ? 700 : 500 }}>{s.label}</span>
                    <span style={{ fontWeight: 700 }}>{statusCounts[s.key]}</span>
                    <span style={{ width: 38, textAlign: 'right', color: crmV2.textMuted, fontSize: 12 }}>{pct(statusCounts[s.key], total)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={card}>
            <RecapTitle icon={<BookOpen size={13} />}>Par formation · {periodLabel}</RecapTitle>
            {byFormation.length === 0 && <div style={{ padding: '0 14px 14px', fontSize: 13, color: crmV2.textFaint }}>—</div>}
            {byFormation.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: crmV2.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ textAlign: 'left', padding: '4px 14px', fontWeight: 700 }}>Formation</th>
                    <th style={{ padding: '4px 6px', fontWeight: 700 }}>RDV</th>
                    <th style={{ padding: '4px 6px', fontWeight: 700 }} title="Préinscrits">Préins.</th>
                    <th style={{ padding: '4px 14px 4px 6px', fontWeight: 700, textAlign: 'right' }} title="Taux de conversion">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {byFormation.map(([f, v]) => (
                    <tr
                      key={f}
                      onClick={() => setFormationFilter(formationFilter === f ? null : f)}
                      style={{ cursor: 'pointer', height: isMobile ? 40 : 34, background: formationFilter === f ? crmV2.goldSoft : undefined, borderTop: `1px solid ${crmV2.borderLight}` }}
                    >
                      <td style={{ padding: '4px 14px', fontWeight: formationFilter === f ? 700 : 500 }}>{f}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>{v.total}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', color: SUIVI_STATUS_CONFIG.preinscrit.color, fontWeight: 600 }}>{v.converted}</td>
                      <td style={{ padding: '4px 14px 4px 6px', textAlign: 'right', color: crmV2.textMuted }}>{pct(v.converted, v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ height: 8 }} />
          </div>

          <div style={{ fontSize: 12, color: crmV2.textFaint, lineHeight: 1.5, padding: '0 4px' }}>
            Mis à jour automatiquement depuis l’agenda : no-show → Absent, à travailler → À relancer,
            pré-positif → En attente pré-inscription, positif → Préinscrit. Un statut modifié à la main
            reste tant que le RDV ne change pas de statut dans l’agenda.
          </div>
        </div>
      </div>

      {/* Comparatif mois par mois */}
      {monthlyRecap.length > 0 && (
        <CrmV2TableCard
          toolbar={<RecapTitle icon={<BarChart3 size={13} />} inline>Évolution mois par mois</RecapTitle>}
          footer={
            <div style={{ fontSize: 12, color: crmV2.textMuted, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span><Swatch color={crmV2.successStrong} />Honorés</span>
              <span><Swatch color={SUIVI_STATUS_CONFIG.absent.color} />Absents</span>
              <span><Swatch color={crmV2.border} />À venir / en attente / annulés</span>
              <span>Cliquer sur un mois pour l’afficher.</span>
            </div>
          }
        >
          {isMobile ? (
            <div>
              {monthlyRecap.map(m => {
                const selected = m.key === month
                return (
                  <div
                    key={m.key}
                    onClick={() => setMonth(m.key)}
                    style={{ padding: '10px 12px', borderBottom: `1px solid ${crmV2.borderLight}`, cursor: 'pointer', background: selected ? crmV2.goldSoft : undefined }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: selected ? 700 : 600, color: crmV2.text }}>
                        {monthLabel(m.key)}{m.key === currentMonth && <span style={{ marginLeft: 6, fontSize: 11, color: crmV2.goldDark, fontWeight: 700 }}>En cours</span>}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.goldDark }}>{pct(m.converted, m.placed)}</span>
                    </div>
                    <MonthBar m={m} maxPlaced={maxPlaced} />
                    <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>
                      {m.placed} placés · {m.honored} honorés · {m.absent} absents · <span style={{ color: SUIVI_STATUS_CONFIG.preinscrit.color, fontWeight: 700 }}>{m.converted} préinscrits</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Mois</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>RDV placés</CrmV2Th>
                  <CrmV2Th style={{ width: '30%' }}>{''}</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}><span title="RDV qui ont eu lieu : à relancer, négatif, en attente pré-inscription, préinscrit">Honorés</span></CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Absents</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Préinscrits</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Conversion</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {monthlyRecap.map(m => {
                  const selected = m.key === month
                  return (
                    <CrmV2Tr key={m.key} onClick={() => setMonth(m.key)} style={selected ? { background: crmV2.goldSoft } : undefined}>
                      <CrmV2Td style={{ fontWeight: selected ? 700 : 600, whiteSpace: 'nowrap' }}>
                        {monthLabel(m.key)}{m.key === currentMonth && <span style={{ marginLeft: 6, fontSize: 11, color: crmV2.goldDark, fontWeight: 700, textTransform: 'uppercase' }}>En cours</span>}
                      </CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right', fontWeight: 700 }}>{m.placed}</CrmV2Td>
                      <CrmV2Td><MonthBar m={m} maxPlaced={maxPlaced} /></CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right' }}>{m.honored} <span style={{ color: crmV2.textFaint, fontSize: 11 }}>{pct(m.honored, m.placed)}</span></CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right' }}>{m.absent} <span style={{ color: crmV2.textFaint, fontSize: 11 }}>{pct(m.absent, m.placed)}</span></CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right', color: SUIVI_STATUS_CONFIG.preinscrit.color, fontWeight: 700 }}>{m.converted}</CrmV2Td>
                      <CrmV2Td style={{ textAlign: 'right', fontWeight: 700, color: crmV2.goldDark }}>{pct(m.converted, m.placed)}</CrmV2Td>
                    </CrmV2Tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      )}
    </div>
  )
}

const card: React.CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow,
}

/** Barre : longueur = RDV placés ; segments honorés / absents. */
function MonthBar({ m, maxPlaced }: { m: { placed: number; honored: number; absent: number }; maxPlaced: number }) {
  return (
    <div style={{
      height: 10, width: `${(m.placed / maxPlaced) * 100}%`, minWidth: 4, background: crmV2.border,
      borderRadius: 999, display: 'flex', overflow: 'hidden', gap: 2, marginTop: 6, marginBottom: 2,
    }}>
      <div style={{ width: `${(m.honored / m.placed) * 100}%`, background: crmV2.successStrong }} />
      <div style={{ width: `${(m.absent / m.placed) * 100}%`, background: SUIVI_STATUS_CONFIG.absent.color }} />
    </div>
  )
}

function Swatch({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: color, marginRight: 5 }} />
}

function RecapTitle({ children, icon, inline = false }: { children: React.ReactNode; icon?: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{
      padding: inline ? 0 : '12px 14px 8px', fontSize: 11, fontWeight: 700, color: crmV2.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon && <span style={{ color: crmV2.gold, display: 'inline-flex' }}>{icon}</span>}
      {children}
    </div>
  )
}
