'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, ChevronDown, ChevronUp, LayoutDashboard, Users, ExternalLink,
  ArrowUpDown, GraduationCap, MapPin, BookOpen, Phone, Mail, RefreshCw,
  LayoutGrid, List, Plus, Save, Check, SlidersHorizontal, Trash2, Copy,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import TransactionBoard from '@/components/TransactionBoard'
import type { UndoAction } from '@/components/TransactionBoard'
import TransactionDetailPanel from '@/components/TransactionDetailPanel'
import type { TransactionDetail } from '@/components/TransactionDetailPanel'

// ── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  hubspot_deal_id: string
  dealname: string | null
  dealstage: string | null
  formation: string | null
  closedate: string | null
  createdate: string | null
  description: string | null
  hubspot_owner_id?: string | null
  teleprospecteur?: string | null
  closer: { id: string; name: string; avatar_color: string } | null
  telepro: { id: string; name: string; avatar_color: string } | null
  contact: {
    hubspot_contact_id: string
    firstname: string | null
    lastname: string | null
    email: string | null
    phone: string | null
    classe_actuelle: string | null
    zone_localite: string | null
    departement: string | null
  } | null
}

interface StatsData {
  stages: Record<string, number>
  formations: Record<string, number>
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGE_MAP: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  emoji: '🔴' },
  '3165428980': { label: 'RDV Pris',              color: '#4cabdb', bg: 'rgba(76,171,219,0.10)',  emoji: '🔵' },
  '3165428981': { label: 'Délai Réflexion',       color: '#ccac71', bg: 'rgba(204,172,113,0.10)', emoji: '🟡' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   emoji: '🟢' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7', bg: 'rgba(168,85,247,0.10)',  emoji: '🟣' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a', bg: 'rgba(22,163,74,0.10)',   emoji: '✅' },
  '3165428985': { label: 'Fermé Perdu',           color: '#7c98b6', bg: 'rgba(85,88,112,0.10)',   emoji: '⚫' },
}

const FORMATION_OPTIONS = [
  '', 'PASS', 'LSPS', 'LAS', 'P-1', 'P-2', 'PAES FR', 'PAES EU', 'LSPS2 UPEC', 'LSPS3 UPEC',
]

const CLASSE_OPTIONS = [
  '', 'Terminale', 'Première', 'Seconde', 'Troisième', 'PASS',
  'LSPS 1', 'LSPS 2', 'LSPS 3', 'LAS 1', 'LAS 2', 'LAS 3', 'Etudes médicales',
]

type SortCol = 'dealname' | 'formation' | 'classe' | 'zone' | 'stage' | 'created'
type ViewMode = 'board' | 'list'

// ── Advanced Filter System ───────────────────────────────────────────────────

type FilterField = 'stage' | 'formation' | 'classe' | 'zone' | 'closer' | 'dealname'
type FilterOperator = 'is' | 'is_not' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

interface FilterRule {
  id: string
  field: FilterField
  operator: FilterOperator
  value: string
}

const FILTER_FIELDS: { key: FilterField; label: string; type: 'select' | 'text' }[] = [
  { key: 'stage',     label: 'Étape',            type: 'select' },
  { key: 'formation', label: 'Formation',        type: 'select' },
  { key: 'classe',    label: 'Classe actuelle',  type: 'select' },
  { key: 'zone',      label: 'Zone / Localité',  type: 'text' },
  { key: 'closer',    label: 'Closer',           type: 'text' },
  { key: 'dealname',  label: 'Nom transaction',  type: 'text' },
]

const OPERATORS_SELECT: { key: FilterOperator; label: string }[] = [
  { key: 'is',           label: 'est' },
  { key: 'is_not',       label: "n'est pas" },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

const OPERATORS_TEXT: { key: FilterOperator; label: string }[] = [
  { key: 'contains',     label: 'contient' },
  { key: 'not_contains', label: 'ne contient pas' },
  { key: 'is',           label: 'est exactement' },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

function getFieldOptions(field: FilterField): string[] {
  switch (field) {
    case 'stage':     return Object.keys(STAGE_MAP)
    case 'formation': return FORMATION_OPTIONS.filter(Boolean)
    case 'classe':    return CLASSE_OPTIONS.filter(Boolean)
    default:          return []
  }
}

function formatFieldValue(field: FilterField, value: string): string {
  if (field === 'stage') {
    const s = STAGE_MAP[value]
    return s ? `${s.emoji} ${s.label}` : value
  }
  return value
}

function operatorsForField(field: FilterField) {
  const f = FILTER_FIELDS.find(ff => ff.key === field)
  return f?.type === 'select' ? OPERATORS_SELECT : OPERATORS_TEXT
}

function needsValue(op: FilterOperator) {
  return op !== 'is_empty' && op !== 'is_not_empty'
}

// ── Saved Views ──────────────────────────────────────────────────────────────

interface SavedView {
  id: string
  name: string
  rules: FilterRule[]
  isDefault?: boolean
}

const DEFAULT_VIEWS: SavedView[] = [
  { id: 'all',  name: 'Toutes',          rules: [], isDefault: true },
  { id: 'rdv',  name: 'RDV Pris',        rules: [{ id: 'r1', field: 'stage', operator: 'is', value: '3165428980' }], isDefault: true },
  { id: 'pre',  name: 'Pré-inscription', rules: [{ id: 'r2', field: 'stage', operator: 'is', value: '3165428982' }], isDefault: true },
  { id: 'lost', name: 'Fermé Perdu',     rules: [{ id: 'r3', field: 'stage', operator: 'is', value: '3165428985' }], isDefault: true },
]

function loadSavedViews(): SavedView[] {
  if (typeof window === 'undefined') return DEFAULT_VIEWS
  try {
    const raw = localStorage.getItem('tx-saved-views-v2')
    if (raw) {
      const parsed = JSON.parse(raw) as SavedView[]
      if (parsed.length > 0) return parsed
    }
  } catch { /* ignore */ }
  return DEFAULT_VIEWS
}

function persistViews(views: SavedView[]) {
  localStorage.setItem('tx-saved-views-v2', JSON.stringify(views))
}

// Convert filter rules to simple query params for the API
function rulesToParams(rules: FilterRule[]): { search: string; stage: string; formation: string; classe: string } {
  const params = { search: '', stage: '', formation: '', classe: '' }
  for (const rule of rules) {
    if (rule.operator === 'is') {
      if (rule.field === 'stage') params.stage = rule.value
      else if (rule.field === 'formation') params.formation = rule.value
      else if (rule.field === 'classe') params.classe = rule.value
      else if (rule.field === 'dealname') params.search = rule.value
    } else if (rule.operator === 'contains' && rule.field === 'dealname') {
      params.search = rule.value
    }
  }
  return params
}

// Check if a deal matches filter rules (for board client-side filtering)
function dealMatchesRules(deal: Transaction | TransactionDetail, rules: FilterRule[]): boolean {
  for (const rule of rules) {
    let fieldVal = ''
    switch (rule.field) {
      case 'stage':     fieldVal = deal.dealstage ?? ''; break
      case 'formation': fieldVal = deal.formation ?? ''; break
      case 'classe':    fieldVal = deal.contact?.classe_actuelle ?? ''; break
      case 'zone':      fieldVal = deal.contact?.zone_localite ?? deal.contact?.departement ?? ''; break
      case 'closer':    fieldVal = deal.closer?.name ?? ''; break
      case 'dealname':  fieldVal = deal.dealname ?? ''; break
    }
    const v = rule.value?.toLowerCase() ?? ''
    const fv = fieldVal.toLowerCase()
    switch (rule.operator) {
      case 'is':           if (fv !== v) return false; break
      case 'is_not':       if (fv === v) return false; break
      case 'contains':     if (!fv.includes(v)) return false; break
      case 'not_contains': if (fv.includes(v)) return false; break
      case 'is_empty':     if (fieldVal.trim() !== '') return false; break
      case 'is_not_empty': if (fieldVal.trim() === '') return false; break
    }
  }
  return true
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StageBadge({ stageId }: { stageId: string | null }) {
  if (!stageId) return <span style={{ color: '#7c98b6', fontSize: 12 }}>—</span>
  const s = STAGE_MAP[stageId]
  if (!s) return <span style={{ fontSize: 12, color: '#7c98b6' }}>{stageId}</span>
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}33`,
      borderRadius: 6,
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
    }}>
      <span style={{ fontSize: 10 }}>{s.emoji}</span>
      {s.label}
    </span>
  )
}

function Avatar({ name, color, size = 26 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color || '#4f6ef7',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 22 ? 9 : 10, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  )
}

// ── Dropdown Filter ──────────────────────────────────────────────────────────

function DropFilter({
  value, onChange, options, placeholder, format,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
  format?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = value !== ''

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.08)' : '#f5f8fa',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.35)' : '#cbd6e2'}`,
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          color: isActive ? '#ccac71' : '#6b7a90', fontSize: 12, fontFamily: 'inherit',
          fontWeight: isActive ? 600 : 400,
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        {isActive ? (format ? format(value) : value) : placeholder}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 200,
          background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '4px 0',
          maxHeight: 280, overflowY: 'auto', minWidth: '100%',
        }}>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                display: 'block', width: '100%', background: value === opt ? 'rgba(204,172,113,0.12)' : 'transparent',
                border: 'none', padding: '8px 14px', fontSize: 12, cursor: 'pointer',
                color: value === opt ? '#ccac71' : '#516f90', fontFamily: 'inherit',
                fontWeight: value === opt ? 700 : 400, textAlign: 'left', whiteSpace: 'nowrap',
              }}
            >
              {opt === '' ? placeholder : (format ? format(opt) : opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sortable Column Header ───────────────────────────────────────────────────

function SortHeader({
  label, col, currentSort, currentOrder, onSort,
}: {
  label: string; col: SortCol; currentSort: SortCol; currentOrder: 'asc' | 'desc'
  onSort: (col: SortCol) => void
}) {
  const isActive = currentSort === col
  return (
    <button
      onClick={() => onSort(col)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color: isActive ? '#ccac71' : '#3a5070', fontFamily: 'inherit',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      }}
    >
      {label}
      {isActive ? (
        currentOrder === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      ) : (
        <ArrowUpDown size={9} style={{ opacity: 0.4 }} />
      )}
    </button>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

// Saisons disponibles (pipelines HubSpot)
const SEASONS: { id: string; label: string }[] = [
  { id: '2313043166', label: '2026-2027' },
  { id: '1329267902', label: '2025-2026' },
  { id: '322737657',  label: '2024-2025' },
  { id: '55039960',   label: '2023-2024' },
  { id: 'all',        label: 'Toutes saisons' },
]

export default function TransactionsPage() {
  const router = useRouter()
  // View mode — default board, persisted in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  // Saison selectionnee (pipeline HubSpot)
  const [season, setSeason] = useState<string>('2313043166')

  // List view state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal]   = useState(0)
  const [stats, setStats]   = useState<StatsData | null>(null)
  const [page, setPage]     = useState(0)
  const [listLoading, setListLoading] = useState(false)

  // Board view state
  const [boardColumns, setBoardColumns] = useState<Record<string, TransactionDetail[]>>({})
  const [boardTotal, setBoardTotal] = useState(0)
  const [boardStats, setBoardStats] = useState<StatsData | null>(null)
  const [boardLoading, setBoardLoading] = useState(true)

  // Selected deal for detail panel
  const [selectedDeal, setSelectedDeal] = useState<TransactionDetail | null>(null)

  // Undo
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)

  // Filters (derived from active rules for API calls)
  const [search, setSearch]       = useState('')
  const [stage, setStage]         = useState('')
  const [formation, setFormation] = useState('')
  const [classe, setClasse]       = useState('')

  // Advanced filter rules (active working set)
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

  // Saved views
  const [views, setViews] = useState<SavedView[]>(loadSavedViews)
  const [activeViewId, setActiveViewId] = useState('all')
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingView, setCreatingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  // Sort (list only)
  const [sortCol, setSortCol]     = useState<SortCol>('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Expanded row (list only)
  const [expanded, setExpanded]   = useState<string | null>(null)

  const LIMIT = 50
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore view mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tx-view-mode')
    if (saved === 'list' || saved === 'board') setViewMode(saved)
  }, [])

  function switchView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('tx-view-mode', mode)
  }

  // ── Board Fetch ────────────────────────────────────────────────────────────

  const fetchBoard = useCallback(async () => {
    setBoardLoading(true)
    try {
      const params = new URLSearchParams({ view: 'board', pipeline: season })
      if (search) params.set('search', search)
      const res = await fetch(`/api/crm/transactions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setBoardColumns(data.columns ?? {})
        setBoardTotal(data.total ?? 0)
        setBoardStats(data.stats ?? null)
      }
    } finally {
      setBoardLoading(false)
    }
  }, [season, search])

  // Load board on mount (it's default view)
  useEffect(() => { fetchBoard() }, [fetchBoard])

  // ── List Fetch ─────────────────────────────────────────────────────────────

  const fetchList = useCallback(async (resetPage = false) => {
    setListLoading(true)
    const p = resetPage ? 0 : page
    if (resetPage) setPage(0)

    const params = new URLSearchParams({ limit: String(LIMIT), page: String(p), sort: sortCol, order: sortOrder, pipeline: season })
    if (search)    params.set('search', search)
    if (stage)     params.set('stage', stage)
    if (formation) params.set('formation', formation)
    if (classe)    params.set('classe', classe)

    try {
      const res = await fetch(`/api/crm/transactions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.data ?? [])
        setTotal(data.total ?? 0)
        setStats(data.stats ?? null)
      }
    } finally {
      setListLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stage, formation, classe, sortCol, sortOrder, page, season])

  // Fetch list data when in list mode
  useEffect(() => {
    if (viewMode === 'list') fetchList()
  }, [viewMode, fetchList])

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (viewMode === 'list') fetchList(true)
    }, 300)
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortOrder('asc')
    }
  }

  // ── Stage map for labels ────────────────────────────────────────────────────

  const STAGE_LABELS: Record<string, string> = {
    '3165428979': 'À Replanifier',
    '3165428980': 'RDV Pris',
    '3165428981': 'Délai Réflexion',
    '3165428982': 'Pré-inscription',
    '3165428983': 'Finalisation',
    '3165428984': 'Inscription Confirmée',
    '3165428985': 'Fermé Perdu',
  }

  // ── Board stage change (drag & drop) ───────────────────────────────────────

  async function handleStageChange(dealId: string, newStage: string) {
    // Find original stage for undo
    let fromStage = ''
    for (const [stageId, deals] of Object.entries(boardColumns)) {
      if (deals.some(d => d.hubspot_deal_id === dealId)) {
        fromStage = stageId
        break
      }
    }

    // Don't move to same stage
    if (fromStage === newStage) return

    // Save undo action
    setUndoAction({
      type: 'stage_change',
      dealIds: [dealId],
      fromStage,
      toStage: newStage,
      label: `1 transaction déplacée de "${STAGE_LABELS[fromStage] ?? fromStage}" vers "${STAGE_LABELS[newStage] ?? newStage}"`,
    })

    // Optimistic update
    setBoardColumns(prev => {
      const next = { ...prev }
      let movedDeal: TransactionDetail | null = null
      for (const stageId of Object.keys(next)) {
        const idx = next[stageId].findIndex(d => d.hubspot_deal_id === dealId)
        if (idx !== -1) {
          movedDeal = { ...next[stageId][idx], dealstage: newStage }
          next[stageId] = [...next[stageId]]
          next[stageId].splice(idx, 1)
          break
        }
      }
      if (movedDeal) {
        next[newStage] = [...(next[newStage] ?? []), movedDeal]
      }
      return next
    })

    // Persist
    await fetch(`/api/crm/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealstage: newStage }),
    })
  }

  // ── Batch stage change (multi-select drag & drop) ──────────────────────────

  async function handleBatchStageChange(dealIds: string[], newStage: string) {
    // Find original stages for undo (collect unique source stages)
    const fromStages = new Set<string>()
    for (const [stageId, deals] of Object.entries(boardColumns)) {
      for (const deal of deals) {
        if (dealIds.includes(deal.hubspot_deal_id)) {
          fromStages.add(stageId)
        }
      }
    }
    const fromStage = fromStages.size === 1 ? Array.from(fromStages)[0] : Array.from(fromStages)[0] ?? ''

    // Don't move to same stage
    if (fromStages.size === 1 && fromStage === newStage) return

    // Save undo action
    setUndoAction({
      type: 'stage_change',
      dealIds,
      fromStage,
      toStage: newStage,
      label: `${dealIds.length} transaction${dealIds.length > 1 ? 's' : ''} déplacée${dealIds.length > 1 ? 's' : ''} vers "${STAGE_LABELS[newStage] ?? newStage}"`,
    })

    // Optimistic update
    setBoardColumns(prev => {
      const next = { ...prev }
      const movedDeals: TransactionDetail[] = []

      for (const stageId of Object.keys(next)) {
        const remaining: TransactionDetail[] = []
        for (const deal of next[stageId]) {
          if (dealIds.includes(deal.hubspot_deal_id)) {
            movedDeals.push({ ...deal, dealstage: newStage })
          } else {
            remaining.push(deal)
          }
        }
        next[stageId] = remaining
      }

      next[newStage] = [...(next[newStage] ?? []), ...movedDeals]
      return next
    })

    // Persist via batch endpoint
    await fetch('/api/crm/deals/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealIds, dealstage: newStage }),
    })
  }

  // ── Undo handler ──────────────────────────────────────────────────────────

  async function handleUndo() {
    if (!undoAction) return

    const { dealIds, fromStage } = undoAction

    // Optimistic revert
    setBoardColumns(prev => {
      const next = { ...prev }
      const movedDeals: TransactionDetail[] = []

      for (const stageId of Object.keys(next)) {
        const remaining: TransactionDetail[] = []
        for (const deal of next[stageId]) {
          if (dealIds.includes(deal.hubspot_deal_id)) {
            movedDeals.push({ ...deal, dealstage: fromStage })
          } else {
            remaining.push(deal)
          }
        }
        next[stageId] = remaining
      }

      next[fromStage] = [...(next[fromStage] ?? []), ...movedDeals]
      return next
    })

    setUndoAction(null)

    // Persist revert
    if (dealIds.length === 1) {
      await fetch(`/api/crm/deals/${dealIds[0]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealstage: fromStage }),
      })
    } else {
      await fetch('/api/crm/deals/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealIds, dealstage: fromStage }),
      })
    }
  }

  // ── Deal selection (for detail panel) ──────────────────────────────────────

  function handleSelectDeal(deal: TransactionDetail | Transaction) {
    // Click sur une transaction = ouverture de la fiche contact
    // (Les transactions associees sont visibles en haut a droite de la fiche.)
    const contactId = (deal as TransactionDetail | Transaction).contact?.hubspot_contact_id
    if (contactId) {
      router.push(`/admin/crm/contacts/${contactId}`)
    } else {
      // Fallback: panel de detail si pas de contact lie
      setSelectedDeal(deal as TransactionDetail)
    }
  }

  function handleDetailClose() {
    setSelectedDeal(null)
  }

  function handleDetailUpdate() {
    // Refresh data after an edit
    if (viewMode === 'board') fetchBoard()
    else fetchList()
    // Also refresh the selected deal
    setSelectedDeal(null)
  }

  const hasFilters = filterRules.length > 0
  const totalPages = Math.ceil(total / LIMIT)
  const loading = viewMode === 'board' ? boardLoading : listLoading
  const displayTotal = viewMode === 'board' ? boardTotal : total
  const displayStats = viewMode === 'board' ? boardStats : stats

  // Sync rules → simple params for API
  function applyRulesToParams(rules: FilterRule[]) {
    const p = rulesToParams(rules)
    setSearch(p.search); setStage(p.stage); setFormation(p.formation); setClasse(p.classe)
  }

  // Check if current rules differ from active view
  const activeView = views.find(v => v.id === activeViewId)
  const viewFiltersChanged = activeView ? (
    JSON.stringify(filterRules) !== JSON.stringify(activeView.rules)
  ) : false

  function resetFilters() {
    setFilterRules([])
    setSearch(''); setStage(''); setFormation(''); setClasse('')
  }

  function applyView(view: SavedView) {
    setActiveViewId(view.id)
    setFilterRules(view.rules)
    applyRulesToParams(view.rules)
    setFilterPanelOpen(false)
    scheduleRefetch()
  }

  function createView(name: string) {
    const id = `view_${Date.now()}`
    const newView: SavedView = {
      id,
      name: name || 'Nouvelle vue',
      rules: [...filterRules],
    }
    const updated = [...views, newView]
    setViews(updated)
    persistViews(updated)
    setActiveViewId(id)
    setCreatingView(false)
    setNewViewName('')
  }

  function deleteView(viewId: string) {
    const updated = views.filter(v => v.id !== viewId)
    setViews(updated)
    persistViews(updated)
    if (activeViewId === viewId) {
      const allView = updated[0]
      if (allView) applyView(allView)
    }
  }

  function renameView(viewId: string, newName: string) {
    const updated = views.map(v => v.id === viewId ? { ...v, name: newName || v.name } : v)
    setViews(updated)
    persistViews(updated)
    setRenamingViewId(null)
  }

  function updateViewFilters(viewId: string) {
    const updated = views.map(v =>
      v.id === viewId ? { ...v, rules: [...filterRules] } : v
    )
    setViews(updated)
    persistViews(updated)
  }

  // ── Filter rule CRUD ──────────────────────────────────────────────────────

  function addFilterRule() {
    const newRule: FilterRule = {
      id: `fr_${Date.now()}`,
      field: 'stage',
      operator: 'is',
      value: '',
    }
    const updated = [...filterRules, newRule]
    setFilterRules(updated)
  }

  function updateFilterRule(ruleId: string, patch: Partial<FilterRule>) {
    const updated = filterRules.map(r => {
      if (r.id !== ruleId) return r
      const merged = { ...r, ...patch }
      // Reset value if field changed (options change)
      if (patch.field && patch.field !== r.field) merged.value = ''
      // Reset value if operator doesn't need one
      if (patch.operator && !needsValue(patch.operator)) merged.value = ''
      return merged
    })
    setFilterRules(updated)
    applyRulesToParams(updated)
    scheduleRefetch()
  }

  function removeFilterRule(ruleId: string) {
    const updated = filterRules.filter(r => r.id !== ruleId)
    setFilterRules(updated)
    applyRulesToParams(updated)
    scheduleRefetch()
  }

  function duplicateFilterRule(ruleId: string) {
    const rule = filterRules.find(r => r.id === ruleId)
    if (!rule) return
    const idx = filterRules.indexOf(rule)
    const dup = { ...rule, id: `fr_${Date.now()}` }
    const updated = [...filterRules]
    updated.splice(idx + 1, 0, dup)
    setFilterRules(updated)
  }

  const stageOptions = ['', ...Object.keys(STAGE_MAP)]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f8fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px', height: 52, background: '#ffffff',
        borderBottom: '1px solid #cbd6e2',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, width: 'auto' }} />
          <div style={{ width: 1, height: 22, background: '#cbd6e2' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GraduationCap size={14} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 13, color: '#ccac71', fontWeight: 700 }}>Transactions</span>
            <select
              value={season}
              onChange={e => setSeason(e.target.value)}
              style={{
                fontSize: 12, fontWeight: 600, color: '#ccac71',
                background: '#fff', border: '1px solid #cbd6e2', borderRadius: 6,
                padding: '3px 6px', cursor: 'pointer', marginLeft: 4,
              }}
            >
              {SEASONS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Recherche transactions (par nom de transaction OU contact) */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, color: '#7c98b6', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Rechercher une transaction..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8,
                padding: '5px 28px 5px 28px', color: '#33475b', fontSize: 12,
                width: 220, outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 6, background: 'transparent', border: 'none',
                  cursor: 'pointer', color: '#7c98b6', display: 'flex', padding: 2,
                }}
                aria-label="Effacer la recherche"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <a href="/admin/crm" style={{
            background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8,
            padding: '5px 12px', color: '#516f90', fontSize: 12, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Users size={12} /> CRM Contacts
          </a>
          <a href="/admin" style={{
            background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8,
            padding: '5px 12px', color: '#516f90', fontSize: 12, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <LayoutDashboard size={12} /> Dashboard
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px', background: '#ffffff',
        borderBottom: '1px solid #cbd6e2',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#33475b' }}>{displayTotal.toLocaleString('fr-FR')}</span>
            <span style={{ fontSize: 12, color: '#7c98b6' }}>transactions</span>
          </div>
          {displayStats && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(displayStats.stages).sort((a, b) => b[1] - a[1]).map(([id, count]) => {
                const s = STAGE_MAP[id]
                if (!s) return null
                return (
                  <button
                    key={id}
                    onClick={() => {
                      if (viewMode === 'list') {
                        setStage(stage === id ? '' : id)
                        scheduleRefetch()
                      }
                    }}
                    style={{
                      background: stage === id ? s.bg : 'transparent',
                      border: `1px solid ${stage === id ? s.color + '55' : 'transparent'}`,
                      borderRadius: 6, padding: '3px 8px',
                      cursor: viewMode === 'list' ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 9 }}>{s.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View mode toggle */}
          <div style={{
            display: 'flex', background: '#f5f8fa', borderRadius: 8, border: '1px solid #cbd6e2',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => switchView('board')}
              style={{
                background: viewMode === 'board' ? 'rgba(204,172,113,0.15)' : 'transparent',
                border: 'none', padding: '6px 12px', cursor: 'pointer',
                color: viewMode === 'board' ? '#ccac71' : '#7c98b6', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                fontWeight: viewMode === 'board' ? 700 : 400,
                borderRight: '1px solid #cbd6e2',
              }}
            >
              <LayoutGrid size={12} /> Board
            </button>
            <button
              onClick={() => switchView('list')}
              style={{
                background: viewMode === 'list' ? 'rgba(204,172,113,0.15)' : 'transparent',
                border: 'none', padding: '6px 12px', cursor: 'pointer',
                color: viewMode === 'list' ? '#ccac71' : '#7c98b6', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                fontWeight: viewMode === 'list' ? 700 : 400,
              }}
            >
              <List size={12} /> Liste
            </button>
          </div>

          <button
            onClick={() => viewMode === 'board' ? fetchBoard() : fetchList(true)}
            disabled={loading}
            style={{
              background: 'rgba(76,171,219,0.12)', border: '1px solid rgba(76,171,219,0.3)',
              borderRadius: 8, padding: '6px 12px', color: '#4cabdb', fontSize: 12,
              cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ── Views Tab Bar ───────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px', background: '#ffffff',
        borderBottom: '1px solid #cbd6e2', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 0,
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        {views.map(view => {
          const isActive = activeViewId === view.id
          const isRenaming = renamingViewId === view.id
          const stageRule = view.rules.find(r => r.field === 'stage' && r.operator === 'is')

          return (
            <div
              key={view.id}
              onClick={() => { if (!isRenaming) applyView(view) }}
              onDoubleClick={() => {
                if (!view.isDefault) {
                  setRenamingViewId(view.id)
                  setRenameValue(view.name)
                }
              }}
              style={{
                padding: '10px 14px',
                borderBottom: `2px solid ${isActive ? '#ccac71' : 'transparent'}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameView(view.id, renameValue)
                    if (e.key === 'Escape') setRenamingViewId(null)
                  }}
                  onBlur={() => renameView(view.id, renameValue)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'rgba(204,172,113,0.08)', border: '1px solid #ccac71',
                    borderRadius: 4, padding: '2px 6px', color: '#ccac71',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    outline: 'none', width: Math.max(60, renameValue.length * 8),
                  }}
                />
              ) : (
                <span style={{
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  color: isActive ? '#ccac71' : '#6b7a90',
                }}>
                  {view.name}
                </span>
              )}

              {/* Badge: count of rules or stage count */}
              {stageRule && displayStats?.stages[stageRule.value] != null ? (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: isActive ? '#ccac71' : '#3a5070',
                  background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(58,80,112,0.15)',
                  borderRadius: 8, padding: '1px 6px',
                }}>
                  {displayStats.stages[stageRule.value]}
                </span>
              ) : view.rules.length > 0 && !stageRule ? (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: isActive ? '#ccac71' : '#3a5070',
                  background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(58,80,112,0.15)',
                  borderRadius: 8, padding: '1px 6px',
                }}>
                  {view.rules.length} filtre{view.rules.length > 1 ? 's' : ''}
                </span>
              ) : null}

              {/* Delete button (not for defaults) */}
              {!view.isDefault && isActive && !isRenaming && (
                <button
                  onClick={e => { e.stopPropagation(); deleteView(view.id) }}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: '#7c98b6', cursor: 'pointer', display: 'flex',
                    marginLeft: 2,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )
        })}

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: '#cbd6e2', margin: '0 4px', flexShrink: 0 }} />

        {/* Filtres avancés button */}
        <button
          onClick={() => setFilterPanelOpen(o => !o)}
          style={{
            padding: '7px 12px', background: filterPanelOpen ? 'rgba(204,172,113,0.12)' : 'none',
            border: filterPanelOpen ? '1px solid rgba(204,172,113,0.3)' : '1px solid transparent',
            borderRadius: 6, color: filterRules.length > 0 ? '#ccac71' : '#6b7a90',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontFamily: 'inherit', fontWeight: filterRules.length > 0 ? 600 : 400,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <SlidersHorizontal size={12} />
          Filtres{filterRules.length > 0 ? ` (${filterRules.length})` : ''}
        </button>

        {/* Update view button */}
        {viewFiltersChanged && activeViewId !== 'all' && (
          <button
            onClick={() => updateViewFilters(activeViewId)}
            style={{
              padding: '6px 10px', background: 'rgba(204,172,113,0.08)',
              border: '1px solid rgba(204,172,113,0.25)', borderRadius: 6,
              color: '#ccac71', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              whiteSpace: 'nowrap', margin: '0 4px', flexShrink: 0,
            }}
          >
            <Save size={10} /> Sauvegarder
          </button>
        )}

        {/* Create new view */}
        {creatingView ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 8px', flexShrink: 0,
          }}>
            <input
              autoFocus
              value={newViewName}
              onChange={e => setNewViewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createView(newViewName)
                if (e.key === 'Escape') { setCreatingView(false); setNewViewName('') }
              }}
              placeholder="Nom de la vue…"
              style={{
                background: 'rgba(204,172,113,0.08)', border: '1px solid #ccac71',
                borderRadius: 4, padding: '3px 8px', color: '#ccac71',
                fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 120,
              }}
            />
            <button
              onClick={() => createView(newViewName)}
              style={{
                background: '#ccac71', border: 'none', borderRadius: 4,
                padding: '3px 6px', cursor: 'pointer', display: 'flex',
              }}
            >
              <Check size={12} color="#f5f8fa" />
            </button>
            <button
              onClick={() => { setCreatingView(false); setNewViewName('') }}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: '#7c98b6', cursor: 'pointer', display: 'flex',
              }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingView(true)}
            style={{
              padding: '8px 12px', background: 'none', border: 'none',
              color: '#3a5070', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'inherit',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ccac71')}
            onMouseLeave={e => (e.currentTarget.style.color = '#3a5070')}
          >
            <Plus size={12} /> Vue
          </button>
        )}
      </div>

      {/* ── Advanced Filter Panel ─────────────────────────────────────────────── */}
      {filterPanelOpen && (
        <div style={{
          padding: '16px 20px', background: '#f5f8fa',
          borderBottom: '1px solid #cbd6e2', flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: filterRules.length > 0 ? 12 : 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#33475b' }}>
              Filtres avancés
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {hasFilters && (
                <button
                  onClick={() => { resetFilters(); scheduleRefetch() }}
                  style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 6, padding: '4px 10px', color: '#ef4444', fontSize: 11,
                    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                    gap: 4, fontWeight: 600,
                  }}
                >
                  <X size={10} /> Tout effacer
                </button>
              )}
              <button
                onClick={() => setFilterPanelOpen(false)}
                style={{
                  background: 'none', border: 'none', padding: 2,
                  color: '#7c98b6', cursor: 'pointer', display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter rules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filterRules.map((rule, idx) => {
              const fieldDef = FILTER_FIELDS.find(f => f.key === rule.field)
              const operators = operatorsForField(rule.field)
              const options = getFieldOptions(rule.field)
              const showValue = needsValue(rule.operator)
              const isSelectField = fieldDef?.type === 'select'

              return (
                <div key={rule.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#ffffff', borderRadius: 8,
                  border: '1px solid #cbd6e2', padding: '8px 12px',
                }}>
                  {/* AND label */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#3a5070',
                    width: 24, textAlign: 'center', flexShrink: 0,
                  }}>
                    {idx === 0 ? 'OÙ' : 'ET'}
                  </span>

                  {/* Field selector */}
                  <select
                    value={rule.field}
                    onChange={e => updateFilterRule(rule.id, { field: e.target.value as FilterField })}
                    style={{
                      background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 6,
                      padding: '5px 8px', color: '#516f90', fontSize: 12,
                      fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                      minWidth: 130,
                    }}
                  >
                    {FILTER_FIELDS.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>

                  {/* Operator selector */}
                  <select
                    value={rule.operator}
                    onChange={e => updateFilterRule(rule.id, { operator: e.target.value as FilterOperator })}
                    style={{
                      background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 6,
                      padding: '5px 8px', color: '#516f90', fontSize: 12,
                      fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                      minWidth: 120,
                    }}
                  >
                    {operators.map(op => (
                      <option key={op.key} value={op.key}>{op.label}</option>
                    ))}
                  </select>

                  {/* Value input */}
                  {showValue && (
                    isSelectField && options.length > 0 ? (
                      <select
                        value={rule.value}
                        onChange={e => updateFilterRule(rule.id, { value: e.target.value })}
                        style={{
                          background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 6,
                          padding: '5px 8px', color: rule.value ? '#ccac71' : '#7c98b6', fontSize: 12,
                          fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                          flex: 1, minWidth: 140,
                        }}
                      >
                        <option value="">Sélectionner…</option>
                        {options.map(opt => (
                          <option key={opt} value={opt}>
                            {formatFieldValue(rule.field, opt)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={rule.value}
                        onChange={e => updateFilterRule(rule.id, { value: e.target.value })}
                        placeholder="Valeur…"
                        style={{
                          background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 6,
                          padding: '5px 8px', color: '#33475b', fontSize: 12,
                          fontFamily: 'inherit', outline: 'none',
                          flex: 1, minWidth: 120,
                        }}
                      />
                    )
                  )}

                  {/* Actions */}
                  <button
                    onClick={() => duplicateFilterRule(rule.id)}
                    title="Dupliquer"
                    style={{
                      background: 'none', border: 'none', padding: 3,
                      color: '#3a5070', cursor: 'pointer', display: 'flex', flexShrink: 0,
                    }}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => removeFilterRule(rule.id)}
                    title="Supprimer"
                    style={{
                      background: 'none', border: 'none', padding: 3,
                      color: '#ef4444', cursor: 'pointer', display: 'flex', flexShrink: 0,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Add filter button */}
          <button
            onClick={addFilterRule}
            style={{
              marginTop: 10, padding: '7px 14px',
              background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)',
              borderRadius: 6, color: '#4cabdb', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <Plus size={12} /> Ajouter un filtre
          </button>
        </div>
      )}

      {/* ── Content Area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: viewMode === 'board' ? 'hidden' : 'auto', padding: viewMode === 'board' ? '0 12px' : '0 20px 20px' }}>

        {/* ── Board View ──────────────────────────────────────────────────────── */}
        {viewMode === 'board' && (
          boardLoading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#7c98b6' }}>
              <div style={{
                display: 'inline-block', width: 22, height: 22,
                border: '2px solid #cbd6e2', borderTopColor: '#4cabdb',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12,
              }} />
              <div style={{ fontSize: 13 }}>Chargement du board…</div>
            </div>
          ) : (
            <TransactionBoard
              columns={boardColumns}
              onStageChange={handleStageChange}
              onBatchStageChange={handleBatchStageChange}
              onSelectDeal={handleSelectDeal}
              undoAction={undoAction}
              onUndo={handleUndo}
              pipelineId={season}
            />
          )
        )}

        {/* ── List View ───────────────────────────────────────────────────────── */}
        {viewMode === 'list' && (
          <>
            {listLoading ? (
              <div style={{ textAlign: 'center', padding: '80px 0', color: '#7c98b6' }}>
                <div style={{
                  display: 'inline-block', width: 22, height: 22,
                  border: '2px solid #cbd6e2', borderTopColor: '#4cabdb',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12,
                }} />
                <div style={{ fontSize: 13 }}>Chargement des transactions…</div>
              </div>
            ) : transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0', color: '#7c98b6' }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📋</div>
                <div style={{ fontWeight: 600, color: '#516f90', marginBottom: 4 }}>Aucune transaction trouvée</div>
                <div style={{ fontSize: 12 }}>Modifiez vos filtres ou lancez une synchronisation CRM</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #cbd6e2' }}>
                    {[
                      { label: 'Transaction', col: 'dealname' as SortCol, width: '25%' },
                      { label: 'Formation', col: 'formation' as SortCol, width: '12%' },
                      { label: 'Classe actuelle', col: 'classe' as SortCol, width: '14%' },
                      { label: 'Zone / Localité', col: 'zone' as SortCol, width: '16%' },
                      { label: 'Étape', col: 'stage' as SortCol, width: '15%' },
                      { label: 'Créé le', col: 'created' as SortCol, width: '10%' },
                      { label: '', col: 'created' as SortCol, width: '8%' },
                    ].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap',
                          background: '#0d1624', position: 'sticky', top: 0, zIndex: 10,
                          width: h.width,
                        }}
                      >
                        {i < 6 ? (
                          <SortHeader label={h.label} col={h.col} currentSort={sortCol} currentOrder={sortOrder} onSort={handleSort} />
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const contactName = [tx.contact?.firstname, tx.contact?.lastname].filter(Boolean).join(' ') || '—'
                    const zone = tx.contact?.zone_localite || tx.contact?.departement || '—'
                    const isExpanded = expanded === tx.hubspot_deal_id
                    const createdStr = tx.createdate
                      ? new Date(tx.createdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
                      : '—'

                    return (
                      <Fragment key={tx.hubspot_deal_id}>
                        <tr
                          onClick={() => handleSelectDeal(tx as unknown as TransactionDetail)}
                          style={{
                            background: isExpanded ? 'rgba(45,74,107,0.3)' : 'transparent',
                            borderBottom: `1px solid ${isExpanded ? 'transparent' : '#16273a'}`,
                            cursor: 'pointer',
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => { if (!isExpanded) (e.currentTarget.style.background = 'rgba(29,47,75,0.6)') }}
                          onMouseLeave={e => { if (!isExpanded) (e.currentTarget.style.background = 'transparent') }}
                        >
                          {/* Transaction name + contact */}
                          <td style={{ padding: '11px 12px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#33475b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                              {tx.dealname || '(sans nom)'}
                            </div>
                            <div style={{ fontSize: 11, color: '#516f90', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {contactName}
                            </div>
                          </td>

                          {/* Formation */}
                          <td style={{ padding: '11px 12px' }}>
                            {tx.formation ? (
                              <span style={{
                                background: 'rgba(204,172,113,0.10)', border: '1px solid rgba(204,172,113,0.25)',
                                borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 700,
                                color: '#ccac71', whiteSpace: 'nowrap',
                              }}>
                                {tx.formation}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd6e2', fontSize: 12 }}>—</span>
                            )}
                          </td>

                          {/* Classe */}
                          <td style={{ padding: '11px 12px' }}>
                            {tx.contact?.classe_actuelle ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <BookOpen size={11} style={{ color: '#5a6a7e', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#516f90' }}>{tx.contact.classe_actuelle}</span>
                              </div>
                            ) : (
                              <span style={{ color: '#cbd6e2', fontSize: 12 }}>—</span>
                            )}
                          </td>

                          {/* Zone */}
                          <td style={{ padding: '11px 12px' }}>
                            {zone !== '—' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <MapPin size={11} style={{ color: '#5a6a7e', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#516f90', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {zone}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: '#cbd6e2', fontSize: 12 }}>—</span>
                            )}
                          </td>

                          {/* Stage */}
                          <td style={{ padding: '11px 12px' }}>
                            <StageBadge stageId={tx.dealstage} />
                          </td>

                          {/* Date */}
                          <td style={{ padding: '11px 12px' }}>
                            <span style={{ fontSize: 11, color: '#516f90', whiteSpace: 'nowrap' }}>{createdStr}</span>
                          </td>

                          {/* HubSpot link */}
                          <td style={{ padding: '11px 8px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <a
                              href={`https://app.hubspot.com/contacts/43296174/deal/${tx.hubspot_deal_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)',
                                borderRadius: 6, padding: '4px 8px', color: '#f97316', fontSize: 11,
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontWeight: 600,
                              }}
                            >
                              <ExternalLink size={10} /> HS
                            </a>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingBottom: 20 }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{
                    background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 7,
                    padding: '6px 16px', color: page === 0 ? '#cbd6e2' : '#516f90',
                    cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit',
                  }}
                >
                  ← Précédent
                </button>
                <span style={{ fontSize: 12, color: '#7c98b6' }}>
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={{
                    background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 7,
                    padding: '6px 16px', color: page >= totalPages - 1 ? '#cbd6e2' : '#516f90',
                    cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit',
                  }}
                >
                  Suivant →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail Panel ─────────────────────────────────────────────────────── */}
      {selectedDeal && (
        <TransactionDetailPanel
          deal={selectedDeal}
          onClose={handleDetailClose}
          onUpdate={handleDetailUpdate}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd6e2; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a5a7a; }
      `}</style>
    </div>
  )
}
