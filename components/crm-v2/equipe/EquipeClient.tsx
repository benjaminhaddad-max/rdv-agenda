'use client'

/**
 * Page « Équipe » (/admin/crm-v2/equipe) — remplace « Utilisateurs ».
 * Onglets Télépros / Closers / Admins ; sur chaque ligne, la gestion du compte
 * (désactiver, ajouter, se connecter en tant que, identifiants) et, pour les
 * télépros et closers, la performance de la période.
 *
 * - Télépros : appels Aircall (lignes suivies), temps d'appel, RDV placés,
 *   minutes d'appel par RDV, RDV convertis — par marque (Diploma / Medibox).
 * - Closers : RDV eus, honorés, no-show, convertis, taux de closing — par
 *   marque. Une réassignation remplace le closer du RDV : il compte pour le
 *   closer final.
 * - Double rôle : rdv_users.role (rôle principal) + extra_roles (casquettes en
 *   plus, cf. lib/team-roles.ts). Un admin qui close (Pascal) apparaît dans
 *   Closers ; un télépro qui close aussi apparaît dans les deux onglets.
 *
 * Les chiffres viennent de /api/crm/reports/suivi-commercial (même calcul
 * que « Suivi commercial »).
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlertTriangle, BarChart3, Briefcase, CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Key,
  Columns3, LogIn, Percent, Phone, PhoneOutgoing, Plus, RefreshCw, Shield, Trash2, Trophy, UserCheck, UserPlus, UserX, X,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Avatar, CrmV2Body, CrmV2Button, CrmV2Field, CrmV2Header, CrmV2Input, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page,
  CrmV2Search, CrmV2Segmented, CrmV2Select, CrmV2Table, CrmV2TableCard, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { AdminIconButton, AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { PanelCard } from '@/components/crm-v2/panels/PanelUi'
import { CredentialBox, type TeamMember } from '@/components/crm-v2/panels/TeamMemberManager'
import { PlanningDayCell, PlanningDayHeader, PlanningLegend, PlanningWeekSummary, usePlanningWeek, type PlanningData } from '@/components/crm-v2/equipe/PlanningWeek'
import { DayScheduleEditor, SlotChip, VERDICTS, VerdictPill, WEEKDAYS, fmtMinutes as fmtPlannedMinutes, type DayReport } from '@/components/planning/PlanningUi'
import { addParisDays, parisDateKey, parisMonthEndKey, parisWeekStartKey } from '@/lib/date-paris'
import { RDV_BRANDS, RDV_BRAND_IDS, type RdvBrand } from '@/lib/rdv-brand'
import { TEAM_ROLE_LABELS, TEAM_ROLES, teamRolesOf, type TeamRole } from '@/lib/team-roles'
import type { AgentMetrics, BrandBreakdown, SuiviCommercialResponse } from '@/lib/suivi-commercial'

type Tab = 'telepros' | 'closers' | 'admins'
type Period = 'day' | 'week' | 'month'
/** Mode d'affichage de la liste : mêmes lignes, colonnes différentes. */
type Mode = 'planning' | 'stats' | 'acces'

const MODES: Record<Tab, Mode[]> = {
  telepros: ['planning', 'stats', 'acces'],
  closers: ['stats', 'acces'],
  admins: ['acces'],
}
const MODE_LABELS: Record<Mode, string> = { planning: 'Planning', stats: 'Stats', acces: 'Accès' }

type EquipeMember = TeamMember & {
  role: string
  extra_roles: string[]
  crm_brand: string | null
  is_default_brand_telepro: boolean
  hubspot_owner_id: string | null
  last_sign_in_at: string | null
}

const TEAMS: Record<Tab, {
  /** POST création + PATCH ban / unban / reset-password */
  endpoint: string
  role: TeamRole | null
  noun: string
  column: string
  impersonateUrl: (m: EquipeMember) => string | null
}> = {
  telepros: {
    endpoint: '/api/admin/telepros',
    role: 'telepro',
    noun: 'télépro',
    column: 'Télépro',
    impersonateUrl: m => `/telepro?preview_as=${m.id}`,
  },
  closers: {
    endpoint: '/api/admin/closers',
    role: 'closer',
    noun: 'closer',
    column: 'Closer',
    impersonateUrl: m => (m.slug ? `/closer/${m.slug}` : null),
  },
  admins: {
    endpoint: '/api/admin/closers', // PATCH ban / reset : valable pour tout compte
    role: null,
    noun: 'admin',
    column: 'Admin',
    impersonateUrl: () => null,
  },
}

/** Marques ayant au moins un RDV (les autres n'apparaissent nulle part). */
function brandsWithData(b: BrandBreakdown | undefined): RdvBrand[] {
  return RDV_BRAND_IDS.filter(k => (b?.[k]?.rdv_total ?? 0) > 0)
}
const MAIN_ROLES = ['admin', 'manager', 'closer', 'telepro'] as const
const ROLE_COLOR: Record<string, string> = {
  admin: '#7e22ce',
  manager: '#0091ae',
  closer: '#8a6d22',
  telepro: '#1f7ca8',
}

// ── Période ──────────────────────────────────────────────────────────────────

function monthStartOf(key: string): string {
  return key.slice(0, 8) + '01'
}

function periodRange(period: Period, anchor: string): { from: string; to: string } {
  if (period === 'day') return { from: anchor, to: anchor }
  if (period === 'week') {
    const from = parisWeekStartKey(new Date(`${anchor}T12:00:00Z`))
    return { from, to: addParisDays(from, 6) }
  }
  const from = monthStartOf(anchor)
  return { from, to: parisMonthEndKey(from) }
}

function shiftAnchor(period: Period, anchor: string, dir: 1 | -1): string {
  if (period === 'day') return addParisDays(anchor, dir)
  if (period === 'week') return addParisDays(anchor, dir * 7)
  const [y, m] = anchor.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + dir, 1, 12))
  return d.toISOString().slice(0, 10)
}

function formatRange(period: Period, from: string, to: string): string {
  const dt = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d, 12))
  }
  if (period === 'month') {
    const s = dt(from).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const fmt = (k: string, withYear: boolean) => dt(k).toLocaleDateString('fr-FR', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: withYear ? 'numeric' : undefined,
  })
  if (from === to) return fmt(from, true)
  return `Du ${fmt(from, false)} au ${fmt(to, true)}`
}

// ── Formatage ────────────────────────────────────────────────────────────────

function fmtInt(n: number | null | undefined): string {
  if (!n) return '—'
  return n.toLocaleString('fr-FR')
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} %`
}

function pct(num: number, den: number): number | null {
  if (den <= 0) return null
  return Math.round((num / den) * 1000) / 10
}

function fmtMinutes(sec: number): string {
  if (!sec) return '—'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

/** Minutes de conversation Aircall par RDV placé. */
function minPerRdv(talkSec: number, rdv: number): number | null {
  if (rdv <= 0 || talkSec <= 0) return null
  return Math.round(talkSec / 60 / rdv)
}

function converted(a: { rdv_positifs: number; rdv_preinscriptions: number }): number {
  return a.rdv_positifs + a.rdv_preinscriptions
}

function fmtLastSignIn(iso: string | null): string {
  if (!iso) return 'Jamais'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Lignes ───────────────────────────────────────────────────────────────────

type Row = {
  id: string
  name: string
  color: string | null
  member: EquipeMember | null
  stats: AgentMetrics | null
}

/** Clé de colonne : 'calls', 'rdv'… ou 'brand:medibox' (colonnes de marque). */
type SortKey = string

function sortValue(r: Row, key: SortKey, presence: Record<string, DayReport[]> | null): number | string {
  const s = r.stats
  if (key === 'name') return r.name
  if (key === 'lastSignIn') return r.member?.last_sign_in_at ? Date.parse(r.member.last_sign_in_at) : 0
  if (key === 'presence') {
    const days = presence?.[r.id] ?? []
    return days.filter(d => d.calls > 0).length * 10_000 + days.reduce((t, d) => t + d.planned_min, 0)
  }
  if (!s) return -1
  if (key.startsWith('brand:')) return s.by_brand[key.slice(6) as RdvBrand]?.rdv_total ?? 0
  switch (key) {
    case 'calls': return s.calls_outbound
    case 'answered': return s.calls_outbound_talk_2min + s.calls_outbound_talk_short
    case 'talk2': return s.calls_outbound_talk_2min
    case 'talk': return s.talk_time_sec
    case 'rdv': return s.rdv_total
    case 'minPerRdv': return minPerRdv(s.talk_time_sec, s.rdv_total) ?? 1e9
    case 'conv': return converted(s)
    case 'honored': return s.rdv_honored
    case 'noShow': return s.rdv_no_show
    case 'cancelled': return s.rdv_annules
    case 'showRate': return s.show_rate ?? -1
    case 'closingRate': return s.closing_rate ?? -1
    case 'talk2Rdv': return s.conversion_talk_2min ?? -1
    case 'venus': return s.rdv_venus
    case 'preinscrits': return s.rdv_preinscrits
    case 'avgTalk2': return s.avg_talk_2min_sec ?? -1
    case 'delta': return s.delta_rdv
    default: return 0
  }
}

const EMPTY_MEMBERS: Record<Tab, EquipeMember[] | null> = { telepros: null, closers: null, admins: null }

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EquipeClient() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<Tab>('telepros')
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState(() => parisDateKey(new Date()))
  const { from, to } = periodRange(period, anchor)

  const [members, setMembers] = useState<Record<Tab, EquipeMember[] | null>>(EMPTY_MEMBERS)
  const [extraRolesReady, setExtraRolesReady] = useState(true)
  const [stats, setStats] = useState<SuiviCommercialResponse | null>(null)
  const [statsKey, setStatsKey] = useState<string | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rdv', dir: 'desc' })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showBanned, setShowBanned] = useState(false)
  const [presenceTick, setPresenceTick] = useState(0)
  const [mode, setMode] = useState<Mode>('planning')
  const [editingDay, setEditingDay] = useState<{ row: Row; day: DayReport } | null>(null)

  const team = TEAMS[tab]
  const isAdmins = tab === 'admins'

  // Colonnes masquées par onglet (réglage « Colonnes », gardé dans le navigateur)
  const [hiddenCols, setHiddenCols] = useState<Record<string, string[]> | null>(null)
  useEffect(() => {
    let stored: Record<string, string[]> | null = null
    try { stored = JSON.parse(localStorage.getItem(HIDDEN_COLS_KEY) || 'null') } catch { /* stockage indisponible */ }
    setHiddenCols(stored && typeof stored === 'object' ? stored : {})
  }, [])
  function toggleCol(key: string) {
    setHiddenCols(prev => {
      const current = prev?.[tab] ?? defaultHidden(tab)
      const next = { ...(prev ?? {}), [tab]: current.includes(key) ? current.filter(k => k !== key) : [...current, key] }
      try { localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(next)) } catch { /* stockage indisponible */ }
      return next
    })
  }

  // Onglet depuis l'URL (?tab=closers), sans Suspense
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab')
    const tabNow: Tab = t === 'closers' || t === 'telepros' || t === 'admins' ? t : 'telepros'
    setTab(tabNow)
    if (tabNow === 'admins') setSort({ key: 'name', dir: 'asc' })
    const m = params.get('mode') as Mode | null
    setMode(m && MODES[tabNow].includes(m) ? m : MODES[tabNow][0])
  }, [])

  function syncUrl(t: Tab, m: Mode) {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    url.searchParams.set('mode', m)
    url.searchParams.delete('view')
    window.history.replaceState(null, '', url.toString())
  }

  function changeTab(t: Tab) {
    setTab(t)
    setExpanded(null)
    setSearch('')
    setSort(t === 'admins' ? { key: 'name', dir: 'asc' } : { key: 'rdv', dir: 'desc' })
    const m = MODES[t].includes(mode) ? mode : MODES[t][0]
    setMode(m)
    if (m === 'planning') setPeriod('week')
    syncUrl(t, m)
  }

  function changeMode(m: Mode) {
    setMode(m)
    setExpanded(null)
    if (m === 'planning') setPeriod('week')
    syncUrl(tab, m)
  }

  // Comptes : chargés une fois par onglet (et à l'actualisation)
  const loadMembers = useCallback(async (t: Tab) => {
    try {
      const res = await fetch(`/api/admin/team?tab=${t}`, { cache: 'no-store' })
      const data = res.ok ? await res.json() : null
      setMembers(prev => ({ ...prev, [t]: Array.isArray(data?.members) ? data.members : (prev[t] ?? []) }))
      if (data) setExtraRolesReady(data.extra_roles_ready !== false)
    } catch {
      setMembers(prev => ({ ...prev, [t]: prev[t] ?? [] }))
    }
  }, [])

  useEffect(() => {
    if (members[tab] == null) loadMembers(tab)
  }, [tab, members, loadMembers])

  // Performance de la période (télépros / closers)
  const wantedKey = `${team.role}|${from}|${to}|${refreshTick}`
  useEffect(() => {
    if (!team.role) return
    let cancelled = false
    setStatsLoading(true)
    setStatsError(null)
    fetch(`/api/crm/reports/suivi-commercial?role=${team.role}&from=${from}&to=${to}`, { cache: 'no-store' })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setStatsError(data?.error || 'Statistiques indisponibles')
          setStats(null)
        } else {
          setStats(data as SuiviCommercialResponse)
        }
        setStatsKey(wantedKey)
      })
      .catch(() => { if (!cancelled) { setStatsError('Statistiques indisponibles'); setStats(null) } })
      .finally(() => { if (!cancelled) setStatsLoading(false) })
    return () => { cancelled = true }
  }, [team.role, from, to, refreshTick, wantedKey])

  const statsReady = !!team.role && statsKey === wantedKey && stats?.role === team.role

  // Mode Planning : semaine (lundi → dimanche) contenant la période affichée
  const planningWeekStart = parisWeekStartKey(new Date(`${from}T12:00:00Z`))
  const planning = usePlanningWeek(planningWeekStart, refreshTick + presenceTick, tab === 'telepros' && mode === 'planning')

  async function saveDay(slots: Array<{ start: string; end: string; locked: boolean }>, applyTo: string[]): Promise<string | null> {
    if (!editingDay) return null
    const res = await fetch('/api/admin/planning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: editingDay.row.id, date: editingDay.day.date, slots, apply_to: applyTo }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return j.error || 'Enregistrement impossible'
    setEditingDay(null)
    setPresenceTick(t => t + 1)
    return null
  }

  // Présence (planning d'appel) sur la période — onglet Télépros
  const [presence, setPresence] = useState<Record<string, DayReport[]> | null>(null)
  useEffect(() => {
    if (tab !== 'telepros') return
    let cancelled = false
    setPresence(null)
    fetch(`/api/admin/planning?from=${from}&to=${to}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.report) setPresence(j.report as Record<string, DayReport[]>) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tab, from, to, refreshTick, presenceTick])

  function refresh() {
    loadMembers(tab)
    setRefreshTick(t => t + 1)
  }

  /** Rôle / casquettes changés : un compte peut changer d'onglet → tout recharger. */
  function reloadAllMembers() {
    setMembers(EMPTY_MEMBERS)
    setExpanded(null)
  }

  // Fusion comptes + stats
  const rows = useMemo<Row[]>(() => {
    const list = members[tab] ?? []
    const byId = new Map<string, AgentMetrics>()
    if (statsReady && stats) for (const a of stats.agents) if (!a.unmapped) byId.set(a.user_id, a)
    const out: Row[] = list.map(m => ({
      id: m.id, name: m.name, color: m.avatar_color, member: m, stats: byId.get(m.id) ?? null,
    }))
    const known = new Set(list.map(m => m.id))
    for (const a of byId.values()) {
      if (known.has(a.user_id)) continue
      out.push({ id: a.user_id, name: a.name, color: a.avatar_color, member: null, stats: a })
    }
    return out
  }, [members, tab, stats, statsReady])

  const q = search.trim().toLowerCase()
  const filtered = q ? rows.filter(r => `${r.name} ${r.member?.email ?? ''}`.toLowerCase().includes(q)) : rows
  const sorted = [...filtered].sort((a, b) => {
    const va = sortValue(a, sort.key, presence)
    const vb = sortValue(b, sort.key, presence)
    let c = typeof va === 'string' || typeof vb === 'string'
      ? String(va).localeCompare(String(vb), 'fr')
      : (va as number) - (vb as number)
    if (sort.dir === 'desc') c = -c
    return c || a.name.localeCompare(b.name, 'fr')
  })
  const activeRows = sorted.filter(r => !r.member?.is_banned)
  const bannedRows = sorted.filter(r => r.member?.is_banned)

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: key === 'name' || key === 'minPerRdv' ? 'asc' : 'desc' })
  }

  function patchMember(id: string, patch: Partial<EquipeMember>) {
    setMembers(prev => {
      const next = { ...prev }
      for (const t of Object.keys(next) as Tab[]) {
        if (next[t]) next[t] = next[t]!.map(m => m.id === id ? { ...m, ...patch } : m)
      }
      return next
    })
  }

  function addMember(m: EquipeMember) {
    setMembers(prev => ({
      ...prev,
      [tab]: [...(prev[tab] ?? []), m].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    }))
  }

  const totals = statsReady ? stats?.totals : null
  const unmappedCount = statsReady && stats ? stats.agents.filter(a => a.unmapped).length : 0
  const loadingMembers = members[tab] == null
  const activeCount = (t: Tab) => members[t]?.filter(m => !m.is_banned).length

  const tabLabel = (icon: ReactNode, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon} {label}</span>
  )

  // Colonnes : fixes + une colonne par marque autre que Diploma ayant des RDV sur la période
  const brandCols: Col[] = useMemo(() => {
    if (!statsReady || !stats || tab === 'admins') return []
    const totalsByBrand = stats.totals.by_brand
    return RDV_BRAND_IDS
      .filter(b => b !== 'diploma' && (totalsByBrand?.[b]?.rdv_total ?? 0) > 0)
      .map(b => ({
        key: `brand:${b}`,
        label: `RDV ${RDV_BRANDS[b].label}`,
        title: tab === 'closers' ? `RDV ${RDV_BRANDS[b].label} · convertis` : `RDV ${RDV_BRANDS[b].label} placés · venus`,
      }))
  }, [stats, statsReady, tab])
  const allCols = [...(tab === 'telepros' ? TELEPRO_COLS : tab === 'closers' ? CLOSER_COLS : []), ...brandCols]
  const hidden = hiddenCols?.[tab] ?? defaultHidden(tab)
  const visibleCols = allCols.filter(c => !hidden.includes(c.key))

  const tableProps = {
    tab, isMobile, statsLoading, sort, onSort: toggleSort, expanded,
    onExpand: (id: string) => setExpanded(e => e === id ? null : id),
    onPatch: patchMember, onAdd: addMember, onRolesChanged: reloadAllMembers, extraRolesReady,
    presence, cols: visibleCols, allCols, hiddenCols: hidden, onToggleCol: toggleCol,
    onPresenceChanged: () => setPresenceTick(t => t + 1),
    mode, planning: planning.data, planningCounts: planning.dayCounts,
    onEditDay: (row: Row, day: DayReport) => setEditingDay({ row, day }),
    modeSwitch: MODES[tab].length > 1 ? (
      <CrmV2Segmented<Mode>
        size="sm"
        items={MODES[tab].map(m => ({ id: m, label: MODE_LABELS[m] }))}
        value={mode}
        onChange={changeMode}
      />
    ) : null,
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Équipe"
        subtitle={isAdmins
          ? 'Comptes admin et manager · accès complet au CRM'
          : mode === 'acces'
            ? 'Comptes, rôles et accès'
            : mode === 'planning'
              ? `${formatRange('week', planningWeekStart, addParisDays(planningWeekStart, 6))} · horaires d'appel et présence`
              : `${formatRange(period, from, to)} · performance`}
        actions={
          <>
            {!isAdmins && mode !== 'acces' && (
              <>
                {mode === 'stats' && (
                  <CrmV2Segmented<Period>
                    size="sm"
                    items={[{ id: 'day', label: 'Jour' }, { id: 'week', label: 'Semaine' }, { id: 'month', label: 'Mois' }]}
                    value={period}
                    onChange={setPeriod}
                  />
                )}
                <div style={{ display: 'inline-flex', gap: 4 }}>
                  <AdminIconButton icon={<ChevronLeft size={15} />} title="Période précédente" onClick={() => setAnchor(a => shiftAnchor(period, a, -1))} />
                  <CrmV2Button size="sm" onClick={() => setAnchor(parisDateKey(new Date()))}>Aujourd&apos;hui</CrmV2Button>
                  <AdminIconButton icon={<ChevronRight size={15} />} title="Période suivante" onClick={() => setAnchor(a => shiftAnchor(period, a, 1))} />
                </div>
              </>
            )}
            <AdminIconButton
              icon={<RefreshCw size={15} style={{ animation: statsLoading || loadingMembers ? 'crm-v2-spin 1s linear infinite' : 'none' }} />}
              title="Actualiser"
              onClick={refresh}
            />
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={id => changeTab(id as Tab)}
          items={[
            { id: 'telepros', label: tabLabel(<Phone size={14} />, 'Télépros'), count: activeCount('telepros') },
            { id: 'closers', label: tabLabel(<Briefcase size={14} />, 'Closers'), count: activeCount('closers') },
            { id: 'admins', label: tabLabel(<Shield size={14} />, 'Admins'), count: activeCount('admins') },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {mode === 'stats' && statsError && <AdminNotice tone="error">{statsError}</AdminNotice>}
        {mode === 'planning' && planning.error && <AdminNotice tone="error">{planning.error}</AdminNotice>}
        {mode === 'planning' && planning.data && !planning.data.ready && (
          <AdminNotice tone="warning">Planning pas encore activé : la migration BDD v57 est à lancer dans Supabase.</AdminNotice>
        )}
        {mode === 'stats' && statsReady && stats?.needs_lines && tab === 'telepros' && (
          <AdminNotice tone="warning" icon={<AlertTriangle size={15} />}>
            Aucune ligne Aircall suivie : les appels ne sont pas comptés. Choisis les lignes dans{' '}
            <a href="/admin/crm-v2/reports/suivi-commercial" style={{ color: 'inherit', fontWeight: 700 }}>Suivi commercial</a>.
          </AdminNotice>
        )}

        {mode === 'stats' && <TeamKpis tab={tab} totals={totals ?? null} loading={statsLoading} />}

        <MembersTable
          {...tableProps}
          rows={activeRows}
          loadingMembers={loadingMembers}
          search={search}
          onSearch={setSearch}
          footer={
            isAdmins ? (
              <span>Un admin peut aussi être closer ou télépro : ouvre sa ligne pour lui ajouter la casquette.</span>
            ) : (
              <>
                <span>
                  {tab === 'telepros'
                    ? 'RDV comptés à la date de prise du RDV · tous les appels Aircall du télépro · minutes = temps de conversation réel.'
                    : 'RDV comptés à leur date · un RDV réassigné compte pour le closer final · convertis = positifs + préinscriptions.'}
                  {unmappedCount > 0 && ` · ${unmappedCount} agent(s) Aircall non associé(s).`}
                </span>
                <a href="/admin/crm-v2/reports/suivi-commercial" style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <BarChart3 size={13} /> Suivi commercial détaillé
                </a>
              </>
            )
          }
        />

        {bannedRows.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowBanned(s => !s)} style={{
              appearance: 'none', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: crmV2.textMuted,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {showBanned ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Désactivés ({bannedRows.length})
            </button>
            {showBanned && (
              <div style={{ marginTop: 8 }}>
                <MembersTable {...tableProps} rows={bannedRows} loadingMembers={false} />
              </div>
            )}
          </div>
        )}
        <DayScheduleEditor
          open={!!editingDay}
          title={editingDay ? `Horaires d'appel · ${editingDay.row.name}` : ''}
          day={editingDay?.day ?? null}
          weekDates={planning.data?.dates}
          canImpose
          onClose={() => setEditingDay(null)}
          onSave={saveDay}
        />
      </CrmV2Body>
    </CrmV2Page>
  )
}

// ── Indicateurs d'équipe ─────────────────────────────────────────────────────

function TeamKpis({ tab, totals, loading }: { tab: Tab; totals: SuiviCommercialResponse['totals'] | null; loading: boolean }) {
  const dash = loading ? <AdminSpin size={18} /> : '—'
  const brandSplit = (b: BrandBreakdown | undefined, pick: (s: BrandBreakdown[RdvBrand]) => number) =>
    b ? brandsWithData(b).map(k => `${RDV_BRANDS[k].label} ${pick(b[k])}`).join(' · ') : undefined

  if (tab === 'telepros') {
    const t = totals
    const mpr = t ? minPerRdv(t.talk_time_sec, t.rdv_total) : null
    const venus = t?.rdv_venus ?? 0
    const pre = t?.rdv_preinscrits ?? 0
    return (
      <CrmV2KpiGrid>
        <CrmV2KpiCard icon={<PhoneOutgoing size={15} />} label="Appels sortants" value={t ? fmtInt(t.calls_outbound) : dash}
          detail={t ? `${fmtInt(t.calls_outbound_talk_2min)} ≥ 2 min (${fmtPct(t.talk_2min_rate)}) · ${fmtMinutes(t.talk_time_sec)}` : undefined} />
        <CrmV2KpiCard icon={<CalendarCheck size={15} />} label="RDV placés" color={crmV2.goldDark} value={t ? fmtInt(t.rdv_total) : dash}
          detail={t ? `${fmtPct(t.conversion_talk_2min)} des appels ≥ 2 min → RDV · ${mpr != null ? `${mpr} min / RDV` : '—'}` : undefined} />
        <CrmV2KpiCard icon={<UserCheck size={15} />} label="RDV venus" value={t ? fmtInt(venus) : dash}
          detail={t ? `${fmtPct(pct(venus, t.rdv_total))} des RDV placés · ${fmtInt(t.rdv_no_show)} no-show` : undefined} />
        <CrmV2KpiCard icon={<Trophy size={15} />} label="Préinscriptions" color={crmV2.successStrong} value={t ? fmtInt(pre) : dash}
          detail={t ? `${fmtPct(pct(pre, venus))} des venus · ${fmtPct(pct(pre, t.rdv_total))} des placés` : undefined} />
        {t && RDV_BRAND_IDS.some(b => b !== 'diploma' && (t.by_brand?.[b]?.rdv_total ?? 0) > 0) && (
          <CrmV2KpiCard icon={<Clock size={15} />} label="Par marque" value={fmtInt(t.rdv_total)}
            detail={brandSplit(t.by_brand, s => s.rdv_total)} />
        )}
      </CrmV2KpiGrid>
    )
  }

  const t = totals
  return (
    <CrmV2KpiGrid>
      <CrmV2KpiCard icon={<CalendarCheck size={15} />} label="RDV" value={t ? fmtInt(t.rdv_total) : dash}
        detail={brandSplit(t?.by_brand, s => s.rdv_total)} />
      <CrmV2KpiCard icon={<UserCheck size={15} />} label="RDV honorés" value={t ? fmtInt(t.rdv_honored ?? 0) : dash}
        detail={t ? `Taux de présence ${fmtPct(t.show_rate)} · ${fmtInt(t.rdv_no_show)} no-show` : undefined} />
      <CrmV2KpiCard icon={<Trophy size={15} />} label="Convertis" color={crmV2.successStrong} value={t ? fmtInt(converted(t)) : dash}
        detail={t ? `Closing ${fmtPct(t.closing_rate)} des honorés` : undefined} />
      {RDV_BRAND_IDS.filter(b => (t?.by_brand?.[b]?.rdv_total ?? 0) > 0).map(b => {
        const s = t?.by_brand?.[b]
        return (
          <CrmV2KpiCard key={b} icon={<Percent size={15} />} color={RDV_BRANDS[b].color}
            label={`Closing ${RDV_BRANDS[b].label}`}
            value={s ? fmtPct(pct(converted(s), s.rdv_honored)) : dash}
            detail={s ? `${fmtInt(converted(s))} convertis / ${fmtInt(s.rdv_honored)} honorés` : undefined} />
        )
      })}
    </CrmV2KpiGrid>
  )
}

// ── Tableau des membres ──────────────────────────────────────────────────────

type Col = { key: SortKey; label: string; title?: string; defaultHidden?: boolean }

const TELEPRO_COLS: Col[] = [
  { key: 'presence', label: 'Présence', title: "Jours présents (au moins un appel), heures prévues et journées bien faites / partielles / sans appel" },
  { key: 'calls', label: 'Appels', title: 'Appels sortants Aircall' },
  { key: 'answered', label: 'Décrochés', title: 'Décrochés humains ≥ 10 s (et part des appels)' },
  { key: 'talk2', label: 'Appels ≥ 2 min', title: 'Conversations de 2 minutes ou plus (et part des appels)' },
  { key: 'avgTalk2', label: 'Durée moy. ≥ 2 min', title: 'Durée moyenne des conversations de 2 minutes ou plus', defaultHidden: true },
  { key: 'talk', label: "Temps d'appel", title: 'Temps de conversation réel' },
  { key: 'rdv', label: 'RDV placés', title: 'Tous les RDV placés, même sans appel (SMS, etc.)' },
  { key: 'talk2Rdv', label: '≥ 2 min → RDV', title: 'RDV placés / appels ≥ 2 min : une conversation de 2 min doit se transformer en RDV' },
  { key: 'minPerRdv', label: 'Min / RDV', title: "Minutes d'appel par RDV placé" },
  { key: 'venus', label: 'RDV venus', title: 'Le closer a saisi une issue (ni no-show ni annulé) — et part des RDV placés' },
  { key: 'noShow', label: 'No-show', defaultHidden: true },
  { key: 'preinscrits', label: 'Préinscrits', title: 'Contact pré-inscrit / inscrit (plateforme d’inscription) — et part des RDV venus' },
  { key: 'delta', label: 'Évol. RDV', title: 'RDV placés vs période précédente', defaultHidden: true },
]

const CLOSER_COLS: Col[] = [
  { key: 'rdv', label: 'RDV' },
  { key: 'honored', label: 'Honorés' },
  { key: 'noShow', label: 'No-show' },
  { key: 'cancelled', label: 'Annulés' },
  { key: 'conv', label: 'Convertis', title: 'Positifs + préinscriptions' },
  { key: 'showRate', label: 'Présence', title: 'Honorés / (honorés + no-show)' },
  { key: 'closingRate', label: 'Closing', title: 'Convertis / RDV honorés' },
  { key: 'delta', label: 'Évol. RDV', title: 'RDV vs période précédente', defaultHidden: true },
]

const HIDDEN_COLS_KEY = 'equipe-hidden-cols-v1'

function defaultHidden(tab: Tab): string[] {
  const cols = tab === 'telepros' ? TELEPRO_COLS : tab === 'closers' ? CLOSER_COLS : []
  return cols.filter(c => c.defaultHidden).map(c => c.key)
}

type TableCommon = {
  tab: Tab
  isMobile: boolean
  statsLoading: boolean
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
  expanded: string | null
  onExpand: (id: string) => void
  onPatch: (id: string, patch: Partial<EquipeMember>) => void
  onAdd: (m: EquipeMember) => void
  onRolesChanged: () => void
  extraRolesReady: boolean
  /** Bilan du planning d'appel par télépro sur la période (onglet Télépros) */
  presence: Record<string, DayReport[]> | null
  onPresenceChanged: () => void
  cols: Col[]
  allCols: Col[]
  hiddenCols: string[]
  onToggleCol: (key: string) => void
  mode: Mode
  planning: PlanningData | null
  planningCounts: Array<{ present: number; planned: number }>
  onEditDay: (row: Row, day: DayReport) => void
  modeSwitch: ReactNode
}

function MembersTable({
  rows, loadingMembers, search, onSearch, footer, ...common
}: TableCommon & {
  rows: Row[]
  loadingMembers: boolean
  search?: string
  onSearch?: (v: string) => void
  footer?: ReactNode
}) {
  const { tab, isMobile, sort, onSort, mode } = common
  const cols = mode === 'stats' ? common.cols : []
  const team = TEAMS[tab]
  const today = parisDateKey(new Date())
  const planningDates = mode === 'planning' ? (common.planning?.dates ?? []) : []
  const [showAdd, setShowAdd] = useState(false)
  const [created, setCreated] = useState<{ name: string; email: string; password: string | null; emailSent?: boolean } | null>(null)

  useEffect(() => { setShowAdd(false); setCreated(null) }, [tab])

  const toolbar = onSearch ? (
    <>
      {common.modeSwitch}
      <CrmV2Search
        value={search ?? ''}
        onChange={e => onSearch(e.target.value)}
        placeholder={`Rechercher un ${team.noun}…`}
        style={{ flex: '1 1 220px', height: isMobile ? 40 : 36 }}
      />
      {mode === 'stats' && !isMobile && <ColumnPicker cols={common.allCols} hidden={common.hiddenCols} onToggle={common.onToggleCol} />}
      {mode === 'planning' && !isMobile && <PlanningLegend />}
      {!showAdd && (
        <CrmV2Button variant="primary" icon={<UserPlus size={14} />} onClick={() => { setShowAdd(true); setCreated(null) }}>
          Ajouter un {team.noun}
        </CrmV2Button>
      )}
    </>
  ) : undefined

  const extras = (
    <>
      {created && (
        <AdminNotice tone="success" icon={<UserCheck size={15} />} onClose={() => setCreated(null)}>
          <div style={{ fontWeight: 700 }}>
            Compte créé — {created.name}{created.emailSent ? ' · invitation envoyée par e-mail' : ''}
          </div>
          {created.password ? (
            <>
              <CredentialBox email={created.email} password={created.password} passwordLabel="Mot de passe CRM" />
              <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 8 }}>
                Transmets ces identifiants. Le mot de passe ne sera plus visible après fermeture.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>Compte existant : mot de passe inchangé.</div>
          )}
        </AdminNotice>
      )}
      {showAdd && (
        <AddMemberForm
          tab={tab}
          isMobile={isMobile}
          onCancel={() => setShowAdd(false)}
          onCreated={(m, password, emailSent) => {
            common.onAdd(m)
            setCreated({ name: m.name, email: m.email, password, emailSent })
            setShowAdd(false)
          }}
        />
      )}
    </>
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toolbar && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{toolbar}</div>}
        {extras}
        {loadingMembers ? (
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><AdminSpin size={18} /></div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun {team.noun}.</div>
        ) : rows.map(r => (
          <MobileMemberCard key={r.id} {...common} row={r} open={common.expanded === r.id} onToggle={() => common.onExpand(r.id)} />
        ))}
        {footer && <div style={{ fontSize: 12, color: crmV2.textMuted, display: 'flex', flexDirection: 'column', gap: 6 }}>{footer}</div>}
      </div>
    )
  }

  const colSpan = (mode === 'planning' ? 1 : 2) + (mode === 'stats' ? cols.length : mode === 'planning' ? planningDates.length + 1 : ACCES_COLS.length)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {extras}
      <CrmV2TableCard toolbar={toolbar} footer={footer}>
        <CrmV2Table>
          <thead>
            <tr>
              <CrmV2Th sorted={sort.key === 'name' ? sort.dir : false} onClick={() => onSort('name')}>{team.column}</CrmV2Th>
              {cols.map(c => (
                <CrmV2Th key={c.key} sorted={sort.key === c.key ? sort.dir : false} onClick={() => onSort(c.key)} style={{ textAlign: c.key === 'presence' ? 'left' : 'right' }}>
                  <span title={c.title}>{c.label}</span>
                </CrmV2Th>
              ))}
              {planningDates.map((d, i) => (
                <CrmV2Th key={d} style={{ minWidth: 98, padding: '8px 6px', borderLeft: `1px solid ${crmV2.borderLight}` }}>
                  <PlanningDayHeader date={d} index={i} counts={common.planningCounts[i]} today={today} />
                </CrmV2Th>
              ))}
              {mode === 'planning' && <CrmV2Th style={{ textAlign: 'right' }}>Semaine</CrmV2Th>}
              {mode === 'acces' && ACCES_COLS.map(c => (
                <CrmV2Th key={c.key} sorted={sort.key === c.key ? sort.dir : false} onClick={c.sortable ? () => onSort(c.key) : undefined}>{c.label}</CrmV2Th>
              ))}
              {mode !== 'planning' && <CrmV2Th style={{ textAlign: 'right' }}>Compte</CrmV2Th>}
            </tr>
          </thead>
          <tbody>
            {mode === 'planning' && !common.planning && rows.length > 0 && (
              <tr><CrmV2Td colSpan={colSpan} style={{ textAlign: 'center', height: 50 }}><AdminSpin size={16} /></CrmV2Td></tr>
            )}
            {loadingMembers && rows.length === 0 ? (
              <tr><CrmV2Td colSpan={colSpan} style={{ textAlign: 'center', height: 80 }}><AdminSpin size={18} /></CrmV2Td></tr>
            ) : rows.length === 0 ? (
              <tr><CrmV2Td colSpan={colSpan} style={{ color: crmV2.textMuted }}>Aucun {team.noun}.</CrmV2Td></tr>
            ) : rows.map(r => (
              <MemberRow key={r.id} {...common} row={r} cols={cols} colSpan={colSpan}
                open={common.expanded === r.id} onToggle={() => common.onExpand(r.id)} />
            ))}
          </tbody>
        </CrmV2Table>
      </CrmV2TableCard>
    </div>
  )
}

function cellValue(tab: Tab, key: SortKey, s: AgentMetrics): ReactNode {
  if (key.startsWith('brand:')) {
    const b = s.by_brand[key.slice(6) as RdvBrand]
    if (!b?.rdv_total) return '—'
    return tab === 'closers'
      ? <>{fmtInt(b.rdv_total)} <Faint>{fmtInt(converted(b))} conv.</Faint></>
      : <>{fmtInt(b.rdv_total)} <Faint>{fmtInt(b.rdv_venus)} venus</Faint></>
  }
  switch (key) {
    case 'calls': return fmtInt(s.calls_outbound)
    case 'answered': {
      const n = s.calls_outbound_talk_2min + s.calls_outbound_talk_short
      return n ? <>{fmtInt(n)} <Faint>{fmtPct(s.answer_rate)}</Faint></> : '—'
    }
    case 'talk2': return s.calls_outbound_talk_2min
      ? <>{fmtInt(s.calls_outbound_talk_2min)} <Faint>{fmtPct(s.talk_2min_rate)}</Faint></>
      : '—'
    case 'talk2Rdv': return <strong style={{ color: rateColor(s.conversion_talk_2min, 60, 35) }}>{fmtPct(s.conversion_talk_2min)}</strong>
    case 'venus': return s.rdv_venus
      ? <>{fmtInt(s.rdv_venus)} <Faint>{fmtPct(pct(s.rdv_venus, s.rdv_total))}</Faint></>
      : '—'
    case 'preinscrits': return s.rdv_preinscrits
      ? <><strong style={{ color: crmV2.successStrong }}>{fmtInt(s.rdv_preinscrits)}</strong> <Faint>{fmtPct(pct(s.rdv_preinscrits, s.rdv_venus))}</Faint></>
      : '—'
    case 'talk': return fmtMinutes(s.talk_time_sec)
    case 'rdv': return <strong style={{ color: s.rdv_total ? crmV2.text : crmV2.textFaint }}>{fmtInt(s.rdv_total)}</strong>
    case 'minPerRdv': {
      const v = minPerRdv(s.talk_time_sec, s.rdv_total)
      return v != null ? `${v} min` : '—'
    }
    case 'conv': {
      const c = converted(s)
      if (!c) return '—'
      const base = tab === 'closers' ? s.rdv_honored : s.rdv_total
      return <><strong style={{ color: crmV2.successStrong }}>{c}</strong> <Faint>{fmtPct(pct(c, base))}</Faint></>
    }
    case 'honored': return fmtInt(s.rdv_honored)
    case 'noShow': return fmtInt(s.rdv_no_show)
    case 'cancelled': return fmtInt(s.rdv_annules)
    case 'showRate': return fmtPct(s.show_rate)
    case 'closingRate': return <strong>{fmtPct(s.closing_rate)}</strong>
    case 'avgTalk2': return s.avg_talk_2min_sec ? `${Math.floor(s.avg_talk_2min_sec / 60)} min ${String(s.avg_talk_2min_sec % 60).padStart(2, '0')}` : '—'
    case 'delta': return s.delta_rdv
      ? <strong style={{ color: s.delta_rdv > 0 ? crmV2.successStrong : '#dc2626' }}>{s.delta_rdv > 0 ? '+' : ''}{s.delta_rdv}</strong>
      : '—'
    default: return '—'
  }
}

/** Vert au-dessus de `good`, orange entre les deux, rouge sous `bad`. */
function rateColor(v: number | null | undefined, good: number, bad: number): string {
  if (v == null) return crmV2.textFaint
  if (v >= good) return crmV2.successStrong
  if (v < bad) return '#dc2626'
  return '#d97706'
}

function presenceSummary(days: DayReport[]) {
  const t = { planned: 0, ok: 0, partiel: 0, absent: 0, hors: 0 }
  for (const d of days) {
    t.planned += d.planned_min
    if (d.verdict === 'ok') t.ok++
    else if (d.verdict === 'partiel') t.partiel++
    else if (d.verdict === 'absent') t.absent++
    else if (d.verdict === 'hors_planning') t.hors++
  }
  return t
}

/** Colonne « Présence » : heures prévues + journées ✓ / ~ / ✗ sur la période. */
function PresenceCell({ days }: { days: DayReport[] | null }) {
  if (!days) return <span style={{ color: crmV2.textFaint }}>…</span>
  const t = presenceSummary(days)
  const present = days.filter(d => d.calls > 0).length
  const judged = t.ok + t.partiel + t.absent
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, whiteSpace: 'nowrap' }}>
      <strong style={{ color: present ? crmV2.text : crmV2.textFaint }}>{present} j</strong>
      <span style={{ color: crmV2.textMuted }}>{t.planned ? `${fmtPlannedMinutes(t.planned)} prévues` : 'sans horaires'}</span>
      {judged > 0 && (
        <span title="Journées bien faites / partielles / sans appel">
          <span style={{ color: VERDICTS.ok.color, fontWeight: 700 }}>{t.ok}✓</span>{' '}
          <span style={{ color: VERDICTS.partiel.color, fontWeight: 700 }}>{t.partiel}~</span>{' '}
          <span style={{ color: VERDICTS.absent.color, fontWeight: 700 }}>{t.absent}✗</span>
        </span>
      )}
    </span>
  )
}

const ACCES_COLS: Array<{ key: string; label: string; sortable?: boolean }> = [
  { key: 'roles', label: 'Rôle · accès' },
  { key: 'email', label: 'E-mail' },
  { key: 'lastSignIn', label: 'Dernière connexion', sortable: true },
  { key: 'status', label: 'Statut' },
]

const ROLE_ACCESS: Record<string, string> = {
  admin: 'CRM complet',
  manager: 'CRM complet',
  closer: 'Son agenda closer',
  telepro: 'Espace télépro',
}

/** Mode Accès : rôle principal + casquettes, e-mail, dernière connexion, statut. */
function AccesCells({ row }: { row: Row }) {
  const m = row.member
  if (!m) return <CrmV2Td colSpan={ACCES_COLS.length} style={{ color: crmV2.textFaint }}>—</CrmV2Td>
  const roles = teamRolesOf(m)
  return (
    <>
      <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {roles.map((r, i) => {
            const c = ROLE_COLOR[r] ?? crmV2.goldDark
            return (
              <span key={r} title={i === 0 ? `Rôle principal : ${ROLE_ACCESS[r] ?? ''}` : 'Casquette en plus'} style={{
                padding: '1px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: c,
                background: `${c}14`, border: `1px solid ${i === 0 ? c : `${c}40`}`, whiteSpace: 'nowrap',
              }}>
                {TEAM_ROLE_LABELS[r] ?? r}
              </span>
            )
          })}
          <span style={{ fontSize: 12, color: crmV2.textMuted, marginLeft: 4 }}>{ROLE_ACCESS[m.role] ?? ''}</span>
        </span>
      </CrmV2Td>
      <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</CrmV2Td>
      <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{fmtLastSignIn(m.last_sign_in_at)}</CrmV2Td>
      <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700,
          color: m.is_banned ? '#d13a41' : m.auth_id ? crmV2.successStrong : '#b45309',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: 'currentColor' }} />
          {m.is_banned ? 'Désactivé' : m.auth_id ? 'Actif' : 'Sans compte'}
        </span>
      </CrmV2Td>
    </>
  )
}

/** Bouton « Colonnes » : afficher / masquer les colonnes du tableau. */
function ColumnPicker({ cols, hidden, onToggle }: { cols: Col[]; hidden: string[]; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <CrmV2Button icon={<Columns3 size={14} />} onClick={() => setOpen(o => !o)}>Colonnes</CrmV2Button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41, minWidth: 230, maxHeight: 380, overflowY: 'auto',
            background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, boxShadow: crmV2.shadowPanel, padding: 8,
          }}>
            {cols.map(c => (
              <label key={c.key} title={c.title} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, color: crmV2.text,
              }}>
                <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => onToggle(c.key)}
                  style={{ accentColor: crmV2.gold, width: 15, height: 15 }} />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Faint({ children }: { children: ReactNode }) {
  return <span style={{ color: crmV2.textFaint, fontSize: 12, fontWeight: 500 }}>{children}</span>
}

/**
 * Badge double rôle : affiché dans chaque onglet où le compte apparaît
 * (« Télépro + Closer », « Admin + Closer »), une couleur par casquette.
 */
function DualRoleBadge({ m }: { m: EquipeMember | null }) {
  if (!m) return null
  const roles = teamRolesOf(m)
  if (roles.length < 2) return null
  return (
    <span
      title={`Double rôle : ${roles.map(r => TEAM_ROLE_LABELS[r] ?? r).join(' et ')}`}
      style={{
        display: 'inline-flex', alignItems: 'stretch', borderRadius: 999, overflow: 'hidden', flexShrink: 0,
        fontSize: 11, fontWeight: 700, lineHeight: '18px', border: `1px solid ${crmV2.border}`,
      }}
    >
      {roles.map((r, i) => {
        const c = ROLE_COLOR[r] ?? crmV2.goldDark
        return (
          <span key={r} style={{
            padding: '0 8px', color: c, background: `${c}14`,
            borderLeft: i > 0 ? `1px solid ${crmV2.border}` : 'none', whiteSpace: 'nowrap',
          }}>
            {TEAM_ROLE_LABELS[r] ?? r}
          </span>
        )
      })}
    </span>
  )
}

function NameCell({ row, open }: { tab: Tab; row: Row; open: boolean }) {
  const banned = !!row.member?.is_banned
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
      {open ? <ChevronUp size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} /> : <ChevronDown size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />}
      <span style={{ opacity: banned ? 0.5 : 1, display: 'inline-flex', flexShrink: 0 }}>
        <CrmV2Avatar name={row.name} color={banned ? crmV2.borderStrong : (row.color ?? crmV2.gold)} size={24} radius="36%" />
      </span>
      <span style={{ fontWeight: 600, color: banned ? crmV2.textMuted : crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{row.name}</span>
      <DualRoleBadge m={row.member} />
    </span>
  )
}

function MemberRow({
  row, cols, colSpan, open, onToggle, ...common
}: TableCommon & {
  row: Row
  cols: Col[]
  colSpan: number
  open: boolean
  onToggle: () => void
}) {
  const { tab, statsLoading, mode } = common
  const account = useAccountActions(tab, row, common.onPatch)
  const s = row.stats
  return (
    <Fragment>
      <CrmV2Tr onClick={onToggle}>
        <CrmV2Td style={{ whiteSpace: 'nowrap' }}><NameCell tab={tab} row={row} open={open} /></CrmV2Td>
        {mode === 'planning' && (common.planning?.report[row.id] ?? []).map(d => (
          <CrmV2Td key={d.date} style={{ height: 'auto', padding: 2, verticalAlign: 'top', borderLeft: `1px solid ${crmV2.borderLight}` }}>
            <PlanningDayCell day={d} today={parisDateKey(new Date())} onClick={() => common.onEditDay(row, d)} />
          </CrmV2Td>
        ))}
        {mode === 'planning' && common.planning && !common.planning.report[row.id] && (
          <CrmV2Td colSpan={7} style={{ color: crmV2.textFaint, fontSize: 12 }}>Pas dans l&apos;équipe télépro active</CrmV2Td>
        )}
        {mode === 'planning' && (
          <CrmV2Td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: 8 }}>
            {common.planning?.report[row.id] ? <PlanningWeekSummary days={common.planning.report[row.id]} /> : null}
          </CrmV2Td>
        )}
        {mode === 'acces' && <AccesCells row={row} />}
        {(mode === 'stats' ? cols : []).map(c => c.key === 'presence' ? (
          <CrmV2Td key={c.key} style={{ whiteSpace: 'nowrap' }}>
            <PresenceCell days={common.presence ? (common.presence[row.id] ?? []) : null} />
          </CrmV2Td>
        ) : (
          <CrmV2Td key={c.key} style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {s ? cellValue(tab, c.key, s) : statsLoading ? <span style={{ color: crmV2.textFaint }}>…</span> : '—'}
          </CrmV2Td>
        ))}

        {mode !== 'planning' && (
          <CrmV2Td style={{ textAlign: 'right' }}>
            <div onClick={e => e.stopPropagation()}>{account.actions}</div>
          </CrmV2Td>
        )}
      </CrmV2Tr>
      {(account.confirm || account.credentials) && (
        <tr><CrmV2Td colSpan={colSpan} style={{ height: 'auto', padding: '8px 14px 12px' }}>{account.confirm ?? account.credentials}</CrmV2Td></tr>
      )}
      {open && (
        <tr>
          <CrmV2Td colSpan={colSpan} style={{ height: 'auto', padding: '10px 14px 16px', background: crmV2.bgHover }}>
            <MemberDetail {...common} cols={cols} row={row} actions={mode === 'planning' ? account.actions : null} />
          </CrmV2Td>
        </tr>
      )}
    </Fragment>
  )
}

function MobileMemberCard({
  row, open, onToggle, ...common
}: TableCommon & {
  row: Row
  open: boolean
  onToggle: () => void
}) {
  const { tab, statsLoading } = common
  const account = useAccountActions(tab, row, common.onPatch)
  const s = row.stats
  const mini: Array<[string, ReactNode]> = s
    ? tab === 'telepros'
      ? [['Appels', fmtInt(s.calls_outbound)], ["Temps d'appel", fmtMinutes(s.talk_time_sec)], ['RDV placés', fmtInt(s.rdv_total)],
         ['Min / RDV', (() => { const v = minPerRdv(s.talk_time_sec, s.rdv_total); return v != null ? `${v} min` : '—' })()]]
      : [['RDV', fmtInt(s.rdv_total)], ['Honorés', fmtInt(s.rdv_honored)], ['Convertis', fmtInt(converted(s))], ['Closing', fmtPct(s.closing_rate)]]
    : []
  return (
    <PanelCard style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button type="button" onClick={onToggle} style={{ appearance: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', minWidth: 0, textAlign: 'left' }}>
          <NameCell tab={tab} row={row} open={open} />
        </button>
        {account.actions}
      </div>
      {account.confirm ?? account.credentials}
      {tab === 'admins' ? (
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6 }}>
          {row.member?.email} · dernière connexion {fmtLastSignIn(row.member?.last_sign_in_at ?? null)}
        </div>
      ) : s ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
          {mini.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: crmV2.textMuted, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{value}</div>
            </div>
          ))}
        </div>
      ) : statsLoading ? (
        <div style={{ marginTop: 8 }}><AdminSpin /></div>
      ) : null}
      {open && <div style={{ marginTop: 10 }}><MemberDetail {...common} row={row} actions={null} /></div>}
    </PanelCard>
  )
}

// ── Détail : performance par marque + réglages du compte ────────────────────

function MemberDetail({ row, actions, ...common }: TableCommon & { row: Row; actions: ReactNode }) {
  const { tab, mode } = common
  const days = mode === 'planning'
    ? (common.planning?.report[row.id] ?? [])
    : (common.presence?.[row.id] ?? [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: crmV2.textMuted }}>{row.member?.email}</span>
          <div onClick={e => e.stopPropagation()}>{actions}</div>
        </div>
      )}
      {tab === 'telepros' && row.stats && <MemberStatsStrip s={row.stats} />}
      {tab === 'telepros' && days.length > 0 && (
        <MemberDaysTable days={days} onEdit={d => common.onEditDay(row, d)} />
      )}
      {row.member && (
        <AccountSettings
          member={row.member}
          onPatch={common.onPatch}
          onRolesChanged={common.onRolesChanged}
          extraRolesReady={common.extraRolesReady}
        />
      )}
    </div>
  )
}

/** Stats du télépro sur la période (semaine en mode Planning). */
function MemberStatsStrip({ s }: { s: AgentMetrics }) {
  const answered = s.calls_outbound_talk_2min + s.calls_outbound_talk_short
  const mpr = minPerRdv(s.talk_time_sec, s.rdv_total)
  const items: Array<[string, ReactNode, ReactNode?]> = [
    ['Appels', fmtInt(s.calls_outbound)],
    ['Décrochés', fmtInt(answered), fmtPct(s.answer_rate)],
    ['≥ 2 min', fmtInt(s.calls_outbound_talk_2min), fmtPct(s.talk_2min_rate)],
    ["Temps d'appel", fmtMinutes(s.talk_time_sec)],
    ['RDV placés', fmtInt(s.rdv_total)],
    ['≥ 2 min → RDV', <span key="c" style={{ color: rateColor(s.conversion_talk_2min, 60, 35) }}>{fmtPct(s.conversion_talk_2min)}</span>],
    ['Min / RDV', mpr != null ? `${mpr} min` : '—'],
    ['RDV venus', fmtInt(s.rdv_venus), fmtPct(pct(s.rdv_venus, s.rdv_total))],
    ['No-show', fmtInt(s.rdv_no_show)],
    ['Préinscrits', fmtInt(s.rdv_preinscrits), fmtPct(pct(s.rdv_preinscrits, s.rdv_venus))],
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 8,
    }}>
      {items.map(([label, value, sub]) => (
        <div key={label} style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{label}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: crmV2.text, fontVariantNumeric: 'tabular-nums' }}>
            {value}{sub && sub !== '—' ? <span style={{ fontSize: 11.5, fontWeight: 500, color: crmV2.textFaint }}> {sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Détail jour par jour (horaires, activité Aircall, RDV, bilan) — clic → modifier les horaires. */
function MemberDaysTable({ days, onEdit }: { days: DayReport[]; onEdit: (d: DayReport) => void }) {
  const today = parisDateKey(new Date())
  const th: CSSProperties = {
    padding: '6px 10px', fontSize: 10.5, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase',
    letterSpacing: '0.04em', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${crmV2.border}`,
  }
  const td: CSSProperties = { padding: '6px 10px', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${crmV2.borderLight}` }
  return (
    <div style={{ overflowX: 'auto', background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Jour</th>
            <th style={{ ...th, textAlign: 'left' }}>Horaires</th>
            <th style={th}>Activité réelle</th>
            <th style={th}>Appels</th>
            <th style={th}>Décrochés</th>
            <th style={th}>≥ 2 min</th>
            <th style={th}>Temps</th>
            <th style={th}>RDV</th>
            <th style={{ ...th, textAlign: 'left' }}>Bilan</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {days.map(d => {
            const [y, m, dd] = d.date.split('-').map(Number)
            const wd = WEEKDAYS[(new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay() + 6) % 7]
            const empty = !d.calls && !d.slots.length
            return (
              <tr key={d.date} onClick={() => onEdit(d)} style={{ cursor: 'pointer', background: d.date === today ? crmV2.goldSoft : undefined }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: empty ? crmV2.textFaint : crmV2.text }}>{wd} {dd}</td>
                <td style={{ ...td, textAlign: 'left' }}>
                  {d.slots.length
                    ? <span style={{ display: 'inline-flex', gap: 3 }}>{d.slots.map(s => <SlotChip key={s.id} slot={s} />)}</span>
                    : <span style={{ color: crmV2.textFaint }}>—</span>}
                </td>
                <td style={td}>{d.first_call ? `${d.first_call} → ${d.last_call}` : '—'}</td>
                <td style={{ ...td, fontWeight: 700 }}>{d.calls || '—'}</td>
                <td style={td}>{d.answered || '—'}</td>
                <td style={td}>{d.talk2 || '—'}</td>
                <td style={td}>{d.talk_sec ? fmtMinutes(d.talk_sec) : '—'}</td>
                <td style={{ ...td, fontWeight: 700, color: d.rdv ? crmV2.goldDark : crmV2.textFaint }}>{d.rdv || '—'}</td>
                <td style={{ ...td, textAlign: 'left' }}>{(d.slots.length > 0 || d.calls > 0) && d.verdict !== 'a_venir' ? <VerdictPill verdict={d.verdict} small /> : null}</td>
                <td style={{ ...td, color: crmV2.link, fontWeight: 600 }}>Modifier</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Rôle principal, casquettes en plus (double rôle), marque CRM, suppression. */
function AccountSettings({
  member, onPatch, onRolesChanged, extraRolesReady,
}: {
  member: EquipeMember
  onPatch: (id: string, patch: Partial<EquipeMember>) => void
  onRolesChanged: () => void
  extraRolesReady: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function patchUser(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, ...body }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Modification impossible'); return false }
      return true
    } finally {
      setBusy(false)
    }
  }

  async function toggleExtra(r: TeamRole) {
    const next = member.extra_roles.includes(r) ? member.extra_roles.filter(x => x !== r) : [...member.extra_roles, r]
    if (await patchUser({ extra_roles: next })) onRolesChanged()
  }

  async function changeRole(role: string) {
    if (role === member.role) return
    if (!window.confirm(`Passer ${member.name} en ${TEAM_ROLE_LABELS[role] ?? role} ?\nSes accès changent en conséquence.`)) return
    // Le nouveau rôle principal sort des casquettes en plus
    const extras = new Set(member.extra_roles.filter(x => x !== role))
    if (await patchUser({ role, extra_roles: extraRolesReady ? [...extras] : undefined })) onRolesChanged()
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement le compte de ${member.name} ?\nPréfère « Désactiver » pour garder son historique.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(member.id)}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Suppression impossible'); return }
      onRolesChanged()
    } finally {
      setBusy(false)
    }
  }

  const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }
  return (
    <div style={{
      display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start',
      paddingTop: 12, borderTop: `1px dashed ${crmV2.border}`,
    }}>
      <div>
        <div style={label}>Casquettes</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {TEAM_ROLES.map(r => {
            const main = member.role === r
            const on = main || member.extra_roles.includes(r)
            return (
              <label key={r} title={main ? 'Rôle principal' : undefined} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: crmV2.text,
                cursor: main || busy || !extraRolesReady ? 'default' : 'pointer', opacity: main ? 0.75 : 1,
              }}>
                <input type="checkbox" checked={on} disabled={main || busy || !extraRolesReady}
                  onChange={() => toggleExtra(r)} style={{ accentColor: crmV2.gold, width: 16, height: 16 }} />
                {TEAM_ROLE_LABELS[r]}{main ? ' (principal)' : ''}
              </label>
            )
          })}
        </div>
        {!extraRolesReady && (
          <div style={{ fontSize: 11, color: crmV2.goldDark, marginTop: 4 }}>Double rôle : migration BDD v56 à appliquer.</div>
        )}
      </div>
      <div>
        <div style={label}>Rôle principal (accès)</div>
        <CrmV2Select value={member.role} disabled={busy} onChange={e => changeRole(e.target.value)} style={{ minWidth: 150 }}>
          {MAIN_ROLES.map(r => <option key={r} value={r}>{TEAM_ROLE_LABELS[r]}</option>)}
        </CrmV2Select>
      </div>
      <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
        <CrmV2Button size="sm" variant="secondary" icon={<Trash2 size={13} />} onClick={remove} disabled={busy}>
          Supprimer le compte
        </CrmV2Button>
      </div>
      {error && <AdminNotice tone="error" style={{ flexBasis: '100%' }}>{error}</AdminNotice>}
    </div>
  )
}

// ── Actions de compte ────────────────────────────────────────────────────────

function useAccountActions(tab: Tab, row: Row, onPatch: (id: string, patch: Partial<EquipeMember>) => void) {
  const team = TEAMS[tab]
  const m = row.member
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function patch(action: 'ban' | 'unban' | 'reset-password') {
    if (!m) return null
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(team.endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: m.id, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Erreur'); return null }
      return data
    } finally {
      setBusy(false)
    }
  }

  async function toggleBan() {
    if (!m) return
    const data = await patch(m.is_banned ? 'unban' : 'ban')
    setConfirming(false)
    if (data) onPatch(m.id, { is_banned: !m.is_banned })
  }

  async function resetPassword() {
    if (!m) return
    if (!window.confirm(`Générer un nouveau mot de passe pour ${m.name} ?\nL'ancien ne fonctionnera plus.`)) return
    const data = await patch('reset-password')
    if (data?.password) setPassword(data.password)
  }

  if (!m) {
    return {
      actions: <span style={{ fontSize: 12, color: crmV2.textFaint, whiteSpace: 'nowrap' }}>—</span>,
      confirm: null as ReactNode,
      credentials: null as ReactNode,
    }
  }

  const impersonate = team.impersonateUrl(m)
  const banned = m.is_banned
  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexShrink: 0 }}>
      {!banned && m.auth_id && (
        <AdminIconButton icon={<Key size={14} />} title="Identifiants : générer un nouveau mot de passe" onClick={resetPassword} disabled={busy} />
      )}
      {!banned && impersonate && (
        <AdminIconButton icon={<LogIn size={14} />} title={`Se connecter en tant que ce ${team.noun}`} onClick={() => window.open(impersonate, '_blank')} />
      )}
      {m.auth_id && (
        <AdminIconButton
          icon={banned ? <UserCheck size={14} /> : <UserX size={14} />}
          title={banned ? 'Réactiver' : 'Désactiver'}
          tone={banned ? 'default' : 'danger'}
          onClick={() => setConfirming(true)}
          disabled={busy}
        />
      )}
    </div>
  )

  const confirm = confirming ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
      <span style={{ flex: '1 1 200px', fontSize: 13, color: crmV2.text }}>
        {banned ? `Réactiver ${m.name} ? Il pourra de nouveau se connecter.` : `Désactiver ${m.name} ? Il ne pourra plus se connecter.`}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <CrmV2Button size="sm" onClick={() => setConfirming(false)}>Annuler</CrmV2Button>
        <CrmV2Button size="sm" variant={banned ? 'primary' : 'danger'} onClick={toggleBan} disabled={busy}>
          {busy ? '…' : 'Confirmer'}
        </CrmV2Button>
      </div>
    </div>
  ) : error ? (
    <AdminNotice tone="error" onClose={() => setError(null)} style={{ marginTop: 4 }}>{error}</AdminNotice>
  ) : null

  const credentials = password ? (
    <div style={{
      background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 12, padding: '10px 12px', marginTop: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Key size={13} /> Identifiants de connexion · {m.email}
        </span>
        <button type="button" onClick={() => setPassword(null)} aria-label="Masquer" title="Masquer" style={{
          background: 'none', border: 'none', color: crmV2.goldDark, cursor: 'pointer', padding: 4, display: 'inline-flex',
        }}>
          <X size={14} />
        </button>
      </div>
      <CredentialBox email={m.email} password={password} passwordLabel="Mot de passe (nouveau)" />
    </div>
  ) : null

  return { actions, confirm, credentials }
}

// ── Création de compte ───────────────────────────────────────────────────────

function AddMemberForm({
  tab, isMobile, onCancel, onCreated,
}: {
  tab: Tab
  isMobile: boolean
  onCancel: () => void
  onCreated: (m: EquipeMember, password: string | null, emailSent?: boolean) => void
}) {
  const team = TEAMS[tab]
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canCreate = !!(firstName.trim() && lastName.trim() && email.trim())

  async function submit() {
    if (!canCreate) return
    setSaving(true)
    setError(null)
    try {
      const isAdmins = tab === 'admins'
      // Admins : /api/users (invitation par e-mail) ; télépros / closers : routes d'équipe
      const res = await fetch(isAdmins ? '/api/users' : team.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAdmins
          ? { name: `${firstName.trim()} ${lastName.trim()}`, email: email.trim(), role: 'admin' }
          : { email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Erreur'); return }
      const user = isAdmins ? data : data.user
      const member: EquipeMember = {
        ...user,
        auth_id: user?.auth_id ?? null,
        is_banned: false,
        role: user?.role ?? team.role ?? 'admin',
        extra_roles: [],
        crm_brand: user?.crm_brand ?? null,
        is_default_brand_telepro: !!user?.is_default_brand_telepro,
        hubspot_owner_id: user?.hubspot_owner_id ?? null,
        last_sign_in_at: null,
      }
      onCreated(member, data.password ?? null, isAdmins ? !!data.email_sent : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PanelCard accent style={{ padding: isMobile ? 14 : 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Plus size={16} color={crmV2.gold} /> Nouveau {team.noun}
      </div>
      <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4 }}>
        {tab === 'admins'
          ? 'Accès complet au CRM. Une invitation est envoyée par e-mail.'
          : 'Un mot de passe unique sera généré pour se connecter au CRM.'}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: '12px 14px', marginTop: 14,
      }}>
        <CrmV2Field label="Prénom *">
          <CrmV2Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Prénom" autoFocus />
        </CrmV2Field>
        <CrmV2Field label="Nom *">
          <CrmV2Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nom" />
        </CrmV2Field>
        <CrmV2Field label="E-mail *">
          <CrmV2Input type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="prenom.nom@diploma-sante.fr" />
        </CrmV2Field>
      </div>
      {error && <AdminNotice tone="error" style={{ marginTop: 12 }}>{error}</AdminNotice>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <CrmV2Button onClick={onCancel}>Annuler</CrmV2Button>
        <CrmV2Button variant="primary" onClick={submit} disabled={saving || !canCreate}>
          {saving ? 'Création…' : 'Créer le compte'}
        </CrmV2Button>
      </div>
    </PanelCard>
  )
}
