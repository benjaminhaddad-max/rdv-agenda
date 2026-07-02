'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, Search, X, ChevronLeft, ChevronRight, Check, SlidersHorizontal, Plus, Save, Clock } from 'lucide-react'
import CRMContactsTable, { type CRMContact, type ContactInlinePatch } from './CRMContactsTable'
import CRMEditDrawer from './CRMEditDrawer'
import { PARCOURSUP_VERDICT_OPTIONS } from '@/lib/parcoursup-verdict'
import { CRMFieldPicker, isCustomField, type CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'
import { MultiSelectDropdown, SearchableSelect } from '@/components/crm/CRMSelects'
import { fetchRecentContacts, saveRecentContact, clearRecentContactsRemote } from '@/lib/recent-contacts'
import {
  CRM_FILTER_FIELDS, opsForField, opsForKind, opNeedsValue, opIsMulti, opIsRange, propertyKindOf,
  defaultOpForField, shouldRenderMultiSelect, coerceMultiSelectOperator,
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
// Charte Diploma Santé 2026
const NAVY      = '#ffffff'      // bg page
const NAVY_BG   = '#f6f9fc'      // bg champs (bleu pâle charte) — ne PAS utiliser le bleu nuit pour le fond des inputs
const NAVY_BDR  = '#e5ddc8'      // bordures
const GOLD      = '#c6aa7c'      // doré charte
const BLUE      = '#4fabdb'      // bleu Diploma
const TEXT_DIM  = '#5b6b7a'      // texte secondaire (sur fond clair)
const TEXT_MID  = '#12314d'      // texte principal (bleu nuit charte) — pour la lisibilité

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
  '3165428980': { label: 'RDV Pris',              color: BLUE },
  '3165428981': { label: 'Délai Réflexion',       color: GOLD },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#4a6070' },
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
function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: value ? 'rgba(204,172,113,0.08)' : NAVY_BG,
          border: `1px solid ${value ? 'rgba(204,172,113,0.35)' : NAVY_BDR}`,
          borderRadius: 8,
          padding: '7px 30px 7px 10px',
          color: value ? GOLD : TEXT_MID,
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          minWidth: 130,
          fontWeight: value ? 600 : 400,
        }}
      >
        {children}
      </select>
      <span style={{
        position: 'absolute',
        right: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        color: TEXT_DIM,
        pointerEvents: 'none',
        fontSize: 10,
      }}>▾</span>
    </div>
  )
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
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.08)' : NAVY_BG,
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.35)' : NAVY_BDR}`,
          borderRadius: 8,
          padding: '7px 30px 7px 10px',
          color: isActive ? GOLD : TEXT_MID,
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          minWidth: 130,
          textAlign: 'left',
          fontWeight: isActive ? 600 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 220,
          width: '100%',
        }}
      >
        {label}
      </button>
      <span style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        color: TEXT_DIM, pointerEvents: 'none', fontSize: 10,
      }}>▾</span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 300,
          background: '#ffffff', border: `1px solid ${NAVY_BDR}`, borderRadius: 10,
          minWidth: 220, maxHeight: 300, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}>
          <div style={{ padding: 6, borderBottom: `1px solid ${NAVY_BDR}` }}>
            <input
              autoFocus
              type="text"
              placeholder="Rechercher…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', border: `1px solid ${NAVY_BDR}`, borderRadius: 6,
                padding: '5px 8px', fontSize: 12, color: TEXT_MID, outline: 'none',
                fontFamily: 'inherit', background: NAVY_BG,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setQuery('') }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', border: 'none',
              background: !isActive ? 'rgba(204,172,113,0.12)' : 'transparent',
              padding: '8px 12px', color: !isActive ? GOLD : TEXT_DIM, fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: !isActive ? 700 : 400,
            }}
          >
            {allLabel}
          </button>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: TEXT_DIM }}>Aucun résultat</div>
            )}
            {filtered.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                  color: TEXT_MID, border: 'none', textAlign: 'left', fontFamily: 'inherit',
                  background: selected.includes(opt) ? 'rgba(204,172,113,0.08)' : 'transparent',
                  fontWeight: selected.includes(opt) ? 600 : 400,
                }}
              >
                <span style={{
                  width: 15, height: 15, borderRadius: 3, flexShrink: 0,
                  border: selected.includes(opt) ? `2px solid ${GOLD}` : `2px solid ${TEXT_DIM}`,
                  background: selected.includes(opt) ? GOLD : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected.includes(opt) && <Check size={9} color="#ffffff" strokeWidth={3} />}
                </span>
                {opt}
              </button>
            ))}
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
  const inputStyle: React.CSSProperties = {
    background: '#f6f9fc', border: '1px solid #e5ddc8', borderRadius: 6,
    padding: '6px 8px', color: '#12314d', fontSize: 12, fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

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
        <select value={rule.value} onChange={e => onChange({ value: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
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
        <select value={rule.value} onChange={e => onChange({ value: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">{valueOptions.length === 0 ? 'Chargement…' : 'Sélectionner…'}</option>
          {valueOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </select>
      )
    }
    return <input type="text" value={rule.value} onChange={e => onChange({ value: e.target.value })} placeholder="Valeur…" style={inputStyle} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#f7f4ee', border: '1px solid #e5ddc8', borderRadius: 8, padding: '24px 10px 8px', position: 'relative' }}>
      <button
        type="button"
        onClick={onRemove}
        title="Supprimer ce filtre"
        style={{ position: 'absolute', top: 4, right: 4, background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 6, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, width: 22, height: 22, zIndex: 5 }}
      ><X size={13} /></button>
      <CRMFieldPicker
        value={rule.field}
        onChange={(field) => {
          const next = crmProps.find(p => 'custom:' + p.name === field)
          onChange({ field, operator: defaultOpForField(field, next), value: '' })
        }}
        crmProps={crmProps}
      />
      <select value={rule.operator} onChange={e => onChange({ operator: e.target.value as CRMFilterOp })} style={{ ...inputStyle, cursor: 'pointer' }}>
        {ops.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
      </select>
      {renderValueInput()}
      {unsupported && (
        <div style={{ fontSize: 10, color: '#ef4444' }}>
          Ce champ n&apos;est pas filtrable sur la liste des contacts.
        </div>
      )}
    </div>
  )
}

// ── Composant principal ──────────────────────────────────────────────────────
export default function UserCRMView({ ownerParam, ownerId, mode, assignedScopeOnly, onTotalChange, initialSourceFilter }: Props) {
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

  // mode='telepro' → filtres CONTACT ; mode='closer' → filtres TRANSACTION
  const isContactsView = mode === 'telepro'

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
  const [leadStatusOpts, setLeadStatusOpts] = useState<string[]>([])
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
  }, [ownerParam, ownerId, limit, page, sortBy, sortDir, debouncedSearch, filterStage, filterLeadStatus, filterFormation, filterSource, filterClasse, filterPeriod, filterZone, filterFormEvent, filterParcoursupVerdict, cfJson, isContactsView, onTotalChange, extraColumns, assignedScopeOnly])

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

  // Fetch field options (force-cache : profite du Cache-Control s-maxage=3600 côté CDN Vercel)
  useEffect(() => {
    fetch('/api/crm/field-options', { cache: 'force-cache' })
      .then(r => r.json())
      .then(d => {
        if (d.leadStatuses?.length) setLeadStatusOpts(d.leadStatuses)
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
    if (!activeView) return false
    return JSON.stringify(currentSnapshot) !== JSON.stringify(activeView.snapshot ?? {})
  }, [currentSnapshot, activeView])

  // Charge les vues privées de l'utilisateur (owner=me → invisibles des autres).
  useEffect(() => {
    fetch('/api/crm/views?scope=contacts&owner=me')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; name: string; filter_groups: unknown }>) => {
        if (!Array.isArray(rows)) return
        const loaded: UserSavedView[] = rows.map(r => ({
          id: r.id,
          name: r.name,
          snapshot: (r.filter_groups as UserViewSnapshot) ?? {},
        }))
        setViews([DEFAULT_USER_VIEW, ...loaded])
      })
      .catch(() => {})
  }, [])

  function applyView(view: UserSavedView) {
    const s = view.snapshot ?? {}
    setActiveViewId(view.id)
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
    const finalName = name || (views.find(v => v.id === id)?.name ?? '')
    setViews(prev => prev.map(v => (v.id === id ? { ...v, name: finalName } : v)))
    setRenamingViewId(null)
    void fetch(`/api/crm/views/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: finalName }),
    }).catch(() => {})
  }

  function saveActiveView() {
    if (!activeView || activeView.isDefault) return
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
  const totalPages = Math.max(1, Math.ceil(total / limit))

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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: NAVY,
    }}>

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '18px 24px 0',
        borderBottom: `1px solid ${NAVY_BDR}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0e1e35', display: 'flex', alignItems: 'center', gap: 8 }}>
              {ownerParam === 'closer_hs_id' ? '🎯 Mes Transactions' : (ownerParam === 'telepro_id' || ownerParam === 'telepro_hs_id' || ownerParam === 'telepro_owner_hs_id') ? '👥 Mes Contacts' : '👥 Mes Contacts'}
              {total > 0 && (
                <span style={{
                  background: 'rgba(76,171,219,0.15)',
                  border: '1px solid rgba(76,171,219,0.3)',
                  borderRadius: 20,
                  padding: '1px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: BLUE,
                }}>
                  {total}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>
              Contacts + transactions depuis HubSpot
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={openCreate}
              style={{
                background: GOLD,
                border: `1px solid ${GOLD}`,
                borderRadius: 8,
                padding: '7px 14px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              <Plus size={13} /> Créer un contact
            </button>
            <button
              onClick={() => { setPage(0); fetchContacts() }}
              disabled={loading}
              style={{
                background: '#12314d',
                border: '1px solid #12314d',
                borderRadius: 8,
                padding: '7px 14px',
                color: '#ffffff',
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontFamily: 'inherit',
                fontWeight: 600,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          </div>
        </div>

        {/* ── Barre d'onglets de vues (privées à l'utilisateur) ─────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12,
          borderBottom: `1px solid ${NAVY_BDR}`,
          overflowX: 'auto', overflowY: 'hidden',
        }}>
          {views.map(view => {
            const isActive = activeViewId === view.id
            const isRenaming = renamingViewId === view.id
            return (
              <div
                key={view.id}
                onClick={() => { if (!isRenaming) applyView(view) }}
                onDoubleClick={() => {
                  if (!view.isDefault) { setRenamingViewId(view.id); setRenameValue(view.name) }
                }}
                style={{
                  padding: '9px 14px',
                  borderBottom: `2px solid ${isActive ? GOLD : 'transparent'}`,
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
                      background: 'rgba(204,172,113,0.08)', border: `1px solid ${GOLD}`,
                      borderRadius: 4, padding: '2px 6px', color: GOLD,
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                      outline: 'none', width: Math.max(70, renameValue.length * 8),
                    }}
                  />
                ) : (
                  <span style={{
                    fontSize: 12, fontWeight: isActive ? 700 : 500,
                    color: isActive ? GOLD : TEXT_DIM,
                  }}>
                    {view.name}
                  </span>
                )}
                {!view.isDefault && isActive && !isRenaming && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteView(view.id) }}
                    title="Supprimer la vue"
                    style={{
                      background: 'none', border: 'none', padding: 0, marginLeft: 2,
                      color: TEXT_DIM, cursor: 'pointer', display: 'flex',
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )
          })}

          <div style={{ width: 1, height: 18, background: NAVY_BDR, margin: '0 6px', flexShrink: 0 }} />

          {/* Sauvegarder les filtres dans la vue active */}
          {viewChanged && !activeView?.isDefault && (
            <button
              onClick={saveActiveView}
              style={{
                padding: '5px 10px', background: 'rgba(204,172,113,0.08)',
                border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6,
                color: GOLD, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap', marginRight: 4, flexShrink: 0,
              }}
            >
              <Save size={11} /> Sauvegarder
            </button>
          )}

          {/* Créer une nouvelle vue */}
          {creatingView ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', flexShrink: 0 }}>
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
                  background: 'rgba(204,172,113,0.08)', border: `1px solid ${GOLD}`,
                  borderRadius: 4, padding: '3px 8px', color: GOLD,
                  fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 130,
                }}
              />
              <button
                onClick={() => createView(newViewName)}
                style={{ background: GOLD, border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex' }}
              >
                <Check size={12} color="#ffffff" />
              </button>
              <button
                onClick={() => { setCreatingView(false); setNewViewName('') }}
                style={{ background: 'none', border: 'none', padding: 0, color: TEXT_DIM, cursor: 'pointer', display: 'flex' }}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingView(true)}
              title="Enregistrer les filtres actuels comme une nouvelle vue privée"
              style={{
                padding: '7px 12px', background: 'none', border: 'none',
                color: TEXT_DIM, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'inherit',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <Plus size={12} /> Vue
            </button>
          )}
        </div>

        {/* ── Barre de filtres ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160, maxWidth: 280 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: TEXT_DIM, pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Rechercher…"
              style={{
                width: '100%',
                background: NAVY_BG,
                border: `1px solid ${search ? BLUE : NAVY_BDR}`,
                borderRadius: 8,
                padding: '7px 28px 7px 28px',
                color: '#0e1e35',
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
            />
            {search && (
              <button onClick={() => handleSearchChange('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: TEXT_DIM, cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={11} />
              </button>
            )}

            {/* Historique des derniers contacts ouverts — accès direct à la fiche */}
            {searchFocused && !search && recentContacts.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: `1px solid ${NAVY_BDR}`,
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(18,49,77,0.12)',
                  zIndex: 50,
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderBottom: `1px solid ${NAVY_BDR}` }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    <Clock size={11} /> Récemment consultés
                  </span>
                  <button
                    onMouseDown={e => { e.preventDefault(); clearRecentContacts() }}
                    style={{ background: 'none', border: 'none', color: TEXT_DIM, fontSize: 10.5, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                  >
                    Effacer
                  </button>
                </div>
                {recentContacts.map(c => (
                  <button
                    key={c.hubspot_contact_id}
                    onMouseDown={e => { e.preventDefault(); openDrawerAndRecord(c); setSearchFocused(false) }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 1,
                      padding: '7px 10px',
                      background: 'none',
                      border: 'none',
                      borderBottom: `1px solid ${NAVY_BG}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = NAVY_BG)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_MID }}>{contactDisplayName(c)}</span>
                    {(c.email || c.phone) && (
                      <span style={{ fontSize: 11, color: TEXT_DIM }}>{c.email || c.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

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

          {/* Formation demandée — options chargées à la volée */}
          <FilterSelect value={filterFormation} onChange={v => { setFilterFormation(v); setPage(0) }}>
            <option value="">Toutes formations</option>
            {formationOpts.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>

          {/* Période de création du contact */}
          <FilterSelect value={filterPeriod} onChange={v => { setFilterPeriod(v); setPage(0) }}>
            <option value="">Toutes les dates</option>
            <option value="7d">7 derniers jours</option>
            <option value="30d">30 derniers jours</option>
            <option value="90d">3 derniers mois</option>
            <option value="365d">12 derniers mois</option>
          </FilterSelect>

          {/* Verdict Parcoursup 2026 (telepro + closer) */}
          <FilterSelect value={filterParcoursupVerdict} onChange={v => { setFilterParcoursupVerdict(v); setPage(0) }}>
            <option value="">Tous les verdicts Parcoursup</option>
            {PARCOURSUP_VERDICT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </FilterSelect>

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
          <button
            onClick={() => setShowAdvanced(s => !s)}
            style={{
              background: (showAdvanced || activeAdvancedCount > 0) ? 'rgba(204,172,113,0.08)' : NAVY_BG,
              border: `1px solid ${(showAdvanced || activeAdvancedCount > 0) ? 'rgba(204,172,113,0.35)' : NAVY_BDR}`,
              borderRadius: 8,
              padding: '7px 12px',
              color: (showAdvanced || activeAdvancedCount > 0) ? GOLD : TEXT_MID,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: activeAdvancedCount > 0 ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <SlidersHorizontal size={12} /> Autres filtres{activeAdvancedCount > 0 ? ` · ${activeAdvancedCount}` : ''}
          </button>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              style={{
                background: 'transparent',
                border: `1px solid rgba(239,68,68,0.3)`,
                borderRadius: 8,
                padding: '7px 12px',
                color: '#ef4444',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <X size={11} /> Réinitialiser
            </button>
          )}

          {/* Enregistrer les filtres dans une vue.
              - Vue active perso modifiée → met à jour la vue.
              - Sinon (vue par défaut) avec filtres actifs → crée une nouvelle vue. */}
          {viewChanged && activeView && !activeView.isDefault ? (
            <button
              onClick={saveActiveView}
              style={{
                background: justSaved ? 'rgba(34,197,94,0.12)' : '#12314d',
                border: `1px solid ${justSaved ? 'rgba(34,197,94,0.4)' : '#12314d'}`,
                borderRadius: 8,
                padding: '7px 12px',
                color: justSaved ? '#16a34a' : '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {justSaved ? <Check size={12} /> : <Save size={12} />}
              {justSaved ? 'Enregistré' : 'Enregistrer la vue'}
            </button>
          ) : hasActiveFilters && (activeView?.isDefault ?? true) ? (
            <button
              onClick={() => { setCreatingView(true); setNewViewName('') }}
              style={{
                background: '#12314d',
                border: '1px solid #12314d',
                borderRadius: 8,
                padding: '7px 12px',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Save size={12} /> Enregistrer comme vue
            </button>
          ) : null}
        </div>

        {/* ── Panneau filtres avancés (toute propriété CRM) ──────────────── */}
        {showAdvanced && (
          <div style={{ paddingBottom: 14 }}>
            <div style={{
              background: '#ffffff', border: `1px solid ${NAVY_BDR}`, borderRadius: 10,
              padding: 12, maxWidth: 720,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MID, marginBottom: 8 }}>
                Filtrer sur n&apos;importe quelle propriété
              </div>
              {advancedRules.length === 0 && (
                <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8 }}>
                  Aucun filtre avancé. Ajoute une règle pour filtrer sur une propriété du CRM.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {advancedRules.map((rule, idx) => (
                  <div key={rule.id}>
                    {idx > 0 && <div style={{ fontSize: 11, color: TEXT_DIM, padding: '2px 0 6px 2px' }}>et</div>}
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
                onClick={addAdvancedRule}
                style={{
                  marginTop: 10, padding: '6px 12px', background: 'transparent',
                  border: `1px solid ${NAVY_BDR}`, borderRadius: 6, color: BLUE,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Plus size={11} /> Ajouter un filtre
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
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
        />
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderTop: `1px solid ${NAVY_BDR}`,
        flexShrink: 0,
        background: '#0b1929',
      }}>
        {/* Par page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>Par page :</span>
          {[25, 50, 100].map(n => (
            <button key={n} onClick={() => { setLimit(n); setPage(0) }}
              style={{
                background: limit === n ? 'rgba(204,172,113,0.12)' : 'transparent',
                border: `1px solid ${limit === n ? 'rgba(204,172,113,0.35)' : NAVY_BDR}`,
                borderRadius: 6,
                padding: '4px 10px',
                color: limit === n ? GOLD : TEXT_DIM,
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
                fontWeight: limit === n ? 700 : 400,
              }}
            >{n}</button>
          ))}
        </div>

        {/* Navigation pages */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: TEXT_MID }}>
            Page <strong style={{ color: '#0e1e35' }}>{page + 1}</strong> / {totalPages}
            <span style={{ color: TEXT_DIM, marginLeft: 8 }}>({total} contacts)</span>
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: NAVY_BG,
                border: `1px solid ${NAVY_BDR}`,
                borderRadius: 6,
                width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: page === 0 ? TEXT_DIM : TEXT_MID,
                cursor: page === 0 ? 'default' : 'pointer',
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                background: NAVY_BG,
                border: `1px solid ${NAVY_BDR}`,
                borderRadius: 6,
                width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: page >= totalPages - 1 ? TEXT_DIM : TEXT_MID,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
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
        const modalInput: React.CSSProperties = {
          width: '100%', background: NAVY_BG, border: `1px solid ${NAVY_BDR}`,
          borderRadius: 8, padding: '9px 11px', color: TEXT_MID, fontSize: 13,
          fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
        }
        const modalLabel: React.CSSProperties = {
          fontSize: 11, fontWeight: 700, color: TEXT_DIM, marginBottom: 5,
          display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em',
        }
        return (
          <div
            onClick={() => !creatingContact && setShowCreate(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(11,25,41,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff', border: `1px solid ${NAVY_BDR}`, borderRadius: 16,
                width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
                boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
              }}
            >
              {/* En-tête modale */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '18px 22px', borderBottom: `1px solid ${NAVY_BDR}`,
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0e1e35', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={17} style={{ color: GOLD }} /> Créer un nouveau contact
                </div>
                <button
                  onClick={() => !creatingContact && setShowCreate(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, display: 'flex', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Corps */}
              <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                    <select value={newClasse} onChange={e => setNewClasse(e.target.value)} style={{ ...modalInput, cursor: 'pointer' }}>
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
                    <select value={newOrigine} onChange={e => setNewOrigine(e.target.value)} style={{ ...modalInput, cursor: 'pointer' }}>
                      <option value="">— Aucune —</option>
                      {sourceOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabel}>Statut du lead *</label>
                    <select value={newLeadStatus} onChange={e => setNewLeadStatus(e.target.value)} style={{ ...modalInput, cursor: 'pointer' }}>
                      {leadStatusOpts.length === 0 && <option value="Nouveau">Nouveau</option>}
                      {leadStatusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabel}>Closer du contact</label>
                    <select value={newCloser} onChange={e => setNewCloser(e.target.value)} style={{ ...modalInput, cursor: 'pointer' }}>
                      {closerSelectOptions.map(o => <option key={o.id || 'none'} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={modalLabel}>Télépro</label>
                    <select value={newTelepro} onChange={e => setNewTelepro(e.target.value)} style={{ ...modalInput, cursor: 'pointer' }}>
                      {teleproSelectOptions.map((o, i) => <option key={`${o.id}-${i}`} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {createError && (
                  <div style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 8, padding: '9px 12px', color: '#ef4444', fontSize: 12,
                  }}>
                    {createError}
                  </div>
                )}
              </div>

              {/* Pied modale */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                padding: '16px 22px', borderTop: `1px solid ${NAVY_BDR}`,
              }}>
                <button
                  onClick={() => setShowCreate(false)}
                  disabled={creatingContact}
                  style={{
                    background: 'transparent', border: `1px solid ${NAVY_BDR}`, borderRadius: 8,
                    padding: '9px 18px', color: TEXT_MID, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={submitCreate}
                  disabled={creatingContact}
                  style={{
                    background: GOLD, border: `1px solid ${GOLD}`, borderRadius: 8,
                    padding: '9px 20px', color: '#ffffff', fontSize: 13, fontWeight: 700,
                    cursor: creatingContact ? 'default' : 'pointer', fontFamily: 'inherit',
                    opacity: creatingContact ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {creatingContact ? 'Création…' : <><Check size={14} /> Créer le contact</>}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
