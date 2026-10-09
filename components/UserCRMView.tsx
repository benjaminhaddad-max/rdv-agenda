'use client'

import { useState, useEffect, useCallback, useRef, useMemo, Children, isValidElement } from 'react'
import { RefreshCw, X, Check, SlidersHorizontal, Plus, Save, Clock } from 'lucide-react'
import CRMContactsTable, { type CRMContact, type ContactInlinePatch } from './CRMContactsTable'
import CRMEditDrawer from './CRMEditDrawer'
import { PARCOURSUP_VERDICT_OPTIONS } from '@/lib/parcoursup-verdict'
import { CRMFieldPicker, isCustomField, type CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'
import { MultiSelectDropdown, SearchableSelect, FilterSelect as V2PillSelect } from '@/components/crm/CRMSelects'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button, CrmV2Header } from '@/components/crm-v2/primitives'
import {
  V2ContactSearch, V2RoundButton, V2AdvancedFiltersLink, V2ToolbarLink, V2ContactsPager,
} from '@/components/crm-v2/contacts-list/ContactsListParts'
import {
  v2Field, v2NativeSelect, v2MenuPanel, v2Option, v2OptionHover, v2PillTrigger,
  V2Chevron, V2RoundCheck, V2MenuSearch, V2MenuEmpty, V2MenuDivider,
} from '@/components/crm-v2/filters/styles'
import { fetchRecentContacts, saveRecentContact, clearRecentContactsRemote } from '@/lib/recent-contacts'
import TeleproAddViewModal, { type CatalogViewOption } from '@/components/crm/TeleproAddViewModal'
import { persistAdminViewLayout } from '@/lib/crm-views'
import { isTopLevelCatalogId } from '@/lib/crm-admin-view-layout'
import {
  CRM_FILTER_FIELDS, opsForField, opsForKind, opNeedsValue, opIsMulti, opIsRange, propertyKindOf,
  defaultOpForField, shouldRenderMultiSelect, coerceMultiSelectOperator, LEAD_STATUS_OPTIONS_FALLBACK,
  type CRMFilterField, type CRMFilterOp, type SelectOption,
} from '@/lib/crm-constants'

// Règle de filtre avancé (filtre sur n'importe quelle propriété CRM).
type AdvancedRule = {
  id: string
  field: string          // 'custom:<name>' ou clé hardcodée (CRM_FILTER_FIELDS)
  operator: CRMFilterOp
  value: string
}

// ── Vues sauvegardées (privées à l'utilisateur) ──────────────────────────────
// Snapshot de l'état complet des filtres de la vue. Stocké tel quel dans la
// colonne JSONB crm_saved_views.filter_groups (owner_id = id de l'utilisateur).
type UserViewSnapshot = {
  search?: string
  stage?: string
  leadStatus?: string
  formation?: string
  source?: string
  classe?: string
  period?: string
  zone?: string
  formEvent?: string
  parcoursupVerdict?: string
  advancedRules?: AdvancedRule[]
}

interface UserSavedView {
  id: string
  name: string
  snapshot: UserViewSnapshot
  isDefault?: boolean
  /** Vue globale admin (ex. Recalif 2026) — lecture seule, filtres via view_id. */
  isShared?: boolean
}

const DEFAULT_USER_VIEW: UserSavedView = { id: 'all', name: 'Tous mes contacts', snapshot: {}, isDefault: true }

// Map clé hardcodée → colonne réelle de crm_contacts pour le moteur `cf`.
// Les clés absentes (étape de transaction, pipeline, etc.) ne sont pas des
// colonnes contact : on les ignore côté `cf` pour éviter toute erreur SQL.
const FIELD_TO_CF_COLUMN: Record<string, string> = {
  classe:      'classe_actuelle',
  zone:        'zone_localite',
  source:      'origine',
  lead_status: 'hs_lead_status',
  formation:   'formation_demandee',
  departement: 'departement',
  form_event:  'recent_conversion_event',
}

function ruleFieldToCfColumn(field: string): string | null {
  const custom = isCustomField(field)
  if (custom) return custom
  return FIELD_TO_CF_COLUMN[field] ?? null
}

// ── Constantes ──────────────────────────────────────────────────────────────
// Charte V2 (lib/crm-v2-theme.ts)
const NAVY_BDR  = crmV2.border      // bordures
const TEXT_DIM  = crmV2.textMuted   // texte secondaire
const TEXT_MID  = crmV2.text        // texte principal

const POLL_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_USER_VIEW_POLL_MS ?? '30000')
  return Number.isFinite(raw) && raw >= 10000 ? raw : 30000
})()
const SEARCH_DEBOUNCE_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_SEARCH_DEBOUNCE_MS ?? '180')
  return Number.isFinite(raw) && raw >= 80 ? raw : 180
})()

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: '#4cabdb' },
  '3165428981': { label: 'Délai Réflexion',       color: '#b8963e' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#7c98b6' },
}

interface RdvUser {
  id: string
  name: string
  role: string
  avatar_color?: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface Props {
  ownerParam: 'telepro_id' | 'telepro_hs_id' | 'telepro_owner_hs_id' | 'closer_hs_id' | 'contact_owner_hs_id'
  ownerId: string
  mode: 'closer' | 'telepro'
  /** Vue closer : n'afficher que les contacts où l'utilisateur est télépro OU closer du contact (pas propriétaire). */
  assignedScopeOnly?: boolean
  onTotalChange?: (n: number) => void
  initialSourceFilter?: string
}

// ── Styled select helper ─────────────────────────────────────────────────────
// Les <option> enfants sont convertis en options du menu pilule V2
// (FilterSelect de CRMSelects) : même contrat value / onChange qu'avant.
function optionText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(optionText).join('')
  return String(node)
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  const options: SelectOption[] = Children.toArray(children).flatMap(ch => {
    if (!isValidElement(ch) || ch.type !== 'option') return []
    const props = ch.props as { value?: string | number; children?: React.ReactNode }
    return [{ id: String(props.value ?? ''), label: optionText(props.children) }]
  })
  return <V2PillSelect value={value} onChange={onChange} options={options} />
}

// Multi-sélection (valeur = liste séparée par des virgules), même look que FilterSelect.
function MultiFilterSelect({
  value,
  onChange,
  options,
  allLabel,
  itemNoun = 'origines',
}: {
  value: string                 // CSV
  onChange: (v: string) => void
  options: string[]
  allLabel: string
  itemNoun?: string
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? value.split(',').filter(Boolean) : []
  const isActive = selected.length > 0

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
    onChange(next.join(','))
  }

  const label = !isActive
    ? allLabel
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ${itemNoun}`

  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={v2PillTrigger(isActive, open)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{label}</span>
        <V2Chevron open={open} size={13} color={isActive ? crmV2.link : crmV2.textFaint} />
      </button>
      {open && (
        <div style={{
          ...v2MenuPanel, minWidth: 240, maxWidth: 320, maxHeight: 340,
          display: 'flex', flexDirection: 'column',
        }}>
          <V2MenuSearch value={query} onChange={setQuery} />
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setQuery('') }}
            style={v2Option(!isActive)}
            {...v2OptionHover(!isActive)}
          >
            {allLabel}
          </button>
          <V2MenuDivider />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && <V2MenuEmpty>Aucun résultat</V2MenuEmpty>}
            {filtered.map(opt => {
              const on = selected.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  style={v2Option(on)}
                  {...v2OptionHover(on)}
                >
                  <V2RoundCheck on={on} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ligne de filtre avancé (toute propriété CRM) ─────────────────────────────
function AdvancedFilterRow({
  rule,
  crmProps,
  optionSets,
  onChange,
  onRemove,
}: {
  rule: AdvancedRule
  crmProps: CrmPropertyMeta[]
  optionSets: {
    leadStatus: SelectOption[]
    formation: SelectOption[]
    source: SelectOption[]
    zone: SelectOption[]
    formEvent: SelectOption[]
    classe: SelectOption[]
  }
  onChange: (patch: Partial<AdvancedRule>) => void
  onRemove: () => void
}) {
  const fieldDef = CRM_FILTER_FIELDS.find(f => f.key === rule.field)
  const customName = isCustomField(rule.field)
  const customProp = customName ? crmProps.find(p => p.name === customName) : null

  let kind: ReturnType<typeof propertyKindOf> = 'text'
  if (customProp) kind = propertyKindOf(customProp.type, customProp.field_type)
  else if (fieldDef?.type === 'select') kind = 'enum'

  const ops = customProp ? opsForKind(kind) : opsForField(rule.field as CRMFilterField)
  const showVal = opNeedsValue(rule.operator)
  const unsupported = ruleFieldToCfColumn(rule.field) === null

  // Options de valeur pour les champs enum.
  let valueOptions: SelectOption[] = []
  if (customProp && customProp.options && customProp.options.length > 0) {
    valueOptions = customProp.options.map(o => ({ id: o.value, label: o.label }))
  } else {
    switch (rule.field) {
      case 'classe':      valueOptions = optionSets.classe; break
      case 'lead_status': valueOptions = optionSets.leadStatus; break
      case 'formation':   valueOptions = optionSets.formation; break
      case 'source':      valueOptions = optionSets.source; break
      case 'zone':        valueOptions = optionSets.zone; break
      case 'form_event':  valueOptions = optionSets.formEvent; break
    }
  }

  const isRange = opIsRange(rule.operator)
  const [v1, v2] = isRange ? (rule.value || '').split('|') : [rule.value || '', '']
  const inputStyle: React.CSSProperties = v2Field

  const renderValueInput = () => {
    if (!showVal) return null
    if (kind === 'date' || kind === 'datetime') {
      const inputType = kind === 'datetime' ? 'datetime-local' : 'date'
      if (isRange) {
        return (
          <div style={{ display: 'flex', gap: 6 }}>
            <input type={inputType} value={v1} onChange={e => onChange({ value: `${e.target.value}|${v2}` })} style={{ ...inputStyle, flex: 1 }} />
            <input type={inputType} value={v2} onChange={e => onChange({ value: `${v1}|${e.target.value}` })} style={{ ...inputStyle, flex: 1 }} />
          </div>
        )
      }
      return <input type={inputType} value={rule.value} onChange={e => onChange({ value: e.target.value })} style={inputStyle} />
    }
    if (kind === 'number') {
      if (isRange) {
        return (
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" value={v1} onChange={e => onChange({ value: `${e.target.value}|${v2}` })} placeholder="Min" style={{ ...inputStyle, flex: 1 }} />
            <input type="number" value={v2} onChange={e => onChange({ value: `${v1}|${e.target.value}` })} placeholder="Max" style={{ ...inputStyle, flex: 1 }} />
          </div>
        )
      }
      return <input type="number" value={rule.value} onChange={e => onChange({ value: e.target.value })} placeholder="Valeur…" style={inputStyle} />
    }
    if (kind === 'bool') {
      return (
        <select value={rule.value} onChange={e => onChange({ value: e.target.value })} style={v2NativeSelect}>
          <option value="">Sélectionner…</option>
          <option value="true">Oui</option>
          <option value="false">Non</option>
        </select>
      )
    }
    if (kind === 'enum' || fieldDef?.type === 'select') {
      if (shouldRenderMultiSelect(rule.field, rule.operator)) {
        return (
          <MultiSelectDropdown
            options={valueOptions}
            value={rule.value}
            onChange={v => onChange({
              value: v,
              operator: coerceMultiSelectOperator(rule.field, rule.operator),
            })}
          />
        )
      }
      if (valueOptions.length > 20) {
        return <SearchableSelect options={valueOptions} value={rule.value} onChange={v => onChange({ value: v })} />
      }
      return (
        <select value={rule.value} onChange={e => onChange({ value: e.target.value })} style={v2NativeSelect}>
          <option value="">{valueOptions.length === 0 ? 'Chargement…' : 'Sélectionner…'}</option>
          {valueOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </select>
      )
    }
    return <input type="text" value={rule.value} onChange={e => onChange({ value: e.target.value })} placeholder="Valeur…" style={inputStyle} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '30px 10px 10px', position: 'relative' }}>
      <button
        type="button"
        onClick={onRemove}
        title="Supprimer ce filtre"
        aria-label="Supprimer ce filtre"
        style={{ position: 'absolute', top: 5, right: 5, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill, color: crmV2.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, width: 22, height: 22, zIndex: 5 }}
      ><X size={13} /></button>
      <CRMFieldPicker
        value={rule.field}
        onChange={(field) => {
          const next = crmProps.find(p => 'custom:' + p.name === field)
          onChange({ field, operator: defaultOpForField(field, next), value: '' })
        }}
        crmProps={crmProps}
      />
      <select value={rule.operator} onChange={e => onChange({ operator: e.target.value as CRMFilterOp })} style={v2NativeSelect}>
        {ops.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
      </select>
      {renderValueInput()}
      {unsupported && (
        <div style={{ fontSize: 11, color: '#d13a41' }}>
          Ce champ n&apos;est pas filtrable sur la liste des contacts.
        </div>
      )}
    </div>
  )
}

// ── Composant principal ──────────────────────────────────────────────────────
export default function UserCRMView({ ownerParam, ownerId, mode, assignedScopeOnly, onTotalChange, initialSourceFilter }: Props) {
  // ─ Présentation V2 (mobile, panneau de filtres, emplacement du bouton Colonnes)
  const isMobile = useIsMobile()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [columnsSlot, setColumnsSlot] = useState<HTMLDivElement | null>(null)

  // ─ Contacts
  const [contacts, setContacts]   = useState<CRMContact[]>([])
  const [loading, setLoading]     = useState(false)
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [limit, setLimit]         = useState(50)

  // ─ Filters
  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStage, setFilterStage]         = useState('')
  const [filterLeadStatus, setFilterLeadStatus] = useState('')
  const [filterFormation, setFilterFormation]   = useState('')
  const [filterSource, setFilterSource]         = useState(initialSourceFilter ?? '')
  const [filterParcoursupVerdict, setFilterParcoursupVerdict] = useState('')
  // Filtres spécifiques contacts (mode télépro : "Mes Contacts")
  const [filterClasse, setFilterClasse]         = useState('')
  const [filterPeriod, setFilterPeriod]         = useState('')
  const [filterZone, setFilterZone]             = useState('')
  const [filterFormEvent, setFilterFormEvent]   = useState('')
  // Filtres avancés : n'importe quelle propriété CRM (sérialisés vers `cf`).
  const [advancedRules, setAdvancedRules]       = useState<AdvancedRule[]>([])
  const [showAdvanced, setShowAdvanced]         = useState(false)

  // ─ Vues sauvegardées privées (propres à l'utilisateur, jamais partagées)
  const [views, setViews]                 = useState<UserSavedView[]>([DEFAULT_USER_VIEW])
  const [activeViewId, setActiveViewId]   = useState('all')
  const [creatingView, setCreatingView]   = useState(false)
  const [newViewName, setNewViewName]     = useState('')
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null)
  const [renameValue, setRenameValue]     = useState('')
  const [justSaved, setJustSaved]         = useState(false)
  const [addViewOpen, setAddViewOpen]     = useState(false)
  const [catalogViews, setCatalogViews]   = useState<CatalogViewOption[]>([])
  const [layoutViewIds, setLayoutViewIds] = useState<string[]>([])

  // mode='telepro' → filtres CONTACT ; mode='closer' → filtres TRANSACTION
  const isContactsView = mode === 'telepro'

  const activeSharedViewId = useMemo(() => {
    const v = views.find(x => x.id === activeViewId)
    return v?.isShared ? activeViewId : ''
  }, [views, activeViewId])

  // Sérialise les filtres avancés (propriétés arbitraires) vers le param `cf`.
  // On ignore les règles sans valeur (sauf is_empty / is_not_empty) et celles
  // dont le champ ne correspond pas à une colonne contact.
  const cfJson = useMemo(() => {
    const arr = advancedRules
      .map(r => {
        const col = ruleFieldToCfColumn(r.field)
        if (!col) return null
        if (!r.value && r.operator !== 'is_empty' && r.operator !== 'is_not_empty') return null
        return { field: col, operator: r.operator, value: r.value }
      })
      .filter((x): x is { field: string; operator: CRMFilterOp; value: string } => x !== null)
    return arr.length > 0 ? JSON.stringify(arr) : ''
  }, [advancedRules])

  // ─ Sort
  // Tri par defaut : date de creation du contact (du plus recent au plus ancien)
  // → les nouveaux leads remontent automatiquement en haut de la liste.
  const [sortBy, setSortBy]   = useState('createdat_contact')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ─ Drawer
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  // ─ Historique de recherche (par utilisateur) : derniers contacts ouverts.
  // Synchronisé en base (suit le compte sur tous les appareils). localStorage
  // sert de cache instantané + repli hors-ligne.
  const RECENT_MAX = 5
  const recentContext = `crm-${mode}`
  const recentStorageKey = `crm-recent-contacts-${mode}-${ownerId ?? 'anon'}`
  const [recentContacts, setRecentContacts] = useState<CRMContact[]>([])
  const [searchFocused, setSearchFocused] = useState(false)

  function cacheRecent(list: CRMContact[]) {
    try {
      localStorage.setItem(recentStorageKey, JSON.stringify(list))
    } catch {
      // ignore
    }
  }

  // 1) Cache local immédiat → 2) source de vérité serveur (compte).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(recentStorageKey)
      if (saved) setRecentContacts(JSON.parse(saved) as CRMContact[])
    } catch {
      // ignore
    }
    let cancelled = false
    fetchRecentContacts(recentContext).then(remote => {
      if (cancelled || remote === null) return
      setRecentContacts(remote as CRMContact[])
      cacheRecent(remote as CRMContact[])
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentContext, recentStorageKey])

  // Ouvre la fiche d'un contact et l'enregistre en tête de l'historique.
  const openDrawerAndRecord = useCallback((contact: CRMContact) => {
    setDrawerContact(contact)
    setRecentContacts(prev => {
      const next = [contact, ...prev.filter(c => c.hubspot_contact_id !== contact.hubspot_contact_id)].slice(0, RECENT_MAX)
      cacheRecent(next)
      return next
    })
    void saveRecentContact(recentContext, contact as unknown as { hubspot_contact_id: string })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentContext, recentStorageKey])

  function clearRecentContacts() {
    setRecentContacts([])
    cacheRecent([])
    void clearRecentContactsRemote(recentContext)
  }

  function contactDisplayName(c: CRMContact): string {
    const name = `${c.firstname ?? ''} ${c.lastname ?? ''}`.trim()
    return name || c.email || c.phone || `Contact #${c.hubspot_contact_id}`
  }

  // ─ Création d'un nouveau contact (closer + télépro)
  const [showCreate, setShowCreate]   = useState(false)
  const [creatingContact, setCreatingContact] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newLastname, setNewLastname]   = useState('')
  const [newFirstname, setNewFirstname] = useState('')
  const [newEmail, setNewEmail]         = useState('')
  const [newPhone, setNewPhone]         = useState('')
  const [newClasse, setNewClasse]       = useState('')
  const [newZone, setNewZone]           = useState('')
  const [newOrigine, setNewOrigine]     = useState('')
  const [newCloser, setNewCloser]       = useState('')
  const [newTelepro, setNewTelepro]     = useState('')
  const [newLeadStatus, setNewLeadStatus] = useState('Nouveau')

  // ─ Users (pour drawer)
  const [closers, setClosers]   = useState<RdvUser[]>([])
  const [telepros, setTelePros] = useState<RdvUser[]>([])

  // ─ Field options
  // Liste standard affichée tout de suite ; complétée par /api/crm/field-options
  // (valeurs réellement présentes en base) quand la réponse arrive.
  const [leadStatusOpts, setLeadStatusOpts] = useState<string[]>(() => LEAD_STATUS_OPTIONS_FALLBACK.map(o => o.id))
  const [formationOpts, setFormationOpts]   = useState<string[]>([])
  const [sourceOpts, setSourceOpts]         = useState<string[]>([])
  const [zoneOpts, setZoneOpts]             = useState<string[]>([])
  const [formEventOpts, setFormEventOpts]   = useState<string[]>([])
  const [allCrmProps, setAllCrmProps]       = useState<CrmPropertyMeta[]>([])
  const extraColsStorageKey = `crm-extra-columns-user-${mode}`
  const [extraColumns, setExtraColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(extraColsStorageKey)
      if (saved) return JSON.parse(saved) as string[]
    } catch {
      // ignore
    }
    return []
  })

  function persistExtraColumns(next: string[]) {
    setExtraColumns(next)
    try {
      localStorage.setItem(extraColsStorageKey, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contactsAbortRef = useRef<AbortController | null>(null)
  function handleSearchChange(v: string) {
    setSearch(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(v)
      setPage(0)
    }, SEARCH_DEBOUNCE_MS)
  }

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    if (!ownerId) return
    contactsAbortRef.current?.abort()
    const requestAbort = new AbortController()
    contactsAbortRef.current = requestAbort
    setLoading(true)
    try {
      const params = new URLSearchParams({
        [ownerParam]: ownerId,
        limit: String(limit),
        page: String(page),
        sort_by: sortBy,
        sort_dir: sortDir,
        exact_count: '1',
        no_cache: '1',
        all_classes: '1',     // afficher tous les leads, pas seulement les classes prioritaires
        show_external: '1',   // vue personnelle "Mes Contacts/Transactions" : on
                              // ne masque pas les contacts de l'équipe externe
                              // si le user en est le télépro/closer. L'exclusion
                              // équipe externe sert pour la vue admin globale,
                              // pas pour la vue personnelle d'un commercial.
      })
      if (debouncedSearch)    params.set('search',      debouncedSearch)
      if (!isContactsView && filterStage) params.set('stage', filterStage)
      if (filterLeadStatus)   params.set('lead_status', filterLeadStatus)
      if (filterFormation)    params.set('formation',   filterFormation)
      if (filterSource)       params.set('source',      filterSource)
      if (filterClasse)       params.set('classe',      filterClasse)
      if (filterPeriod)       params.set('period',      filterPeriod)
      if (filterZone)         params.set('zone',        filterZone)
      if (filterFormEvent)    params.set('form_event',  filterFormEvent)
      if (filterParcoursupVerdict) params.set('parcoursup_verdict', filterParcoursupVerdict)
      if (cfJson)             params.set('cf',          cfJson)
      if (extraColumns.length > 0) params.set('props', extraColumns.join(','))
      if (assignedScopeOnly) params.set('assigned_scope', '1')
      if (activeSharedViewId) params.set('view_id', activeSharedViewId)

      const res = await fetch(`/api/crm/contacts?${params}`, { signal: requestAbort.signal })
      if (res.ok) {
        const data = await res.json()
        setContacts(data.data ?? [])
        const t = data.total ?? 0
        setTotal(t)
        onTotalChange?.(t)
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        // garde l'etat precedent en cas d'erreur reseau
      }
    } finally {
      setLoading(false)
    }
  }, [ownerParam, ownerId, limit, page, sortBy, sortDir, debouncedSearch, filterStage, filterLeadStatus, filterFormation, filterSource, filterClasse, filterPeriod, filterZone, filterFormEvent, filterParcoursupVerdict, cfJson, isContactsView, onTotalChange, extraColumns, assignedScopeOnly, activeSharedViewId])

  useEffect(() => { fetchContacts() }, [fetchContacts])
  useEffect(() => () => contactsAbortRef.current?.abort(), [])

  // Keep the header badge in sync automatically, even when new leads arrive
  // in the background (without a manual refresh).
  const refreshTotalOnly = useCallback(async () => {
    if (!ownerId) return
    try {
      const params = new URLSearchParams({
        [ownerParam]: ownerId,
        limit: '0',
        exact_count: '1',
        no_cache: '1',
        all_classes: '1',
        show_external: '1',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (!isContactsView && filterStage) params.set('stage', filterStage)
      if (filterLeadStatus) params.set('lead_status', filterLeadStatus)
      if (filterFormation) params.set('formation', filterFormation)
      if (filterSource) params.set('source', filterSource)
      if (filterClasse) params.set('classe', filterClasse)
      if (filterPeriod) params.set('period', filterPeriod)
      if (filterZone) params.set('zone', filterZone)
      if (filterFormEvent) params.set('form_event', filterFormEvent)
      if (filterParcoursupVerdict) params.set('parcoursup_verdict', filterParcoursupVerdict)
      if (cfJson) params.set('cf', cfJson)
      if (assignedScopeOnly) params.set('assigned_scope', '1')
      if (activeSharedViewId) params.set('view_id', activeSharedViewId)

      const res = await fetch(`/api/crm/contacts?${params}`)
      if (!res.ok) return
      const data = await res.json()
      const t = data.total ?? 0
      setTotal(prev => (prev === t ? prev : t))
      onTotalChange?.(t)
    } catch {
      // Silent retry on next tick.
    }
  }, [
    ownerParam,
    ownerId,
    debouncedSearch,
    isContactsView,
    filterStage,
    filterLeadStatus,
    filterFormation,
    filterSource,
    filterClasse,
    filterPeriod,
    filterZone,
    filterFormEvent,
    filterParcoursupVerdict,
    cfJson,
    onTotalChange,
    assignedScopeOnly,
    activeSharedViewId,
  ])

  const handleContactPatched = useCallback((contactId: string, patch: ContactInlinePatch) => {
    setContacts(prev => prev.map(c => {
      if (c.hubspot_contact_id !== contactId) return c
      let next = c
      if (patch.contact) next = { ...next, ...patch.contact }
      if (patch.deal && next.deal) next = { ...next, deal: { ...next.deal, ...patch.deal } }
      return next
    }))
    void refreshTotalOnly()
  }, [refreshTotalOnly])

  useEffect(() => {
    setFilterSource(initialSourceFilter ?? '')
    setPage(0)
  }, [initialSourceFilter])

  useEffect(() => {
    if (!ownerId) return
    const tickMs = POLL_MS
    const id = setInterval(() => { void refreshTotalOnly() }, tickMs)
    const onFocus = () => { void refreshTotalOnly() }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshTotalOnly()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ownerId, refreshTotalOnly])

  // Fetch users pour CRMEditDrawer
  useEffect(() => {
    fetch('/api/users?roles=closer,admin,telepro')
      .then(r => r.json())
      .then((users: RdvUser[]) => {
        setClosers(users.filter(u => ['closer', 'admin'].includes(u.role)))
        setTelePros(users.filter(u => u.role === 'telepro'))
      })
      .catch(() => {})
  }, [])

  // Propriétés CRM dispo pour le picker de colonnes dynamiques.
  useEffect(() => {
    fetch('/api/crm/properties?object=contacts&limit=2000')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.properties)) setAllCrmProps(d.properties as CrmPropertyMeta[])
      })
      .catch(() => {})
  }, [])

  // Options des filtres (réponse immédiate : résultat enregistré côté serveur)
  useEffect(() => {
    fetch('/api/crm/field-options')
      .then(r => r.json())
      .then(d => {
        if (d.leadStatuses?.length) {
          setLeadStatusOpts(prev => [...prev, ...(d.leadStatuses as string[]).filter(v => !prev.includes(v))])
        }
        if (d.formations?.length)   setFormationOpts(d.formations)
        if (d.sources?.length)      setSourceOpts(d.sources)
        if (d.zones?.length)        setZoneOpts(d.zones)
        if (d.formEvents?.length)   setFormEventOpts(d.formEvents)
      })
      .catch(() => {})
  }, [])

  function handleSortChange(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
    setPage(0)
  }

  function resetFilters() {
    setFilterStage('')
    setFilterLeadStatus('')
    setFilterFormation('')
    setFilterSource(initialSourceFilter ?? '')
    setFilterClasse('')
    setFilterPeriod('')
    setFilterZone('')
    setFilterFormEvent('')
    setFilterParcoursupVerdict('')
    setAdvancedRules([])
    setSearch('')
    setDebouncedSearch('')
    setActiveViewId('all')
    setPage(0)
  }

  // ── Vues sauvegardées privées ───────────────────────────────────────────────
  // Snapshot de l'état courant des filtres (clés vides omises à la sérialisation).
  const currentSnapshot = useMemo<UserViewSnapshot>(() => ({
    search: search || undefined,
    stage: filterStage || undefined,
    leadStatus: filterLeadStatus || undefined,
    formation: filterFormation || undefined,
    source: filterSource || undefined,
    classe: filterClasse || undefined,
    period: filterPeriod || undefined,
    zone: filterZone || undefined,
    formEvent: filterFormEvent || undefined,
    parcoursupVerdict: filterParcoursupVerdict || undefined,
    advancedRules: advancedRules.length > 0 ? advancedRules : undefined,
  }), [search, filterStage, filterLeadStatus, filterFormation, filterSource, filterClasse, filterPeriod, filterZone, filterFormEvent, filterParcoursupVerdict, advancedRules])

  const activeView = views.find(v => v.id === activeViewId)
  const viewChanged = useMemo(() => {
    if (!activeView || activeView.isShared) return false
    return JSON.stringify(currentSnapshot) !== JSON.stringify(activeView.snapshot ?? {})
  }, [currentSnapshot, activeView])

  // Charge les vues privées + le catalogue admin (télépro, lecture seule).
  useEffect(() => {
    let cancelled = false
    const loadViews = async () => {
      try {
        const requests: Promise<Response>[] = [
          fetch('/api/crm/views?scope=contacts&owner=me'),
        ]
        if (mode === 'telepro') {
          requests.push(fetch('/api/crm/views?scope=contacts&shared=telepro'))
          requests.push(fetch('/api/crm/views/layout'))
        }
        const responses = await Promise.all(requests)
        if (cancelled) return

        const privateRows = responses[0]?.ok
          ? await responses[0].json() as Array<{ id: string; name: string; filter_groups: unknown }>
          : []
        const sharedRows = mode === 'telepro' && responses[1]?.ok
          ? await responses[1].json() as Array<{ id: string; name: string; parent_id?: string | null; kind?: string | null }>
          : []
        const layoutPayload = mode === 'telepro' && responses[2]?.ok
          ? await responses[2].json() as { view_ids?: string[] }
          : { view_ids: [] as string[] }

        const privateViews: UserSavedView[] = Array.isArray(privateRows)
          ? privateRows.map(r => ({
              id: r.id,
              name: r.name,
              snapshot: (r.filter_groups as UserViewSnapshot) ?? {},
            }))
          : []
        const catalog: CatalogViewOption[] = Array.isArray(sharedRows)
          ? sharedRows
              .filter(r => isTopLevelCatalogId(r.id, r.parent_id, r.kind) && !r.id.startsWith('alayout_'))
              .map(r => ({ id: r.id, name: r.name }))
          : []
        const pinnedIds = Array.isArray(layoutPayload?.view_ids)
          ? layoutPayload.view_ids.filter((id): id is string => typeof id === 'string')
          : []
        const catalogById = new Map(catalog.map(v => [v.id, v]))
        const sharedViews: UserSavedView[] = pinnedIds
          .map(id => catalogById.get(id))
          .filter((v): v is CatalogViewOption => !!v)
          .map(v => ({ id: v.id, name: v.name, snapshot: {}, isShared: true }))

        setCatalogViews(catalog)
        setLayoutViewIds(pinnedIds)
        setViews([DEFAULT_USER_VIEW, ...sharedViews, ...privateViews])
      } catch {
        // ignore
      }
    }
    void loadViews()
    return () => { cancelled = true }
  }, [mode])

  function applyView(view: UserSavedView) {
    setActiveViewId(view.id)
    if (view.isShared) {
      setSearch('')
      setDebouncedSearch('')
      setFilterStage('')
      setFilterLeadStatus('')
      setFilterFormation('')
      setFilterSource('')
      setFilterClasse('')
      setFilterPeriod('')
      setFilterZone('')
      setFilterFormEvent('')
      setFilterParcoursupVerdict('')
      setAdvancedRules([])
      setPage(0)
      return
    }
    const s = view.snapshot ?? {}
    setSearch(s.search ?? '')
    setDebouncedSearch(s.search ?? '')
    setFilterStage(s.stage ?? '')
    setFilterLeadStatus(s.leadStatus ?? '')
    setFilterFormation(s.formation ?? '')
    setFilterSource(s.source ?? '')
    setFilterClasse(s.classe ?? '')
    setFilterPeriod(s.period ?? '')
    setFilterZone(s.zone ?? '')
    setFilterFormEvent(s.formEvent ?? '')
    setFilterParcoursupVerdict(s.parcoursupVerdict ?? '')
    setAdvancedRules(s.advancedRules ?? [])
    if ((s.advancedRules ?? []).length > 0) setShowAdvanced(true)
    setPage(0)
  }

  function createView(name: string) {
    const id = `uv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const snapshot = currentSnapshot
    const newView: UserSavedView = { id, name: name || 'Nouvelle vue', snapshot }
    const position = views.filter(v => !v.isDefault).length
    setViews(prev => [...prev, newView])
    setActiveViewId(id)
    setCreatingView(false)
    setNewViewName('')
    void fetch('/api/crm/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: newView.name, filter_groups: snapshot, scope: 'contacts', owner: 'me', position }),
    }).catch(() => {})
  }

  function deleteView(id: string) {
    setViews(prev => prev.filter(v => v.id !== id))
    if (activeViewId === id) applyView(DEFAULT_USER_VIEW)
    void fetch(`/api/crm/views/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  function renameView(id: string, name: string) {
    const view = views.find(v => v.id === id)
    if (!view || view.isShared || view.isDefault) return
    const finalName = name.trim() || view.name
    setViews(prev => prev.map(v => (v.id === id ? { ...v, name: finalName } : v)))
    setRenamingViewId(null)
    void fetch(`/api/crm/views/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: finalName }),
    }).catch(() => {})
  }

  function pinSharedView(id: string) {
    if (layoutViewIds.includes(id)) return
    const next = [...layoutViewIds, id]
    setLayoutViewIds(next)
    void persistAdminViewLayout(next)
    const cat = catalogViews.find(v => v.id === id)
    if (!cat) return
    setViews(prev => {
      if (prev.some(v => v.id === id)) return prev
      const head = prev.filter(v => v.isDefault || v.isShared)
      const priv = prev.filter(v => !v.isDefault && !v.isShared)
      return [...head, { id: cat.id, name: cat.name, snapshot: {}, isShared: true }, ...priv]
    })
  }

  function unpinSharedView(id: string) {
    const next = layoutViewIds.filter(x => x !== id)
    setLayoutViewIds(next)
    void persistAdminViewLayout(next)
    setViews(prev => prev.filter(v => v.id !== id))
    if (activeViewId === id) applyView(DEFAULT_USER_VIEW)
  }

  function saveActiveView() {
    if (!activeView || activeView.isDefault || activeView.isShared) return
    const snapshot = currentSnapshot
    setViews(prev => prev.map(v => (v.id === activeViewId ? { ...v, snapshot } : v)))
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1800)
    void fetch(`/api/crm/views/${activeViewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter_groups: snapshot }),
    }).catch(() => {})
  }

  const activeAdvancedCount = advancedRules.filter(r => ruleFieldToCfColumn(r.field) !== null && (r.value || r.operator === 'is_empty' || r.operator === 'is_not_empty')).length
  const hasActiveFilters = !!(filterStage || filterLeadStatus || filterFormation || filterSource || filterClasse || filterPeriod || filterZone || filterFormEvent || filterParcoursupVerdict || activeAdvancedCount > 0 || debouncedSearch)

  // Options pour CRMContactsTable (inline editing)
  const leadStatusOptions = leadStatusOpts.map(v => ({ id: v, label: v }))
  const sourceOptions     = sourceOpts.map(v => ({ id: v, label: v }))

  // Jeux d'options pour les filtres avancés (champs enum hardcodés).
  const CLASSE_LIST = ['Troisième','Seconde','Première','Terminale','PASS','LSPS 1','LSPS 2','LSPS 3','LAS 1','LAS 2','LAS 3','Etudes médicales','Etudes Sup.','Autre']
  const advancedOptionSets = {
    leadStatus: leadStatusOpts.map(v => ({ id: v, label: v })),
    formation:  formationOpts.map(v => ({ id: v, label: v })),
    source:     sourceOpts.map(v => ({ id: v, label: v })),
    zone:       zoneOpts.map(v => ({ id: v, label: v })),
    formEvent:  formEventOpts.map(v => ({ id: v, label: v })),
    classe:     CLASSE_LIST.map(v => ({ id: v, label: v })),
  }

  function addAdvancedRule() {
    setShowAdvanced(true)
    const firstProp = allCrmProps[0]
    const defaultField = firstProp ? `custom:${firstProp.name}` : 'classe'
    const kind = firstProp ? propertyKindOf(firstProp.type, firstProp.field_type) : 'enum'
    const defaultOp = (opsForKind(kind)[0]?.key ?? 'is') as CRMFilterOp
    setAdvancedRules(prev => [
      ...prev,
      { id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, field: defaultField, operator: defaultOp, value: '' },
    ])
  }
  function updateAdvancedRule(id: string, patch: Partial<AdvancedRule>) {
    setAdvancedRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    setPage(0)
  }
  function removeAdvancedRule(id: string) {
    setAdvancedRules(prev => prev.filter(r => r.id !== id))
    setPage(0)
  }

  // ── Création d'un nouveau contact ────────────────────────────────────────
  // Préremplit le commercial courant (closer OU télépro) pour que le contact
  // créé apparaisse immédiatement dans « Mes Contacts ».
  function openCreate() {
    setCreateError(null)
    setNewLastname(''); setNewFirstname(''); setNewEmail(''); setNewPhone('')
    setNewClasse(''); setNewZone(''); setNewOrigine(''); setNewLeadStatus('Nouveau')
    if (mode === 'closer') {
      setNewCloser(ownerId || '')
      setNewTelepro('')
    } else {
      const me = telepros.find(u => u.id === ownerId)
      // telepro_user_id peut être bigint en base : on ne préremplit qu'avec un
      // identifiant HubSpot numérique (jamais l'UUID CRM).
      setNewTelepro(me ? (me.hubspot_owner_id || me.hubspot_user_id || '') : '')
      setNewCloser('')
    }
    setShowCreate(true)
  }

  async function submitCreate() {
    if (
      !newLastname.trim() || !newFirstname.trim() || !newEmail.trim() ||
      !newPhone.trim() || !newClasse || !newZone.trim()
    ) {
      setCreateError('Remplis tous les champs obligatoires (*).')
      return
    }
    setCreatingContact(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstname: newFirstname.trim(),
          lastname: newLastname.trim(),
          email: newEmail.trim(),
          phone: newPhone.trim(),
          classe_actuelle: newClasse,
          zone_localite: newZone.trim(),
          origine: newOrigine || undefined,
          hs_lead_status: newLeadStatus || undefined,
          closer_du_contact_owner_id: newCloser || undefined,
          telepro_user_id: newTelepro || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setCreateError(data.error || 'Erreur lors de la création'); return }
      if (data.existed) { setCreateError('Un contact existe déjà avec cet email.'); return }
      setShowCreate(false)
      setPage(0)
      await fetchContacts()
      void refreshTotalOnly()
    } catch {
      setCreateError('Erreur réseau')
    } finally {
      setCreatingContact(false)
    }
  }
  const closerSelectOptions = [
    { id: '', label: '— Aucun —' },
    ...closers.map(u => ({ id: u.hubspot_owner_id || u.id, label: u.name })),
  ]
  // Le champ crm_contacts.telepro_user_id peut contenir soit le hubspot_user_id,
  // soit le hubspot_owner_id (selon la source : sync vs assignation manuelle vs
  // deal.teleprospecteur). On ajoute donc les 2 IDs comme entrées séparées
  // (même label) pour que le lookup par ID fonctionne dans tous les cas.
  const teleproSelectOptions = [
    { id: '', label: '— Aucun —' },
    ...telepros.flatMap(u => {
      const opts: { id: string; label: string }[] = []
      if (u.hubspot_owner_id) opts.push({ id: u.hubspot_owner_id, label: u.name })
      if (u.hubspot_user_id && u.hubspot_user_id !== u.hubspot_owner_id) opts.push({ id: u.hubspot_user_id, label: u.name })
      if (opts.length === 0) opts.push({ id: u.id, label: u.name })
      return opts
    }),
  ]

  const isTransactionsTitle = ownerParam === 'closer_hs_id'
  const quickFilterCount = [filterStage, filterLeadStatus, filterFormation, filterSource, filterClasse, filterPeriod, filterZone, filterFormEvent, filterParcoursupVerdict]
    .filter(Boolean).length + activeAdvancedCount

  // Recherche pilule + historique des derniers contacts ouverts
  const searchBox = (
    <div style={{ position: 'relative', flex: isMobile ? 1 : '0 1 280px', minWidth: isMobile ? 0 : 220 }}>
      <div
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
      >
        <V2ContactSearch
          value={search}
          onChange={handleSearchChange}
          height={isMobile ? 42 : 36}
          style={search ? { borderColor: crmV2.link } : undefined}
        />
      </div>

      {/* Historique des derniers contacts ouverts — accès direct à la fiche */}
      {searchFocused && !search && recentContacts.length > 0 && (
        <div
          style={{
            ...v2MenuPanel,
            right: 0,
            zIndex: 50,
            padding: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              <Clock size={14} /> Récemment consultés
            </span>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); clearRecentContacts() }}
              style={{ background: 'none', border: 'none', color: crmV2.link, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              Effacer
            </button>
          </div>
          {recentContacts.map(c => (
            <button
              key={c.hubspot_contact_id}
              type="button"
              onMouseDown={e => { e.preventDefault(); openDrawerAndRecord(c); setSearchFocused(false) }}
              style={{
                width: '100%',
                minHeight: 40,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-start',
                gap: 1,
                padding: '6px 10px',
                background: 'none',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = crmV2.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MID }}>{contactDisplayName(c)}</span>
              {(c.email || c.phone) && (
                <span style={{ fontSize: 12, color: TEXT_DIM }}>{c.email || c.phone}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // Filtres pilules (télépro + closer)
  const filterPills = (
    <>
      {/* ── Filtres prioritaires (télépro + closer) ───────────────────
          Ordre métier : Classe actuelle · Zone localité · Origine ·
          Soumission de formulaire · Statut du lead. */}

      {/* 1. Classe actuelle — propriété du contact */}
      <FilterSelect value={filterClasse} onChange={v => { setFilterClasse(v); setPage(0) }}>
        <option value="">Toutes les classes</option>
        {['Troisième','Seconde','Première','Terminale','PASS','LSPS 1','LSPS 2','LSPS 3','LAS 1','LAS 2','LAS 3','Etudes médicales','Etudes Sup.','Autre'].map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </FilterSelect>

      {/* 2. Zone localité (multi-sélection) */}
      <MultiFilterSelect
        value={filterZone}
        onChange={v => { setFilterZone(v); setPage(0) }}
        options={zoneOpts}
        allLabel="Toutes les zones"
        itemNoun="zones"
      />

      {/* 3. Origine (multi-sélection) */}
      <MultiFilterSelect
        value={filterSource}
        onChange={v => { setFilterSource(v); setPage(0) }}
        options={sourceOpts}
        allLabel="Toutes les origines"
      />

      {/* 4. Soumission de formulaire (multi-sélection) */}
      <MultiFilterSelect
        value={filterFormEvent}
        onChange={v => { setFilterFormEvent(v); setPage(0) }}
        options={formEventOpts}
        allLabel="Soumission de formulaire"
        itemNoun="formulaires"
      />

      {/* 5. Statut du lead — options peuplées depuis /api/crm/field-options */}
      <FilterSelect value={filterLeadStatus} onChange={v => { setFilterLeadStatus(v); setPage(0) }}>
        <option value="">Statut du lead</option>
        {leadStatusOpts.map(v => <option key={v} value={v}>{v}</option>)}
      </FilterSelect>

      {/* ── Filtres secondaires ──────────────────────────────────────── */}

      {/* Formation demandée — options chargées à la volée (pas côté télépro) */}
      {mode !== 'telepro' && (
        <FilterSelect value={filterFormation} onChange={v => { setFilterFormation(v); setPage(0) }}>
          <option value="">Toutes formations</option>
          {formationOpts.map(v => <option key={v} value={v}>{v}</option>)}
        </FilterSelect>
      )}

      {/* Période de création du contact */}
      <FilterSelect value={filterPeriod} onChange={v => { setFilterPeriod(v); setPage(0) }}>
        <option value="">Toutes les dates</option>
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="90d">3 derniers mois</option>
        <option value="365d">12 derniers mois</option>
      </FilterSelect>

      {/* Verdict Parcoursup 2026 (closer seulement : inutile côté télépro) */}
      {mode !== 'telepro' && (
        <FilterSelect value={filterParcoursupVerdict} onChange={v => { setFilterParcoursupVerdict(v); setPage(0) }}>
          <option value="">Tous les verdicts Parcoursup</option>
          {PARCOURSUP_VERDICT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </FilterSelect>
      )}

      {/* Étape de transaction (mode closer "Mes Transactions") */}
      {!isContactsView && (
        <FilterSelect value={filterStage} onChange={v => { setFilterStage(v); setPage(0) }}>
          <option value="">Toutes les étapes</option>
          {Object.entries(STAGE_MAP).map(([id, s]) => (
            <option key={id} value={id}>{s.label}</option>
          ))}
        </FilterSelect>
      )}

      {/* Autres filtres — toute propriété CRM */}
      <V2AdvancedFiltersLink count={activeAdvancedCount} open={showAdvanced} onClick={() => setShowAdvanced(s => !s)} />

      {/* Reset */}
      {hasActiveFilters && (
        <V2ToolbarLink onClick={resetFilters} tone="danger" icon={<X size={14} />}>
          Réinitialiser
        </V2ToolbarLink>
      )}

      {/* Enregistrer les filtres dans une vue.
          - Vue active perso modifiée → met à jour la vue.
          - Sinon (vue par défaut) avec filtres actifs → crée une nouvelle vue. */}
      {viewChanged && activeView && !activeView.isDefault ? (
        <V2ToolbarLink
          onClick={saveActiveView}
          tone={justSaved ? 'muted' : 'gold'}
          icon={justSaved ? <Check size={14} color={crmV2.successStrong} /> : <Save size={14} />}
        >
          {justSaved ? 'Enregistré' : 'Enregistrer la vue'}
        </V2ToolbarLink>
      ) : hasActiveFilters && (activeView?.isDefault ?? true) && mode !== 'telepro' ? (
        <V2ToolbarLink onClick={() => { setCreatingView(true); setNewViewName('') }} tone="gold" icon={<Save size={14} />}>
          Enregistrer comme vue
        </V2ToolbarLink>
      ) : null}
    </>
  )

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      fontFamily: 'inherit',
      background: crmV2.bgSoft,
      color: crmV2.text,
    }}>

      {/* ── En-tête blanc : titre, compteur, actions, onglets de vues ───── */}
      <CrmV2Header
        title={isTransactionsTitle ? 'Mes Transactions' : 'Mes Contacts'}
        subtitle={total > 0
          ? `${total.toLocaleString('fr-FR')} contact${total > 1 ? 's' : ''} · contacts et transactions`
          : 'Contacts et transactions'}
        actions={
          <>
            <CrmV2Button
              onClick={() => { setPage(0); fetchContacts() }}
              disabled={loading}
              icon={<RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />}
            >
              {loading ? 'Chargement…' : 'Actualiser'}
            </CrmV2Button>
            <CrmV2Button variant="primary" onClick={openCreate} icon={<Plus size={14} />}>
              Créer un contact
            </CrmV2Button>
          </>
        }
      >
        {/* ── Onglets de vues (privées à l'utilisateur) ─────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          margin: isMobile ? '0 -12px' : '0 -28px', padding: isMobile ? '0 12px' : '0 28px',
          overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
        }}>
          {views.map(view => {
            const isActive = activeViewId === view.id
            const isRenaming = renamingViewId === view.id
            return (
              <div
                key={view.id}
                onClick={() => { if (!isRenaming) applyView(view) }}
                onDoubleClick={() => {
                  if (!view.isDefault && !view.isShared) { setRenamingViewId(view.id); setRenameValue(view.name) }
                }}
                style={{
                  padding: isMobile ? '10px 12px' : '10px 14px',
                  borderBottom: `3px solid ${isActive ? crmV2.text : 'transparent'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap', flexShrink: 0,
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
                      background: crmV2.bg, border: `1px solid ${crmV2.gold}`,
                      borderRadius: crmV2.radiusPill, padding: '3px 10px', color: crmV2.text,
                      fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      outline: 'none', width: Math.max(80, renameValue.length * 8),
                    }}
                  />
                ) : (
                  <span style={{
                    fontSize: 14, fontWeight: isActive ? 600 : 500,
                    color: isActive ? crmV2.text : crmV2.textMuted,
                  }}>
                    {view.name}
                  </span>
                )}
                {!view.isDefault && isActive && !isRenaming && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      if (view.isShared) unpinSharedView(view.id)
                      else deleteView(view.id)
                    }}
                    title={view.isShared ? 'Retirer de mes onglets' : 'Supprimer la vue'}
                    aria-label={view.isShared ? 'Retirer de mes onglets' : 'Supprimer la vue'}
                    style={{
                      background: 'none', border: 'none', padding: 0, marginLeft: 2,
                      color: crmV2.textFaint, cursor: 'pointer', display: 'flex',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )
          })}

          <div style={{ width: 1, height: 18, background: NAVY_BDR, margin: '0 6px', flexShrink: 0 }} />

          {/* Sauvegarder les filtres dans la vue active */}
          {viewChanged && !activeView?.isDefault && (
            <button
              type="button"
              onClick={saveActiveView}
              style={{
                height: 28, padding: '0 12px', background: crmV2.goldSoft,
                border: `1px solid ${crmV2.goldBorder}`, borderRadius: crmV2.radiusPill,
                color: crmV2.goldDark, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                whiteSpace: 'nowrap', marginRight: 4, flexShrink: 0,
              }}
            >
              <Save size={14} /> Sauvegarder
            </button>
          )}

          {/* Créer une nouvelle vue */}
          {creatingView ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', flexShrink: 0 }}>
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
                  background: crmV2.bg, border: `1px solid ${crmV2.gold}`,
                  borderRadius: crmV2.radiusPill, padding: '4px 12px', color: crmV2.text,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 140,
                }}
              />
              <button
                type="button"
                onClick={() => createView(newViewName)}
                aria-label="Créer la vue"
                style={{ background: crmV2.primary, border: 'none', borderRadius: crmV2.radiusPill, width: 26, height: 26, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Check size={14} color="#ffffff" />
              </button>
              <button
                type="button"
                onClick={() => { setCreatingView(false); setNewViewName('') }}
                aria-label="Annuler"
                style={{ background: 'none', border: 'none', padding: 0, color: TEXT_DIM, cursor: 'pointer', display: 'flex' }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => mode === 'telepro' ? setAddViewOpen(true) : setCreatingView(true)}
              title={mode === 'telepro'
                ? 'Ajouter une vue existante créée en admin'
                : 'Enregistrer les filtres actuels comme une nouvelle vue privée'}
              style={{
                padding: '10px 12px', background: 'none', border: 'none',
                color: crmV2.link, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <Plus size={14} /> {mode === 'telepro' ? 'Ajouter' : 'Vue'}
            </button>
          )}
        </div>
      </CrmV2Header>

      {/* ── Corps : carte tableau ─────────────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column',
        padding: isMobile ? '10px 10px 0' : '16px 28px 20px', gap: isMobile ? 8 : 0,
      }}>
        {/* Mobile : recherche + bouton filtres avec compteur */}
        {isMobile && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {searchBox}
            <V2RoundButton
              size={42}
              title="Filtres"
              active={mobileFiltersOpen}
              badge={quickFilterCount}
              onClick={() => setMobileFiltersOpen(o => !o)}
            >
              <SlidersHorizontal size={16} />
            </V2RoundButton>
          </div>
        )}
        {isMobile && mobileFiltersOpen && (
          <div style={{
            flexShrink: 0, background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
            padding: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            {filterPills}
          </div>
        )}

        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0,
          ...(isMobile ? {} : {
            background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
            boxShadow: crmV2.shadow, overflow: 'hidden',
          }),
        }}>
          {/* Barre d'outils : recherche, filtres pilules, Autres filtres, Colonnes */}
          {!isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', flexWrap: 'wrap',
              borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0,
            }}>
              {searchBox}
              {filterPills}
              <div style={{ flex: 1 }} />
              {/* Bouton « Colonnes » rendu ici par CRMContactsTable (portail) */}
              <div ref={setColumnsSlot} />
            </div>
          )}

          {/* ── Panneau filtres avancés (toute propriété CRM) ──────────────── */}
          {showAdvanced && (
            <div style={{
              flexShrink: 0, maxHeight: '45vh', overflowY: 'auto',
              padding: isMobile ? '0 0 4px' : '12px 14px', borderBottom: isMobile ? 'none' : `1px solid ${crmV2.border}`,
            }}>
              <div style={{
                background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12,
                padding: 12, maxWidth: 720,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Filtrer sur n&apos;importe quelle propriété
                </div>
                {advancedRules.length === 0 && (
                  <div style={{ fontSize: 13, color: crmV2.textFaint, marginBottom: 8 }}>
                    Aucun filtre avancé. Ajoute une règle pour filtrer sur une propriété du CRM.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {advancedRules.map((rule, idx) => (
                    <div key={rule.id}>
                      {idx > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textFaint, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '2px 0 6px 4px' }}>et</div>}
                      <AdvancedFilterRow
                        rule={rule}
                        crmProps={allCrmProps}
                        optionSets={advancedOptionSets}
                        onChange={patch => updateAdvancedRule(rule.id, patch)}
                        onRemove={() => removeAdvancedRule(rule.id)}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addAdvancedRule}
                  style={{
                    marginTop: 10, height: 34, padding: '0 14px', background: crmV2.bg,
                    border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill, color: crmV2.link,
                    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Plus size={14} /> Ajouter un filtre
                </button>
              </div>
            </div>
          )}

          {/* ── Table ─────────────────────────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <CRMContactsTable
              contacts={contacts}
              loading={loading}
              mode={mode}
              onRefresh={fetchContacts}
              onContactPatched={handleContactPatched}
              onOpenDrawer={openDrawerAndRecord}
              leadStatusOptions={leadStatusOptions}
              sourceOptions={sourceOptions}
              closerSelectOptions={closerSelectOptions}
              teleproSelectOptions={teleproSelectOptions}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={handleSortChange}
              allCrmProps={allCrmProps}
              extraColumns={extraColumns}
              onExtraColumnsChange={persistExtraColumns}
              columnsMenuSlot={isMobile ? null : columnsSlot}
            />
            {isMobile && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                padding: '12px 4px 20px', fontSize: 13, color: crmV2.textMuted,
              }}>
                <V2ContactsPager
                  page={page}
                  limit={limit}
                  total={total}
                  onPage={setPage}
                  onLimit={n => { setLimit(n); setPage(0) }}
                  compact
                />
              </div>
            )}
          </div>

          {/* ── Pagination ──────────────────────────────────────────────────── */}
          {!isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              padding: '10px 14px', borderTop: `1px solid ${crmV2.border}`, fontSize: 13, color: crmV2.textMuted, flexShrink: 0,
            }}>
              <V2ContactsPager
                page={page}
                limit={limit}
                total={total}
                onPage={setPage}
                onLimit={n => { setLimit(n); setPage(0) }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── CRMEditDrawer ───────────────────────────────────────────────── */}
      {drawerContact && (
        <CRMEditDrawer
          contact={drawerContact}
          closers={closers as any}
          telepros={telepros as any}
          onClose={() => setDrawerContact(null)}
          onRefresh={fetchContacts}
          preloadedLeadStatuses={leadStatusOpts}
          preloadedFormations={formationOpts}
          preloadedSources={sourceOpts}
          preloadedZones={zoneOpts}
        />
      )}

      {/* ── Modale : Créer un nouveau contact ───────────────────────────── */}
      {showCreate && (() => {
        const modalInput: React.CSSProperties = v2Field
        const modalLabel: React.CSSProperties = {
          fontSize: 12, fontWeight: 700, color: TEXT_DIM, marginBottom: 6, display: 'block',
        }
        return (
          <div
            onClick={() => !creatingContact && setShowCreate(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,31,61,0.45)',
              display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: crmV2.bg, border: `1px solid ${NAVY_BDR}`,
                borderRadius: isMobile ? '22px 22px 0 0' : 20,
                width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
                boxShadow: crmV2.shadowPanel,
              }}
            >
              {/* En-tête modale */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '16px 16px' : '18px 22px', borderBottom: `1px solid ${NAVY_BDR}`,
              }}>
                <div style={{ fontSize: 17, fontWeight: 600, color: TEXT_MID, display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.01em' }}>
                  <Plus size={18} style={{ color: crmV2.gold }} /> Créer un nouveau contact
                </div>
                <button
                  onClick={() => !creatingContact && setShowCreate(false)}
                  aria-label="Fermer"
                  style={{ background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusPill, cursor: 'pointer', color: TEXT_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Corps */}
              <div style={{ padding: isMobile ? 16 : 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={modalLabel}>Nom *</label>
                    <input value={newLastname} onChange={e => setNewLastname(e.target.value)} placeholder="Nom" style={modalInput} />
                  </div>
                  <div>
                    <label style={modalLabel}>Prénom *</label>
                    <input value={newFirstname} onChange={e => setNewFirstname(e.target.value)} placeholder="Prénom" style={modalInput} />
                  </div>
                  <div>
                    <label style={modalLabel}>Mail *</label>
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemple.com" style={modalInput} />
                  </div>
                  <div>
                    <label style={modalLabel}>Tél *</label>
                    <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+33 6 00 00 00 00" style={modalInput} />
                  </div>
                  <div>
                    <label style={modalLabel}>Classe actuelle *</label>
                    <select value={newClasse} onChange={e => setNewClasse(e.target.value)} style={v2NativeSelect}>
                      <option value="">Sélectionner…</option>
                      {CLASSE_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabel}>Zone / localité *</label>
                    <input
                      list="crm-create-zones"
                      value={newZone}
                      onChange={e => setNewZone(e.target.value)}
                      placeholder="ex : Paris, 75, IDF…"
                      style={modalInput}
                    />
                    <datalist id="crm-create-zones">
                      {zoneOpts.map(z => <option key={z} value={z} />)}
                    </datalist>
                  </div>
                  <div>
                    <label style={modalLabel}>Origine</label>
                    <select value={newOrigine} onChange={e => setNewOrigine(e.target.value)} style={v2NativeSelect}>
                      <option value="">— Aucune —</option>
                      {sourceOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabel}>Statut du lead *</label>
                    <select value={newLeadStatus} onChange={e => setNewLeadStatus(e.target.value)} style={v2NativeSelect}>
                      {leadStatusOpts.length === 0 && <option value="Nouveau">Nouveau</option>}
                      {leadStatusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabel}>Closer du contact</label>
                    <select value={newCloser} onChange={e => setNewCloser(e.target.value)} style={v2NativeSelect}>
                      {closerSelectOptions.map(o => <option key={o.id || 'none'} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabel}>Télépro</label>
                    <select value={newTelepro} onChange={e => setNewTelepro(e.target.value)} style={v2NativeSelect}>
                      {teleproSelectOptions.map((o, i) => <option key={`${o.id}-${i}`} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {createError && (
                  <div style={{
                    background: crmV2.dangerSoft, border: '1px solid rgba(242,84,91,0.30)',
                    borderRadius: crmV2.radius, padding: '9px 12px', color: '#d13a41', fontSize: 13,
                  }}>
                    {createError}
                  </div>
                )}
              </div>

              {/* Pied modale */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                padding: isMobile ? '12px 16px 16px' : '16px 22px', borderTop: `1px solid ${NAVY_BDR}`,
              }}>
                <CrmV2Button onClick={() => setShowCreate(false)} disabled={creatingContact}>
                  Annuler
                </CrmV2Button>
                <CrmV2Button
                  variant="primary"
                  onClick={submitCreate}
                  disabled={creatingContact}
                  icon={creatingContact ? undefined : <Check size={14} />}
                >
                  {creatingContact ? 'Création…' : 'Créer le contact'}
                </CrmV2Button>
              </div>
            </div>
          </div>
        )
      })()}
      {mode === 'telepro' && addViewOpen && (
        <TeleproAddViewModal
          catalogViews={catalogViews}
          layoutViewIds={layoutViewIds}
          onClose={() => setAddViewOpen(false)}
          onPin={pinSharedView}
          onUnpin={unpinSharedView}
        />
      )}
    </div>
  )
}
