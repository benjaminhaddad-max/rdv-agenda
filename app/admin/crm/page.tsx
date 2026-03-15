'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Search, LayoutDashboard, Users, X, ChevronDown, Zap, Bell, List, GraduationCap, SlidersHorizontal, Plus, Save, Check, Trash2, Copy, Pen } from 'lucide-react'
import CRMContactsTable, { CRMContact } from '@/components/CRMContactsTable'
import CRMEditDrawer from '@/components/CRMEditDrawer'
import LogoutButton from '@/components/LogoutButton'

// ── Static option lists ────────────────────────────────────────────────────────

const STAGE_OPTIONS = [
  { id: '',           label: 'Toutes les étapes' },
  { id: '3165428979', label: '🔴 À Replanifier' },
  { id: '3165428980', label: '🔵 RDV Pris' },
  { id: '3165428981', label: '🟡 Délai Réflexion' },
  { id: '3165428982', label: '🟢 Pré-inscription' },
  { id: '3165428983', label: '🟣 Finalisation' },
  { id: '3165428984', label: '✅ Inscription Confirmée' },
  { id: '3165428985', label: '⚫ Fermé Perdu' },
]

const FORMATION_OPTIONS = [
  { id: '',              label: 'Toutes formations' },
  { id: 'PASS',          label: 'PASS' },
  { id: 'LSPS',          label: 'LSPS' },
  { id: 'LAS',           label: 'LAS' },
  { id: 'P-1',           label: 'P-1' },
  { id: 'P-2',           label: 'P-2' },
  { id: 'PAES FR',       label: 'PAES FR' },
  { id: 'PAES EU',       label: 'PAES EU' },
  { id: 'LSPS2 UPEC',   label: 'LSPS2 UPEC' },
  { id: 'LSPS3 UPEC',   label: 'LSPS3 UPEC' },
]

const CLASSE_OPTIONS = [
  { id: '',                  label: 'Toutes classes' },
  { id: 'Terminale',         label: 'Terminale' },
  { id: 'Première',          label: 'Première' },
  { id: 'Seconde',           label: 'Seconde' },
  { id: 'Troisième',         label: 'Troisième' },
  { id: 'PASS',              label: 'PASS' },
  { id: 'LSPS 1',            label: 'LSPS 1' },
  { id: 'LSPS 2',            label: 'LSPS 2' },
  { id: 'LSPS 3',            label: 'LSPS 3' },
  { id: 'LAS 1',             label: 'LAS 1' },
  { id: 'LAS 2',             label: 'LAS 2' },
  { id: 'LAS 3',             label: 'LAS 3' },
  { id: 'Etudes médicales',  label: 'Études médicales' },
]

const PERIOD_OPTIONS = [
  { id: '',       label: 'Toutes les périodes' },
  { id: 'today',  label: "Aujourd'hui" },
  { id: 'week',   label: 'Cette semaine' },
  { id: 'month',  label: 'Ce mois' },
]

// Ces listes sont chargées dynamiquement depuis /api/crm/field-options
// (valeurs réellement présentes dans crm_contacts, telles que renvoyées par HubSpot)

// ── Advanced filter system ───────────────────────────────────────────────────

type CRMFilterField = 'stage' | 'formation' | 'classe' | 'closer' | 'telepro' | 'lead_status' | 'source' | 'period' | 'search' | 'zone' | 'departement'
type CRMFilterOp = 'is' | 'is_not' | 'is_any' | 'is_none' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

interface CRMFilterRule {
  id: string
  field: CRMFilterField
  operator: CRMFilterOp
  value: string
}

interface CRMFilterGroup {
  id: string
  rules: CRMFilterRule[]
}

const CRM_FILTER_FIELDS: { key: CRMFilterField; label: string; type: 'select' | 'text' }[] = [
  { key: 'stage',       label: 'Étape',         type: 'select' },
  { key: 'formation',   label: 'Formation',     type: 'select' },
  { key: 'classe',      label: 'Classe',        type: 'select' },
  { key: 'closer',      label: 'Closer',        type: 'select' },
  { key: 'telepro',     label: 'Télépro',       type: 'select' },
  { key: 'lead_status', label: 'Statut lead',   type: 'select' },
  { key: 'source',      label: 'Origine',       type: 'select' },
  { key: 'zone',        label: 'Zone / Localité', type: 'select' },
  { key: 'departement', label: 'Département',   type: 'select' },
  { key: 'period',      label: 'Période',       type: 'select' },
  { key: 'search',      label: 'Recherche',     type: 'text' },
]

const SELECT_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'is',           label: 'est' },
  { key: 'is_not',       label: "n'est pas" },
  { key: 'is_any',       label: 'est parmi' },
  { key: 'is_none',      label: "n'est aucun de" },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

const TEXT_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'contains',     label: 'contient' },
  { key: 'not_contains', label: 'ne contient pas' },
  { key: 'is',           label: 'est exactement' },
  { key: 'is_empty',     label: 'est vide' },
]

function opsForField(field: CRMFilterField) {
  const f = CRM_FILTER_FIELDS.find(ff => ff.key === field)
  return f?.type === 'select' ? SELECT_OPS : TEXT_OPS
}

function opNeedsValue(op: CRMFilterOp) {
  return op !== 'is_empty' && op !== 'is_not_empty'
}

function opIsMulti(op: CRMFilterOp) {
  return op === 'is_any' || op === 'is_none'
}

// ── Multi-select dropdown for filters ─────────────────────────────────────

function MultiSelectDropdown({ options, value, onChange }: {
  options: SelectOption[]
  value: string          // comma-separated
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? value.split(',').filter(Boolean) : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
    onChange(next.join(','))
  }

  const selectedLabels = selected
    .map(s => options.find(o => o.id === s)?.label ?? s)
    .slice(0, 2)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6,
          padding: '6px 8px', color: selected.length > 0 ? '#ccac71' : '#555870',
          fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', width: '100%',
          textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected.length === 0
            ? 'Sélectionner…'
            : selected.length <= 2
              ? selectedLabels.join(', ')
              : `${selectedLabels.join(', ')} +${selected.length - 2}`}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, marginLeft: 4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#0d1a28', border: '1px solid #2d4a6b', borderRadius: 6,
          marginTop: 2, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        }}>
          {options.map(opt => (
            <label
              key={opt.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#c8cad8',
                background: selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,172,113,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent')}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 3,
                border: selected.includes(opt.id) ? '2px solid #ccac71' : '2px solid #3a5070',
                background: selected.includes(opt.id) ? '#ccac71' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {selected.includes(opt.id) && <Check size={10} color="#0d1a28" strokeWidth={3} />}
              </span>
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Saved views ─────────────────────────────────────────────────────────────

interface CRMSavedView {
  id: string
  name: string
  groups: CRMFilterGroup[]
  presetFlags?: { noTelepro?: boolean; recentFormMonths?: number }
  isDefault?: boolean
}

const CRM_DEFAULT_VIEWS: CRMSavedView[] = [
  { id: 'all',         name: 'Tous les leads',       groups: [], isDefault: true },
  { id: 'a_attribuer', name: 'À attribuer',          groups: [], presetFlags: { noTelepro: true }, isDefault: true },
  { id: 'recents',     name: 'Formulaires récents',  groups: [], presetFlags: { recentFormMonths: 3 }, isDefault: true },
]

function loadCRMViews(): CRMSavedView[] {
  return CRM_DEFAULT_VIEWS
}

async function persistViewCreate(view: CRMSavedView, position: number) {
  await fetch('/api/crm/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: view.id,
      name: view.name,
      filter_groups: view.groups,
      preset_flags: view.presetFlags ?? null,
      position,
    }),
  })
}

async function persistViewUpdate(id: string, patch: { name?: string; filter_groups?: unknown; position?: number }) {
  await fetch(`/api/crm/views/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

async function persistViewDelete(id: string) {
  await fetch(`/api/crm/views/${id}`, { method: 'DELETE' })
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface RdvUser {
  id: string
  name: string
  role: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface SyncLog {
  synced_at: string
  contacts_upserted: number
  deals_upserted: number
  duration_ms: number
  error_message?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isPeriodMatch(contact: CRMContact, period: string): boolean {
  if (!period) return true
  const dateStr = contact.deal?.createdate
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (period === 'today') return d.toDateString() === now.toDateString()
  if (period === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
    return d >= weekAgo
  }
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  return true
}

function filterClientSide(contacts: CRMContact[], period: string, formation: string, classe: string): CRMContact[] {
  return contacts.filter(c => {
    if (period && !isPeriodMatch(c, period)) return false
    if (formation && c.deal?.formation !== formation) return false
    if (classe && c.classe_actuelle !== classe) return false
    return true
  })
}

// ── Custom Select ──────────────────────────────────────────────────────────────

interface SelectOption { id: string; label: string }

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
}) {
  const current = options.find(o => o.id === value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = value !== ''

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(13,30,52,0.8)',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`,
          borderRadius: 8,
          padding: '7px 11px',
          color: isActive ? '#ccac71' : '#8b8fa8',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
          fontWeight: isActive ? 600 : 400,
          whiteSpace: 'nowrap',
          minWidth: 120,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
          {current?.label ?? placeholder ?? options[0]?.label}
        </span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: '#0d1e34',
          border: '1px solid #2d4a6b',
          borderRadius: 10,
          zIndex: 200,
          minWidth: '100%',
          maxHeight: 280,
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          padding: '4px 0',
        }}>
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                background: value === opt.id ? 'rgba(204,172,113,0.12)' : 'transparent',
                border: 'none',
                padding: '8px 14px',
                color: value === opt.id ? '#ccac71' : '#c8cad8',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontWeight: value === opt.id ? 700 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterMultiSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string           // comma-separated IDs
  onChange: (v: string) => void
  options: SelectOption[] // first option = "all" (id='')
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? value.split(',').filter(Boolean) : []
  const isActive = selected.length > 0
  const allLabel = options[0]?.label ?? placeholder ?? 'Tous'
  const selectableOptions = options.filter(o => o.id !== '')

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
    onChange(next.join(','))
  }

  const displayLabel = isActive
    ? selected.length === 1
      ? (selectableOptions.find(o => o.id === selected[0])?.label ?? selected[0])
      : `${selected.length} sélectionnés`
    : allLabel

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(13,30,52,0.8)',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`,
          borderRadius: 8,
          padding: '7px 11px',
          color: isActive ? '#ccac71' : '#8b8fa8',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
          fontWeight: isActive ? 600 : 400,
          whiteSpace: 'nowrap',
          minWidth: 120,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
          {displayLabel}
        </span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: '#0d1e34',
          border: '1px solid #2d4a6b',
          borderRadius: 10,
          zIndex: 200,
          minWidth: '100%',
          maxHeight: 280,
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          padding: '4px 0',
        }}>
          {/* "All" option — clears selection */}
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%',
              background: !isActive ? 'rgba(204,172,113,0.12)' : 'transparent',
              border: 'none',
              padding: '8px 14px',
              color: !isActive ? '#ccac71' : '#c8cad8',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              fontWeight: !isActive ? 700 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {allLabel}
          </button>
          <div style={{ height: 1, background: '#1a2f45', margin: '2px 8px' }} />
          {selectableOptions.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: '#c8cad8',
                background: selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent',
                fontWeight: selected.includes(opt.id) ? 600 : 400,
                border: 'none', textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,172,113,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent')}
            >
              <span style={{
                width: 15, height: 15, borderRadius: 3, flexShrink: 0,
                border: selected.includes(opt.id) ? '2px solid #ccac71' : '2px solid #3a5070',
                background: selected.includes(opt.id) ? '#ccac71' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected.includes(opt.id) && <Check size={9} color="#0d1a28" strokeWidth={3} />}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [contacts, setContacts]   = useState<CRMContact[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; label: string } | null>(null)
  const [lastSync, setLastSync]       = useState<SyncLog | null>(null)

  // Saved views
  const [crmViews, setCrmViews] = useState<CRMSavedView[]>(loadCRMViews)
  const [viewsLoaded, setViewsLoaded] = useState(false)
  const [manageViewsOpen, setManageViewsOpen] = useState(false)
  const [activeViewId, setActiveViewId] = useState('all')
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingView, setCreatingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  // Advanced filter panel
  const [filterGroups, setFilterGroups] = useState<CRMFilterGroup[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

  // Server-side filters (déclenchent un appel API)
  const [search, setSearch]           = useState('')
  const [stage, setStage]             = useState('')
  const [closerHsId, setCloserHsId]   = useState('')
  const [teleproHsId, setTeleproHsId] = useState('')
  const [noTelepro, setNoTelepro]     = useState(false)
  const [ownerExclude, setOwnerExclude] = useState('')
  const [recentFormMonths, setRecentFormMonths] = useState(0)
  const [leadStatus, setLeadStatus]   = useState('')
  const [source, setSource]           = useState('')
  const [zoneFilter, setZoneFilter]   = useState('')
  const [deptFilter, setDeptFilter]   = useState('')

  // Exclusion filters (is_not / is_none)
  const [stageNot, setStageNot]           = useState('')
  const [leadStatusNot, setLeadStatusNot] = useState('')
  const [sourceNot, setSourceNot]         = useState('')
  const [zoneNot, setZoneNot]             = useState('')
  const [deptNot, setDeptNot]             = useState('')
  const [closerNot, setCloserNot]         = useState('')
  const [teleproNot, setTeleproNot]       = useState('')
  const [formationNot, setFormationNot]   = useState('')

  // Overrides des filtres par défaut
  const [showExternal, setShowExternal] = useState(false)
  const [allClasses, setAllClasses]     = useState(true)

  // Client-side filters (appliqués sur les données déjà chargées)
  const [formation, setFormation] = useState('')
  const [classe, setClasse]       = useState('')
  const [period, setPeriod]       = useState('')

  // Listes utilisateurs pour les dropdowns
  const [closers, setClosers]     = useState<RdvUser[]>([])
  const [telepros, setTelepros]   = useState<RdvUser[]>([])
  const [allUsers, setAllUsers]   = useState<RdvUser[]>([])

  // Options dynamiques depuis HubSpot (valeurs réelles)
  const [leadStatusOptions, setLeadStatusOptions]   = useState<SelectOption[]>([{ id: '', label: 'Tous les statuts lead' }])
  const [sourceOptions, setSourceOptions]           = useState<SelectOption[]>([{ id: '', label: 'Toutes les origines' }])
  const [zoneOptions, setZoneOptions]               = useState<SelectOption[]>([{ id: '', label: 'Toutes les zones' }])
  const [deptOptions, setDeptOptions]               = useState<SelectOption[]>([{ id: '', label: 'Tous les départements' }])

  // Sélection en masse + drawer
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTeleproId, setBulkTeleproId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  const LIMIT = 50
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Charger les vues sauvegardées ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/crm/views')
      .then(r => r.json())
      .then((rows: Array<{ id: string; name: string; filter_groups: unknown; preset_flags: unknown; position: number }>) => {
        if (!Array.isArray(rows) || rows.length === 0) { setViewsLoaded(true); return }
        const dbViews: CRMSavedView[] = rows.map(r => ({
          id: r.id,
          name: r.name,
          groups: (r.filter_groups as CRMFilterGroup[]) ?? [],
          presetFlags: r.preset_flags as CRMSavedView['presetFlags'] ?? undefined,
          isDefault: false,
        }))
        setCrmViews([...CRM_DEFAULT_VIEWS, ...dbViews])
        setViewsLoaded(true)
      })
      .catch(() => setViewsLoaded(true))
  }, [])

  // ── Charger les utilisateurs ─────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/users?roles=closer,admin').then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : []
      setClosers(arr)
      setAllUsers(prev => [...prev.filter(u => u.role !== 'closer' && u.role !== 'admin'), ...arr])
    })
    fetch('/api/users?role=telepro').then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : []
      setTelepros(arr)
      setAllUsers(prev => [...prev.filter(u => u.role !== 'telepro'), ...arr])
    })
    // Charger les valeurs réelles HubSpot pour statut lead + origine
    fetch('/api/crm/field-options').then(r => r.json()).then(d => {
      if (d.leadStatuses?.length) {
        setLeadStatusOptions([
          { id: '', label: 'Tous les statuts lead' },
          ...d.leadStatuses.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.sources?.length) {
        setSourceOptions([
          { id: '', label: 'Toutes les origines' },
          ...d.sources.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.zones?.length) {
        setZoneOptions([
          { id: '', label: 'Toutes les zones' },
          ...d.zones.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.departements?.length) {
        setDeptOptions([
          { id: '', label: 'Tous les départements' },
          ...d.departements.map((v: string) => ({ id: v, label: v })),
        ])
      }
    })
  }, [])

  // ── Récupérer les contacts ───────────────────────────────────────────────────

  const fetchContacts = useCallback(async (resetPage = false) => {
    setLoading(true)
    const currentPage = resetPage ? 0 : page
    if (resetPage) setPage(0)

    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        page: String(currentPage),
      })
      if (search)               params.set('search', search)
      if (stage)                params.set('stage', stage)
      if (closerHsId)           params.set('closer_hs_id', closerHsId)
      if (teleproHsId)          params.set('telepro_hs_id', teleproHsId)
      if (noTelepro)            params.set('no_telepro', '1')
      if (ownerExclude)         params.set('owner_exclude', ownerExclude)
      if (recentFormMonths > 0) params.set('recent_form_months', String(recentFormMonths))
      if (showExternal)         params.set('show_external', '1')
      if (allClasses)           params.set('all_classes', '1')
      if (leadStatus)           params.set('lead_status', leadStatus)
      if (source)               params.set('source', source)
      if (zoneFilter)           params.set('zone', zoneFilter)
      if (deptFilter)           params.set('departement', deptFilter)

      // Exclusion params (is_not / is_none)
      if (stageNot)             params.set('stage_not', stageNot)
      if (leadStatusNot)        params.set('lead_status_not', leadStatusNot)
      if (sourceNot)            params.set('source_not', sourceNot)
      if (zoneNot)              params.set('zone_not', zoneNot)
      if (deptNot)              params.set('departement_not', deptNot)
      if (closerNot)            params.set('closer_not', closerNot)
      if (teleproNot)           params.set('telepro_not', teleproNot)
      if (formationNot)         params.set('formation_not', formationNot)

      const res = await fetch(`/api/crm/contacts?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.data ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stage, closerHsId, teleproHsId, noTelepro, ownerExclude, recentFormMonths, showExternal, allClasses, leadStatus, source, zoneFilter, deptFilter, stageNot, leadStatusNot, sourceNot, zoneNot, deptNot, closerNot, teleproNot, formationNot, page])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchContacts(true), 300)
  }

  // ── View management ──────────────────────────────────────────────────────────

  function applyGroupsToFilters(groups: CRMFilterGroup[], flags?: CRMSavedView['presetFlags']) {
    // Reset all positive filters
    setSearch(''); setStage(''); setCloserHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod(''); setLeadStatus(''); setSource('')
    setZoneFilter(''); setDeptFilter('')
    // Reset all exclusion filters
    setStageNot(''); setLeadStatusNot(''); setSourceNot(''); setZoneNot(''); setDeptNot('')
    setCloserNot(''); setTeleproNot(''); setFormationNot('')
    setNoTelepro(flags?.noTelepro ?? false)
    setRecentFormMonths(flags?.recentFormMonths ?? 0)

    // Apply first group rules (AND) to the simple filter params
    const firstGroup = groups[0]
    if (firstGroup) {
      for (const rule of firstGroup.rules) {
        if (!rule.value && rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty') continue
        const val = rule.value
        // Positive filters: is, is_any, contains
        if (rule.operator === 'is' || rule.operator === 'is_any' || rule.operator === 'contains') {
          switch (rule.field) {
            case 'stage':       setStage(val); break
            case 'formation':   setFormation(val); break
            case 'classe':      setClasse(val); break
            case 'closer':      setCloserHsId(val); break
            case 'telepro':     setTeleproHsId(val); break
            case 'lead_status': setLeadStatus(val); break
            case 'source':      setSource(val); break
            case 'period':      setPeriod(val); break
            case 'search':      setSearch(val); break
            case 'zone':        setZoneFilter(val); break
            case 'departement': setDeptFilter(val); break
          }
        }
        // Exclusion filters: is_not, is_none
        if (rule.operator === 'is_not' || rule.operator === 'is_none') {
          switch (rule.field) {
            case 'stage':       setStageNot(val); break
            case 'formation':   setFormationNot(val); break
            case 'closer':      setCloserNot(val); break
            case 'telepro':     setTeleproNot(val); break
            case 'lead_status': setLeadStatusNot(val); break
            case 'source':      setSourceNot(val); break
            case 'zone':        setZoneNot(val); break
            case 'departement': setDeptNot(val); break
          }
        }
      }
    }
  }

  function applyCRMView(view: CRMSavedView) {
    setActiveViewId(view.id)
    setFilterGroups(view.groups)
    applyGroupsToFilters(view.groups, view.presetFlags)
    scheduleRefetch()
  }

  function createCRMView(name: string) {
    const id = `v_${Date.now()}`
    const newView: CRMSavedView = {
      id,
      name: name || 'Nouvelle vue',
      groups: [...filterGroups],
    }
    const customViews = crmViews.filter(v => !v.isDefault)
    const position = customViews.length
    setCrmViews(prev => [...prev, newView])
    persistViewCreate(newView, position)
    setActiveViewId(id)
    setCreatingView(false)
    setNewViewName('')
  }

  function deleteCRMView(viewId: string) {
    const updated = crmViews.filter(v => v.id !== viewId)
    setCrmViews(updated)
    persistViewDelete(viewId)
    if (activeViewId === viewId) applyCRMView(updated[0])
  }

  function renameCRMView(viewId: string, newName: string) {
    const updated = crmViews.map(v => v.id === viewId ? { ...v, name: newName || v.name } : v)
    setCrmViews(updated)
    persistViewUpdate(viewId, { name: newName || (crmViews.find(v => v.id === viewId)?.name ?? '') })
    setRenamingViewId(null)
  }

  function updateCRMViewFilters(viewId: string) {
    const updated = crmViews.map(v =>
      v.id === viewId ? { ...v, groups: [...filterGroups] } : v
    )
    setCrmViews(updated)
    persistViewUpdate(viewId, { filter_groups: filterGroups })
  }

  // ── Filter group CRUD ──────────────────────────────────────────────────────

  function addFilterGroup() {
    const g: CRMFilterGroup = {
      id: `g_${Date.now()}`,
      rules: [{ id: `r_${Date.now()}`, field: 'stage', operator: 'is', value: '' }],
    }
    setFilterGroups(prev => [...prev, g])
  }

  function deleteFilterGroup(gid: string) {
    const updated = filterGroups.filter(g => g.id !== gid)
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    scheduleRefetch()
  }

  function duplicateFilterGroup(gid: string) {
    const g = filterGroups.find(g => g.id === gid)
    if (!g) return
    const dup: CRMFilterGroup = {
      id: `g_${Date.now()}`,
      rules: g.rules.map(r => ({ ...r, id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
    }
    const idx = filterGroups.indexOf(g)
    const updated = [...filterGroups]
    updated.splice(idx + 1, 0, dup)
    setFilterGroups(updated)
  }

  function addRuleToGroup(gid: string) {
    const updated = filterGroups.map(g => {
      if (g.id !== gid) return g
      return {
        ...g,
        rules: [...g.rules, { id: `r_${Date.now()}`, field: 'stage' as CRMFilterField, operator: 'is' as CRMFilterOp, value: '' }],
      }
    })
    setFilterGroups(updated)
  }

  function updateRule(gid: string, rid: string, patch: Partial<CRMFilterRule>) {
    const updated = filterGroups.map(g => {
      if (g.id !== gid) return g
      return {
        ...g,
        rules: g.rules.map(r => {
          if (r.id !== rid) return r
          const merged = { ...r, ...patch }
          if (patch.field && patch.field !== r.field) merged.value = ''
          if (patch.operator && !opNeedsValue(patch.operator)) merged.value = ''
          return merged
        }),
      }
    })
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    scheduleRefetch()
  }

  function removeRule(gid: string, rid: string) {
    let updated = filterGroups.map(g => {
      if (g.id !== gid) return g
      return { ...g, rules: g.rules.filter(r => r.id !== rid) }
    }).filter(g => g.rules.length > 0)
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    scheduleRefetch()
  }

  // ── HubSpot sync ─────────────────────────────────────────────────────────────

  async function handleSync(full = false) {
    setSyncing(true)
    setSyncProgress(null)

    try {
      if (!full) {
        // Sync incrémental : un seul appel
        const res = await fetch('/api/admin/crm-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full: false }),
        })
        const data = await res.json()
        setLastSync({
          synced_at: new Date().toISOString(),
          contacts_upserted: data.contacts_upserted ?? 0,
          deals_upserted: data.deals_upserted ?? 0,
          duration_ms: data.duration_ms ?? 0,
          error_message: data.error ?? null,
        })
      } else {
        // Sync complet : premier appel (deals + premier chunk contacts)
        setSyncProgress({ done: 0, label: 'Sync deals + premiers contacts…' })
        const res1 = await fetch('/api/admin/crm-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full: true }),
        })
        const data1 = await res1.json()

        let totalContacts = data1.contacts_upserted ?? 0
        let cursor: string | null = data1.next_cursor ?? null

        setSyncProgress({ done: totalContacts, label: `${totalContacts.toLocaleString('fr')} contacts synchro…` })

        // Chunks suivants tant qu'il y a un cursor
        while (cursor) {
          const res = await fetch('/api/admin/crm-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cursor }),
          })
          const data = await res.json()

          totalContacts += data.contacts_upserted ?? 0
          cursor = data.next_cursor ?? null

          setSyncProgress({
            done: totalContacts,
            label: cursor
              ? `${totalContacts.toLocaleString('fr')} contacts synchro…`
              : `✓ ${totalContacts.toLocaleString('fr')} contacts synchronisés`,
          })

          if (data.error) break
        }

        setLastSync({
          synced_at: new Date().toISOString(),
          contacts_upserted: totalContacts,
          deals_upserted: data1.deals_upserted ?? 0,
          duration_ms: 0,
          error_message: null,
        })
      }

      await fetchContacts(true)
    } catch { /* silent */ }
    finally {
      setSyncing(false)
      setTimeout(() => setSyncProgress(null), 4000)
    }
  }

  function formatSyncTime(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime()
    const min = Math.round(diff / 60000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const h = Math.round(min / 60)
    return `il y a ${h}h`
  }

  // ── Filtres client-side ───────────────────────────────────────────────────────

  const displayed = filterClientSide(contacts, period, formation, classe)
  const totalPages = Math.ceil(total / LIMIT)

  const hasWithDeal  = contacts.filter(c => !!c.deal).length
  const hasNoTelepro = contacts.filter(c => c.deal && !c.deal.teleprospecteur).length
  const hasNoCloser  = contacts.filter(c => c.deal && !c.deal.closer).length

  const hasActiveFilters = search || stage || closerHsId || teleproHsId || formation || classe || period || noTelepro || ownerExclude || recentFormMonths > 0 || leadStatus || source || zoneFilter || deptFilter
  const totalFilterRules = filterGroups.reduce((sum, g) => sum + g.rules.length, 0)

  // Check if current filters changed from active view
  const activeCRMView = crmViews.find(v => v.id === activeViewId)
  const crmViewChanged = activeCRMView ? (
    JSON.stringify(filterGroups) !== JSON.stringify(activeCRMView.groups)
  ) : false

  function resetAll() {
    setSearch(''); setStage(''); setCloserHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod('')
    setNoTelepro(false); setOwnerExclude(''); setRecentFormMonths(0)
    setLeadStatus(''); setSource(''); setZoneFilter(''); setDeptFilter('')
    setFilterGroups([])
    setActiveViewId('all')
  }

  // ── Sélection en masse ────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllPage(ids: string[]) {
    setSelectedIds(prev => new Set([...prev, ...ids]))
  }

  function deselectAll() {
    setSelectedIds(new Set())
  }

  function selectFirst(n: number) {
    const ids = displayed.slice(0, n).map(c => c.hubspot_contact_id)
    setSelectedIds(new Set(ids))
  }

  function selectAll() {
    setSelectedIds(new Set(displayed.map(c => c.hubspot_contact_id)))
  }

  async function handleBulkAssign() {
    if (!bulkTeleproId || selectedIds.size === 0) return
    setBulkAssigning(true)
    try {
      await fetch('/api/crm/contacts/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: [...selectedIds], teleprospecteur: bulkTeleproId }),
      })
      setSelectedIds(new Set())
      setBulkTeleproId('')
      await fetchContacts(true)
    } finally {
      setBulkAssigning(false)
    }
  }

  // ── Dropdown options ───────────────────────────────────────────────────────────

  // Dropdown options
  const closerOptions: SelectOption[] = [
    { id: '', label: 'Tous les closers' },
    ...closers.map(c => ({ id: c.hubspot_owner_id ?? c.id, label: c.name })),
  ]
  const teleproOptions: SelectOption[] = [
    { id: '', label: 'Tous les télépros' },
    ...telepros.map(t => ({ id: t.hubspot_user_id ?? t.id, label: t.name })),
  ]
  // Tous les utilisateurs avec un hubspot_owner_id (pour "Exclure propriétaire")
  const ownerExcludeOptions: SelectOption[] = [
    { id: '', label: 'Aucune exclusion' },
    ...allUsers
      .filter(u => u.hubspot_owner_id)
      .map(u => ({ id: u.hubspot_owner_id!, label: u.name })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px',
        height: 52,
        background: '#1d2f4b',
        borderBottom: '1px solid #2d4a6b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, width: 'auto' }} />
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600 }}>CRM — Contacts & Transactions</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href="/admin/crm/transactions" style={{ background: 'rgba(204,172,113,0.10)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '5px 12px', color: '#ccac71', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
            <GraduationCap size={12} /> Transactions 2026-2027
          </a>
          <a href="/admin" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <LayoutDashboard size={12} /> Dashboard
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* ── Sync bar ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 20px',
        background: '#101e30',
        borderBottom: '1px solid #1a2f45',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            style={{
              background: syncing ? 'rgba(76,171,219,0.08)' : 'rgba(76,171,219,0.15)',
              border: '1px solid rgba(76,171,219,0.3)',
              borderRadius: 8,
              padding: '6px 14px',
              color: '#4cabdb',
              fontSize: 12,
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={12} style={{ animation: syncing ? 'spin 0.8s linear infinite' : 'none' }} />
            {syncing ? 'Synchronisation…' : 'Sync HubSpot'}
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={syncing}
            title="Sync complet depuis sept. 2024 (premier lancement)"
            style={{
              background: 'transparent',
              border: '1px solid #1a2f45',
              borderRadius: 8,
              padding: '6px 10px',
              color: '#3a5070',
              fontSize: 11,
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            Sync complet
          </button>
          {syncProgress && syncing && (
            <span style={{ fontSize: 11, color: '#4cabdb', fontWeight: 600 }}>
              {syncProgress.label}
            </span>
          )}
          {!syncing && syncProgress && (
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
              {syncProgress.label}
            </span>
          )}
          {!syncProgress && lastSync && (
            <span style={{ fontSize: 11, color: lastSync.error_message ? '#ef4444' : '#3a5070' }}>
              {lastSync.error_message
                ? `⚠ ${lastSync.error_message}`
                : `✓ ${formatSyncTime(lastSync.synced_at)} · ${lastSync.contacts_upserted.toLocaleString('fr')} contacts · ${lastSync.deals_upserted} deals`
              }
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatChip value={total} label="contacts" color="#8b8fa8" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasWithDeal} label="avec deal" color="#4cabdb" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasNoTelepro} label="sans télépro" color="#ccac71" />
          <div style={{ width: 1, height: 16, background: '#2d4a6b' }} />
          <StatChip value={hasNoCloser} label="sans closer" color="#ef4444" />
        </div>
      </div>

      {/* ── Views Tab Bar (HubSpot-style) ─────────────────────────────────── */}
      <div style={{
        padding: '0 20px', background: '#0b1624',
        borderBottom: '1px solid #1a2f45', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 0,
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        {crmViews.map(view => {
          const isActive = activeViewId === view.id
          const isRenaming = renamingViewId === view.id
          const Icon = view.id === 'a_attribuer' ? Zap : view.id === 'recents' ? Bell : List

          return (
            <div
              key={view.id}
              onClick={() => { if (!isRenaming) applyCRMView(view) }}
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
              {view.isDefault && <Icon size={12} style={{ color: isActive ? '#ccac71' : '#555870' }} />}

              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameCRMView(view.id, renameValue)
                    if (e.key === 'Escape') setRenamingViewId(null)
                  }}
                  onBlur={() => renameCRMView(view.id, renameValue)}
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

              {/* Badge: filter count for custom views */}
              {!view.isDefault && view.groups.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: isActive ? '#ccac71' : '#3a5070',
                  background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(58,80,112,0.15)',
                  borderRadius: 8, padding: '1px 6px',
                }}>
                  {view.groups.reduce((s, g) => s + g.rules.length, 0)} filtre{view.groups.reduce((s, g) => s + g.rules.length, 0) > 1 ? 's' : ''}
                </span>
              )}

              {/* Delete button */}
              {!view.isDefault && isActive && !isRenaming && (
                <button
                  onClick={e => { e.stopPropagation(); deleteCRMView(view.id) }}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: '#555870', cursor: 'pointer', display: 'flex', marginLeft: 2,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )
        })}

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: '#1a2f45', margin: '0 6px', flexShrink: 0 }} />

        {/* Filtres avancés button */}
        <button
          onClick={() => setFilterPanelOpen(o => !o)}
          style={{
            padding: '7px 12px',
            background: filterPanelOpen ? 'rgba(204,172,113,0.12)' : 'none',
            border: filterPanelOpen ? '1px solid rgba(204,172,113,0.3)' : '1px solid transparent',
            borderRadius: 6, color: totalFilterRules > 0 ? '#ccac71' : '#6b7a90',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontFamily: 'inherit', fontWeight: totalFilterRules > 0 ? 600 : 400,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <SlidersHorizontal size={12} />
          Filtres avancés{totalFilterRules > 0 ? ` (${totalFilterRules})` : ''}
        </button>

        {/* Save view filters */}
        {crmViewChanged && activeViewId !== 'all' && !activeCRMView?.isDefault && (
          <button
            onClick={() => updateCRMViewFilters(activeViewId)}
            style={{
              padding: '6px 10px', background: 'rgba(204,172,113,0.08)',
              border: '1px solid rgba(204,172,113,0.25)', borderRadius: 6,
              color: '#ccac71', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <Save size={10} /> Sauvegarder
          </button>
        )}

        {/* Manage views button */}
        {crmViews.filter(v => !v.isDefault).length > 0 && (
          <button
            onClick={() => setManageViewsOpen(true)}
            style={{
              padding: '7px 10px', background: 'none', border: '1px solid transparent',
              borderRadius: 6, color: '#3a5070', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#8b8fa8'; e.currentTarget.style.borderColor = '#2d4a6b' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#3a5070'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <SlidersHorizontal size={11} /> Gérer
          </button>
        )}

        {/* Create new view */}
        {creatingView ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', flexShrink: 0 }}>
            <input
              autoFocus
              value={newViewName}
              onChange={e => setNewViewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createCRMView(newViewName)
                if (e.key === 'Escape') { setCreatingView(false); setNewViewName('') }
              }}
              placeholder="Nom de la vue…"
              style={{
                background: 'rgba(204,172,113,0.08)', border: '1px solid #ccac71',
                borderRadius: 4, padding: '3px 8px', color: '#ccac71',
                fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 120,
              }}
            />
            <button onClick={() => createCRMView(newViewName)} style={{ background: '#ccac71', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex' }}>
              <Check size={12} color="#0b1624" />
            </button>
            <button onClick={() => { setCreatingView(false); setNewViewName('') }} style={{ background: 'none', border: 'none', padding: 0, color: '#555870', cursor: 'pointer', display: 'flex' }}>
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
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ccac71')}
            onMouseLeave={e => (e.currentTarget.style.color = '#3a5070')}
          >
            <Plus size={12} /> Enregistrer la vue
          </button>
        )}

        {/* Transactions link */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <a
            href="/admin/crm/transactions"
            style={{
              background: 'rgba(204,172,113,0.10)',
              border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 8, padding: '6px 14px', color: '#ccac71',
              fontSize: 12, textDecoration: 'none', display: 'flex',
              alignItems: 'center', gap: 6, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            <GraduationCap size={13} /> Transactions 2026-2027
          </a>
        </div>
      </div>

      {/* ── Quick filters bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: '6px 20px',
        background: '#090f1a',
        borderBottom: '1px solid #1a2f45',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: '#3a5070', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>
          Filtres auto
        </span>
        <button
          onClick={() => { setAllClasses(v => !v); scheduleRefetch() }}
          style={{
            background: allClasses ? 'rgba(76,171,219,0.1)' : 'rgba(204,172,113,0.1)',
            border: `1px solid ${allClasses ? 'rgba(76,171,219,0.3)' : 'rgba(204,172,113,0.35)'}`,
            borderRadius: 20, padding: '3px 10px',
            color: allClasses ? '#4cabdb' : '#ccac71',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: 9 }}>●</span>
          {allClasses ? 'Toutes classes' : 'Terminale · Première · Seconde + récents'}
        </button>
        <button
          onClick={() => { setShowExternal(v => !v); scheduleRefetch() }}
          style={{
            background: showExternal ? 'rgba(239,68,68,0.1)' : 'rgba(76,171,219,0.1)',
            border: `1px solid ${showExternal ? 'rgba(239,68,68,0.3)' : 'rgba(76,171,219,0.3)'}`,
            borderRadius: 20, padding: '3px 10px',
            color: showExternal ? '#ef4444' : '#4cabdb',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: 9 }}>{showExternal ? '○' : '●'}</span>
          {showExternal ? 'Équipe externe visible' : 'Équipe externe masquée'}
        </button>
      </div>

      {/* ── Search + quick dropdowns ──────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px', background: '#0d1a28',
        borderBottom: '1px solid #1a2f45', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#0b1624', border: '1px solid #2d4a6b', borderRadius: 8,
            padding: '7px 12px', flex: '1 1 auto', maxWidth: 380,
          }}>
            <Search size={13} style={{ color: '#3a5070', flexShrink: 0 }} />
            <input
              type="text" placeholder="Nom, email, téléphone…"
              value={search}
              onChange={e => { setSearch(e.target.value); scheduleRefetch() }}
              onKeyDown={e => { if (e.key === 'Enter') fetchContacts(true) }}
              style={{ background: 'transparent', border: 'none', color: '#e8eaf0', fontSize: 13, outline: 'none', flex: 1, fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => { setSearch(''); scheduleRefetch() }} style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button onClick={() => { resetAll(); scheduleRefetch() }} style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '7px 12px', color: '#ef4444', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
              gap: 5, fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              <X size={11} /> Réinitialiser
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <FilterMultiSelect value={stage} onChange={v => { setStage(v); scheduleRefetch() }} options={STAGE_OPTIONS} />
          <FilterSelect value={formation} onChange={setFormation} options={FORMATION_OPTIONS} />
          <FilterSelect value={classe} onChange={setClasse} options={CLASSE_OPTIONS} />
          <FilterMultiSelect value={closerHsId} onChange={v => { setCloserHsId(v); scheduleRefetch() }} options={closerOptions} />
          <FilterMultiSelect value={teleproHsId} onChange={v => { setTeleproHsId(v); scheduleRefetch() }} options={teleproOptions} />
          <FilterSelect value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
          <div style={{ width: 1, height: 24, background: '#2d4a6b', flexShrink: 0 }} />
          <FilterMultiSelect value={leadStatus} onChange={v => { setLeadStatus(v); scheduleRefetch() }} options={leadStatusOptions} />
          <FilterMultiSelect value={source} onChange={v => { setSource(v); scheduleRefetch() }} options={sourceOptions} />
          {ownerExcludeOptions.length > 1 && (
            <>
              <div style={{ width: 1, height: 24, background: '#2d4a6b', flexShrink: 0 }} />
              <FilterSelect value={ownerExclude} onChange={v => { setOwnerExclude(v); scheduleRefetch() }} options={ownerExcludeOptions} placeholder="Exclure propriétaire" />
            </>
          )}
        </div>
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#3a5070' }}>Filtres :</span>
            {noTelepro && <FilterPill label="Sans télépro" onRemove={() => { setNoTelepro(false); scheduleRefetch() }} />}
            {recentFormMonths > 0 && <FilterPill label={`Form. < ${recentFormMonths} mois`} onRemove={() => { setRecentFormMonths(0); scheduleRefetch() }} />}
            {stage && <FilterPill label={stage.includes(',') ? `${stage.split(',').length} étapes` : STAGE_OPTIONS.find(o => o.id === stage)?.label ?? stage} onRemove={() => { setStage(''); scheduleRefetch() }} />}
            {formation && <FilterPill label={formation} onRemove={() => setFormation('')} />}
            {classe && <FilterPill label={classe} onRemove={() => setClasse('')} />}
            {closerHsId && <FilterPill label={closerHsId.includes(',') ? `${closerHsId.split(',').length} closers` : closerOptions.find(o => o.id === closerHsId)?.label ?? 'Closer'} onRemove={() => { setCloserHsId(''); scheduleRefetch() }} />}
            {teleproHsId && <FilterPill label={teleproHsId.includes(',') ? `${teleproHsId.split(',').length} télépros` : teleproOptions.find(o => o.id === teleproHsId)?.label ?? 'Télépro'} onRemove={() => { setTeleproHsId(''); scheduleRefetch() }} />}
            {ownerExclude && <FilterPill label={`Excl. ${ownerExcludeOptions.find(o => o.id === ownerExclude)?.label ?? 'propriétaire'}`} onRemove={() => { setOwnerExclude(''); scheduleRefetch() }} />}
            {period && <FilterPill label={PERIOD_OPTIONS.find(o => o.id === period)?.label ?? period} onRemove={() => setPeriod('')} />}
            {leadStatus && <FilterPill label={leadStatus.includes(',') ? `${leadStatus.split(',').length} statuts` : leadStatusOptions.find(o => o.id === leadStatus)?.label ?? leadStatus} onRemove={() => { setLeadStatus(''); scheduleRefetch() }} />}
            {source && <FilterPill label={source.includes(',') ? `${source.split(',').length} origines` : sourceOptions.find(o => o.id === source)?.label ?? source} onRemove={() => { setSource(''); scheduleRefetch() }} />}
            {search && <FilterPill label={`"${search}"`} onRemove={() => { setSearch(''); scheduleRefetch() }} />}
          </div>
        )}
      </div>

      {/* ── Table + Advanced Filter Panel ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Table area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 20px' }}>
        {(formation || classe || period) && !loading && (
          <div style={{ padding: '10px 20px 6px', fontSize: 12, color: '#3a5070' }}>
            {displayed.length} résultat{displayed.length !== 1 ? 's' : ''} affiché{displayed.length !== 1 ? 's' : ''} sur {contacts.length} chargés
          </div>
        )}

        {/* ── Barre sélection en masse ───────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'rgba(13,30,52,0.98)', border: `1px solid #2d4a6b`,
            borderRadius: 10, padding: '10px 16px', margin: '8px 20px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4cabdb' }}>
              ☑ {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[25, 100, 500].map(n => (
                <button key={n} onClick={() => selectFirst(n)}
                  style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.3)', borderRadius: 6, padding: '4px 10px', color: '#4cabdb', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {n} premiers
                </button>
              ))}
              <button onClick={selectAll}
                style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, padding: '4px 10px', color: '#ccac71', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Tout ({displayed.length})
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                style={{ background: 'transparent', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#555870', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Désélectionner
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#8b8fa8' }}>Assigner à :</span>
            <select
              value={bulkTeleproId}
              onChange={e => setBulkTeleproId(e.target.value)}
              style={{ background: '#0d1e34', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 10px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit' }}
            >
              <option value="">— Choisir un télépro —</option>
              {telepros.map(u => (
                <option key={u.id} value={u.hubspot_user_id || u.id}>{u.name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkTeleproId || bulkAssigning}
              style={{
                background: bulkTeleproId ? '#22c55e' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${bulkTeleproId ? '#22c55e' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: 8, padding: '6px 16px', color: '#fff', fontSize: 12,
                fontWeight: 700, cursor: bulkTeleproId ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', opacity: bulkAssigning ? 0.6 : 1,
              }}
            >
              {bulkAssigning ? 'Attribution…' : 'Assigner'}
            </button>
          </div>
        )}

        <div style={{ padding: '0 20px' }}>
        <CRMContactsTable
          contacts={displayed}
          loading={loading}
          mode="admin"
          onRefresh={() => fetchContacts()}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAllPage}
          onDeselectAll={deselectAll}
          onOpenDrawer={setDrawerContact}
          leadStatusOptions={leadStatusOptions.filter(o => o.id !== '')}
          sourceOptions={sourceOptions.filter(o => o.id !== '')}
          closerSelectOptions={closerOptions.filter(o => o.id !== '')}
          teleproSelectOptions={teleproOptions.filter(o => o.id !== '')}
        /></div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingBottom: 20 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '6px 16px', color: page === 0 ? '#2d4a6b' : '#8b8fa8', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
            >
              ← Précédent
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i : (
                  i === 0 ? 0 :
                  i === 6 ? totalPages - 1 :
                  page <= 3 ? i :
                  page >= totalPages - 4 ? totalPages - 7 + i :
                  page - 3 + i
                )
                return (
                  <button
                    key={i}
                    onClick={() => setPage(p)}
                    style={{
                      background: p === page ? 'rgba(204,172,113,0.15)' : 'transparent',
                      border: `1px solid ${p === page ? 'rgba(204,172,113,0.4)' : 'transparent'}`,
                      borderRadius: 6,
                      width: 32,
                      height: 32,
                      color: p === page ? '#ccac71' : '#3a5070',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      fontWeight: p === page ? 700 : 400,
                    }}
                  >
                    {p + 1}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '6px 16px', color: page >= totalPages - 1 ? '#2d4a6b' : '#8b8fa8', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {/* ── Advanced Filter Side Panel — RIGHT (HubSpot-style) ────────────── */}
      {filterPanelOpen && (
        <div style={{
          width: 380, flexShrink: 0,
          background: '#0d1a28', borderLeft: '1px solid #1a2f45',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #1a2f45',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e8eaf0' }}>Tous les filtres</span>
            <button onClick={() => setFilterPanelOpen(false)} style={{
              background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 2,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8b8fa8', marginBottom: 12 }}>
              Filtres avancés
            </div>

            {filterGroups.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#1a2f45' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#555870', background: '#0d1a28', padding: '2px 10px', border: '1px solid #1a2f45', borderRadius: 4 }}>ou</span>
                    <div style={{ flex: 1, height: 1, background: '#1a2f45' }} />
                  </div>
                )}

                <div style={{ background: '#101e30', border: '1px solid #1a2f45', borderRadius: 10, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#c8cad8' }}>Groupe {gi + 1}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => duplicateFilterGroup(group.id)} title="Dupliquer" style={{ background: 'none', border: 'none', color: '#3a5070', cursor: 'pointer', display: 'flex', padding: 3 }}><Copy size={13} /></button>
                      <button onClick={() => deleteFilterGroup(group.id)} title="Supprimer" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: 3 }}><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {group.rules.map((rule, ri) => {
                    const ops = opsForField(rule.field)
                    const showVal = opNeedsValue(rule.operator)
                    const fieldDef = CRM_FILTER_FIELDS.find(f => f.key === rule.field)
                    let valueOptions: SelectOption[] = []
                    switch (rule.field) {
                      case 'stage':       valueOptions = STAGE_OPTIONS.filter(o => o.id); break
                      case 'formation':   valueOptions = FORMATION_OPTIONS.filter(o => o.id); break
                      case 'classe':      valueOptions = CLASSE_OPTIONS.filter(o => o.id); break
                      case 'closer':      valueOptions = closerOptions.filter(o => o.id); break
                      case 'telepro':     valueOptions = teleproOptions.filter(o => o.id); break
                      case 'lead_status': valueOptions = leadStatusOptions.filter(o => o.id); break
                      case 'source':      valueOptions = sourceOptions.filter(o => o.id); break
                      case 'zone':        valueOptions = zoneOptions.filter(o => o.id); break
                      case 'departement': valueOptions = deptOptions.filter(o => o.id); break
                      case 'period':      valueOptions = PERIOD_OPTIONS.filter(o => o.id); break
                    }
                    return (
                      <div key={rule.id}>
                        {ri > 0 && <div style={{ fontSize: 11, color: '#3a5070', padding: '4px 0 4px 4px' }}>et</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#0b1624', border: '1px solid #1a2f45', borderRadius: 8, padding: '8px 10px', position: 'relative' }}>
                          <button onClick={() => removeRule(group.id, rule.id)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={12} /></button>
                          <select value={rule.field} onChange={e => updateRule(group.id, rule.id, { field: e.target.value as CRMFilterField })} style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                            {CRM_FILTER_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          <select value={rule.operator} onChange={e => updateRule(group.id, rule.id, { operator: e.target.value as CRMFilterOp })} style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                            {ops.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
                          </select>
                          {showVal && (
                            fieldDef?.type === 'select' && valueOptions.length > 0 ? (
                              opIsMulti(rule.operator) ? (
                                <MultiSelectDropdown
                                  options={valueOptions}
                                  value={rule.value}
                                  onChange={v => updateRule(group.id, rule.id, { value: v })}
                                />
                              ) : (
                                <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: rule.value ? '#ccac71' : '#555870', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                                  <option value="">Rechercher…</option>
                                  {valueOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                                </select>
                              )
                            ) : (
                              <input type="text" value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} placeholder="Valeur…" style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%' }} />
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <button onClick={() => addRuleToGroup(group.id)} style={{ marginTop: 8, padding: '6px 12px', background: 'transparent', border: '1px solid #1a2f45', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={11} /> Ajouter un filtre
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: filterGroups.length > 0 ? 12 : 0 }}>
              {filterGroups.length > 0 && (
                <>
                  <div style={{ flex: 1, height: 1, background: '#1a2f45' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555870' }}>ou</span>
                </>
              )}
              <button onClick={addFilterGroup} style={{ padding: '8px 14px', background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <Plus size={12} /> Ajouter un groupe de filtres
              </button>
            </div>
          </div>

          {/* Panel footer */}
          {totalFilterRules > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #1a2f45', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Update current view — shown when filters changed on a custom (non-default) view */}
              {crmViewChanged && activeCRMView && !activeCRMView.isDefault && (
                <button
                  onClick={() => { updateCRMViewFilters(activeViewId); }}
                  style={{ width: '100%', padding: '10px', background: 'rgba(76,171,219,0.12)', border: '1px solid rgba(76,171,219,0.35)', borderRadius: 8, color: '#4cabdb', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Save size={13} /> Mettre à jour « {activeCRMView.name} »
                </button>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setFilterGroups([]); applyGroupsToFilters([]); scheduleRefetch() }} style={{ flex: 1, padding: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Tout effacer
                </button>
                <button onClick={() => setCreatingView(true)} style={{ flex: 1, padding: '8px', background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, color: '#ccac71', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Nouvelle vue
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      </div>{/* end flex container (table + side panel) */}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d4a6b; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a5a7a; }
      `}</style>

      {/* ── Manage Views Modal ──────────────────────────────────────────────── */}
      {manageViewsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setManageViewsOpen(false)}
        >
          <div
            style={{ background: '#0d1a28', border: '1px solid #2d4a6b', borderRadius: 14, width: 420, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a2f45', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>Gérer les vues</span>
              <button onClick={() => setManageViewsOpen(false)} style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div style={{ overflow: 'auto', padding: '12px 16px', flex: 1 }}>
              {crmViews.filter(v => !v.isDefault).length === 0 ? (
                <p style={{ color: '#555870', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune vue personnalisée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {crmViews.filter(v => !v.isDefault).map(view => {
                    const isRenaming = renamingViewId === view.id
                    const ruleCount = view.groups.reduce((s, g) => s + g.rules.length, 0)
                    return (
                      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#101e30', border: '1px solid #1a2f45', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isRenaming ? (
                            <input
                              autoFocus
                              defaultValue={view.name}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { renameCRMView(view.id, (e.target as HTMLInputElement).value); }
                                if (e.key === 'Escape') setRenamingViewId(null)
                              }}
                              onBlur={e => renameCRMView(view.id, e.target.value)}
                              style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid #ccac71', borderRadius: 5, padding: '3px 8px', color: '#ccac71', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', width: '100%' }}
                            />
                          ) : (
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#c8cad8' }}>{view.name}</span>
                              {ruleCount > 0 && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: '#3a5070' }}>{ruleCount} filtre{ruleCount > 1 ? 's' : ''}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { setRenamingViewId(view.id); setRenameValue(view.name) }}
                          title="Renommer"
                          style={{ background: 'none', border: 'none', color: '#3a5070', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ccac71')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#3a5070')}
                        >
                          <Pen size={13} />
                        </button>
                        <button
                          onClick={() => { deleteCRMView(view.id); if (crmViews.filter(v => !v.isDefault).length <= 1) setManageViewsOpen(false) }}
                          title="Supprimer"
                          style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#555870')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #1a2f45' }}>
              <button
                onClick={() => setManageViewsOpen(false)}
                style={{ width: '100%', padding: '9px', background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 8, color: '#4cabdb', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CRM Edit Drawer ─────────────────────────────────────────────────── */}
      {drawerContact && (
        <CRMEditDrawer
          contact={drawerContact}
          closers={closers}
          telepros={telepros}
          onClose={() => setDrawerContact(null)}
          onRefresh={() => fetchContacts()}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value.toLocaleString('fr-FR')}</span>
      <span style={{ fontSize: 11, color: '#3a5070' }}>{label}</span>
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(204,172,113,0.1)',
      border: '1px solid rgba(204,172,113,0.25)',
      borderRadius: 20,
      padding: '2px 8px 2px 10px',
      fontSize: 11,
      color: '#ccac71',
      fontWeight: 600,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', color: '#ccac71', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.7, lineHeight: 1 }}
      >
        <X size={10} />
      </button>
    </span>
  )
}
