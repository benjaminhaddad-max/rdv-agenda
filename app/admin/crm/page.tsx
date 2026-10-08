'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { LayoutDashboard, X, ChevronDown, List, GraduationCap, SlidersHorizontal, Plus, Save, Check, Trash2, Copy, Pen, Download, Upload, AlertTriangle, BookOpen, Pencil, Layers, SquareCheck, ChevronRight } from 'lucide-react'
import CRMContactsTable, { CRMContact, type ContactInlinePatch } from '@/components/CRMContactsTable'
import LogoutButton from '@/components/LogoutButton'
import { validateEmailDomain } from '@/lib/email-validation'
import { usePageTitle } from '@/components/DocumentTitle'

// ── Lazy-loaded modals / panels ──────────────────────────────────────────────
// Composants ouverts conditionnellement (drawers, modals d'outils). Charges a
// la demande -> bundle initial bien plus leger, premier paint plus rapide.
const CRMEditDrawer = dynamic(() => import('@/components/CRMEditDrawer'), { ssr: false })
const RepopJournal = dynamic(() => import('@/components/RepopJournal'), { ssr: false })
import {
  CURRENT_PIPELINE_ID,
  STAGE_OPTIONS, FORMATION_OPTIONS, CLASSE_OPTIONS, PERIOD_OPTIONS,
  CRM_FILTER_FIELDS, LEAD_STATUS_OPTIONS_FALLBACK, PARCOURSUP_VERDICT_FILTER_OPTIONS,
  LAB_CALLBACK_FILTER_OPTIONS,
  LAB_APP_FILTER_OPTIONS,
  opsForField, opsForKind, opNeedsValue, opIsMulti, opIsRange, propertyKindOf,
  defaultOpForField, shouldRenderMultiSelect, coerceMultiSelectOperator,
  type SelectOption,
  type CRMFilterField, type CRMFilterOp, type CRMFilterRule, type CRMFilterGroup,
} from '@/lib/crm-constants'
import {
  type CRMSavedView,
  CRM_DEFAULT_VIEWS, loadCRMViews, viewToParams,
  persistViewCreate, persistViewUpdate, persistViewDelete, persistAdminViewLayout,
} from '@/lib/crm-views'
import { recomposeSubview } from '@/lib/crm-subviews'
import { MultiSelectDropdown, SearchableSelect } from '@/components/crm/CRMSelects'
const ExportCSVModal = dynamic(() => import('@/components/crm/CRMExportModal'), { ssr: false })
import { CRMFieldPicker, isCustomField, type CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'
import { CRMBulkPropertyPicker, resolveBulkPropMeta } from '@/components/crm/CRMBulkPropertyPicker'
import { isReadOnlyProperty } from '@/lib/crm-property-normalization'
import { getCached, invalidate, invalidatePrefix, refetch } from '@/lib/client-cache'
import { HUBSPOT_PROPERTY_TO_COLUMN } from '@/lib/crm-contact-write'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { useIsMobile } from '@/lib/useIsMobile'
import { buildEdumoveGroups, isEdumoveGroups } from '@/lib/edumove-crm-view'
import {
  isDiplomaSanteView,
  diplomaSanteGroupsFromSaved,
  hasDiplomaFormEventRule,
} from '@/lib/diploma-sante-crm-view'
import {
  bucketHasFacets,
  EMPTY_BUCKET_FACETS,
  inferViewKind,
  isAttributionBucketId,
  isAttributionSubViewId,
  parseAttributionParentId,
  withBucketFacets,
  type BucketFacetSelection,
} from '@/lib/crm-attribution-buckets'
import { CRMBucketSubviewsBar } from '@/components/crm/CRMBucketSubviews'
import { CRMManageViewsModal } from '@/components/crm/CRMManageViewsModal'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Header } from '@/components/crm-v2/primitives'
import {
  useScrollParentHeight, foldText, type HeaderMenuItem,
  V2PillLink, V2RoundButton, V2MoreMenu, V2ViewSearch, V2ContactSearch,
  V2FilterMultiPill, V2FilterPill, V2AdvancedFiltersLink, V2ToolbarLink, V2ActiveChip,
  V2ContactsPager, V2InlineSpinner,
} from '@/components/crm-v2/contacts-list/ContactsListParts'

// Composants UI extraits dans @/components/crm/*

const LINOVA_FORM_NAMES = [
  'LINOVA - Form LGF - 21/05/2026',
  'LINOVA - Form LGF - 18/05/2026',
]

function buildLinovaGroups(): CRMFilterGroup[] {
  return [{
    id: 'grp-linova-forms',
    rules: [{
      id: 'linova-form-event-is-any',
      field: 'form_event',
      operator: 'is_any',
      value: LINOVA_FORM_NAMES.join(','),
    }],
  }]
}

function isLinovaGroups(groups: CRMFilterGroup[]): boolean {
  const first = groups?.[0]
  if (!first || !Array.isArray(first.rules)) return false
  const rule = first.rules.find(r => r.field === 'form_event' && r.operator === 'is_any')
  if (!rule?.value) return false
  const vals = rule.value.split(',').map(v => v.trim()).filter(Boolean)
  return LINOVA_FORM_NAMES.every(name => vals.includes(name))
}

function normalizeLegacyFieldName(field: string): string {
  // Backward-compat: anciennes vues sauvegardées avec "origine".
  if (field === 'origine') return 'source'
  return field
}

// Flags de rollout perf (safe by default):
// - NEXT_PUBLIC_CRM_RELAX_EXACT_COUNT=1 : favorise defer_count sur les vues
//   filtrées pour éviter les COUNT(*) coûteux à chaque frappe.
// - NEXT_PUBLIC_CRM_BYPASS_CACHE=1 : garde-fou de debug, désactive le cache
//   réponse API quand nécessaire.
const RELAX_EXACT_COUNT = process.env.NEXT_PUBLIC_CRM_RELAX_EXACT_COUNT === '1'
const BYPASS_CRM_CACHE = process.env.NEXT_PUBLIC_CRM_BYPASS_CACHE === '1'
const LEADS_AUTO_REFRESH_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_ADMIN_AUTO_REFRESH_MS ?? '30000')
  return Number.isFinite(raw) && raw >= 10000 ? raw : 30000
})()
// Fenêtre de fraîcheur des badges de comptage par vue. En-dessous de ce délai,
// on réutilise la valeur déjà connue (évite de re-demander au serveur le même
// comptage à chaque changement d'onglet). N'altère pas le calcul : c'est la
// même valeur que celle déjà affichée, simplement non re-demandée.
const VIEW_COUNT_FRESH_MS = 60_000
const SEARCH_DEBOUNCE_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_SEARCH_DEBOUNCE_MS ?? '180')
  return Number.isFinite(raw) && raw >= 80 ? raw : 180
})()
const CONTACTS_FETCH_TIMEOUT_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_FETCH_TIMEOUT_MS ?? '15000')
  return Number.isFinite(raw) && raw >= 5000 ? raw : 15000
})()
const CONTACTS_TOTAL_BUDGET_MS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CRM_FETCH_BUDGET_MS ?? '12000')
  return Number.isFinite(raw) && raw >= 6000 ? raw : 12000
})()

// ── Types ──────────────────────────────────────────────────────────────────────

interface RdvUser {
  id: string
  name: string
  role: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface IngestionHealth {
  latest_contact: {
    id: string | null
    source: string | null
    origine: string | null
    synced_at: string | null
  } | null
  latest_meta_event: {
    leadgen_id: string | null
    form_id: string | null
    status: string | null
    processed_at: string | null
  } | null
  contacts_24h: number
  meta_events_24h: number
  stale_minutes: number | null
  is_stale: boolean
}

// ExportCSVModal → @/components/crm/CRMExportModal

function contactsPageSignature(rows: CRMContact[]): string {
  return rows.map(c => c.hubspot_contact_id).join('|')
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CRMPage() {
  const isMobile = useIsMobile()
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  /** Met à jour les lignes sans reset scroll ni re-render si la page est identique. */
  function applyContactsRows(nextRows: CRMContact[]) {
    const scrollEl = tableScrollRef.current
    const scrollTop = scrollEl?.scrollTop ?? 0
    setContacts(prev => {
      if (contactsPageSignature(prev) === contactsPageSignature(nextRows)) return prev
      return nextRows
    })
    if (scrollEl) {
      requestAnimationFrame(() => {
        if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop
      })
    }
  }

  const [contacts, setContacts]   = useState<CRMContact[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)
  // Échec du dernier chargement (lenteur / erreur serveur) : affiché comme tel
  // au lieu de « les filtres masquent tous les résultats ».
  const [fetchError, setFetchError] = useState(false)
  const [ingestionHealth, setIngestionHealth] = useState<IngestionHealth | null>(null)

  // Saved views
  const [crmViews, setCrmViews] = useState<CRMSavedView[]>(loadCRMViews)
  const [viewsLoaded, setViewsLoaded] = useState(false)
  const [manageViewsOpen, setManageViewsOpen] = useState(false)
  const [activeViewId, setActiveViewId] = useState('all')
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingView, setCreatingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const [draggedViewId, setDraggedViewId] = useState<string | null>(null)
  const [dragOverViewId, setDragOverViewId] = useState<string | null>(null)
  /** Ids du catalogue affichés dans la barre d'onglets de CET admin. */
  const [layoutViewIds, setLayoutViewIds] = useState<string[]>([])
  usePageTitle(crmViews.find(v => v.id === activeViewId)?.name || 'Contacts')

  // Advanced filter panel
  const [filterGroups, setFilterGroups] = useState<CRMFilterGroup[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  // Mobile : filtres rapides + actions de vue repliés derrière un bouton
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // CSV export
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastFetchClientMs, setLastFetchClientMs] = useState<number | null>(null)
  const [lastFetchServerMs, setLastFetchServerMs] = useState<number | null>(null)
  const [totalEstimated, setTotalEstimated] = useState(false)

  // Server-side filters (déclenchent un appel API)
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stage, setStage]             = useState('')
  const [closerHsId, setCloserHsId]   = useState('')
  const [closerContactHsId, setCloserContactHsId] = useState('') // = filtre direct sur crm_contacts.closer_du_contact_owner_id
  const [closerContactNot, setCloserContactNot]   = useState('')
  const [contactOwnerHsId, setContactOwnerHsId] = useState('') // = filtre direct sur crm_contacts.hubspot_owner_id
  const [teleproHsId, setTeleproHsId] = useState('')
  const [noTelepro, setNoTelepro]     = useState(false)
  const [ownerExclude, setOwnerExclude] = useState('')
  const [recentFormMonths, setRecentFormMonths] = useState(0)
  const [recentFormDays, setRecentFormDays]     = useState(0)
  const [createdBeforeDays, setCreatedBeforeDays] = useState(0)
  const [leadStatus, setLeadStatus]   = useState('')
  const [source, setSource]           = useState('')
  const [formEvent, setFormEvent]     = useState('')
  const [parcoursupVerdict, setParcoursupVerdict] = useState('')
  const [zoneFilter, setZoneFilter]   = useState('')
  const [deptFilter, setDeptFilter]   = useState('')

  // Exclusion filters (is_not / is_none)
  const [stageNot, setStageNot]           = useState('')
  const [leadStatusNot, setLeadStatusNot] = useState('')
  const [sourceNot, setSourceNot]         = useState('')
  const [formEventNot, setFormEventNot]   = useState('')
  const [zoneNot, setZoneNot]             = useState('')
  const [deptNot, setDeptNot]             = useState('')
  const [closerNot, setCloserNot]         = useState('')
  const [contactOwnerNot, setContactOwnerNot] = useState('')
  const [teleproNot, setTeleproNot]       = useState('')
  const [formationNot, setFormationNot]   = useState('')
  const [pipeline,            setPipeline]           = useState('')
  const [pipelineNot,         setPipelineNot]        = useState('')
  const [priorPreinscription, setPriorPreinscription] = useState(false)

  // Pipelines HubSpot (chargés dynamiquement)
  type PipelineData = { id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }
  const [pipelineOptions, setPipelineOptions] = useState<SelectOption[]>([])
  const [pipelinesData,   setPipelinesData]   = useState<PipelineData[]>([])

  // Toutes les options de stages : pipeline actuel + anciens pipelines (préfixés par l'année)
  // Pour les anciens pipelines, on n'affiche que les stages >= preinscription (hors fermé/perdu)
  // Helper : pour un pipeline donné, retourne les stages >= preinscription
  // Stratégie : 1) match label "preinscription", 2) fallback moitié sup des étapes positives
  function getPreinscPlusStages(p: PipelineData) {
    const negRe = /perdu|lost|ferm[eé]|annul|rejet/i
    const positiveStages = p.stages.filter(s => !negRe.test(s.label))
    // 1) Chercher par label
    let pivot = positiveStages.find(s => /pr[eé]inscription/i.test(s.label))
    // 2) Fallback : moitié supérieure des étapes positives (stages avancés)
    if (!pivot && positiveStages.length > 0) {
      pivot = positiveStages[Math.floor(positiveStages.length / 2)]
    }
    const minOrder = pivot?.displayOrder ?? Infinity
    return p.stages.filter(s => s.displayOrder >= minOrder && !negRe.test(s.label))
  }

  const allStageOptions = useMemo<SelectOption[]>(() => {
    const current = STAGE_OPTIONS.filter(o => o.id)
    const currentIds = new Set(current.map(o => o.id))
    const extra: SelectOption[] = []
    for (const p of pipelinesData) {
      if (p.id === CURRENT_PIPELINE_ID) continue
      const yearMatch = p.label.match(/(\d{4})[^\d]*(\d{2,4})/)
      const yearTag = yearMatch ? `${yearMatch[1]}-${String(yearMatch[2]).slice(-2)}` : p.label
      for (const s of getPreinscPlusStages(p)) {
        if (!currentIds.has(s.id)) {
          extra.push({ id: s.id, label: `[${yearTag}] ${s.label}` })
        }
      }
    }
    return [...current, ...extra]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelinesData])

  // Empty / not-empty filters (is_empty / is_not_empty)
  const [emptyFields, setEmptyFields]       = useState('')   // comma-separated field names
  const [notEmptyFields, setNotEmptyFields] = useState('')   // comma-separated field names
  const [customFilterParam, setCustomFilterParam] = useState('') // JSON string of custom HubSpot filters

  // Tri des colonnes — par défaut : date de création du contact desc.
  // Repose sur l'index idx_crm_contacts_contact_createdate.
  const [sortBy,  setSortBy]  = useState<string>('createdat_contact')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Colonnes dynamiques (propriétés HubSpot ajoutées par l'utilisateur via le menu Colonnes)
  // Persisté en localStorage
  const BLOCKED_EXTRA_COLUMN_PROPS = new Set(['closer', 'closer_hs_id', 'hubspot_owner_id', 'contact_owner_hs_id'])
  const [extraColumns, setExtraColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('crm-extra-columns')
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        return parsed.filter(p => !BLOCKED_EXTRA_COLUMN_PROPS.has(p))
      }
    } catch { /* ignore */ }
    return []
  })
  function persistExtraColumns(next: string[]) {
    const clean = next.filter(p => !BLOCKED_EXTRA_COLUMN_PROPS.has(p))
    setExtraColumns(clean)
    localStorage.setItem('crm-extra-columns', JSON.stringify(clean))
  }

  // ── Outils modals ──────────────────────────────────────────────────────────
  const [showRepop,         setShowRepop]         = useState(false)
  // Emplacement du bouton « Colonnes » dans la barre d'outils (style HubSpot)
  const [columnsSlot,       setColumnsSlot]       = useState<HTMLDivElement | null>(null)

  // ─── Modal "Nouveau contact" ─────────────────────────────────────────────
  const [showNewContact, setShowNewContact] = useState(false)
  const [newContactSaving, setNewContactSaving] = useState(false)
  const [newContactError, setNewContactError] = useState<string | null>(null)
  const [newContactExisting, setNewContactExisting] = useState<{
    id: string; firstname: string; lastname: string; email: string;
  } | null>(null)
  const [newContactEmailFormatError, setNewContactEmailFormatError] = useState<string | null>(null)
  const [newContactEmailChecking, setNewContactEmailChecking] = useState(false)
  const [newContact, setNewContact] = useState({
    firstname: '', lastname: '', email: '', phone: '',
    departement: '', classe_actuelle: '', formation: '',
  })

  // Vérification live de l'email : format + existence en base (debounced)
  useEffect(() => {
    if (!showNewContact) return
    const email = newContact.email.trim()
    setNewContactExisting(null)
    if (!email) {
      setNewContactEmailFormatError(null)
      setNewContactEmailChecking(false)
      return
    }
    const formatErr = validateEmailDomain(email)
    if (formatErr) {
      setNewContactEmailFormatError(formatErr)
      setNewContactEmailChecking(false)
      return
    }
    setNewContactEmailFormatError(null)
    setNewContactEmailChecking(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/crm/contacts/check?email=${encodeURIComponent(email)}`, { signal: ctrl.signal })
        const data = await res.json()
        if (data.exists && data.contact) setNewContactExisting(data.contact)
        else setNewContactExisting(null)
      } catch {
        // ignore
      } finally {
        setNewContactEmailChecking(false)
      }
    }, 400)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [newContact.email, showNewContact])

  async function handleCreateContact() {
    const required = {
      firstname: newContact.firstname.trim(),
      lastname:  newContact.lastname.trim(),
      email:     newContact.email.trim(),
      phone:     newContact.phone.trim(),
      departement: newContact.departement.trim(),
      classe_actuelle: newContact.classe_actuelle.trim(),
    }
    const missing: string[] = []
    if (!required.firstname)       missing.push('prénom')
    if (!required.lastname)        missing.push('nom')
    if (!required.email)           missing.push('email')
    if (!required.phone)           missing.push('téléphone')
    if (!required.departement)     missing.push('département')
    if (!required.classe_actuelle) missing.push('classe actuelle')
    if (missing.length) {
      setNewContactError(`Champs requis manquants : ${missing.join(', ')}.`)
      return
    }
    if (newContactEmailFormatError) {
      setNewContactError(newContactEmailFormatError)
      return
    }
    if (newContactExisting) {
      setNewContactError('Cet email est déjà associé à un contact existant.')
      return
    }
    setNewContactSaving(true)
    setNewContactError(null)
    try {
      const res = await fetch('/api/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      })
      const data = await res.json()
      if (!res.ok) {
        setNewContactError(data.error || 'Erreur lors de la création')
        return
      }
      if (data.existed) {
        setNewContactExisting({
          id: data.id,
          firstname: data.properties?.firstname || '',
          lastname:  data.properties?.lastname  || '',
          email:     data.properties?.email     || newContact.email,
        })
        return
      }
      setShowNewContact(false)
      setNewContact({ firstname: '', lastname: '', email: '', phone: '', departement: '', classe_actuelle: '', formation: '' })
      window.location.href = `/admin/crm/contacts/${data.id}`
    } catch (e) {
      setNewContactError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setNewContactSaving(false)
    }
  }

  // Overrides des filtres par défaut
  // Plus de filtre auto "équipe externe" : on affiche tout par défaut.
  // State conservé pour compatibilité avec les vues sauvegardées et l'export.
  const [showExternal, setShowExternal] = useState(true)
  const [allClasses, setAllClasses]     = useState(true)

  // Client-side filters (appliqués sur les données déjà chargées)
  const [formation, setFormation] = useState('')
  const [classe, setClasse]       = useState('')
  const [period, setPeriod]       = useState('')

  // Listes utilisateurs pour les dropdowns
  const [closers, setClosers]     = useState<RdvUser[]>([])
  const [telepros, setTelepros]   = useState<RdvUser[]>([])
  const [allUsers, setAllUsers]   = useState<RdvUser[]>([])
  // Tous les owners HubSpot importés (51 personnes) — utilisés en complément
  // pour avoir TOUTES les valeurs possibles dans les dropdowns Propriétaire
  const [hubspotOwners, setHubspotOwners] = useState<Array<{ hubspot_owner_id: string; firstname?: string; lastname?: string; email?: string }>>([])

  // Toutes les 829 propriétés CRM contacts — utilisées pour le picker des
  // filtres avancés (permet de filtrer sur n'importe quelle prop, pas que les 14)
  const [allCrmProps, setAllCrmProps] = useState<CrmPropertyMeta[]>([])

  // Options dynamiques depuis HubSpot (valeurs réelles)
  // ⚠️ leadStatusOptions est initialisé avec un fallback statique pour que le
  // filtre "Statut du lead" affiche TOUJOURS un dropdown, même avant que
  // /api/crm/field-options réponde (cette API peut prendre plusieurs secondes
  // car elle scanne crm_contacts). Sans ce fallback, le filtre bascule en
  // input texte "Valeur…" pendant le chargement.
  const [leadStatusOptions, setLeadStatusOptions]   = useState<SelectOption[]>([
    { id: '', label: 'Tous les statuts du lead' },
    ...LEAD_STATUS_OPTIONS_FALLBACK,
  ])
  const [formEventOptions, setFormEventOptions]     = useState<SelectOption[]>([{ id: '', label: 'Tous les formulaires' }])
  const [sourceOptions, setSourceOptions]           = useState<SelectOption[]>([{ id: '', label: 'Toutes les origines' }])
  const [zoneOptions, setZoneOptions]               = useState<SelectOption[]>([{ id: '', label: 'Toutes les zones / localités' }])
  const [deptOptions, setDeptOptions]               = useState<SelectOption[]>([{ id: '', label: 'Tous les départements' }])

  // Counts pré-chargés par vue
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({})
  // Horodatage du dernier comptage récupéré par id de vue (dédup réseau).
  const viewCountFetchedAtRef = useRef<Record<string, number>>({})
  const linovaViewIds = useMemo(
    () => new Set(crmViews.filter(v => (v.name ?? '').toLowerCase().includes('linova')).map(v => v.id)),
    [crmViews],
  )
  const catalogTopLevelViews = useMemo(
    () => crmViews.filter(v => !v.isDefault && !v.parentId && v.kind !== 'subview' && !isAttributionSubViewId(v.id)),
    [crmViews],
  )
  const topLevelViews = useMemo(() => {
    const defaults = crmViews.filter(v => v.isDefault)
    if (!viewsLoaded) return defaults
    const byId = new Map(catalogTopLevelViews.map(v => [v.id, v]))
    const pinned = layoutViewIds.map(id => byId.get(id)).filter((v): v is CRMSavedView => !!v)
    return [...defaults, ...pinned]
  }, [crmViews, catalogTopLevelViews, layoutViewIds, viewsLoaded])
  const activeBucketId = useMemo(() => {
    const v = crmViews.find(x => x.id === activeViewId)
    if (!v) return null
    if (v.parentId) return v.parentId
    const inferred = parseAttributionParentId(v.id)
    if (inferred) return inferred
    // Toute vue peut avoir ses sous-vues (créées en cliquant) : la vue active
    // est donc toujours le parent de la barre « Sous-vues ».
    return v.id
  }, [crmViews, activeViewId])
  // Filtres rapides Classe / Zone du bucket actif (non sauvegardés dans la vue).
  const [bucketFacets, setBucketFacets] = useState<BucketFacetSelection>(EMPTY_BUCKET_FACETS)
  const activeBucketHasFacets = bucketHasFacets(activeBucketId)
  const activeBucketParent = useMemo(
    () => (activeBucketId ? crmViews.find(v => v.id === activeBucketId) ?? null : null),
    [crmViews, activeBucketId],
  )
  const activeBucketChildren = useMemo(() => {
    if (!activeBucketId) return []
    return crmViews.filter(v =>
      v.id !== activeBucketId &&
      (v.parentId === activeBucketId || parseAttributionParentId(v.id) === activeBucketId),
    )
  }, [crmViews, activeBucketId])
  const [fieldOptionsLoaded, setFieldOptionsLoaded] = useState(false)

  // Sélection en masse + drawer
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  /** 'page' = sélection manuelle / page ; 'view' = tous les contacts matching la vue. */
  const [selectionScope, setSelectionScope] = useState<'page' | 'view'>('page')
  const [selectingAllView, setSelectingAllView] = useState(false)
  const [selectAllViewProgress, setSelectAllViewProgress] = useState<{ loaded: number; total: number } | null>(null)
  const selectAllViewAbortRef = useRef<AbortController | null>(null)
  const [bulkTeleproId, setBulkTeleproId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkPropOpen, setBulkPropOpen] = useState(false)
  const [bulkPropName, setBulkPropName] = useState('')
  const [bulkPropValue, setBulkPropValue] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkUpdateProgress, setBulkUpdateProgress] = useState<{ done: number; total: number } | null>(null)
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  const [limit, setLimit] = useState(50)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedOnceRef = useRef(false)
  const contactsFetchSeqRef = useRef(0)
  const lastFetchSignatureRef = useRef('')
  const contactsAbortRef = useRef<AbortController | null>(null)
  const didInitViewFromUrlRef = useRef(false)
  /** Force le prochain fetchContacts à bypasser le cache (après bulk edit). */
  const forceFreshListRef = useRef(false)

  // ── Charger les vues sauvegardées ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/crm/views').then(r => r.json()),
      fetch('/api/crm/views/layout').then(r => r.ok ? r.json() : { view_ids: null }).catch(() => ({ view_ids: null })),
    ])
      .then(([rows, layout]: [unknown, { view_ids?: string[] | null }]) => {
        if (cancelled) return
        if (!Array.isArray(rows) || rows.length === 0) { setViewsLoaded(true); return }
        const dbViews: CRMSavedView[] = (rows as Array<{
          id: string
          name: string
          filter_groups: unknown
          preset_flags: unknown
          parent_id?: string | null
          kind?: 'view' | 'bucket' | 'subview'
        }>).map(r => {
          const rawGroups = (r.filter_groups as CRMFilterGroup[]) ?? []
          const nameLower = (r.name || '').toLowerCase()
          const shouldForceLinova = nameLower.includes('linova')
          const shouldForceEdumove = nameLower.includes('edumove')
          const shouldForceDiploma = isDiplomaSanteView(r.id, r.name)
          const groups = shouldForceLinova
            ? buildLinovaGroups()
            : shouldForceEdumove
              ? buildEdumoveGroups()
              : shouldForceDiploma
                ? diplomaSanteGroupsFromSaved(rawGroups)
                : rawGroups

          if (shouldForceLinova && !isLinovaGroups(rawGroups)) {
            void fetch(`/api/crm/views/${encodeURIComponent(r.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filter_groups: groups }),
            }).catch(() => {})
          }
          if (shouldForceEdumove && !isEdumoveGroups(rawGroups)) {
            void fetch(`/api/crm/views/${encodeURIComponent(r.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filter_groups: groups }),
            }).catch(() => {})
          }
          if (shouldForceDiploma && !hasDiplomaFormEventRule(rawGroups)) {
            void fetch(`/api/crm/views/${encodeURIComponent(r.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filter_groups: groups }),
            }).catch(() => {})
          }

          return {
            id: r.id,
            name: r.name,
            groups,
            presetFlags: r.preset_flags as CRMSavedView['presetFlags'] ?? undefined,
            isDefault: false,
            parentId: r.parent_id ?? parseAttributionParentId(r.id),
            kind: r.kind ?? inferViewKind(r.id, r.parent_id ?? parseAttributionParentId(r.id)),
          }
        })
        setCrmViews([...CRM_DEFAULT_VIEWS, ...dbViews])
        const catalogIds = dbViews
          .filter(v => !v.parentId && v.kind !== 'subview' && !isAttributionSubViewId(v.id))
          .map(v => v.id)
        const fromApi = Array.isArray(layout?.view_ids) ? layout.view_ids.filter(id => typeof id === 'string') : null
        setLayoutViewIds(fromApi ?? catalogIds)
        setViewsLoaded(true)
      })
      .catch(() => { if (!cancelled) setViewsLoaded(true) })
    return () => { cancelled = true }
  }, [])

  // Au chargement, restaure la vue depuis ?view_id=... (si présente).
  useEffect(() => {
    if (!viewsLoaded || didInitViewFromUrlRef.current) return
    didInitViewFromUrlRef.current = true
    const params = new URLSearchParams(window.location.search)
    const viewIdFromUrl = params.get('view_id') || params.get('view')
    if (!viewIdFromUrl || viewIdFromUrl === activeViewId) return
    const view = crmViews.find(v => v.id === viewIdFromUrl)
    if (view) applyCRMView(view)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewsLoaded, crmViews, activeViewId])

  // Quand on change de vue, reflète ce choix dans l'URL.
  useEffect(() => {
    if (!viewsLoaded) return
    const url = new URL(window.location.href)
    if (activeViewId) url.searchParams.set('view_id', activeViewId)
    else url.searchParams.delete('view_id')
    const nextSearch = url.searchParams.toString()
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', nextUrl)
    }
  }, [activeViewId, viewsLoaded])

  function syncViewIdInUrl(viewId: string, mode: 'replace' | 'push' = 'replace') {
    const url = new URL(window.location.href)
    if (viewId) url.searchParams.set('view_id', viewId)
    else url.searchParams.delete('view_id')
    const nextSearch = url.searchParams.toString()
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl === currentUrl) return
    if (mode === 'push') window.history.pushState(window.history.state, '', nextUrl)
    else window.history.replaceState(window.history.state, '', nextUrl)
  }

  // ── Charger les pipelines HubSpot ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/crm/pipelines')
      .then(r => r.json())
      .then((rows: Array<{ id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }>) => {
        if (!Array.isArray(rows)) return
        setPipelineOptions(rows.map(p => ({ id: p.id, label: p.label })))
        setPipelinesData(rows)
      })
      .catch(() => {})
  }, [])

  const fetchViewCounts = useCallback(async (viewIds?: string[]) => {
    const body = viewIds && viewIds.length > 0 ? { view_ids: viewIds } : {}
    try {
      const res = await fetch('/api/crm/views/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      const d = await res.json()
      if (d?.counts && typeof d.counts === 'object') {
        const counts = d.counts as Record<string, number>
        // Marque ces vues comme fraîchement comptées pour éviter de re-demander
        // au serveur le même comptage lors des prochains changements d'onglet.
        const now = Date.now()
        for (const id of Object.keys(counts)) viewCountFetchedAtRef.current[id] = now
        // Linova est isolée: son badge est alimenté par la même requête
        // que la liste active pour éviter les écarts avec le tableau visible.
        const sanitized = Object.fromEntries(
          Object.entries(counts).filter(([id]) => !linovaViewIds.has(id)),
        ) as Record<string, number>
        if (Object.keys(sanitized).length > 0) {
          setViewCounts(prev => ({ ...prev, ...sanitized }))
        }
        return counts
      }
    } catch {
      // best effort
    }
    return null
  }, [linovaViewIds])

  // ── Pré-charger les counts : vue active d'abord, puis reste en idle ──
  useEffect(() => {
    if (!viewsLoaded) return
    // Ne re-demande pas un comptage déjà connu et récent (< VIEW_COUNT_FRESH_MS).
    // Le badge correspondant reste affiché tel quel : aucune valeur n'est modifiée,
    // on évite seulement une requête réseau redondante.
    const isFresh = (id: string) => {
      const at = viewCountFetchedAtRef.current[id]
      return typeof at === 'number' && Date.now() - at < VIEW_COUNT_FRESH_MS
    }
    const siblingIds = activeBucketChildren.map(v => v.id)
    const primaryIds = [activeViewId, 'all', activeBucketId, ...siblingIds]
      .filter((id): id is string => !!id)
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .filter(id => !isFresh(id))
    const t1 = setTimeout(() => {
      if (primaryIds.length > 0) void fetchViewCounts(primaryIds)
    }, 300)
    const idleCb = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const remainingIds = topLevelViews
      .map(v => v.id)
      .filter(id => id !== activeViewId && id !== 'all')
      .filter(id => !isFresh(id))
    const t2 = setTimeout(() => {
      if (remainingIds.length === 0) return
      if (typeof idleCb === 'function') {
        idleCb(() => { void fetchViewCounts(remainingIds) })
      } else {
        void fetchViewCounts(remainingIds)
      }
    }, 2500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [viewsLoaded, crmViews.length, activeViewId, activeBucketId, activeBucketChildren, topLevelViews, fetchViewCounts])

  // Santé ingestion (Meta + CRM): évite les faux diagnostics "plus aucun lead".
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let stopped = false
    const load = async () => {
      try {
        const res = await fetch('/api/crm/ingestion-health', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as IngestionHealth
        if (!stopped) setIngestionHealth(data)
      } catch {
        // best effort
      }
    }
    void load()
    timer = setInterval(() => { void load() }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // ── Charger les utilisateurs ─────────────────────────────────────────────────

  useEffect(() => {
    // On charge TOUS les utilisateurs en un seul appel : les dropdowns des
    // propriétés Closer et Télépro doivent inclure tout le monde (comme la
    // propriété "Owner" dans HubSpot), pas seulement les rôles closer/telepro.
    // On dérive ensuite `closers` (role=closer/admin) et `telepros` (role=telepro)
    // pour préserver les comportements spécifiques au rôle (bulk-assign télépro,
    // résolution des libellés, etc.).
    fetch('/api/users').then(r => r.json()).then((data) => {
      const arr: RdvUser[] = Array.isArray(data) ? data : []
      setAllUsers(arr)
      setClosers(arr.filter(u => u.role === 'closer' || u.role === 'admin'))
      setTelepros(arr.filter(u => u.role === 'telepro'))
    }).catch(() => {})
    // Charger TOUS les owners HubSpot (table crm_owners — 51 personnes)
    // pour alimenter complètement les dropdowns "Propriétaire du contact"
    fetch('/api/crm/owners').then(r => r.json()).then(d => {
      if (Array.isArray(d.owners)) setHubspotOwners(d.owners)
    }).catch(() => {})
  }, [])

  // Charger les options de filtres lourdes après le premier rendu utile,
  // ou immédiatement si l'utilisateur ouvre le panneau de filtres.
  useEffect(() => {
    if (fieldOptionsLoaded) return
    if (!filterPanelOpen && loading) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const load = async (attempt: number) => {
      try {
        const r = await fetch('/api/crm/field-options', { cache: 'no-store' })
        const d = await r.json()
        if (cancelled) return

        if (Array.isArray(d.leadStatuses) && d.leadStatuses.length > 0) {
          // Fusion fallback statique + valeurs distinctes côté DB.
          // On ne remplace JAMAIS par une liste vide (sinon le filtre repasse
          // en input texte).
          const merged = new Map<string, SelectOption>()
          for (const o of LEAD_STATUS_OPTIONS_FALLBACK) merged.set(o.id, o)
          for (const v of d.leadStatuses as string[]) merged.set(v, { id: v, label: v })
          setLeadStatusOptions([
            { id: '', label: 'Tous les statuts du lead' },
            ...merged.values(),
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
            { id: '', label: 'Toutes les zones / localités' },
            ...d.zones.map((v: string) => ({ id: v, label: v })),
          ])
        }
        if (d.departements?.length) {
          setDeptOptions([
            { id: '', label: 'Tous les départements' },
            ...d.departements.map((v: string) => ({ id: v, label: v })),
          ])
        }
        if (d.formEvents?.length) {
          setFormEventOptions([
            { id: '', label: 'Tous les formulaires' },
            ...d.formEvents.map((v: string) => ({ id: v, label: v })),
          ])
        }

        // On ne marque "chargé" QUE si les listes clés sont réellement
        // arrivées. Une réponse vide (cache expiré + requête lente côté API,
        // timeout transient) ne doit pas figer le state : sinon les dropdowns
        // (ex. Origine) restent bloqués sur le fallback et ne réessaient jamais.
        const gotCore = (Array.isArray(d.sources) && d.sources.length > 0)
          || (Array.isArray(d.leadStatuses) && d.leadStatuses.length > 0)
        if (gotCore) {
          setFieldOptionsLoaded(true)
        } else if (attempt < 5) {
          retryTimer = setTimeout(() => { void load(attempt + 1) }, 1500 * (attempt + 1))
        }
      } catch {
        if (!cancelled && attempt < 5) {
          retryTimer = setTimeout(() => { void load(attempt + 1) }, 1500 * (attempt + 1))
        }
      }
    }

    const t = setTimeout(() => { void load(0) }, filterPanelOpen ? 0 : 400)

    return () => {
      cancelled = true
      clearTimeout(t)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [filterPanelOpen, fieldOptionsLoaded, loading])

  // Charge le catalogue des propriétés CRM (utilisé par le panel "Filtres
  // avancés" ET par le menu "Colonnes" de la table). Idempotent : si la liste
  // est déjà en mémoire, on ne refetch pas.
  const ensureCrmPropsLoaded = useCallback(() => {
    if (allCrmProps.length > 0) return
    fetch('/api/crm/properties?object=contacts&limit=2000').then(r => r.json()).then(d => {
      if (Array.isArray(d.properties)) setAllCrmProps(d.properties as CrmPropertyMeta[])
    }).catch(() => {})
  }, [allCrmProps.length])

  useEffect(() => {
    if (!filterPanelOpen) return
    ensureCrmPropsLoaded()
  }, [filterPanelOpen, ensureCrmPropsLoaded])

  // Debounce recherche pour éviter un fetch par frappe.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  // Quand la recherche change, revenir sur la première page.
  useEffect(() => {
    if (page !== 0) setPage(0)
  }, [debouncedSearch])

  // ── Récupérer les contacts ───────────────────────────────────────────────────

  // Seuls le nom et le preset de la vue active servent au fetch : dépendre de
  // crmViews entier relançait la liste (requête annulée puis refaite) à
  // l'arrivée de /api/crm/views, même quand la vue active n'avait pas changé.
  const activeViewForFetch = crmViews.find(v => v.id === activeViewId)
  const activeViewNameForFetch = activeViewForFetch?.name ?? ''
  const activeViewIncludeEmptyLeadStatus = !!activeViewForFetch?.presetFlags?.includeEmptyLeadStatus

  const fetchContacts = useCallback(async (resetPage = false) => {
    // Si une sélection « toute la vue » est en cours, on l'annule : les filtres
    // viennent de changer et les IDs en cours de chargement ne seraient plus valides.
    selectAllViewAbortRef.current?.abort()
    setSelectingAllView(false)
    setSelectAllViewProgress(null)

    contactsAbortRef.current?.abort()
    const requestAbort = new AbortController()
    contactsAbortRef.current = requestAbort

    const currentPage = resetPage ? 0 : page
    if (resetPage) setPage(0)
    const activeViewName = activeViewNameForFetch.toLowerCase()
    const isLinovaView = activeViewName.includes('linova')
    const forceMetaAdsOnly = activeViewId === 'v_meta_ads_all' || activeViewName.includes('meta ads')
    const requestSignature = JSON.stringify({
      activeViewId,
      activeViewName,
      debouncedSearch,
      stage,
      closerHsId,
      closerContactHsId,
      closerContactNot,
      contactOwnerHsId,
      teleproHsId,
      noTelepro,
      ownerExclude,
      recentFormMonths,
      recentFormDays,
      createdBeforeDays,
      showExternal,
      allClasses,
      leadStatus,
      source,
      formEvent,
      parcoursupVerdict,
      zoneFilter,
      deptFilter,
      stageNot,
      leadStatusNot,
      sourceNot,
      formEventNot,
      zoneNot,
      deptNot,
      closerNot,
      contactOwnerNot,
      teleproNot,
      formationNot,
      pipeline,
      pipelineNot,
      priorPreinscription,
      emptyFields,
      notEmptyFields,
      formation,
      classe,
      period,
      sortBy,
      sortDir,
      limit,
      extraColumns,
      customFilterParam,
      forceMetaAdsOnly,
      includeEmptyLeadStatus: activeViewIncludeEmptyLeadStatus,
    })

    // Évite une requête inutile : si les filtres changent hors page 0,
    // on reset la pagination puis on attend le render suivant.
    if (!resetPage && page !== 0 && requestSignature !== lastFetchSignatureRef.current) {
      lastFetchSignatureRef.current = requestSignature
      setPage(0)
      return
    }
    lastFetchSignatureRef.current = requestSignature

    const preferFastFirstPaint = activeViewName.includes('linova')
    const shouldUseApproxCount =
      preferFastFirstPaint ||
      activeViewId === 'all' &&
      !debouncedSearch &&
      !stage &&
      !closerHsId &&
      !closerContactHsId &&
      !closerContactNot &&
      !contactOwnerHsId &&
      !teleproHsId &&
      !noTelepro &&
      !ownerExclude &&
      recentFormMonths <= 0 &&
      recentFormDays <= 0 &&
      createdBeforeDays <= 0 &&
      !leadStatus &&
      !source &&
      !formEvent &&
      !parcoursupVerdict &&
      !zoneFilter &&
      !deptFilter &&
      !stageNot &&
      !leadStatusNot &&
      !sourceNot &&
      !formEventNot &&
      !zoneNot &&
      !deptNot &&
      !closerNot &&
      !contactOwnerNot &&
      !teleproNot &&
      !formationNot &&
      !pipeline &&
      !pipelineNot &&
      !priorPreinscription &&
      !emptyFields &&
      !notEmptyFields &&
      !formation &&
      !classe &&
      !period &&
      !customFilterParam

    const params = new URLSearchParams({
      limit: String(limit),
      page: String(currentPage),
    })
    // Stabilité d'abord:
    // - Compteur exact par défaut pour éviter les faux totaux (ex: "~100").
    // - Approximation uniquement en opt-in explicite via env.
    if (RELAX_EXACT_COUNT && shouldUseApproxCount) {
      params.set('defer_count', '1')
    } else {
      params.set('exact_count', '1')
    }
    if (BYPASS_CRM_CACHE || forceFreshListRef.current) {
      params.set('no_cache', '1')
      params.set('force_sql', '1')
    }
    if (activeViewId) params.set('view_id', activeViewId)
    if (debouncedSearch)      params.set('search', debouncedSearch)
    if (stage)                params.set('stage', stage)
    if (closerHsId)           params.set('closer_hs_id', closerHsId)
    if (closerContactHsId)    params.set('closer_contact_hs_id', closerContactHsId)
    if (closerContactNot)     params.set('closer_contact_not', closerContactNot)
    if (contactOwnerHsId)     params.set('contact_owner_hs_id', contactOwnerHsId)
    if (teleproHsId)          params.set('telepro_hs_id', teleproHsId)
    if (noTelepro)            params.set('no_telepro', '1')
    if (activeViewIncludeEmptyLeadStatus) {
      params.set('include_empty_lead_status', '1')
    }
    if (ownerExclude)         params.set('owner_exclude', ownerExclude)
    if (recentFormMonths > 0) params.set('recent_form_months', String(recentFormMonths))
    if (recentFormDays > 0)   params.set('recent_form_days', String(recentFormDays))
    if (createdBeforeDays > 0) params.set('created_before_days', String(createdBeforeDays))
    const forceStableViewScope = !!activeViewId && activeViewId !== 'all'
    if (showExternal || forceStableViewScope) params.set('show_external', '1')
    if (allClasses || forceMetaAdsOnly || forceStableViewScope) params.set('all_classes', '1')
    if (leadStatus)           params.set('lead_status', leadStatus)
    if (source)               params.set('source', source)
    if (formEvent)            params.set('form_event', formEvent)
    if (parcoursupVerdict)    params.set('parcoursup_verdict', parcoursupVerdict)
    if (zoneFilter)           params.set('zone', zoneFilter)
    if (deptFilter)           params.set('departement', deptFilter)

    // Exclusion params (is_not / is_none)
    if (stageNot)             params.set('stage_not', stageNot)
    if (leadStatusNot)        params.set('lead_status_not', leadStatusNot)
    if (sourceNot)            params.set('source_not', sourceNot)
    if (formEventNot)         params.set('form_event_not', formEventNot)
    if (zoneNot)              params.set('zone_not', zoneNot)
    if (deptNot)              params.set('departement_not', deptNot)
    if (closerNot)            params.set('closer_not', closerNot)
    if (contactOwnerNot)      params.set('contact_owner_not', contactOwnerNot)
    if (teleproNot)           params.set('telepro_not', teleproNot)
    if (formationNot)         params.set('formation_not', formationNot)
    if (pipeline)             params.set('pipeline', pipeline)
    if (pipelineNot)          params.set('pipeline_not', pipelineNot)
    if (priorPreinscription)  params.set('prior_preinscription', '1')

    // Empty / not-empty filters
    if (emptyFields)            params.set('empty_fields', emptyFields)
    if (notEmptyFields)         params.set('not_empty_fields', notEmptyFields)

    // Filtres client-side → serveur
    if (formation)              params.set('formation', formation)
    if (classe)                 params.set('classe', classe)
    if (period)                 params.set('period', period)

    // Tri
    params.set('sort_by',  sortBy)
    params.set('sort_dir', sortDir)

    // Colonnes dynamiques HubSpot (ajoutées via le menu Colonnes)
    if (extraColumns.length > 0) params.set('props', extraColumns.join(','))

    // Filtres custom (propriétés HubSpot : date, number, enum, …)
    if (customFilterParam && !forceMetaAdsOnly) params.set('cf', customFilterParam)
    if (forceMetaAdsOnly) params.set('meta_ads_only', '1')

    const url = `/api/crm/contacts?${params.toString()}`
    const retryParams = new URLSearchParams(params.toString())
    retryParams.delete('cf')
    const retryUrlWithoutCf = `/api/crm/contacts?${retryParams.toString()}`
    const strictRetryParams = new URLSearchParams(retryParams.toString())
    strictRetryParams.delete('defer_count')
    strictRetryParams.set('exact_count', '1')
    strictRetryParams.set('no_cache', '1')
    // Ne pas forcer SQL ici: on veut laisser Typesense servir le fallback
    // rapide/stable quand il est disponible.
    strictRetryParams.delete('force_sql')
    const strictRetryUrl = `/api/crm/contacts?${strictRetryParams.toString()}`
    const totalOnlyParams = new URLSearchParams(retryParams.toString())
    totalOnlyParams.delete('defer_count')
    totalOnlyParams.set('exact_count', '1')
    totalOnlyParams.set('limit', '0')
    totalOnlyParams.set('page', '0')
    const totalOnlyUrl = `/api/crm/contacts?${totalOnlyParams.toString()}`
    const requestSeq = ++contactsFetchSeqRef.current

    const refreshExactTotal = async () => {
      try {
        const totalRes = await fetchWithTimeout(totalOnlyUrl, 6000, { signal: requestAbort.signal })
        if (!totalRes.ok) return
        const totalPayload = await totalRes.json() as { total?: number; total_estimated?: boolean }
        if (requestSeq !== contactsFetchSeqRef.current) return
        if (typeof totalPayload.total === 'number') {
          setTotal(totalPayload.total)
          if (activeViewId && activeViewId !== 'all') {
            setViewCounts(prev => ({ ...prev, [activeViewId]: totalPayload.total as number }))
          }
        }
        setTotalEstimated(totalPayload.total_estimated === true)
      } catch {
        // Best effort: ne pas perturber l'affichage principal.
      }
    }

    const fetchContactsPayload = async () => {
      const start = performance.now()
      const deadline = Date.now() + CONTACTS_TOTAL_BUDGET_MS
      const timeoutForStep = (requestedMs: number) => {
        const left = deadline - Date.now()
        if (left <= 0) throw new Error('contacts fetch budget exceeded')
        return Math.max(1500, Math.min(requestedMs, left))
      }

      let response = await fetchWithTimeout(url, timeoutForStep(CONTACTS_FETCH_TIMEOUT_MS), { signal: requestAbort.signal })
      // Fallback robuste: si l'URL avec `cf` casse (URL trop longue / proxy),
      // on retente automatiquement sans `cf` en conservant la vue active.
      // Uniquement sur URL refusée : sur un 500 / timeout, relancer la même
      // requête lourde (le serveur relit les filtres via view_id) doublait la charge.
      if ((response.status === 414 || response.status === 431) && activeViewId && activeViewId !== 'all' && customFilterParam) {
        response = await fetchWithTimeout(retryUrlWithoutCf, timeoutForStep(5000), { signal: requestAbort.signal })
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} on ${url}`)
      let payload = await response.json() as { data?: CRMContact[]; total?: number; total_estimated?: boolean }

      // Garde-fou anti incohérence (cas observé): parfois `cf` devient
      // désynchronisé/invalidé et la requête retourne data=[] avec total>0.
      // On retente une fois en s'appuyant uniquement sur `view_id` (sans `cf`)
      // pour garantir un résultat cohérent avec l'onglet actif.
      const shouldRetryWithoutCf = (
        currentPage === 0 &&
        !!activeViewId &&
        activeViewId !== 'all' &&
        !!customFilterParam &&
        (payload.total ?? 0) > 0 &&
        (payload.data?.length ?? 0) === 0
      )
      if (shouldRetryWithoutCf) {
        const retryRes = await fetchWithTimeout(retryUrlWithoutCf, timeoutForStep(4500), { signal: requestAbort.signal })
        if (retryRes.ok) {
          payload = await retryRes.json() as { data?: CRMContact[]; total?: number; total_estimated?: boolean }
        }
      }
      if (currentPage === 0 && (payload.total ?? 0) > 0 && (payload.data?.length ?? 0) === 0) {
        try {
          const strictRetryRes = await fetchWithTimeout(strictRetryUrl, timeoutForStep(4000), { signal: requestAbort.signal })
          if (strictRetryRes.ok) {
            payload = await strictRetryRes.json() as { data?: CRMContact[]; total?: number; total_estimated?: boolean }
          }
        } catch {
          // Le fallback strict est best-effort: ne pas bloquer l'UI si la
          // requête SQL de secours est lente.
        }
      }
      if (currentPage === 0 && (payload.total ?? 0) > 0 && (payload.data?.length ?? 0) === 0) {
        try {
          const hardParams = new URLSearchParams(strictRetryParams.toString())
          hardParams.delete('cf')
          hardParams.set('no_cache', '1')
          hardParams.set('exact_count', '1')
          const hardRetryUrl = `/api/crm/contacts?${hardParams.toString()}`
          const hardRetryRes = await fetchWithTimeout(hardRetryUrl, timeoutForStep(3500), { signal: requestAbort.signal })
          if (hardRetryRes.ok) {
            payload = await hardRetryRes.json() as { data?: CRMContact[]; total?: number; total_estimated?: boolean }
          }
        } catch {
          // Best effort.
        }
      }

      const serverMsRaw = response.headers.get('X-Response-Time-Ms')
      const serverMs = serverMsRaw ? Number(serverMsRaw) : null
      return {
        payload,
        clientMs: Math.round(performance.now() - start),
        serverMs: Number.isFinite(serverMs) ? serverMs : null,
      }
    }

    // Cache hit (typiquement : retour sur la page apres avoir ouvert un
    // contact) → render immediat avec les anciennes donnees, puis revalidation
    // silencieuse en arriere-plan.
    // Après un bulk edit, on ignore volontairement le cache stale.
    if (forceFreshListRef.current) {
      invalidate(url)
      forceFreshListRef.current = false
    }
    const cached = getCached<
      | {
          payload?: { data?: CRMContact[]; total?: number; total_estimated?: boolean }
          clientMs?: number
          serverMs?: number | null
        }
      | { data?: CRMContact[]; total?: number; total_estimated?: boolean }
    >(url)
    if (cached) {
      const cachedPayload: { data?: CRMContact[]; total?: number; total_estimated?: boolean } =
        ('payload' in cached && cached.payload)
          ? cached.payload
          : (cached as { data?: CRMContact[]; total?: number; total_estimated?: boolean })
      const cachedRows = cachedPayload.data?.length ?? 0
      const cachedTotal = cachedPayload.total ?? 0
      if (currentPage === 0 && cachedTotal > 0 && cachedRows === 0) {
        // Ne pas réutiliser une entrée cache incohérente en page 0.
        invalidate(url)
      } else {
      if (currentPage > 0 && cachedTotal > 0 && cachedRows === 0) {
        // Page hors plage: on revient immédiatement à la page 0.
        if (requestSeq === contactsFetchSeqRef.current) setPage(0)
        setLoading(false)
        return
      }
      if (requestSeq === contactsFetchSeqRef.current) {
        setFetchError(false)
        applyContactsRows(cachedPayload.data ?? [])
        const nextTotal = cachedPayload.total ?? 0
        setTotal(nextTotal)
        if (activeViewId && activeViewId !== 'all') {
          setViewCounts(prev => ({ ...prev, [activeViewId]: nextTotal }))
        }
        setTotalEstimated(cachedPayload.total_estimated === true)
        if ('clientMs' in cached && typeof cached.clientMs === 'number') setLastFetchClientMs(cached.clientMs)
        if ('serverMs' in cached && typeof cached.serverMs === 'number') setLastFetchServerMs(cached.serverMs)
      }
      setLoading(false)
      refetch<{
        payload: { data?: CRMContact[]; total?: number; total_estimated?: boolean }
        clientMs: number
        serverMs: number | null
      }>(url, fetchContactsPayload, 30_000)
        .then(({ payload, clientMs, serverMs }) => {
          if (requestSeq !== contactsFetchSeqRef.current) return
          const rows = payload.data?.length ?? 0
          const nextTotal = payload.total ?? 0
          if (currentPage > 0 && nextTotal > 0 && rows === 0) {
            setPage(0)
            return
          }
          applyContactsRows(payload.data ?? [])
          setTotal(nextTotal)
          if (activeViewId && activeViewId !== 'all') {
            setViewCounts(prev => ({ ...prev, [activeViewId]: nextTotal }))
          }
          setTotalEstimated(payload.total_estimated === true)
          setLastFetchClientMs(clientMs)
          setLastFetchServerMs(serverMs)
          if (payload.total_estimated === true) void refreshExactTotal()
        })
        .catch(() => {})
      return
      }
    }

    if (!hasLoadedOnceRef.current) setLoading(true)
    try {
      const { payload, clientMs, serverMs } = await refetch<{
        payload: { data?: CRMContact[]; total?: number; total_estimated?: boolean }
        clientMs: number
        serverMs: number | null
      }>(url, fetchContactsPayload, 30_000)
      if (requestSeq !== contactsFetchSeqRef.current) return
      const rows = payload.data?.length ?? 0
      const nextTotal = payload.total ?? 0
      if (currentPage > 0 && nextTotal > 0 && rows === 0) {
        setPage(0)
        return
      }
      applyContactsRows(payload.data ?? [])
      setTotal(nextTotal)
      if (activeViewId && activeViewId !== 'all') {
        setViewCounts(prev => ({ ...prev, [activeViewId]: nextTotal }))
      }
      setTotalEstimated(payload.total_estimated === true)
      setLastFetchClientMs(clientMs)
      setLastFetchServerMs(serverMs)
      setFetchError(false)
      hasLoadedOnceRef.current = true
      if (payload.total_estimated === true) void refreshExactTotal()
    } catch {
      // garde le state precedent en cas d'erreur reseau ; signale l'échec
      // sauf si la requête a été remplacée par une plus récente.
      if (requestSeq === contactsFetchSeqRef.current && !requestAbort.signal.aborted) setFetchError(true)
    } finally {
      if (requestSeq === contactsFetchSeqRef.current) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, stage, closerHsId, closerContactHsId, closerContactNot, contactOwnerHsId, teleproHsId, noTelepro, ownerExclude, recentFormMonths, recentFormDays, createdBeforeDays, showExternal, allClasses, leadStatus, source, formEvent, parcoursupVerdict, zoneFilter, deptFilter, stageNot, leadStatusNot, sourceNot, formEventNot, zoneNot, deptNot, closerNot, contactOwnerNot, teleproNot, formationNot, pipeline, pipelineNot, priorPreinscription, emptyFields, notEmptyFields, formation, classe, period, sortBy, sortDir, limit, page, extraColumns, customFilterParam, activeViewId, activeViewNameForFetch, activeViewIncludeEmptyLeadStatus])

  useEffect(() => { fetchContacts() }, [fetchContacts])
  useEffect(() => () => contactsAbortRef.current?.abort(), [])

  const handleContactPatched = useCallback((contactId: string, patch: ContactInlinePatch) => {
    setContacts(prev => prev.map(c => {
      if (c.hubspot_contact_id !== contactId) return c
      let next = c
      if (patch.contact) next = { ...next, ...patch.contact }
      if (patch.deal && next.deal) next = { ...next, deal: { ...next.deal, ...patch.deal } }
      return next
    }))
  }, [])

  const fetchRef = useRef(fetchContacts)
  fetchRef.current = fetchContacts

  const shouldAutoRefreshLeads = useMemo(() => {
    const active = crmViews.find(v => v.id === activeViewId)
    const activeName = (active?.name ?? '').toLowerCase()
    // "Tous les leads" doit aussi se rafraîchir automatiquement pour afficher
    // les nouveaux formulaires sans action manuelle.
    const isAllLeadsView = activeViewId === 'all'
    return isAllLeadsView || activeName.includes('linova') || activeName.includes('edumove') || activeName.includes('candidature diploma') || source === 'meta_lead_ads' || customFilterParam.includes('"meta_lead_ads"')
  }, [crmViews, activeViewId, source, customFilterParam])

  // Rafraichit la liste en continu pour refléter les leads Meta quasi en temps réel.
  // Le webhook/poll peut insérer un lead pendant que la vue LINOVA est ouverte.
  useEffect(() => {
    if (!shouldAutoRefreshLeads || isMobile) return
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        if (document.visibilityState !== 'visible') return
        fetchRef.current(false)
      }, LEADS_AUTO_REFRESH_MS)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchRef.current(false)
        start()
      } else {
        stop()
      }
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [shouldAutoRefreshLeads, isMobile])

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPage(0), 180)
  }

  function handleSortChange(col: string) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  // ── View management ──────────────────────────────────────────────────────────

  function applyGroupsToFilters(groups: CRMFilterGroup[], flags?: CRMSavedView['presetFlags']) {
    // Reset all positive filters
    setSearch(''); setStage(''); setCloserHsId(''); setCloserContactHsId(''); setContactOwnerHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod(''); setLeadStatus(''); setSource(''); setFormEvent('')
    setParcoursupVerdict('')
    setZoneFilter(''); setDeptFilter('')
    // Reset all exclusion filters
    setStageNot(''); setLeadStatusNot(''); setSourceNot(''); setFormEventNot(''); setZoneNot(''); setDeptNot('')
    setCloserNot(''); setCloserContactNot(''); setContactOwnerNot(''); setTeleproNot(''); setFormationNot('')
    setPipeline(''); setPipelineNot('')
    setPriorPreinscription(false)
    // Reset empty/not-empty filters
    setEmptyFields(''); setNotEmptyFields('')
    setCustomFilterParam('')
    setNoTelepro(flags?.noTelepro ?? false)
    setRecentFormMonths(flags?.recentFormMonths ?? 0)
    setRecentFormDays(flags?.recentFormDays ?? 0)
    setCreatedBeforeDays(flags?.createdBeforeDays ?? 0)

    // Apply first group rules (AND) to the simple filter params
    const firstGroup = groups[0]
    const customFilters: Array<{ field: string; operator: string; value: string }> = []
    if (firstGroup) {
      for (const rule of firstGroup.rules) {
        const ruleField = normalizeLegacyFieldName(String(rule.field))
        if (!rule.value && rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty') continue
        const val = rule.value
        // Filtre custom (propriété HubSpot non-hardcodée) → JSON envoyé via ?cf=
        if (ruleField.startsWith('custom:')) {
          customFilters.push({
            field: ruleField.slice(7),
            operator: rule.operator,
            value: val,
          })
          continue
        }
        // form_event :
        // - is / is_any utilisent les params dédiés (resolver hybride API)
        // - contains / not_contains restent en custom filter (ILIKE SQL)
        //   pour éviter les écarts count/list sur les vues de type LINOVA.
        if (ruleField === 'form_event') {
          if (rule.operator === 'is' || rule.operator === 'is_any') {
            setFormEvent(val)
            continue
          }
          if (rule.operator === 'is_not' || rule.operator === 'is_none') {
            setFormEventNot(val)
            continue
          }
          // Fallback pour opérateurs non couverts par params dédiés.
          customFilters.push({ field: 'recent_conversion_event', operator: rule.operator, value: val })
          continue
        }
        // Demande de rappel Lab : résolu côté API en liste de contact_id
        // (la source est une soumission de formulaire, pas une colonne).
        if (ruleField === 'lab_callback' || ruleField === 'lab_app') {
          customFilters.push({ field: ruleField, operator: rule.operator, value: val })
          continue
        }
        // Verdict Parcoursup : résolu côté API par liste de statuts.
        // "est connu" (is_not_empty) → token '__any__' (tout verdict présent),
        // "est inconnu" (is_empty)   → 'aucun' (pas de verdict).
        if (ruleField === 'parcoursup_verdict') {
          if (rule.operator === 'is_not_empty')  { setParcoursupVerdict('__any__'); continue }
          if (rule.operator === 'is_empty')      { setParcoursupVerdict('aucun'); continue }
          setParcoursupVerdict(val)
          continue
        }
        // Positive filters: is, is_any, contains
        if (rule.operator === 'is' || rule.operator === 'is_any' || rule.operator === 'contains') {
          switch (ruleField) {
            case 'stage':       setStage(val); break
            case 'formation':   setFormation(val); break
            case 'classe':      setClasse(val); break
            case 'closer':
            case 'closer_contact': setCloserContactHsId(val); break
            case 'contact_owner': setContactOwnerHsId(val); break
            case 'telepro':       setTeleproHsId(val); break
            case 'lead_status': setLeadStatus(val); break
            case 'source':      setSource(val); break
            case 'period':      setPeriod(val); break
            case 'search':      setSearch(val); break
            case 'zone':        setZoneFilter(val); break
            case 'departement': setDeptFilter(val); break
            case 'pipeline':    setPipeline(val); break
            case 'prior_preinscription': if (val === '1') setPriorPreinscription(true); break
          }
        }
        // Exclusion filters: is_not, is_none
        if (rule.operator === 'is_not' || rule.operator === 'is_none') {
          switch (ruleField) {
            case 'stage':         setStageNot(val); break
            case 'formation':     setFormationNot(val); break
            case 'closer':
            case 'closer_contact': setCloserContactNot(val); break
            case 'contact_owner': setContactOwnerNot(val); break
            case 'telepro':       setTeleproNot(val); break
            case 'lead_status':   setLeadStatusNot(val); break
            case 'source':        setSourceNot(val); break
            case 'zone':          setZoneNot(val); break
            case 'departement':   setDeptNot(val); break
            case 'pipeline':      setPipelineNot(val); break
          }
        }
        // Empty / not-empty filters
        if (rule.operator === 'is_empty') {
          setEmptyFields(prev => prev ? `${prev},${ruleField}` : ruleField)
        }
        if (rule.operator === 'is_not_empty') {
          setNotEmptyFields(prev => prev ? `${prev},${ruleField}` : ruleField)
        }
      }
    }
    // Sérialise les filtres custom dans l'URL via ?cf=
    setCustomFilterParam(customFilters.length > 0 ? JSON.stringify(customFilters) : '')
  }

  function applyCRMView(view: CRMSavedView) {
    // Evite l'affichage transitoire des données de la vue précédente.
    setLoading(true)
    setContacts([])
    setTotal(0)
    setTotalEstimated(false)
    setSelectedIds(new Set())
    setSelectionScope('page')
    setBulkPropOpen(false)
    selectAllViewAbortRef.current?.abort()
    setSelectingAllView(false)
    setSelectAllViewProgress(null)
    // Evite qu'un ancien état UI (classes/externe) réduise silencieusement
    // les résultats d'une vue sauvegardée.
    setShowExternal(true)
    setAllClasses(true)
    syncViewIdInUrl(view.id, 'push')
    // Les facettes suivent l'utilisateur d'une sous-vue à l'autre du même bucket.
    const targetBucketId = view.parentId
      ?? parseAttributionParentId(view.id)
      ?? (isAttributionBucketId(view.id) ? view.id : null)
    const facets = targetBucketId && targetBucketId === activeBucketId && bucketHasFacets(targetBucketId)
      ? bucketFacets
      : EMPTY_BUCKET_FACETS
    setBucketFacets(facets)
    setActiveViewId(view.id)
    setFilterGroups(view.groups)
    applyGroupsToFilters(withBucketFacets(view.groups, facets), view.presetFlags)
    setPage(0)
    scheduleRefetch()
  }

  function changeBucketFacets(next: BucketFacetSelection) {
    const view = crmViews.find(v => v.id === activeViewId)
    setBucketFacets(next)
    setLoading(true)
    setSelectedIds(new Set())
    setSelectionScope('page')
    applyGroupsToFilters(withBucketFacets(filterGroups, next), view?.presetFlags)
    setPage(0)
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
    const nextLayout = [...layoutViewIds, id]
    setLayoutViewIds(nextLayout)
    void persistAdminViewLayout(nextLayout)
    syncViewIdInUrl(id, 'push')
    setActiveViewId(id)
    setCreatingView(false)
    setNewViewName('')
  }

  /** Sous-vues créées en cliquant (barre « Sous-vues ») : on ouvre la 1re. */
  function createSubviews(views: CRMSavedView[]) {
    if (views.length === 0) return
    const base = crmViews.filter(v => !v.isDefault).length
    setCrmViews(prev => [...prev, ...views])
    void Promise.all(views.map((v, i) => persistViewCreate(v, base + i))).then(() => {
      void fetchViewCounts(views.map(v => v.id))
    })
    applyCRMView(views[0])
  }

  function deleteSubview(view: CRMSavedView) {
    setCrmViews(prev => prev.filter(v => v.id !== view.id))
    void persistViewDelete(view.id)
    if (activeViewId === view.id) {
      const parent = crmViews.find(v => v.id === view.parentId)
      if (parent) applyCRMView(parent)
    }
  }

  function unpinCRMView(viewId: string) {
    const nextLayout = layoutViewIds.filter(id => id !== viewId)
    setLayoutViewIds(nextLayout)
    void persistAdminViewLayout(nextLayout)
    if (activeViewId === viewId || parseAttributionParentId(activeViewId) === viewId) {
      const nextPinned = catalogTopLevelViews.find(v => nextLayout.includes(v.id))
      applyCRMView(nextPinned ?? CRM_DEFAULT_VIEWS[0])
    }
  }

  function pinCRMView(viewId: string) {
    if (layoutViewIds.includes(viewId)) return
    const nextLayout = [...layoutViewIds, viewId]
    setLayoutViewIds(nextLayout)
    void persistAdminViewLayout(nextLayout)
  }

  function renameCRMView(viewId: string, newName: string) {
    const current = crmViews.find(v => v.id === viewId)?.name ?? ''
    const next = newName.trim() || current
    if (next !== current) {
      setCrmViews(prev => prev.map(v => v.id === viewId ? { ...v, name: next } : v))
      persistViewUpdate(viewId, { name: next })
    }
    setRenamingViewId(null)
  }

  function updateCRMViewFilters(viewId: string) {
    const parentView = crmViews.find(v => v.id === viewId)
    const nextParent = parentView ? { ...parentView, groups: [...filterGroups] } : null
    // Les sous-vues créées en cliquant suivent les filtres de leur parent.
    const recomposed = new Map<string, CRMSavedView>()
    if (nextParent) {
      for (const child of crmViews) {
        if (child.parentId !== viewId) continue
        const next = recomposeSubview(nextParent, child)
        if (next) recomposed.set(child.id, next)
      }
    }
    const updated = crmViews.map(v =>
      v.id === viewId ? { ...v, groups: [...filterGroups] } : (recomposed.get(v.id) ?? v)
    )
    setCrmViews(updated)
    forceFreshListRef.current = true
    for (const child of recomposed.values()) {
      void persistViewUpdate(child.id, { filter_groups: child.groups, preset_flags: child.presetFlags ?? null })
    }
    void persistViewUpdate(viewId, { filter_groups: filterGroups }).then(() => {
      void fetchViewCounts([viewId, ...recomposed.keys()])
    })
    scheduleRefetch()
  }

  function reorderCRMViews(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromIdx = layoutViewIds.indexOf(fromId)
    const toIdx = layoutViewIds.indexOf(toId)
    if (fromIdx < 0 || toIdx < 0) return

    const next = [...layoutViewIds]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setLayoutViewIds(next)
    void persistAdminViewLayout(next)
  }

  // ── Filter group CRUD ──────────────────────────────────────────────────────

  function addFilterGroup() {
    const g: CRMFilterGroup = {
      id: `g_${Date.now()}`,
      rules: [{ id: `r_${Date.now()}`, field: 'stage', operator: 'is_any', value: '' }],
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
        rules: [...g.rules, { id: `r_${Date.now()}`, field: 'stage' as CRMFilterField, operator: 'is_any' as CRMFilterOp, value: '' }],
      }
    })
    setFilterGroups(updated)
  }

  function updateRule(gid: string, rid: string, patch: Partial<CRMFilterRule>) {
    const prevForm = filterGroups
      .flatMap(g => g.rules)
      .filter(r => r.field === 'form_event')
      .map(r => r.value)
      .join('|')
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
    const nextForm = updated
      .flatMap(g => g.rules)
      .filter(r => r.field === 'form_event')
      .map(r => r.value)
      .join('|')
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    if (activeViewId && activeViewId !== 'all' && prevForm !== nextForm) {
      setCrmViews(prev => prev.map(v => v.id === activeViewId ? { ...v, groups: updated } : v))
      forceFreshListRef.current = true
      void persistViewUpdate(activeViewId, { filter_groups: updated }).then(() => {
        void fetchViewCounts([activeViewId])
      })
    }
    scheduleRefetch()
  }

  function removeRule(gid: string, rid: string) {
    const updated = filterGroups.map(g => {
      if (g.id !== gid) return g
      return { ...g, rules: g.rules.filter(r => r.id !== rid) }
    }).filter(g => g.rules.length > 0)
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    scheduleRefetch()
  }

  function formatSignalTime(isoDate: string | null | undefined) {
    if (!isoDate) return 'inconnu'
    const diff = Date.now() - new Date(isoDate).getTime()
    const min = Math.max(0, Math.round(diff / 60000))
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const h = Math.round(min / 60)
    return `il y a ${h}h`
  }

  const displayed = contacts

  const totalFilterRules = filterGroups.reduce((sum, g) => sum + g.rules.length, 0)
  const hasActiveFilters = (
    search || stage || closerContactHsId || contactOwnerHsId || teleproHsId ||
    formation || classe || period || noTelepro || ownerExclude || recentFormMonths > 0 ||
    recentFormDays > 0 || createdBeforeDays > 0 || leadStatus || source || formEvent ||
    zoneFilter || deptFilter || formEventNot ||
    totalFilterRules > 0
  )

  // Check if current filters changed from active view
  const activeCRMView = crmViews.find(v => v.id === activeViewId)
  const crmViewChanged = activeCRMView ? (
    JSON.stringify(filterGroups) !== JSON.stringify(activeCRMView.groups)
  ) : false

  function resetAll() {
    setSearch(''); setStage(''); setCloserHsId(''); setCloserContactHsId(''); setContactOwnerHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod('')
    setFormEvent(''); setFormEventNot('')
    setNoTelepro(false); setOwnerExclude(''); setRecentFormMonths(0)
    setLeadStatus(''); setSource(''); setZoneFilter(''); setDeptFilter('')
    setFilterGroups([])
    syncViewIdInUrl('all', 'push')
    setActiveViewId('all')
  }

  function clearAdvancedFilters() {
    setFilterGroups([])
    setFormEvent('')
    setFormEventNot('')
    setCustomFilterParam('')
    setPage(0)
  }

  // ── Sélection en masse ────────────────────────────────────────────────────────

  function clearSelection() {
    setSelectedIds(new Set())
    setSelectionScope('page')
    setBulkPropOpen(false)
    setBulkPropName('')
    setBulkPropValue('')
    setBulkUpdateProgress(null)
    selectAllViewAbortRef.current?.abort()
    setSelectingAllView(false)
    setSelectAllViewProgress(null)
  }

  function toggleSelect(id: string) {
    setSelectionScope('page')
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllPage(ids: string[]) {
    setSelectionScope('page')
    setSelectedIds(prev => new Set([...prev, ...ids]))
  }

  function deselectAll() {
    clearSelection()
  }

  function selectFirst(n: number) {
    setSelectionScope('page')
    const ids = displayed.slice(0, n).map(c => c.hubspot_contact_id)
    setSelectedIds(new Set(ids))
  }

  function selectAll() {
    setSelectionScope('page')
    setSelectedIds(new Set(displayed.map(c => c.hubspot_contact_id)))
  }

  /** Params de liste alignés sur fetchContacts (pour select-all-view / export IDs). */
  function buildCurrentListParams(): URLSearchParams {
    const activeView = crmViews.find(v => v.id === activeViewId)
    const activeViewName = (activeView?.name ?? '').toLowerCase()
    const forceMetaAdsOnly = activeViewId === 'v_meta_ads_all' || activeViewName.includes('meta ads')
    const params = new URLSearchParams()
    if (activeViewId) params.set('view_id', activeViewId)
    if (debouncedSearch)      params.set('search', debouncedSearch)
    if (stage)                params.set('stage', stage)
    if (closerHsId)           params.set('closer_hs_id', closerHsId)
    if (closerContactHsId)    params.set('closer_contact_hs_id', closerContactHsId)
    if (closerContactNot)     params.set('closer_contact_not', closerContactNot)
    if (contactOwnerHsId)     params.set('contact_owner_hs_id', contactOwnerHsId)
    if (teleproHsId)          params.set('telepro_hs_id', teleproHsId)
    if (noTelepro)            params.set('no_telepro', '1')
    if (crmViews.find(v => v.id === activeViewId)?.presetFlags?.includeEmptyLeadStatus) {
      params.set('include_empty_lead_status', '1')
    }
    if (ownerExclude)         params.set('owner_exclude', ownerExclude)
    if (recentFormMonths > 0) params.set('recent_form_months', String(recentFormMonths))
    if (recentFormDays > 0)   params.set('recent_form_days', String(recentFormDays))
    if (createdBeforeDays > 0) params.set('created_before_days', String(createdBeforeDays))
    const forceStableViewScope = !!activeViewId && activeViewId !== 'all'
    if (showExternal || forceStableViewScope) params.set('show_external', '1')
    if (allClasses || forceMetaAdsOnly || forceStableViewScope) params.set('all_classes', '1')
    if (leadStatus)           params.set('lead_status', leadStatus)
    if (source)               params.set('source', source)
    if (formEvent)            params.set('form_event', formEvent)
    if (parcoursupVerdict)    params.set('parcoursup_verdict', parcoursupVerdict)
    if (zoneFilter)           params.set('zone', zoneFilter)
    if (deptFilter)           params.set('departement', deptFilter)
    if (stageNot)             params.set('stage_not', stageNot)
    if (leadStatusNot)        params.set('lead_status_not', leadStatusNot)
    if (sourceNot)            params.set('source_not', sourceNot)
    if (formEventNot)         params.set('form_event_not', formEventNot)
    if (zoneNot)              params.set('zone_not', zoneNot)
    if (deptNot)              params.set('departement_not', deptNot)
    if (closerNot)            params.set('closer_not', closerNot)
    if (contactOwnerNot)      params.set('contact_owner_not', contactOwnerNot)
    if (teleproNot)           params.set('telepro_not', teleproNot)
    if (formationNot)         params.set('formation_not', formationNot)
    if (pipeline)             params.set('pipeline', pipeline)
    if (pipelineNot)          params.set('pipeline_not', pipelineNot)
    if (priorPreinscription)  params.set('prior_preinscription', '1')
    if (emptyFields)          params.set('empty_fields', emptyFields)
    if (notEmptyFields)       params.set('not_empty_fields', notEmptyFields)
    if (formation)            params.set('formation', formation)
    if (classe)               params.set('classe', classe)
    if (period)               params.set('period', period)
    params.set('sort_by', sortBy)
    params.set('sort_dir', sortDir)
    if (customFilterParam && !forceMetaAdsOnly) params.set('cf', customFilterParam)
    if (forceMetaAdsOnly) params.set('meta_ads_only', '1')
    return params
  }

  const pageFullySelected =
    displayed.length > 0 &&
    displayed.every(c => selectedIds.has(c.hubspot_contact_id))
  const canSelectEntireView =
    pageFullySelected &&
    selectionScope === 'page' &&
    total > displayed.length &&
    !selectingAllView

  async function selectAllMatchingView() {
    if (selectingAllView) return
    selectAllViewAbortRef.current?.abort()
    const abort = new AbortController()
    selectAllViewAbortRef.current = abort

    setSelectingAllView(true)
    setSelectAllViewProgress({ loaded: 0, total })
    try {
      const params = buildCurrentListParams()
      params.set('export', '1')
      params.set('ids_only', '1')
      params.set('exact_count', '1')
      const ids = new Set<string>()
      let exportPage = 0
      // Pas de plafond métier : on pagine jusqu'à épuisement (10k / page).
      while (true) {
        if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        params.set('page', String(exportPage))
        const res = await fetch(`/api/crm/contacts?${params.toString()}`, { signal: abort.signal })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d?.error || `Erreur chargement des contacts (page ${exportPage})`)
        }
        const data = await res.json()
        const batch: Array<{ hubspot_contact_id?: string | null }> = data.data ?? []
        for (const row of batch) {
          const id = row?.hubspot_contact_id
          if (id) ids.add(String(id))
        }
        setSelectAllViewProgress({ loaded: ids.size, total: typeof data.total === 'number' ? data.total : total })
        if (batch.length < 10000) break
        exportPage += 1
      }
      if (abort.signal.aborted) return
      setSelectedIds(ids)
      setSelectionScope('view')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      alert(e instanceof Error ? e.message : 'Erreur sélection de la vue')
    } finally {
      setSelectingAllView(false)
      setSelectAllViewProgress(null)
    }
  }

  async function handleBulkAssign() {
    if (!bulkTeleproId || selectedIds.size === 0) return
    const selectedTelepro = telepros.find(u => u.id === bulkTeleproId)
    if (!selectedTelepro) return
    const teleproHsUserId = selectedTelepro.hubspot_user_id || selectedTelepro.hubspot_owner_id || null
    setBulkAssigning(true)
    try {
      // Chunk technique (évite timeouts) — pas de plafond métier.
      const allIds = [...selectedIds]
      const CHUNK = 200
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK)
        const res = await fetch('/api/crm/contacts/bulk-assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_ids: chunk,
            telepro_rdv_user_id: selectedTelepro.id,
            telepro_user_id: teleproHsUserId,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d?.error || `Erreur attribution (lot ${Math.floor(i / CHUNK) + 1})`)
        }
      }
      clearSelection()
      setBulkTeleproId('')
      await fetchContacts(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur attribution en masse')
    } finally {
      setBulkAssigning(false)
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || bulkDeleting) return
    const count = selectedIds.size
    const msg = count === 1
      ? 'Supprimer définitivement ce contact ainsi que ses transactions associées ?\n\nCette action est irréversible.'
      : `Supprimer définitivement ces ${count} contacts ainsi que leurs transactions associées ?\n\nCette action est irréversible.`
    if (!window.confirm(msg)) return

    setBulkDeleting(true)
    try {
      const allIds = [...selectedIds]
      const CHUNK = 200
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK)
        const res = await fetch('/api/crm/contacts/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_ids: chunk }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d?.error || `Erreur suppression (lot ${Math.floor(i / CHUNK) + 1})`)
        }
      }
      clearSelection()
      await fetchContacts(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur suppression en masse')
    } finally {
      setBulkDeleting(false)
    }
  }

  const bulkPropMeta = useMemo(
    () => resolveBulkPropMeta(bulkPropName, allCrmProps),
    [allCrmProps, bulkPropName],
  )

  async function handleBulkPropUpdate() {
    if (!bulkPropName || selectedIds.size === 0 || bulkUpdating) return
    if (isReadOnlyProperty(bulkPropMeta)) {
      alert('Cette propriété est en lecture seule.')
      return
    }
    const label = bulkPropMeta?.label || bulkPropName
    const displayValue = bulkPropValue === '' ? '(vide)' : bulkPropValue
    const msg = `Mettre à jour « ${label} » = « ${displayValue} » sur ${selectedIds.size.toLocaleString('fr-FR')} contact${selectedIds.size > 1 ? 's' : ''} ?\n\nCette action est irréversible.`
    if (!window.confirm(msg)) return

    setBulkUpdating(true)
    const allIds = [...selectedIds]
    const propertyName = bulkPropName
    const CHUNK = 500
    let done = 0
    let appliedValue: string = bulkPropValue
    const allErrors: string[] = []
    setBulkUpdateProgress({ done: 0, total: allIds.length })
    try {
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK)
        const isLast = i + CHUNK >= allIds.length
        const res = await fetch('/api/crm/contacts/bulk-update-props', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_ids: chunk,
            property: propertyName,
            value: bulkPropValue,
            refresh_mv: isLast,
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(d?.error || `Erreur mise à jour (lot ${Math.floor(i / CHUNK) + 1})`)
        }
        done += typeof d.done === 'number' ? d.done : chunk.length
        if (d.value !== undefined && d.value !== null) appliedValue = String(d.value)
        if (Array.isArray(d.errors)) allErrors.push(...d.errors)
        setBulkUpdateProgress({ done, total: allIds.length })
      }
      if (allErrors.length > 0) {
        alert(`Mise à jour partielle : ${done}/${allIds.length} OK.\n\nExemples d'erreurs :\n${allErrors.slice(0, 5).join('\n')}`)
      }

      // Affichage immédiat (pas d'attente MV / cache) — 100 % Supabase, pas HubSpot.
      const idSet = new Set(allIds)
      const col = HUBSPOT_PROPERTY_TO_COLUMN[propertyName]
      setContacts(prev => prev.map(c => {
        if (!idSet.has(c.hubspot_contact_id)) return c
        const next: CRMContact = { ...c }
        if (col) (next as unknown as Record<string, unknown>)[col] = appliedValue
        const extra: Record<string, unknown> = { ...(next.extra_props ?? {}), [propertyName]: appliedValue }
        if (propertyName === 'telepro_user_id' || propertyName === 'teleprospecteur') {
          extra.teleprospecteur = appliedValue
          next.telepro_user_id = appliedValue
        }
        next.extra_props = extra
        return next
      }))

      invalidatePrefix('/api/crm/contacts')
      forceFreshListRef.current = true
      clearSelection()
      await fetchContacts(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur mise à jour en masse')
    } finally {
      setBulkUpdating(false)
      setBulkUpdateProgress(null)
    }
  }

  // ── Dropdown options ───────────────────────────────────────────────────────────

  // Helper : fusionner les owners HubSpot (51) avec les rdv_users (closer/telepro),
  // dédupliquer sur hubspot_owner_id, trier par label.
  const mergeOwnersWithUsers = useCallback((users: RdvUser[]): SelectOption[] => {
    const map = new Map<string, SelectOption>()
    // Priorité aux rdv_users (qui ont un name explicite)
    for (const u of users) {
      const id = u.hubspot_owner_id ?? u.hubspot_user_id ?? u.id
      if (id) map.set(id, { id, label: u.name })
    }
    // Compléter avec les owners HubSpot manquants
    for (const o of hubspotOwners) {
      if (!o.hubspot_owner_id || map.has(o.hubspot_owner_id)) continue
      const label = [o.firstname, o.lastname].filter(Boolean).join(' ').trim()
        || o.email
        || o.hubspot_owner_id
      map.set(o.hubspot_owner_id, { id: o.hubspot_owner_id, label })
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [hubspotOwners])

  // Propriétés Closer et Télépro : on inclut TOUS les rdv_users (tous rôles
  // confondus) + tous les owners HubSpot (incluant Benjamin Delacour, équipe
  // externe). Comme la propriété "Owner" de HubSpot, tout utilisateur créé dans
  // le CRM apparaît automatiquement dans les deux dropdowns.
  // Le backend `expandTeleproFilterValues` côté API gère l'équivalence
  // hubspot_owner_id ↔ hubspot_user_id, donc utiliser hubspot_owner_id comme
  // clé fonctionne pour les deux filtres.
  const closerOptions: SelectOption[] = useMemo(() => [
    { id: '', label: 'Tous les closers' },
    ...mergeOwnersWithUsers(allUsers),
  ], [allUsers, mergeOwnersWithUsers])
  const teleproOptions: SelectOption[] = useMemo(() => [
    { id: '', label: 'Tous les télépros' },
    ...mergeOwnersWithUsers(allUsers),
  ], [allUsers, mergeOwnersWithUsers])
  // Tous les utilisateurs avec un hubspot_owner_id (pour "Exclure propriétaire")
  const ownerExcludeOptions: SelectOption[] = useMemo(() => [
    { id: '', label: 'Aucune exclusion' },
    ...mergeOwnersWithUsers(allUsers.filter(u => u.hubspot_owner_id)),
  ], [allUsers, mergeOwnersWithUsers])

  // ── Présentation V2 (gabarit A) : état purement visuel ───────────────────
  const pageRootRef = useRef<HTMLDivElement | null>(null)
  const fillHeight = useScrollParentHeight(pageRootRef)
  const [viewQuery, setViewQuery] = useState('')
  const shownTopLevelViews = viewQuery.trim()
    ? topLevelViews.filter(v => foldText(v.name).includes(foldText(viewQuery.trim())))
    : topLevelViews
  const pipelineLabel = pipeline && !pipeline.includes(',')
    ? (pipelineOptions.find(o => o.id === pipeline)?.label ?? '')
    : ''
  const quickFilterCount = [
    stage, closerContactHsId, teleproHsId, period, formEvent, formEventNot, noTelepro,
    recentFormMonths > 0, recentFormDays > 0, createdBeforeDays > 0,
  ].filter(Boolean).length + totalFilterRules
  const apiHint = lastFetchClientMs !== null
    ? `API ${lastFetchClientMs} ms${lastFetchServerMs !== null ? ` (srv ${lastFetchServerMs} ms)` : ''}`
    : undefined
  const headerMenuItems: HeaderMenuItem[] = [
    ...(!isMobile ? [{ label: 'Journal Repop', icon: <BookOpen size={15} color={crmV2.gold} />, onClick: () => setShowRepop(true) }] : []),
    { label: 'Transactions 2026-2027', icon: <GraduationCap size={15} color={crmV2.gold} />, href: '/admin/crm/transactions' },
    { label: 'Annuaire des vues', icon: <List size={15} color={crmV2.textMuted} />, onClick: () => setManageViewsOpen(true) },
    ...(isMobile ? [
      { label: 'Importer', icon: <Upload size={15} color={crmV2.textMuted} />, href: '/admin/crm/import' },
      { label: 'Exporter', icon: <Download size={15} color={crmV2.textMuted} />, onClick: () => setExportModalOpen(true) },
    ] : []),
  ]

  // Filtres rapides (pilules) + filtres actifs retirables
  const quickFilterPills = (
    <>
      <V2FilterMultiPill label="Étape" value={stage} onChange={v => { setStage(v); scheduleRefetch() }} options={STAGE_OPTIONS} />
      <V2FilterMultiPill label="Closer" value={closerContactHsId} onChange={v => { setCloserContactHsId(v); scheduleRefetch() }} options={closerOptions} />
      <V2FilterMultiPill label="Télépro" value={teleproHsId} onChange={v => { setTeleproHsId(v); scheduleRefetch() }} options={teleproOptions} />
      <V2FilterPill label="Période" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
    </>
  )
  const viewActionLinks = (
    <>
      {crmViewChanged && activeViewId !== 'all' && !activeCRMView?.isDefault && (
        <V2ToolbarLink tone="gold" icon={<Save size={14} />} onClick={() => updateCRMViewFilters(activeViewId)}>
          Sauvegarder
        </V2ToolbarLink>
      )}
      {!creatingView && (
        <V2ToolbarLink icon={<Plus size={14} />} onClick={() => { setCreatingView(true); setNewViewName('') }}>
          Enregistrer la vue
        </V2ToolbarLink>
      )}
    </>
  )
  const activeFilterChips = hasActiveFilters ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', width: '100%' }}>
      {noTelepro && <V2ActiveChip label="Sans télépro" onRemove={() => { setNoTelepro(false); scheduleRefetch() }} />}
      {recentFormMonths > 0 && <V2ActiveChip label={`Form. < ${recentFormMonths} mois`} onRemove={() => { setRecentFormMonths(0); scheduleRefetch() }} />}
      {recentFormDays > 0 && <V2ActiveChip label={`Form. < ${recentFormDays} j`} onRemove={() => { setRecentFormDays(0); scheduleRefetch() }} />}
      {createdBeforeDays > 0 && <V2ActiveChip label={`Créé > ${createdBeforeDays} j`} onRemove={() => { setCreatedBeforeDays(0); scheduleRefetch() }} />}
      {stage && <V2ActiveChip label={stage.includes(',') ? `${stage.split(',').length} étapes` : STAGE_OPTIONS.find(o => o.id === stage)?.label ?? stage} onRemove={() => { setStage(''); scheduleRefetch() }} />}
      {closerContactHsId && <V2ActiveChip label={closerContactHsId.includes(',') ? `${closerContactHsId.split(',').length} closers` : closerOptions.find(o => o.id === closerContactHsId)?.label ?? 'Closer du contact'} onRemove={() => { setCloserContactHsId(''); scheduleRefetch() }} />}
      {teleproHsId && <V2ActiveChip label={teleproHsId.includes(',') ? `${teleproHsId.split(',').length} télépros` : teleproOptions.find(o => o.id === teleproHsId)?.label ?? 'Télépro'} onRemove={() => { setTeleproHsId(''); scheduleRefetch() }} />}
      {formEvent && <V2ActiveChip label={formEvent.includes(',') ? `${formEvent.split(',').length} formulaires` : formEvent} onRemove={() => { setFormEvent(''); scheduleRefetch() }} />}
      {formEventNot && <V2ActiveChip label={`Formulaire ≠ ${formEventNot.includes(',') ? `${formEventNot.split(',').length} valeurs` : formEventNot}`} onRemove={() => { setFormEventNot(''); scheduleRefetch() }} />}
      {period && <V2ActiveChip label={PERIOD_OPTIONS.find(o => o.id === period)?.label ?? period} onRemove={() => setPeriod('')} />}
      {search && <V2ActiveChip label={`« ${search} »`} onRemove={() => { setSearch(''); scheduleRefetch() }} />}
      <V2ToolbarLink tone="danger" icon={<X size={13} />} onClick={() => { resetAll(); scheduleRefetch() }}>
        Réinitialiser
      </V2ToolbarLink>
    </div>
  ) : null

  // Barre de sélection en masse
  const bulkBar = (selectedIds.size > 0 || selectingAllView) ? (
    <div style={{
      position: isMobile ? 'sticky' : 'relative', top: 0, zIndex: 40, flexShrink: 0,
      background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`,
      ...(isMobile ? { border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, margin: '0 0 8px', boxShadow: crmV2.shadow } : {}),
      padding: isMobile ? '10px 12px' : '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 10, overflow: 'visible',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: crmV2.text }}>
          <SquareCheck size={15} color={crmV2.link} />
          {selectingAllView
            ? `Chargement… ${(selectAllViewProgress?.loaded ?? 0).toLocaleString('fr-FR')}${selectAllViewProgress?.total ? ` / ${selectAllViewProgress.total.toLocaleString('fr-FR')}` : ''}`
            : `${selectedIds.size.toLocaleString('fr-FR')} lead${selectedIds.size > 1 ? 's' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}${selectionScope === 'view' ? ' (toute la vue)' : ''}`}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[25, 100, 500].map(n => (
            <CrmV2Button key={n} size="sm" onClick={() => selectFirst(n)} disabled={selectingAllView || bulkUpdating}>
              {n} premiers
            </CrmV2Button>
          ))}
          <CrmV2Button size="sm" onClick={selectAll} disabled={selectingAllView || bulkUpdating}>
            Tout ({displayed.length})
          </CrmV2Button>
          <CrmV2Button size="sm" variant="ghost" onClick={clearSelection}>
            {selectingAllView ? 'Annuler' : 'Désélectionner'}
          </CrmV2Button>
          <CrmV2Button
            size="sm"
            icon={<Pencil size={13} />}
            onClick={() => {
              ensureCrmPropsLoaded()
              setBulkPropOpen(o => !o)
            }}
            disabled={selectingAllView || selectedIds.size === 0 || bulkUpdating}
            style={bulkPropOpen ? { background: crmV2.bgHover, borderColor: crmV2.link, color: crmV2.link } : undefined}
          >
            Modifier une propriété
          </CrmV2Button>
          <CrmV2Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={handleBulkDelete}
            disabled={bulkDeleting || selectingAllView || bulkUpdating || selectedIds.size === 0}
            title={`Supprimer ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''} et leurs transactions`}
          >
            {bulkDeleting ? 'Suppression…' : 'Supprimer'}
          </CrmV2Button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: crmV2.textMuted }}>Assigner à :</span>
          <select
            value={bulkTeleproId}
            onChange={e => setBulkTeleproId(e.target.value)}
            disabled={selectingAllView || bulkUpdating}
            style={{
              height: 32, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
              padding: '0 10px', color: crmV2.text, fontSize: 13, fontFamily: 'inherit', maxWidth: 220,
            }}
          >
            <option value="">Choisir un télépro</option>
            {telepros.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <CrmV2Button
            size="sm"
            variant="primary"
            onClick={handleBulkAssign}
            disabled={!bulkTeleproId || bulkAssigning || selectingAllView || bulkUpdating || selectedIds.size === 0}
          >
            {bulkAssigning ? 'Attribution…' : 'Assigner'}
          </CrmV2Button>
        </div>
      </div>

      {/* Sélectionner toute la vue */}
      {(canSelectEntireView || selectingAllView) && (
        <div style={{
          background: 'rgba(0,145,174,0.06)', border: '1px solid rgba(0,145,174,0.22)',
          borderRadius: crmV2.radius, padding: '8px 12px', fontSize: 13, color: crmV2.text,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          {selectingAllView ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <V2InlineSpinner />
              Sélection de tous les contacts de la vue en cours…
              {selectAllViewProgress
                ? ` ${selectAllViewProgress.loaded.toLocaleString('fr-FR')}${selectAllViewProgress.total ? ` / ${selectAllViewProgress.total.toLocaleString('fr-FR')}` : ''}`
                : ''}
            </span>
          ) : (
            <>
              <span>Les {displayed.length.toLocaleString('fr-FR')} contacts de cette page sont sélectionnés.</span>
              <CrmV2Button size="sm" variant="ghost" onClick={selectAllMatchingView} style={{ padding: '4px 6px' }}>
                Sélectionner les {total.toLocaleString('fr-FR')} contacts de cette vue
              </CrmV2Button>
            </>
          )}
        </div>
      )}

      {/* Édition d'une propriété en masse */}
      {bulkPropOpen && selectedIds.size > 0 && !selectingAllView && (
        <div style={{
          background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12,
          padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap',
          position: 'relative', zIndex: 50, overflow: 'visible',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220, position: 'relative', zIndex: 50, overflow: 'visible' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>Propriété</label>
            <CRMBulkPropertyPicker
              value={bulkPropName}
              onChange={name => {
                setBulkPropName(name)
                setBulkPropValue('')
              }}
              crmProps={allCrmProps}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>Nouvelle valeur</label>
            {(() => {
              const meta = bulkPropMeta
              const ft = String(meta?.field_type || '').toLowerCase()
              const tp = String(meta?.type || '').toLowerCase()
              const opts = Array.isArray(meta?.options) ? meta!.options! : null
              const inputStyle = {
                background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
                padding: '0 10px', height: 34, color: crmV2.text, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
              } as const
              if (!bulkPropName) {
                return <input disabled placeholder="Choisir une propriété d’abord" style={inputStyle} />
              }
              if (tp === 'bool' || ft === 'booleancheckbox') {
                return (
                  <select value={bulkPropValue} onChange={e => setBulkPropValue(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    <option value="true">Oui</option>
                    <option value="false">Non</option>
                  </select>
                )
              }
              if ((ft === 'select' || ft === 'radio' || ft === 'checkbox') && opts && opts.length > 0) {
                return (
                  <select value={bulkPropValue} onChange={e => setBulkPropValue(e.target.value)} style={inputStyle}>
                    <option value="">— (vide)</option>
                    {opts.map(o => (
                      <option key={String(o.value)} value={String(o.value)}>{o.label || o.value}</option>
                    ))}
                  </select>
                )
              }
              if (tp === 'date' || ft === 'date') {
                return (
                  <input type="date" value={bulkPropValue} onChange={e => setBulkPropValue(e.target.value)} style={inputStyle} />
                )
              }
              if (tp === 'number' || ft === 'number') {
                return (
                  <input type="number" value={bulkPropValue} onChange={e => setBulkPropValue(e.target.value)} style={inputStyle} />
                )
              }
              return (
                <input
                  type="text"
                  value={bulkPropValue}
                  onChange={e => setBulkPropValue(e.target.value)}
                  placeholder="Valeur (vide = effacer)"
                  style={inputStyle}
                />
              )
            })()}
          </div>
          <CrmV2Button
            variant="primary"
            onClick={handleBulkPropUpdate}
            disabled={!bulkPropName || bulkUpdating}
          >
            {bulkUpdating
              ? `Mise à jour… ${bulkUpdateProgress ? `${bulkUpdateProgress.done}/${bulkUpdateProgress.total}` : ''}`
              : `Appliquer à ${selectedIds.size.toLocaleString('fr-FR')}`}
          </CrmV2Button>
        </div>
      )}
    </div>
  ) : null

  // Pied de tableau : « 1–25 sur N » + pagination ronde
  const pager = (
    <V2ContactsPager
      page={page}
      limit={limit}
      total={total}
      estimated={totalEstimated}
      onPage={p => setPage(p)}
      onLimit={n => { setLimit(n); setPage(0) }}
      compact={isMobile}
      hint={apiHint}
    />
  )

  return (
    <div
      ref={pageRootRef}
      style={{
        display: 'flex', flexDirection: 'column',
        // Remplit la zone qui défile du shell V2 : seul le tableau défile.
        height: fillHeight ?? (isMobile ? 'calc(100dvh - 56px)' : '100vh'),
        background: crmV2.bgSoft, color: crmV2.text, fontFamily: 'inherit',
      }}
    >

      {/* ── En-tête blanc : titre, compteur, actions, onglets de vues ───────── */}
      <CrmV2Header
        title="Contacts"
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {loading ? (
              <><V2InlineSpinner /> Chargement…</>
            ) : (
              <span title={apiHint} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {totalEstimated ? '≈ ' : ''}{total.toLocaleString('fr-FR')} contact{total !== 1 ? 's' : ''}
              </span>
            )}
            {pipelineLabel && <span>· Pipeline {pipelineLabel}</span>}
            {(formation || classe || period) && !loading ? <span>· {displayed.length} affiché{displayed.length !== 1 ? 's' : ''}</span> : null}
            {!isMobile && ingestionHealth && (
              <span
                title="Basé sur meta_lead_events.processed_at et crm_contacts.synced_at"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  color: ingestionHealth.is_stale ? '#b45309' : crmV2.textMuted,
                  fontWeight: ingestionHealth.is_stale ? 700 : 400, whiteSpace: 'nowrap',
                }}
              >
                ·
                {ingestionHealth.is_stale
                  ? <AlertTriangle size={13} />
                  : <span style={{ width: 7, height: 7, borderRadius: '50%', background: crmV2.success }} />}
                Dernier lead {formatSignalTime(
                  ingestionHealth.latest_meta_event?.processed_at ?? ingestionHealth.latest_contact?.synced_at,
                )} · 24 h : {ingestionHealth.meta_events_24h} événements Meta / {ingestionHealth.contacts_24h} contacts mis à jour
              </span>
            )}
          </span>
        }
        actions={isMobile ? (
          <>
            <V2MoreMenu items={headerMenuItems} size={40} />
            <V2RoundButton variant="primary" size={40} title="Créer un contact" onClick={() => setShowNewContact(true)}>
              <Plus size={18} />
            </V2RoundButton>
          </>
        ) : (
          <>
            <V2MoreMenu items={headerMenuItems} />
            <V2PillLink href="/admin/crm/import" icon={<Upload size={14} />}>Importer</V2PillLink>
            <CrmV2Button icon={<Download size={14} />} onClick={() => setExportModalOpen(true)}>Exporter</CrmV2Button>
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNewContact(true)}>Créer un contact</CrmV2Button>
          </>
        )}
      >
        {/* Onglets de vues soulignés : la rangée défile horizontalement */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 0,
          margin: isMobile ? '0 -12px' : '0 -28px', padding: isMobile ? '0 12px' : '0 28px',
          overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
        }}>
          <V2ViewSearch value={viewQuery} onChange={setViewQuery} compact={isMobile} />

          {shownTopLevelViews.map(view => {
            const isBucket = view.kind === 'bucket' || isAttributionBucketId(view.id)
            const isActive = activeViewId === view.id || activeBucketId === view.id
            const isRenaming = renamingViewId === view.id
            const isDraggable = !view.isDefault && !isRenaming
            const isDragOver = dragOverViewId === view.id && draggedViewId && draggedViewId !== view.id
            const count = viewCounts[view.id]

            return (
              <div
                key={view.id}
                draggable={isDraggable}
                onDragStart={isDraggable ? (e) => {
                  setDraggedViewId(view.id)
                  e.dataTransfer.effectAllowed = 'move'
                } : undefined}
                onDragOver={(e) => {
                  if (!draggedViewId || view.isDefault) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverViewId(view.id)
                }}
                onDragLeave={() => {
                  if (dragOverViewId === view.id) setDragOverViewId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggedViewId && !view.isDefault) {
                    reorderCRMViews(draggedViewId, view.id)
                  }
                  setDraggedViewId(null)
                  setDragOverViewId(null)
                }}
                onDragEnd={() => {
                  setDraggedViewId(null)
                  setDragOverViewId(null)
                }}
                onClick={() => { if (!isRenaming) applyCRMView(view) }}
                onDoubleClick={() => {
                  if (!view.isDefault) {
                    setRenamingViewId(view.id)
                    setRenameValue(view.name)
                  }
                }}
                role="tab"
                aria-selected={isActive}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
                  padding: isMobile ? '10px 12px' : '10px 14px', marginBottom: -1,
                  borderBottom: isActive
                    ? `3px solid ${crmV2.text}`
                    : isDragOver ? `3px solid ${crmV2.goldBorder}` : '3px solid transparent',
                  background: isDragOver ? crmV2.goldSoft : 'transparent',
                  fontSize: 14, fontWeight: isActive ? 600 : 500,
                  color: isActive ? crmV2.text : crmV2.textMuted,
                  cursor: isRenaming ? 'text' : isDraggable ? 'grab' : 'pointer',
                  opacity: draggedViewId === view.id ? 0.5 : 1,
                  transition: 'color .12s, border-color .12s',
                }}
              >
                {isBucket && <Layers size={14} color={isActive ? crmV2.text : crmV2.textFaint} />}

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
                      background: crmV2.bg, border: `1px solid ${crmV2.gold}`,
                      borderRadius: crmV2.radiusSm, padding: '2px 8px', color: crmV2.text,
                      fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      outline: 'none', width: Math.max(80, renameValue.length * 8),
                    }}
                  />
                ) : (
                  <span>{view.name}</span>
                )}

                {/* Compteur gris entre parenthèses */}
                {count !== undefined && (
                  <span style={{ color: crmV2.textFaint, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    ({count.toLocaleString('fr-FR')})
                  </span>
                )}

                {!view.isDefault && isActive && !isRenaming && (
                  <>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setRenamingViewId(view.id)
                        setRenameValue(view.name)
                      }}
                      title="Renommer la vue (tous les admins et télépros)"
                      aria-label="Renommer la vue"
                      style={{ background: 'none', border: 'none', padding: 2, color: crmV2.textFaint, cursor: 'pointer', display: 'flex', marginLeft: 2 }}
                    >
                      <Pen size={12} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); unpinCRMView(view.id) }}
                      title="Retirer de mes onglets"
                      aria-label="Retirer de mes onglets"
                      style={{ background: 'none', border: 'none', padding: 2, color: crmV2.textFaint, cursor: 'pointer', display: 'flex' }}
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
            )
          })}

          {viewQuery.trim() && shownTopLevelViews.length === 0 && (
            <span style={{ alignSelf: 'center', padding: '0 14px 6px', fontSize: 13, color: crmV2.textFaint, whiteSpace: 'nowrap' }}>
              Aucune vue
            </span>
          )}

          {/* Créer une vue (saisie du nom) ou ouvrir l'annuaire des vues */}
          {creatingView ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '6px 10px', marginBottom: -1, borderBottom: `3px solid ${crmV2.gold}`,
            }}>
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
                  background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
                  borderRadius: crmV2.radius, padding: '4px 10px', color: crmV2.text,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 150,
                }}
              />
              <button
                onClick={() => createCRMView(newViewName)}
                title="Créer la vue"
                aria-label="Créer la vue"
                style={{ background: crmV2.primary, border: 'none', borderRadius: 999, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Check size={13} color="#fff" />
              </button>
              <button
                onClick={() => { setCreatingView(false); setNewViewName('') }}
                title="Annuler"
                aria-label="Annuler"
                style={{ background: 'none', border: 'none', padding: 0, color: crmV2.textMuted, cursor: 'pointer', display: 'flex' }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setManageViewsOpen(true)}
              title="Ajouter une vue existante ou en créer une"
              style={{
                appearance: 'none', background: 'none', border: 'none', borderBottom: '3px solid transparent',
                marginBottom: -1, padding: isMobile ? '10px 12px' : '10px 14px',
                display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap',
                fontSize: 14, fontWeight: 600, color: crmV2.link, cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = crmV2.linkHover)}
              onMouseLeave={e => (e.currentTarget.style.color = crmV2.link)}
            >
              <Plus size={13} /> Ajouter une vue
            </button>
          )}
        </div>
      </CrmV2Header>

      {activeBucketParent && (
        <CRMBucketSubviewsBar
          parent={activeBucketParent}
          subviews={activeBucketChildren}
          activeViewId={activeViewId}
          viewCounts={viewCounts}
          onSelect={applyCRMView}
          facets={activeBucketHasFacets ? bucketFacets : undefined}
          onFacetsChange={activeBucketHasFacets ? changeBucketFacets : undefined}
          onCreateSubviews={createSubviews}
          onDeleteSubview={deleteSubview}
          onRenameSubview={(view, name) => renameCRMView(view.id, name)}
        />
      )}

      {/* ── Corps (carte tableau) + panneau des filtres avancés ─────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        padding: isMobile ? '10px 10px 0' : '16px 28px 20px', gap: isMobile ? 8 : 0,
      }}>
        {/* Mobile : recherche + bouton filtres avec compteur */}
        {isMobile && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <V2ContactSearch
              value={search}
              onChange={setSearch}
              onEnter={() => fetchContacts(true)}
              height={42}
              style={{ flex: 1 }}
            />
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
            {quickFilterPills}
            <V2AdvancedFiltersLink count={totalFilterRules} open={filterPanelOpen} onClick={() => setFilterPanelOpen(o => !o)} />
            {viewActionLinks}
            {activeFilterChips}
          </div>
        )}

        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0,
          ...(isMobile ? {} : {
            background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
            boxShadow: crmV2.shadow, overflow: 'hidden',
          }),
        }}>
          {/* Barre d'outils : recherche, filtres pilules, Filtres avancés, Colonnes */}
          {!isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', flexWrap: 'wrap',
              borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0,
            }}>
              <V2ContactSearch
                value={search}
                onChange={setSearch}
                onEnter={() => fetchContacts(true)}
                style={{ flex: '0 1 280px', minWidth: 220 }}
              />
              {quickFilterPills}
              <V2AdvancedFiltersLink count={totalFilterRules} open={filterPanelOpen} onClick={() => setFilterPanelOpen(o => !o)} />
              {viewActionLinks}
              <div style={{ flex: 1 }} />
              {/* Bouton « Colonnes » rendu ici par CRMContactsTable (portail) */}
              <div ref={setColumnsSlot} />
              {activeFilterChips}
            </div>
          )}

          {!isMobile && bulkBar}

          {!loading && displayed.length === 0 && (fetchError || totalFilterRules > 0) && (
            <div style={{
              margin: isMobile ? '0 0 8px' : '12px 14px 0', flexShrink: 0,
              background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 12,
              padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, color: crmV2.goldDark }}>
                {fetchError
                  ? 'Le chargement des contacts a échoué ou a pris trop de temps.'
                  : 'Les filtres avancés actifs masquent tous les résultats.'}
              </span>
              {fetchError ? (
                <CrmV2Button size="sm" onClick={() => fetchContacts()}>
                  Réessayer
                </CrmV2Button>
              ) : (
                <CrmV2Button size="sm" onClick={clearAdvancedFilters}>
                  Retirer les filtres avancés
                </CrmV2Button>
              )}
            </div>
          )}

          {/* Zone qui défile : tableau (ordinateur) ou liste compacte (mobile) */}
          <div ref={tableScrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {isMobile && bulkBar}
            <CRMContactsTable
              contacts={displayed}
              loading={loading && displayed.length === 0}
              mode="admin"
              onRefresh={() => fetchContacts()}
              onContactPatched={handleContactPatched}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAllPage}
              onDeselectAll={deselectAll}
              onOpenDrawer={setDrawerContact}
              leadStatusOptions={leadStatusOptions.filter(o => o.id !== '')}
              sourceOptions={sourceOptions.filter(o => o.id !== '')}
              closerSelectOptions={closerOptions.filter(o => o.id !== '')}
              teleproSelectOptions={teleproOptions.filter(o => o.id !== '')}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={handleSortChange}
              allCrmProps={allCrmProps}
              extraColumns={extraColumns}
              onExtraColumnsChange={persistExtraColumns}
              onRequestProps={ensureCrmPropsLoaded}
              columnsMenuSlot={isMobile ? null : columnsSlot}
            />
            {isMobile && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                padding: '12px 4px 20px', fontSize: 13, color: crmV2.textMuted,
              }}>
                {pager}
                {apiHint && <span style={{ fontSize: 11, color: crmV2.textFaint, width: '100%' }}>{apiHint}</span>}
              </div>
            )}
          </div>

          {!isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              padding: '10px 14px', borderTop: `1px solid ${crmV2.border}`, fontSize: 13, color: crmV2.textMuted, flexShrink: 0,
            }}>
              {pager}
            </div>
          )}
        </div>
      </div>

      {/* ── Advanced Filter Side Panel — RIGHT (HubSpot-style) ────────────── */}
      {filterPanelOpen && (
        <div style={{
          width: isMobile ? '100%' : 380, flexShrink: 0,
          background: crmV2.bg, borderLeft: `1px solid ${crmV2.border}`,
          boxShadow: isMobile ? 'none' : '-8px 0 24px rgba(15,31,61,0.06)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          ...(isMobile ? { position: 'fixed' as const, inset: 0, bottom: 56, zIndex: 60 } : {}),
        }}>
          {/* En-tête du panneau */}
          <div style={{
            padding: '14px 16px', borderBottom: `1px solid ${crmV2.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: crmV2.text }}>
              <SlidersHorizontal size={16} color={crmV2.gold} /> Tous les filtres
            </span>
            <button onClick={() => setFilterPanelOpen(false)} aria-label="Fermer" style={{
              width: 32, height: 32, borderRadius: 999, background: crmV2.bg, border: `1px solid ${crmV2.border}`,
              color: crmV2.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Corps du panneau */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
              Filtres avancés
            </div>


            {filterGroups.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#516f90', background: '#ffffff', padding: '2px 10px', border: '1px solid #dfe3eb', borderRadius: 4 }}>ou</span>
                    <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
                  </div>
                )}

                <div style={{ background: '#ffffff', border: '1px solid #dfe3eb', borderRadius: 10, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#516f90' }}>Groupe {gi + 1}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => duplicateFilterGroup(group.id)} title="Dupliquer" style={{ background: 'none', border: 'none', color: '#0F1F3D', cursor: 'pointer', display: 'flex', padding: 3 }}><Copy size={13} /></button>
                      <button onClick={() => deleteFilterGroup(group.id)} title="Supprimer" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: 3 }}><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {group.rules.map((rule, ri) => {
                    const normalizedField = normalizeLegacyFieldName(String(rule.field))
                    const fieldDef = CRM_FILTER_FIELDS.find(f => f.key === normalizedField)
                    const customName = isCustomField(normalizedField)
                    const customProp = customName ? allCrmProps.find(p => p.name === customName) : null

                    // Détermine le « kind » de la propriété pour choisir l'input + les opérateurs
                    let kind: ReturnType<typeof propertyKindOf> = 'text'
                    if (customProp) {
                      kind = propertyKindOf(customProp.type, customProp.field_type)
                    } else if (fieldDef?.type === 'select') {
                      kind = 'enum'
                    }
                    const ops = customProp ? opsForKind(kind) : opsForField(normalizedField as CRMFilterField)
                    const showVal = opNeedsValue(rule.operator)

                    // Options pour les enums (hardcodés ou venant des propriétés HubSpot)
                    let valueOptions: SelectOption[] = []
                    if (customProp && customProp.options && customProp.options.length > 0) {
                      valueOptions = customProp.options.map(o => ({ id: o.value, label: o.label }))
                    } else {
                      switch (normalizedField) {
                        case 'stage':       valueOptions = allStageOptions; break
                        case 'formation':   valueOptions = FORMATION_OPTIONS.filter(o => o.id); break
                        case 'classe':      valueOptions = CLASSE_OPTIONS.filter(o => o.id); break
                        case 'closer':
                        case 'closer_contact': valueOptions = closerOptions.filter(o => o.id); break
                        case 'contact_owner': valueOptions = closerOptions.filter(o => o.id); break
                        case 'telepro':       valueOptions = teleproOptions.filter(o => o.id); break
                        case 'lead_status': valueOptions = leadStatusOptions.filter(o => o.id); break
                        case 'source': {
                          const opts = sourceOptions.filter(o => o.id)
                          // Si les origines ne sont pas encore chargées, on garde
                          // au moins la/les valeur(s) déjà sélectionnée(s) pour
                          // l'affichage — sans injecter de fausse valeur unique
                          // (l'ancien fallback "meta_lead_ads" masquait la vraie
                          // liste tant que le fetch n'avait pas répondu).
                          const selectedFallback = (rule.value ? rule.value.split(',') : [])
                            .filter(Boolean)
                            .map(v => ({ id: v, label: v }))
                          valueOptions = opts.length > 0 ? opts : selectedFallback
                          break
                        }
                        case 'zone':        valueOptions = zoneOptions.filter(o => o.id); break
                        case 'departement': valueOptions = deptOptions.filter(o => o.id); break
                        case 'period':      valueOptions = PERIOD_OPTIONS.filter(o => o.id); break
                        case 'pipeline':    valueOptions = pipelineOptions; break
                        case 'prior_preinscription': valueOptions = [{ id: '1', label: 'Oui' }]; break
                        case 'form_event':  valueOptions = formEventOptions.filter(o => o.id); break
                        case 'parcoursup_verdict': valueOptions = PARCOURSUP_VERDICT_FILTER_OPTIONS; break
                        case 'lab_callback': valueOptions = LAB_CALLBACK_FILTER_OPTIONS; break
                        case 'lab_app':      valueOptions = LAB_APP_FILTER_OPTIONS; break
                      }
                    }

                    // Décompose la valeur "between" (format "v1|v2")
                    const isRange = opIsRange(rule.operator)
                    const [v1, v2] = isRange ? (rule.value || '').split('|') : [rule.value || '', '']

                    const inputStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #dfe3eb', borderRadius: 6, padding: '6px 8px', color: '#0F1F3D', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%' }

                    const renderValueInput = () => {
                      if (!showVal) return null
                      // form_event : ALWAYS searchable dropdown (toutes les options
                      // sont fetchees au mount, sans aucune condition de fallback).
                      if (normalizedField === 'form_event') {
                        const evOpts = formEventOptions.filter(o => o.id)
                        if (opIsMulti(rule.operator)) {
                          return (
                            <MultiSelectDropdown
                              options={evOpts}
                              value={rule.value}
                              onChange={v => updateRule(group.id, rule.id, { value: v })}
                              allowCustomValue
                              loading={evOpts.length === 0}
                            />
                          )
                        }
                        return (
                          <SearchableSelect
                            options={evOpts}
                            value={rule.value}
                            onChange={v => updateRule(group.id, rule.id, { value: v })}
                            allowCustomValue
                          />
                        )
                      }
                      // DATE / DATETIME
                      if (kind === 'date' || kind === 'datetime') {
                        const inputType = kind === 'datetime' ? 'datetime-local' : 'date'
                        if (isRange) {
                          return (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type={inputType} value={v1} onChange={e => updateRule(group.id, rule.id, { value: `${e.target.value}|${v2}` })} style={{ ...inputStyle, flex: 1 }} />
                              <input type={inputType} value={v2} onChange={e => updateRule(group.id, rule.id, { value: `${v1}|${e.target.value}` })} style={{ ...inputStyle, flex: 1 }} />
                            </div>
                          )
                        }
                        return <input type={inputType} value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={inputStyle} />
                      }
                      // NUMBER
                      if (kind === 'number') {
                        if (isRange) {
                          return (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="number" value={v1} onChange={e => updateRule(group.id, rule.id, { value: `${e.target.value}|${v2}` })} placeholder="Min" style={{ ...inputStyle, flex: 1 }} />
                              <input type="number" value={v2} onChange={e => updateRule(group.id, rule.id, { value: `${v1}|${e.target.value}` })} placeholder="Max" style={{ ...inputStyle, flex: 1 }} />
                            </div>
                          )
                        }
                        return <input type="number" value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} placeholder="Valeur…" style={inputStyle} />
                      }
                      // BOOL
                      if (kind === 'bool') {
                        return (
                          <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ ...inputStyle, color: rule.value ? '#C9A84C' : '#516f90', cursor: 'pointer' }}>
                            <option value="">Rechercher…</option>
                            <option value="true">Oui</option>
                            <option value="false">Non</option>
                          </select>
                        )
                      }
                      // ENUM — règle stricte : si le champ est de type 'select'
                      // (ou la prop custom est un enum), on rend TOUJOURS un
                      // dropdown, même si la liste d'options n'a pas encore été
                      // chargée. Évite que "Statut du lead" et autres select
                      // basculent en input texte pendant le fetch des options.
                      if (kind === 'enum' || fieldDef?.type === 'select') {
                        if (shouldRenderMultiSelect(normalizedField, rule.operator)) {
                          return (
                            <MultiSelectDropdown
                              options={valueOptions}
                              value={rule.value}
                              onChange={v => updateRule(group.id, rule.id, {
                                value: v,
                                operator: coerceMultiSelectOperator(normalizedField, rule.operator),
                              })}
                            />
                          )
                        }
                        if (valueOptions.length > 20) {
                          return (
                            <SearchableSelect
                              options={valueOptions}
                              value={rule.value}
                              onChange={v => updateRule(group.id, rule.id, { value: v })}
                            />
                          )
                        }
                        return (
                          <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ ...inputStyle, color: rule.value ? '#C9A84C' : '#516f90', cursor: 'pointer' }}>
                            <option value="">{valueOptions.length === 0 ? 'Chargement…' : 'Rechercher…'}</option>
                            {valueOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                          </select>
                        )
                      }
                      // TEXT (fallback)
                      return <input type="text" value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} placeholder="Valeur…" style={inputStyle} />
                    }

                    return (
                      <div key={rule.id}>
                        {ri > 0 && <div style={{ fontSize: 11, color: '#0F1F3D', padding: '4px 0 4px 4px' }}>et</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#f5f8fa', border: '1px solid #dfe3eb', borderRadius: 8, padding: '24px 10px 8px', position: 'relative' }}>
                          {/* z-index 5 : le CRMFieldPicker (position: relative) est rendu APRÈS
                              et le recouvrait → bouton invisible / inactif. */}
                          <button
                            type="button"
                            onClick={() => removeRule(group.id, rule.id)}
                            title="Supprimer ce filtre"
                            style={{ position: 'absolute', top: 4, right: 4, background: '#ffffff', border: '1px solid #dfe3eb', borderRadius: 6, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, width: 22, height: 22, zIndex: 5 }}
                          ><X size={13} /></button>
                          <CRMFieldPicker
                            value={normalizedField}
                            onChange={(field) => {
                              // Opérateur par défaut selon le type du champ :
                              // les champs "select" multi-capables (ex. Origine)
                              // basculent sur "est parmi" pour permettre la
                              // sélection de plusieurs valeurs directement.
                              const next = allCrmProps.find(p => 'custom:' + p.name === field)
                              const defaultOp = defaultOpForField(field, next)
                              updateRule(group.id, rule.id, { field: field as CRMFilterField, operator: defaultOp, value: '' })
                            }}
                            crmProps={allCrmProps}
                          />
                          <select value={rule.operator} onChange={e => updateRule(group.id, rule.id, { operator: e.target.value as CRMFilterOp })} style={{ background: '#ffffff', border: '1px solid #dfe3eb', borderRadius: 6, padding: '6px 8px', color: '#516f90', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                            {ops.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
                          </select>
                          {renderValueInput()}
                        </div>
                      </div>
                    )
                  })}

                  <button onClick={() => addRuleToGroup(group.id)} style={{ marginTop: 8, padding: '6px 12px', background: 'transparent', border: '1px solid #dfe3eb', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={11} /> Ajouter un filtre
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: filterGroups.length > 0 ? 12 : 0 }}>
              {filterGroups.length > 0 && (
                <>
                  <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#516f90' }}>ou</span>
                </>
              )}
              <button onClick={addFilterGroup} style={{ padding: '8px 14px', background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <Plus size={12} /> Ajouter un groupe de filtres
              </button>
            </div>
          </div>

          {/* Panel footer */}
          {totalFilterRules > 0 && (
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${crmV2.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Mettre à jour la vue personnalisée active si ses filtres ont changé */}
              {crmViewChanged && activeCRMView && !activeCRMView.isDefault && (
                <CrmV2Button
                  icon={<Save size={14} />}
                  onClick={() => { updateCRMViewFilters(activeViewId); }}
                  style={{ width: '100%' }}
                >
                  Mettre à jour « {activeCRMView.name} »
                </CrmV2Button>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <CrmV2Button variant="danger" onClick={() => { setFilterGroups([]); applyGroupsToFilters([]); scheduleRefetch() }} style={{ flex: 1 }}>
                  Tout effacer
                </CrmV2Button>
                <CrmV2Button variant="gold" icon={<Plus size={14} />} onClick={() => setCreatingView(true)} style={{ flex: 1 }}>
                  Nouvelle vue
                </CrmV2Button>
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
        ::-webkit-scrollbar-thumb { background: #cbd6e2; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #7c98b6; }
      `}</style>

      {/* ── Manage Views Modal ──────────────────────────────────────────────── */}
      {manageViewsOpen && (
        <CRMManageViewsModal
          catalogViews={catalogTopLevelViews}
          layoutViewIds={layoutViewIds}
          onClose={() => setManageViewsOpen(false)}
          onRename={(id, name) => renameCRMView(id, name)}
          onPin={pinCRMView}
          onUnpin={unpinCRMView}
          onCreate={name => {
            createCRMView(name)
            setManageViewsOpen(false)
          }}
        />
      )}

      {/* ── Export CSV Modal ──────────────────────────────────────────────── */}
      {exportModalOpen && (
        <ExportCSVModal
          buildParams={() => {
            const p = new URLSearchParams()
            if (search)               p.set('search', search)
            if (stage)                p.set('stage', stage)
            if (closerHsId)           p.set('closer_hs_id', closerHsId)
            if (teleproHsId)          p.set('telepro_hs_id', teleproHsId)
            if (noTelepro)            p.set('no_telepro', '1')
            if (ownerExclude)         p.set('owner_exclude', ownerExclude)
            if (recentFormMonths > 0) p.set('recent_form_months', String(recentFormMonths))
            const forceStableViewScope = !!activeViewId && activeViewId !== 'all'
            if (showExternal || forceStableViewScope) p.set('show_external', '1')
            if (allClasses || forceStableViewScope)   p.set('all_classes', '1')
            if (leadStatus)           p.set('lead_status', leadStatus)
            if (source)               p.set('source', source)
            if (zoneFilter)           p.set('zone', zoneFilter)
            if (deptFilter)           p.set('departement', deptFilter)
            if (stageNot)             p.set('stage_not', stageNot)
            if (leadStatusNot)        p.set('lead_status_not', leadStatusNot)
            if (sourceNot)            p.set('source_not', sourceNot)
            if (zoneNot)              p.set('zone_not', zoneNot)
            if (deptNot)              p.set('departement_not', deptNot)
            if (closerNot)            p.set('closer_not', closerNot)
            if (teleproNot)           p.set('telepro_not', teleproNot)
            if (formationNot)         p.set('formation_not', formationNot)
            if (emptyFields)          p.set('empty_fields', emptyFields)
            if (notEmptyFields)       p.set('not_empty_fields', notEmptyFields)
            return p
          }}
          exporting={exporting}
          onClose={() => setExportModalOpen(false)}
          onExport={async (cols) => {
            setExporting(true)
            try {
              const params = new URLSearchParams({ export: '1' })
              if (search)               params.set('search', search)
              if (stage)                params.set('stage', stage)
              if (closerHsId)           params.set('closer_hs_id', closerHsId)
              if (contactOwnerHsId)     params.set('contact_owner_hs_id', contactOwnerHsId)
              if (teleproHsId)          params.set('telepro_hs_id', teleproHsId)
              if (noTelepro)            params.set('no_telepro', '1')
              if (crmViews.find(v => v.id === activeViewId)?.presetFlags?.includeEmptyLeadStatus) {
                params.set('include_empty_lead_status', '1')
              }
              if (ownerExclude)         params.set('owner_exclude', ownerExclude)
              if (recentFormMonths > 0) params.set('recent_form_months', String(recentFormMonths))
      if (recentFormDays > 0)   params.set('recent_form_days', String(recentFormDays))
      if (createdBeforeDays > 0) params.set('created_before_days', String(createdBeforeDays))
              const forceStableViewScope = !!activeViewId && activeViewId !== 'all'
              if (showExternal || forceStableViewScope) params.set('show_external', '1')
              if (allClasses || forceStableViewScope)   params.set('all_classes', '1')
              if (leadStatus)           params.set('lead_status', leadStatus)
              if (source)               params.set('source', source)
              if (zoneFilter)           params.set('zone', zoneFilter)
              if (deptFilter)           params.set('departement', deptFilter)
              if (stageNot)             params.set('stage_not', stageNot)
              if (leadStatusNot)        params.set('lead_status_not', leadStatusNot)
              if (sourceNot)            params.set('source_not', sourceNot)
              if (zoneNot)              params.set('zone_not', zoneNot)
              if (deptNot)              params.set('departement_not', deptNot)
              if (closerNot)            params.set('closer_not', closerNot)
      if (contactOwnerNot)      params.set('contact_owner_not', contactOwnerNot)
              if (teleproNot)           params.set('telepro_not', teleproNot)
              if (formationNot)         params.set('formation_not', formationNot)
              if (emptyFields)          params.set('empty_fields', emptyFields)
              if (notEmptyFields)       params.set('not_empty_fields', notEmptyFields)

              // Paginated export: fetch all pages (10000 per page)
              const rows: CRMContact[] = []
              let exportPage = 0
              while (true) {
                params.set('page', String(exportPage))
                const res = await fetch(`/api/crm/contacts?${params.toString()}`)
                if (!res.ok) throw new Error('Export failed')
                const data = await res.json()
                const batch: CRMContact[] = data.data ?? []
                rows.push(...batch)
                // If we got fewer than 10000, we've reached the last page
                if (batch.length < 10000) break
                exportPage++
                // Safety: max 50 pages = 500K rows
                if (exportPage >= 50) break
              }

              // Stage label lookup
              const stageLabel = (id?: string | null) => {
                if (!id) return ''
                const opt = STAGE_OPTIONS.find(o => o.id === id)
                return opt ? opt.label.replace(/^[^\w]*/, '').trim() : id
              }

              // Build CSV
              const BOM = '\uFEFF'
              const SEP = ';'
              const headers: string[] = []
              const colMap: { key: string; extract: (c: CRMContact) => string }[] = []

              for (const col of cols) {
                switch (col) {
                  case 'contact':
                    headers.push('Prénom', 'Nom')
                    colMap.push({ key: 'prenom', extract: c => c.firstname ?? '' })
                    colMap.push({ key: 'nom', extract: c => c.lastname ?? '' })
                    break
                  case 'email':
                    headers.push('Email')
                    colMap.push({ key: 'email', extract: c => c.email ?? '' })
                    break
                  case 'phone':
                    headers.push('Téléphone')
                    colMap.push({ key: 'phone', extract: c => c.phone ?? '' })
                    break
                  case 'formation_souhaitee':
                    headers.push('Formation souhaitée')
                    colMap.push({ key: 'formation_souhaitee', extract: c => c.formation_souhaitee ?? '' })
                    break
                  case 'classe':
                    headers.push('Classe')
                    colMap.push({ key: 'classe', extract: c => c.classe_actuelle ?? '' })
                    break
                  case 'zone':
                    headers.push('Zone')
                    colMap.push({ key: 'zone', extract: c => c.zone_localite ?? '' })
                    break
                  case 'departement':
                    headers.push('Département')
                    colMap.push({ key: 'departement', extract: c => c.departement ?? '' })
                    break
                  case 'etape':
                    headers.push('Étape')
                    colMap.push({ key: 'etape', extract: c => stageLabel(c.deal?.dealstage) })
                    break
                  case 'lead_status':
                    headers.push('Statut lead')
                    colMap.push({ key: 'lead_status', extract: c => c.hs_lead_status ?? '' })
                    break
                  case 'origine':
                    headers.push('Origine')
                    colMap.push({ key: 'origine', extract: c => c.origine ?? '' })
                    break
                  case 'closer':
                    headers.push('Closer du contact')
                    colMap.push({
                      key: 'closer',
                      extract: c => {
                        const id = c.closer_du_contact_owner_id
                        if (!id) return c.deal?.closer?.name ?? ''
                        return closerOptions.find(o => o.id === id)?.label ?? id
                      },
                    })
                    break
                  case 'telepro':
                    headers.push('Télépro')
                    colMap.push({ key: 'telepro', extract: c => c.deal?.telepro?.name ?? '' })
                    break
                  case 'createdat_contact':
                    headers.push('Date création (contact)')
                    colMap.push({ key: 'createdat_contact', extract: c => {
                      const d = c.contact_createdate
                      return d ? new Date(d).toLocaleDateString('fr-FR') : ''
                    }})
                    break
                  case 'createdat_deal':
                    headers.push('Date création (deal)')
                    colMap.push({ key: 'createdat_deal', extract: c => {
                      const d = c.deal?.createdate
                      return d ? new Date(d).toLocaleDateString('fr-FR') : ''
                    }})
                    break
                  case 'form_submission':
                    headers.push('Formulaire', 'Date formulaire')
                    colMap.push({ key: 'form_name', extract: c => c.recent_conversion_event ?? '' })
                    colMap.push({ key: 'form_date', extract: c => c.recent_conversion_date ? new Date(c.recent_conversion_date).toLocaleDateString('fr-FR') : '' })
                    break
                }
              }

              const esc = (v: string) => {
                if (v.includes(SEP) || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
                return v
              }

              const csvLines = [headers.map(esc).join(SEP)]
              for (const row of rows) {
                csvLines.push(colMap.map(c => esc(c.extract(row))).join(SEP))
              }

              const blob = new Blob([BOM + csvLines.join('\n')], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `crm-contacts-export-${new Date().toISOString().slice(0, 10)}.csv`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
              setExportModalOpen(false)
            } finally {
              setExporting(false)
            }
          }}
        />
      )}

      {/* ── CRM Edit Drawer ─────────────────────────────────────────────────── */}
      {drawerContact && (
        <CRMEditDrawer
          contact={drawerContact}
          closers={closers}
          telepros={telepros}
          allUsers={allUsers}
          hubspotOwners={hubspotOwners}
          onClose={() => setDrawerContact(null)}
          onRefresh={() => fetchContacts()}
          preloadedLeadStatuses={leadStatusOptions.filter(o => o.id).map(o => o.id)}
          preloadedFormations={FORMATION_OPTIONS.filter(o => o.id).map(o => o.id)}
          preloadedSources={sourceOptions.filter(o => o.id).map(o => o.id)}
          preloadedZones={zoneOptions.filter(o => o.id).map(o => o.id)}
        />
      )}

      {/* ── Modal "Nouveau contact" ────────────────────────────────────── */}
      {showNewContact && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget && !newContactSaving) { setShowNewContact(false); setNewContactExisting(null) } }}
        >
          <style>{`
            .crm-newcontact-input { color: #2d3e50 !important; background: #ffffff !important; border-radius: 10px !important; border-color: #cbd6e2 !important; }
            .crm-newcontact-input::placeholder { color: #7c98b6 !important; opacity: 1 !important; }
            .crm-newcontact-input:focus { outline: none !important; border-color: #C9A84C !important; box-shadow: 0 0 0 3px rgba(201,168,76,0.18) !important; }
            .crm-newcontact-input.is-invalid { border-color: #ef4444 !important; }
            .crm-newcontact-input.is-existing { border-color: #e3c878 !important; }
          `}</style>
          <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, padding: 24, width: '100%', maxWidth: 480, position: 'relative', boxShadow: crmV2.shadowPanel, boxSizing: 'border-box' }}>
            <button
              onClick={() => { if (!newContactSaving) { setShowNewContact(false); setNewContactExisting(null) } }}
              aria-label="Fermer"
              style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 999, background: crmV2.bg, border: `1px solid ${crmV2.border}`, cursor: 'pointer', color: crmV2.textMuted, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} />
            </button>

            <div style={{ marginBottom: 18, paddingRight: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 4 }}>Nouveau contact</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: crmV2.text, letterSpacing: '-0.02em' }}>Créer un contact</div>
            </div>

            {/* Email en premier — avec validation live */}
            <div style={{ position: 'relative', marginBottom: newContactEmailFormatError ? 6 : 10 }}>
              <input
                type="email" placeholder="Email *" value={newContact.email}
                onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))}
                className={`crm-newcontact-input${newContactEmailFormatError ? ' is-invalid' : newContactExisting ? ' is-existing' : ''}`}
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1px solid #cbd6e2',
                  borderRadius: 10, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                autoFocus
              />
              {newContactEmailChecking && (
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#7c98b6' }}>
                  vérification…
                </span>
              )}
            </div>
            {newContactEmailFormatError && (
              <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 10, paddingLeft: 2 }}>
                {newContactEmailFormatError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                type="text" placeholder="Prénom *" value={newContact.firstname}
                onChange={e => setNewContact(c => ({ ...c, firstname: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', minWidth: 0 }}
              />
              <input
                type="text" placeholder="Nom *" value={newContact.lastname}
                onChange={e => setNewContact(c => ({ ...c, lastname: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', minWidth: 0 }}
              />
            </div>
            <input
              type="tel" placeholder="Téléphone *" value={newContact.phone}
              onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))}
              className="crm-newcontact-input"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                type="text" placeholder="Département *" value={newContact.departement}
                onChange={e => setNewContact(c => ({ ...c, departement: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', minWidth: 0 }}
              />
              <input
                type="text" placeholder="Classe actuelle *" value={newContact.classe_actuelle}
                onChange={e => setNewContact(c => ({ ...c, classe_actuelle: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', minWidth: 0 }}
              />
            </div>
            {newContactError && (
              <div style={{ background: crmV2.dangerSoft, border: '1px solid rgba(242,84,91,0.35)', color: '#d13a41', padding: '8px 12px', borderRadius: 12, fontSize: 13, marginBottom: 12 }}>
                {newContactError}
              </div>
            )}

            {newContactExisting && (
              <div style={{ background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <AlertTriangle size={16} color="#a4844c" />
                  <div style={{ fontWeight: 700, color: '#8a6e3a', fontSize: 13 }}>Ce contact existe déjà</div>
                </div>
                <div style={{ fontSize: 13, color: '#6b5630', lineHeight: 1.5, marginBottom: 10 }}>
                  Un contact avec l'email <strong>{newContactExisting.email}</strong> est déjà présent dans le CRM
                  {newContactExisting.firstname || newContactExisting.lastname
                    ? <> au nom de <strong>{[newContactExisting.firstname, newContactExisting.lastname].filter(Boolean).join(' ')}</strong></>
                    : null}.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { window.location.href = `/admin/crm/contacts/${newContactExisting.id}` }}
                    style={{ padding: '7px 14px', background: crmV2.primary, border: `1px solid ${crmV2.primary}`, borderRadius: 999, color: '#ffffff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
                  >
                    Voir la fiche existante <ChevronRight size={13} />
                  </button>
                  <button
                    onClick={() => setNewContactExisting(null)}
                    style={{ padding: '7px 14px', background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999, color: crmV2.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Modifier l'email
                  </button>
                </div>
              </div>
            )}

            {(() => {
              const allFilled =
                newContact.firstname.trim() && newContact.lastname.trim() &&
                newContact.email.trim() && newContact.phone.trim() &&
                newContact.departement.trim() && newContact.classe_actuelle.trim()
              const canCreate =
                allFilled &&
                !newContactEmailFormatError &&
                !newContactExisting &&
                !newContactEmailChecking &&
                !newContactSaving
              return (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                  <CrmV2Button
                    onClick={() => { setShowNewContact(false); setNewContactExisting(null) }}
                    disabled={newContactSaving}
                  >
                    Annuler
                  </CrmV2Button>
                  <CrmV2Button
                    variant="primary"
                    onClick={handleCreateContact}
                    disabled={!canCreate}
                    icon={newContactSaving ? undefined : <Plus size={14} />}
                    style={newContactSaving ? { cursor: 'wait' } : undefined}
                  >
                    {newContactSaving ? 'Création…' : 'Créer le contact'}
                  </CrmV2Button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {showRepop && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,31,61,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRepop(false) }}
        >
          <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, width: '100%', maxWidth: 860, padding: '24px', boxShadow: crmV2.shadowPanel, position: 'relative', boxSizing: 'border-box' }}>
            <button onClick={() => setShowRepop(false)} aria-label="Fermer" style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, background: crmV2.bg, border: `1px solid ${crmV2.border}`, cursor: 'pointer', color: crmV2.textMuted, padding: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            <RepopJournal scope="admin" />
          </div>
        </div>
      )}
    </div>
  )
}

// fmtCount, StatChip, FilterPill, CRMToolBtn → extraits dans @/components/crm/CRMUIBits
