'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, ExternalLink, MapPin, BookOpen, RefreshCw, Briefcase,
  Kanban, List, Plus, Save, Check, SlidersHorizontal, Trash2, Copy,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import TransactionBoard from '@/components/TransactionBoard'
import type { UndoAction } from '@/components/TransactionBoard'
import type { TransactionDetail } from '@/components/TransactionDetailPanel'
import { isAllowedManualTransition, MANUAL_LOCK_MESSAGE } from '@/lib/dealstage-rules'
import { getCached, refetch, jsonFetcher } from '@/lib/client-cache'
import { useIsMobile } from '@/lib/useIsMobile'
import { PIPELINES, getStageMeta } from '@/lib/crm-stages'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Button, CrmV2Search, CrmV2Select, CrmV2Segmented, CrmV2FilterPill,
  CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Pagination, CrmV2Empty,
  CrmV2Spinner, CrmV2StatusPill, CrmV2Card, CrmV2Pill,
} from '@/components/crm-v2/primitives'

// Panel detail ouvert seulement quand on selectionne une transaction.
const TransactionDetailPanel = dynamic(() => import('@/components/TransactionDetailPanel'), { ssr: false })

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

// Étapes 2026-2027 (couleurs centralisées dans lib/crm-stages.ts)
const STAGE_MAP: Record<string, { label: string; color: string; bg: string }> = Object.fromEntries(
  PIPELINES['2313043166'].stages.map(s => [s.id, { label: s.label, color: s.color, bg: s.bg }]),
)

const FORMATION_OPTIONS = [
  '', 'PASS', 'LSPS', 'LAS', 'P-1', 'P-2', 'PAES FR', 'PAES EU', 'LSPS2 UPEC', 'LSPS3 UPEC',
]

const CLASSE_OPTIONS = [
  '', 'Terminale', 'Première', 'Seconde', 'Troisième', 'PASS',
  'LSPS 1', 'LSPS 2', 'LSPS 3', 'LAS 1', 'LAS 2', 'LAS 3', 'Etudes médicales',
  'Etudes Sup.', 'Autres',
]

type SortCol = 'dealname' | 'formation' | 'classe' | 'zone' | 'stage' | 'created'
type ViewMode = 'board' | 'list'

// ── Advanced Filter System ───────────────────────────────────────────────────

type FilterField = 'stage' | 'formation' | 'classe' | 'zone' | 'closer' | 'dealname' | 'parcoursup_verdict'
type FilterOperator = 'is' | 'is_not' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

interface FilterRule {
  id: string
  field: FilterField
  operator: FilterOperator
  value: string
}

const FILTER_FIELDS: { key: FilterField; label: string; type: 'select' | 'text' }[] = [
  { key: 'stage',              label: 'Étape',                type: 'select' },
  { key: 'formation',          label: 'Formation',            type: 'select' },
  { key: 'classe',             label: 'Classe actuelle',      type: 'select' },
  { key: 'parcoursup_verdict', label: 'Verdict Parcoursup',   type: 'select' },
  { key: 'zone',               label: 'Zone / Localité',      type: 'text' },
  { key: 'closer',             label: 'Closer',               type: 'text' },
  { key: 'dealname',           label: 'Nom transaction',      type: 'text' },
]

// Verdict Parcoursup options (statuts plateforme + 'aucun' pour "Sans verdict")
const PARCOURSUP_VERDICT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'ok_valide',  label: 'OK VALIDÉ' },
  { value: 'ok_attente', label: 'OK EN ATTENTE' },
  { value: 'good',       label: 'GOOD EN PRINCIPE' },
  { value: 'attention',  label: 'ATTENTION JUSTE' },
  { value: 'bascule',    label: 'BASCULE COMPLÈTE PAES' },
  { value: 'aucun',      label: 'Sans verdict' },
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
    case 'stage':              return Object.keys(STAGE_MAP)
    case 'formation':          return FORMATION_OPTIONS.filter(Boolean)
    case 'classe':             return CLASSE_OPTIONS.filter(Boolean)
    case 'parcoursup_verdict': return PARCOURSUP_VERDICT_FILTER_OPTIONS.map(o => o.value)
    default:                   return []
  }
}

function formatFieldValue(field: FilterField, value: string): string {
  if (field === 'stage') {
    const s = STAGE_MAP[value]
    return s ? s.label : value
  }
  if (field === 'parcoursup_verdict') {
    return PARCOURSUP_VERDICT_FILTER_OPTIONS.find(o => o.value === value)?.label ?? value
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
function rulesToParams(rules: FilterRule[]): { search: string; stage: string; formation: string; classe: string; parcoursupVerdict: string } {
  const params = { search: '', stage: '', formation: '', classe: '', parcoursupVerdict: '' }
  for (const rule of rules) {
    if (rule.operator === 'is') {
      if (rule.field === 'stage') params.stage = rule.value
      else if (rule.field === 'formation') params.formation = rule.value
      else if (rule.field === 'classe') params.classe = rule.value
      else if (rule.field === 'parcoursup_verdict') params.parcoursupVerdict = rule.value
      else if (rule.field === 'dealname') params.search = rule.value
    } else if (rule.operator === 'contains' && rule.field === 'dealname') {
      params.search = rule.value
    }
  }
  return params
}

// Helper : extrait le status verdict d'un deal (override prioritaire)
function dealParcoursupStatus(deal: Transaction | TransactionDetail): string {
  const v = (deal as TransactionDetail).contact?.parcoursup_verdict
  return v?.status ? String(v.status).toLowerCase() : ''
}

// Check if a deal matches filter rules (for board client-side filtering)
function dealMatchesRules(deal: Transaction | TransactionDetail, rules: FilterRule[]): boolean {
  for (const rule of rules) {
    let fieldVal = ''
    switch (rule.field) {
      case 'stage':              fieldVal = deal.dealstage ?? ''; break
      case 'formation':          fieldVal = deal.formation ?? ''; break
      case 'classe':             fieldVal = deal.contact?.classe_actuelle ?? ''; break
      case 'zone':               fieldVal = deal.contact?.zone_localite ?? deal.contact?.departement ?? ''; break
      case 'closer':             fieldVal = deal.closer?.name ?? ''; break
      case 'dealname':           fieldVal = deal.dealname ?? ''; break
      case 'parcoursup_verdict': fieldVal = dealParcoursupStatus(deal); break
    }
    // 'aucun' = absence de verdict (string vide normalisée)
    if (rule.field === 'parcoursup_verdict' && fieldVal === '') {
      fieldVal = 'aucun'
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
  if (!stageId) return <span style={{ color: crmV2.textFaint, fontSize: 12 }}>—</span>
  const s = getStageMeta(stageId)
  if (!s) return <span style={{ fontSize: 12, color: crmV2.textMuted }}>{stageId}</span>
  return <CrmV2StatusPill label={s.label} color={s.color} bg={s.bg} />
}

const SORT_COLUMNS: { label: string; col: SortCol }[] = [
  { label: 'Transaction', col: 'dealname' },
  { label: 'Formation', col: 'formation' },
  { label: 'Classe actuelle', col: 'classe' },
  { label: 'Zone / Localité', col: 'zone' },
  { label: 'Étape', col: 'stage' },
  { label: 'Créé le', col: 'created' },
]

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
  const isMobile = useIsMobile()
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

  const LIMIT = 50
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore view mode from localStorage (sauf en mode embed où on force board)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1'
      if (isEmbed) { setViewMode('board'); return }
    }
    const saved = localStorage.getItem('tx-view-mode')
    if (saved === 'list' || saved === 'board') setViewMode(saved)
  }, [])

  function switchView(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('tx-view-mode', mode)
  }

  // ── Board Fetch ────────────────────────────────────────────────────────────

  const fetchBoard = useCallback(async () => {
    const params = new URLSearchParams({ view: 'board', pipeline: season })
    if (search) params.set('search', search)
    // Filtre embed: telepro=<hs_id> ou contact_owner=<hs_id>
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const urlTelepro = sp.get('telepro')
      if (urlTelepro) params.set('telepro_hs_id', urlTelepro)
      const urlContactOwner = sp.get('contact_owner')
      if (urlContactOwner) params.set('contact_owner_hs_id', urlContactOwner)
    }
    const url = `/api/crm/transactions?${params}`

    type BoardData = { columns?: Record<string, TransactionDetail[]>; total?: number; stats?: StatsData }

    // Cache hit → render immediat + revalidation en arriere-plan
    const cached = getCached<BoardData>(url)
    if (cached) {
      setBoardColumns(cached.columns ?? {})
      setBoardTotal(cached.total ?? 0)
      setBoardStats(cached.stats ?? null)
      setBoardLoading(false)
      refetch<BoardData>(url, () => jsonFetcher(url), 30_000)
        .then(d => {
          setBoardColumns(d.columns ?? {})
          setBoardTotal(d.total ?? 0)
          setBoardStats(d.stats ?? null)
        })
        .catch(() => {})
      return
    }

    setBoardLoading(true)
    try {
      const data = await refetch<BoardData>(url, () => jsonFetcher(url), 30_000)
      setBoardColumns(data.columns ?? {})
      setBoardTotal(data.total ?? 0)
      setBoardStats(data.stats ?? null)
    } catch {
      // garde le state precedent en cas d'erreur reseau
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
    // Filtre embed: telepro=<hs_id> ou contact_owner=<hs_id>
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const urlTelepro = sp.get('telepro')
      if (urlTelepro) params.set('telepro_hs_id', urlTelepro)
      const urlContactOwner = sp.get('contact_owner')
      if (urlContactOwner) params.set('contact_owner_hs_id', urlContactOwner)
    }

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

    // Lock : les stages aval (Pre-inscription, Finalisation, Inscription Confirmee,
    // Ferme Perdu) sont pilotes par la plateforme Diploma. Seule exception :
    // amont -> Ferme Perdu autorise.
    if (!isAllowedManualTransition(fromStage, newStage)) {
      alert(MANUAL_LOCK_MESSAGE)
      return
    }

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

    // Lock : on verifie chaque source. Si une seule transition est interdite, on refuse tout
    // le batch (plus simple et sur). User peut deselectionner les deals concernes.
    for (const fs of fromStages) {
      if (!isAllowedManualTransition(fs, newStage)) {
        alert(MANUAL_LOCK_MESSAGE)
        return
      }
    }

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

  // ── Suppression de transactions ────────────────────────────────────────────
  // Le garde-fou (stages aval interdits) est verifie cote board ET cote serveur.
  // Ici on fait une mise a jour optimiste puis on persiste.

  async function handleDeleteDeals(dealIds: string[]) {
    const idSet = new Set(dealIds)

    // Snapshot pour rollback en cas d'erreur reseau/serveur.
    const prevColumns = boardColumns
    const prevTotal = boardTotal

    // Optimistic : retirer les cartes du board.
    setBoardColumns(prev => {
      const next: Record<string, TransactionDetail[]> = {}
      for (const [stageId, deals] of Object.entries(prev)) {
        next[stageId] = deals.filter(d => !idSet.has(d.hubspot_deal_id))
      }
      return next
    })
    setBoardTotal(t => Math.max(0, t - dealIds.length))

    try {
      const res = await fetch('/api/crm/deals/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_ids: dealIds }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Erreur lors de la suppression des transactions')
      }
      // Rafraichir pour resynchroniser stats + total.
      fetchBoard()
      if (viewMode === 'list') fetchList(true)
    } catch (e) {
      // Rollback de l'affichage et message.
      setBoardColumns(prevColumns)
      setBoardTotal(prevTotal)
      alert(e instanceof Error ? e.message : 'Erreur lors de la suppression')
      fetchBoard()
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

  // Filtrage client-side des colonnes du board selon les filterRules.
  // Les filtres avancés (Étape, Formation, Classe, Verdict Parcoursup, etc.)
  // sont appliqués localement car fetchBoard n'envoie pas tous les params
  // au serveur (perf : 1 seul fetch pour toutes les colonnes).
  const filteredBoardColumns = useMemo(() => {
    if (filterRules.length === 0) return boardColumns
    const out: Record<string, TransactionDetail[]> = {}
    for (const [stageId, deals] of Object.entries(boardColumns)) {
      out[stageId] = deals.filter(d => dealMatchesRules(d, filterRules))
    }
    return out
  }, [boardColumns, filterRules])

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


  // ── Rendu ─────────────────────────────────────────────────────────────────

  const gutter = isMobile ? 12 : 28
  const seasonLabel = SEASONS.find(s => s.id === season)?.label ?? ''
  const subtitle = `${season === 'all' ? 'Toutes saisons' : `Diploma Santé ${seasonLabel}`} · ${displayTotal.toLocaleString('fr-FR')} transaction${displayTotal > 1 ? 's' : ''}`

  const fieldStyle: React.CSSProperties = { height: 34, fontSize: 13, width: 'auto' }

  // Sélecteur de saison (pipeline)
  const seasonSelect = (
    <CrmV2Select
      value={season}
      onChange={e => setSeason(e.target.value)}
      aria-label="Saison"
      style={{ height: 36, width: 'auto', borderRadius: 999, fontWeight: 600, paddingRight: 8, ...(isMobile ? { flexShrink: 0 } : {}) }}
    >
      {SEASONS.map(s => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </CrmV2Select>
  )

  // Barre d'outils : recherche, étapes (liste), filtres avancés
  const toolbar = (
    <>
      {/* Recherche transactions (par nom de transaction OU contact) */}
      <div style={{ position: 'relative', display: 'flex', ...(isMobile ? { flex: '1 1 100%' } : {}) }}>
        <CrmV2Search
          placeholder="Rechercher une transaction…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: isMobile ? '100%' : 260, paddingRight: search ? 34 : 14 }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Effacer la recherche"
            style={{
              position: 'absolute', right: 6, top: 4, width: 28, height: 28, borderRadius: 999,
              background: 'transparent', border: 'none', cursor: 'pointer', color: crmV2.textFaint,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {isMobile && seasonSelect}
      <CrmV2FilterPill
        label={<><SlidersHorizontal size={14} />Filtres avancés</>}
        active={filterPanelOpen || filterRules.length > 0}
        count={filterRules.length}
        onClick={() => setFilterPanelOpen(o => !o)}
      />
      {/* Étapes : filtre rapide en vue Liste */}
      {viewMode === 'list' && displayStats && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', minWidth: 0, ...(isMobile ? { flex: '1 1 100%', overflowX: 'auto', scrollbarWidth: 'none' } : {}) }}>
          {Object.entries(displayStats.stages).sort((a, b) => b[1] - a[1]).map(([id, count]) => {
            const s = getStageMeta(id)
            if (!s) return null
            const on = stage === id
            return (
              <button
                key={id}
                type="button"
                title={s.label}
                onClick={() => {
                  setStage(stage === id ? '' : id)
                  scheduleRefetch()
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
                  borderRadius: 999, padding: '0 12px', height: 32, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  background: on ? s.bg : crmV2.bg, color: on ? s.color : crmV2.text, cursor: 'pointer',
                  border: `1px solid ${on ? s.color : crmV2.borderStrong}`,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
                {s.label}
                <span style={{ color: on ? s.color : crmV2.textFaint }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )

  // Panneau des filtres avancés
  const filterPanel = filterPanelOpen && (
    <CrmV2Card style={{
      flexBasis: '100%', padding: isMobile ? 12 : 16, boxShadow: 'none', background: crmV2.bgHover,
      ...(isMobile ? { maxHeight: '50vh', overflowY: 'auto' as const } : {}),
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        marginBottom: filterRules.length > 0 ? 12 : 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text }}>Filtres avancés</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasFilters && (
            <CrmV2Button variant="danger" size="sm" icon={<X size={13} />} onClick={() => { resetFilters(); scheduleRefetch() }}>
              Tout effacer
            </CrmV2Button>
          )}
          <button
            type="button"
            onClick={() => setFilterPanelOpen(false)}
            aria-label="Fermer les filtres"
            style={{
              width: 32, height: 32, borderRadius: 999, border: 'none', background: 'transparent',
              color: crmV2.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Règles de filtre */}
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
              background: crmV2.bg, borderRadius: 12,
              border: `1px solid ${crmV2.border}`, padding: isMobile ? 8 : '8px 12px',
              ...(isMobile ? { flexWrap: 'wrap' as const } : {}),
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, width: 26, textAlign: 'center', flexShrink: 0 }}>
                {idx === 0 ? 'OÙ' : 'ET'}
              </span>

              <CrmV2Select
                value={rule.field}
                onChange={e => updateFilterRule(rule.id, { field: e.target.value as FilterField })}
                style={{ ...fieldStyle, minWidth: 140, ...(isMobile ? { flex: 1, minWidth: 0 } : {}) }}
              >
                {FILTER_FIELDS.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </CrmV2Select>

              <CrmV2Select
                value={rule.operator}
                onChange={e => updateFilterRule(rule.id, { operator: e.target.value as FilterOperator })}
                style={{ ...fieldStyle, minWidth: 130, ...(isMobile ? { flex: 1, minWidth: 0 } : {}) }}
              >
                {operators.map(op => (
                  <option key={op.key} value={op.key}>{op.label}</option>
                ))}
              </CrmV2Select>

              {showValue && (
                isSelectField && options.length > 0 ? (
                  <CrmV2Select
                    value={rule.value}
                    onChange={e => updateFilterRule(rule.id, { value: e.target.value })}
                    style={{ ...fieldStyle, flex: 1, minWidth: 150, color: rule.value ? crmV2.text : crmV2.textFaint, ...(isMobile ? { flexBasis: '100%', minWidth: 0 } : {}) }}
                  >
                    <option value="">Sélectionner…</option>
                    {options.map(opt => (
                      <option key={opt} value={opt}>
                        {formatFieldValue(rule.field, opt)}
                      </option>
                    ))}
                  </CrmV2Select>
                ) : (
                  <input
                    type="text"
                    value={rule.value}
                    onChange={e => updateFilterRule(rule.id, { value: e.target.value })}
                    placeholder="Valeur…"
                    style={{
                      height: 34, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '0 12px',
                      fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, outline: 'none',
                      flex: 1, minWidth: 130, boxSizing: 'border-box',
                      ...(isMobile ? { flexBasis: '100%', minWidth: 0, fontSize: 16 } : {}),
                    }}
                  />
                )
              )}

              <button
                type="button"
                onClick={() => duplicateFilterRule(rule.id)}
                title="Dupliquer"
                style={{ width: 30, height: 30, borderRadius: 999, background: 'none', border: 'none', color: crmV2.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={() => removeFilterRule(rule.id)}
                title="Supprimer"
                style={{ width: 30, height: 30, borderRadius: 999, background: 'none', border: 'none', color: '#d13a41', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      <CrmV2Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addFilterRule} style={{ marginTop: 10, color: crmV2.link }}>
        Ajouter un filtre
      </CrmV2Button>
    </CrmV2Card>
  )

  // Onglets des vues enregistrées
  const viewTabs = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      margin: `0 -${gutter}px`, padding: `0 ${gutter}px`,
      overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
    }}>
      {views.map(view => {
        const isActive = activeViewId === view.id
        const isRenaming = renamingViewId === view.id
        const stageRule = view.rules.find(r => r.field === 'stage' && r.operator === 'is')
        const stageCount = stageRule ? displayStats?.stages[stageRule.value] : undefined

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
            title={view.isDefault ? undefined : 'Double-clic pour renommer'}
            style={{
              padding: isMobile ? '10px 12px' : '10px 14px',
              borderBottom: `3px solid ${isActive ? crmV2.text : 'transparent'}`,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap', flexShrink: 0,
              fontSize: 14, fontWeight: isActive ? 600 : 500,
              color: isActive ? crmV2.text : crmV2.textMuted,
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
                  border: `1px solid ${crmV2.gold}`, borderRadius: 8, padding: '2px 8px', color: crmV2.text,
                  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none',
                  width: Math.max(70, renameValue.length * 8),
                }}
              />
            ) : (
              <span>{view.name}</span>
            )}

            {/* Compteur : nombre de l'étape filtrée, ou nombre de règles */}
            {stageRule && stageCount != null ? (
              <span style={{ color: crmV2.textFaint, fontWeight: 500 }}>({stageCount.toLocaleString('fr-FR')})</span>
            ) : view.rules.length > 0 && !stageRule ? (
              <span style={{ color: crmV2.textFaint, fontWeight: 500, fontSize: 12 }}>
                ({view.rules.length} filtre{view.rules.length > 1 ? 's' : ''})
              </span>
            ) : null}

            {/* Suppression (vues personnalisées uniquement) */}
            {!view.isDefault && isActive && !isRenaming && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); deleteView(view.id) }}
                aria-label="Supprimer la vue"
                style={{
                  background: 'none', border: 'none', padding: 2, marginLeft: 2,
                  color: crmV2.textFaint, cursor: 'pointer', display: 'inline-flex',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}

      <div style={{ width: 1, height: 20, background: crmV2.border, margin: '0 6px', flexShrink: 0 }} />

      {/* Mettre à jour la vue active */}
      {viewFiltersChanged && activeViewId !== 'all' && (
        <CrmV2Button variant="gold" size="sm" icon={<Save size={13} />} onClick={() => updateViewFilters(activeViewId)} style={{ margin: '0 4px', flexShrink: 0 }}>
          Sauvegarder
        </CrmV2Button>
      )}

      {/* Nouvelle vue */}
      {creatingView ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 4px', flexShrink: 0 }}>
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
              height: 30, border: `1px solid ${crmV2.gold}`, borderRadius: 999, padding: '0 12px', color: crmV2.text,
              fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 140,
            }}
          />
          <button
            type="button"
            onClick={() => createView(newViewName)}
            aria-label="Créer la vue"
            style={{
              width: 30, height: 30, background: crmV2.primary, border: 'none', borderRadius: 999,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Check size={14} color="#fff" />
          </button>
          <button
            type="button"
            onClick={() => { setCreatingView(false); setNewViewName('') }}
            aria-label="Annuler"
            style={{
              width: 30, height: 30, background: 'none', border: 'none', borderRadius: 999,
              color: crmV2.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <CrmV2Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setCreatingView(true)} style={{ flexShrink: 0 }}>
          Vue
        </CrmV2Button>
      )}
    </div>
  )

  return (
    <CrmV2Page style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>

      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`,
        padding: isMobile ? '14px 12px 0' : '20px 28px 0', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 10 : '12px 16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 600, color: crmV2.text, letterSpacing: '-0.02em' }}>
              Transactions
            </h1>
            <div style={{ marginTop: 4, fontSize: 13, color: crmV2.textMuted }}>{subtitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            {!isMobile && seasonSelect}
            <CrmV2Segmented<ViewMode>
              items={[
                { id: 'board', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Kanban size={14} />{!isMobile && 'Tableau'}</span> },
                { id: 'list', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><List size={14} />{!isMobile && 'Liste'}</span> },
              ]}
              value={viewMode}
              onChange={switchView}
            />
            {isMobile ? (
              <button
                type="button"
                onClick={() => viewMode === 'board' ? fetchBoard() : fetchList(true)}
                disabled={loading}
                aria-label="Rafraîchir"
                style={{
                  width: 40, height: 40, borderRadius: 999, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg,
                  color: crmV2.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <RefreshCw size={16} style={{ animation: loading ? 'crm-v2-spin 0.8s linear infinite' : 'none' }} />
              </button>
            ) : (
              <CrmV2Button
                variant="secondary"
                onClick={() => viewMode === 'board' ? fetchBoard() : fetchList(true)}
                disabled={loading}
                icon={<RefreshCw size={14} style={{ animation: loading ? 'crm-v2-spin 0.8s linear infinite' : 'none' }} />}
              >
                Rafraîchir
              </CrmV2Button>
            )}
          </div>
        </div>

        {/* Vue Tableau : barre d'outils dans l'en-tête (gabarit C) */}
        {viewMode === 'board' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: isMobile ? 12 : 16, flexWrap: 'wrap' }}>
            {toolbar}
            {filterPanel}
          </div>
        )}

        <div style={{ marginTop: isMobile ? 6 : 10 }}>{viewTabs}</div>
      </div>

      {/* ── Contenu ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: viewMode === 'board' ? 'hidden' : 'auto' }}>

        {/* ── Vue Tableau (kanban) ──────────────────────────────────────────── */}
        {viewMode === 'board' && (
          boardLoading ? (
            <CrmV2Spinner />
          ) : (
            <TransactionBoard
              columns={filteredBoardColumns}
              onStageChange={handleStageChange}
              onBatchStageChange={handleBatchStageChange}
              onDeleteDeals={handleDeleteDeals}
              onSelectDeal={handleSelectDeal}
              undoAction={undoAction}
              onUndo={handleUndo}
              pipelineId={season}
            />
          )
        )}

        {/* ── Vue Liste (gabarit A) ─────────────────────────────────────────── */}
        {viewMode === 'list' && (
          <div style={{ padding: isMobile ? 12 : `16px ${gutter}px 20px` }}>
            <CrmV2TableCard
              toolbar={<>{toolbar}{filterPanel}</>}
              footer={total > 0 ? (
                <CrmV2Pagination page={page + 1} pageSize={LIMIT} total={total} onChange={p => setPage(Math.min(Math.max(0, p - 1), Math.max(0, totalPages - 1)))} />
              ) : undefined}
            >
              {listLoading ? (
                <CrmV2Spinner />
              ) : transactions.length === 0 ? (
                <CrmV2Empty
                  icon={<Briefcase size={26} />}
                  title="Aucune transaction trouvée"
                  description="Modifiez vos filtres ou lancez une synchronisation CRM."
                />
              ) : isMobile ? (
                // Mobile : une ligne par transaction
                <div>
                  {transactions.map(tx => {
                    const contactName = [tx.contact?.firstname, tx.contact?.lastname].filter(Boolean).join(' ')
                    const s = tx.dealstage ? getStageMeta(tx.dealstage) : undefined
                    const createdStr = tx.createdate
                      ? new Date(tx.createdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
                      : ''
                    return (
                      <button
                        key={tx.hubspot_deal_id}
                        type="button"
                        onClick={() => handleSelectDeal(tx as unknown as TransactionDetail)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '8px 12px',
                          background: 'none', border: 'none', borderBottom: `1px solid ${crmV2.border}`, textAlign: 'left',
                          fontFamily: 'inherit', cursor: 'pointer', color: crmV2.text,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: s?.color ?? crmV2.borderStrong, flexShrink: 0 }} title={s?.label} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.dealname || contactName || '(sans nom)'}
                          </span>
                          <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                            {[s?.label, tx.formation, tx.contact?.classe_actuelle].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                        {createdStr && <span style={{ fontSize: 11, color: crmV2.textFaint, whiteSpace: 'nowrap', flexShrink: 0 }}>{createdStr}</span>}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <CrmV2Table>
                  <thead>
                    <tr>
                      {SORT_COLUMNS.slice(0, 1).map(h => (
                        <CrmV2Th key={h.col} sorted={sortCol === h.col ? sortOrder : false} onClick={() => handleSort(h.col)}>{h.label}</CrmV2Th>
                      ))}
                      <CrmV2Th>Contact</CrmV2Th>
                      {SORT_COLUMNS.slice(1).map(h => (
                        <CrmV2Th key={h.col} sorted={sortCol === h.col ? sortOrder : false} onClick={() => handleSort(h.col)}>{h.label}</CrmV2Th>
                      ))}
                      <CrmV2Th style={{ width: 80 }}>{''}</CrmV2Th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => {
                      const contactName = [tx.contact?.firstname, tx.contact?.lastname].filter(Boolean).join(' ') || '—'
                      const zone = tx.contact?.zone_localite || tx.contact?.departement || '—'
                      const createdStr = tx.createdate
                        ? new Date(tx.createdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
                        : '—'
                      const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

                      return (
                        <CrmV2Tr key={tx.hubspot_deal_id} onClick={() => handleSelectDeal(tx as unknown as TransactionDetail)}>
                          {/* Transaction */}
                          <CrmV2Td style={{ maxWidth: 320 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span style={{
                                width: 28, height: 28, borderRadius: 8, background: crmV2.bgSoft, color: crmV2.textMuted,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}>
                                <Briefcase size={14} />
                              </span>
                              <span style={{ ...ellipsis, fontWeight: 600, color: crmV2.link }}>{tx.dealname || '(sans nom)'}</span>
                            </div>
                          </CrmV2Td>
                          {/* Contact */}
                          <CrmV2Td style={{ maxWidth: 200 }}>
                            <div style={{ ...ellipsis, color: crmV2.textMuted }}>{contactName}</div>
                          </CrmV2Td>
                          {/* Formation */}
                          <CrmV2Td>
                            {tx.formation ? (
                              <CrmV2Pill style={{ background: crmV2.goldSoft, borderColor: crmV2.goldBorder, color: crmV2.goldDark, fontWeight: 700 }}>
                                {tx.formation}
                              </CrmV2Pill>
                            ) : <span style={{ color: crmV2.textFaint }}>—</span>}
                          </CrmV2Td>
                          {/* Classe */}
                          <CrmV2Td>
                            {tx.contact?.classe_actuelle ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                <BookOpen size={13} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
                                <span style={{ color: crmV2.textMuted }}>{tx.contact.classe_actuelle}</span>
                              </div>
                            ) : <span style={{ color: crmV2.textFaint }}>—</span>}
                          </CrmV2Td>
                          {/* Zone */}
                          <CrmV2Td style={{ maxWidth: 200 }}>
                            {zone !== '—' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <MapPin size={13} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
                                <span style={{ ...ellipsis, color: crmV2.textMuted }}>{zone}</span>
                              </div>
                            ) : <span style={{ color: crmV2.textFaint }}>—</span>}
                          </CrmV2Td>
                          {/* Étape */}
                          <CrmV2Td>
                            <StageBadge stageId={tx.dealstage} />
                          </CrmV2Td>
                          {/* Date */}
                          <CrmV2Td>
                            <span style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{createdStr}</span>
                          </CrmV2Td>
                          {/* Lien fiche transaction */}
                          <CrmV2Td style={{ textAlign: 'right' }}>
                            <a
                              href={`/admin/crm/deals/${tx.hubspot_deal_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999,
                                border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, padding: '4px 10px',
                                color: crmV2.link, fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                              }}
                            >
                              <ExternalLink size={12} /> Fiche
                            </a>
                          </CrmV2Td>
                        </CrmV2Tr>
                      )
                    })}
                  </tbody>
                </CrmV2Table>
              )}
            </CrmV2TableCard>
          </div>
        )}
      </div>

      {/* ── Panneau de détail (transaction sans contact) ─────────────────────── */}
      {selectedDeal && (
        <TransactionDetailPanel
          deal={selectedDeal}
          onClose={handleDetailClose}
          onUpdate={handleDetailUpdate}
        />
      )}
    </CrmV2Page>
  )
}
