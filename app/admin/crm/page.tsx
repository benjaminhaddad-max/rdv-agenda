'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Search, LayoutDashboard, Users, X, ChevronDown, Zap, Bell, List, GraduationCap, SlidersHorizontal, Plus, Save, Check, Trash2, Copy, Pen, Download, Upload, AlertTriangle, BookOpen } from 'lucide-react'
import CRMContactsTable, { CRMContact, type ContactInlinePatch } from '@/components/CRMContactsTable'
import LogoutButton from '@/components/LogoutButton'
import { fmtCount, StatChip, FilterPill, CRMToolBtn } from '@/components/crm/CRMUIBits'
import { validateEmailDomain } from '@/lib/email-validation'

// ── Lazy-loaded modals / panels ──────────────────────────────────────────────
// Composants ouverts conditionnellement (drawers, modals d'outils). Charges a
// la demande -> bundle initial bien plus leger, premier paint plus rapide.
const CRMEditDrawer = dynamic(() => import('@/components/CRMEditDrawer'), { ssr: false })
const RepopJournal = dynamic(() => import('@/components/RepopJournal'), { ssr: false })
import {
  CURRENT_PIPELINE_ID,
  STAGE_OPTIONS, FORMATION_OPTIONS, CLASSE_OPTIONS, PERIOD_OPTIONS,
  CRM_FILTER_FIELDS, LEAD_STATUS_OPTIONS_FALLBACK, PARCOURSUP_VERDICT_FILTER_OPTIONS,
  opsForField, opsForKind, opNeedsValue, opIsMulti, opIsRange, propertyKindOf,
  type SelectOption,
  type CRMFilterField, type CRMFilterOp, type CRMFilterRule, type CRMFilterGroup,
} from '@/lib/crm-constants'
import {
  type CRMSavedView,
  CRM_DEFAULT_VIEWS, loadCRMViews, viewToParams,
  persistViewCreate, persistViewUpdate, persistViewDelete,
} from '@/lib/crm-views'
import { MultiSelectDropdown, FilterSelect, FilterMultiSelect, SearchableSelect } from '@/components/crm/CRMSelects'
const ExportCSVModal = dynamic(() => import('@/components/crm/CRMExportModal'), { ssr: false })
import { CRMFieldPicker, isCustomField, type CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'
import { getCached, invalidate, refetch } from '@/lib/client-cache'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { useIsMobile } from '@/lib/useIsMobile'
import { buildEdumoveGroups, isEdumoveGroups } from '@/lib/edumove-crm-view'

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

// Champs natifs (type select) qui supportent la multi-sélection côté API
// (.in / liste séparée par des virgules). Quand on choisit l'un de ces champs
// dans le filtre avancé, on bascule par défaut sur l'opérateur "est parmi"
// pour permettre de sélectionner plusieurs valeurs directement.
const MULTI_SELECT_FIELDS = new Set<string>([
  'stage', 'formation', 'closer', 'closer_contact', 'contact_owner', 'telepro',
  'lead_status', 'source', 'zone', 'departement', 'pipeline', 'form_event',
  'parcoursup_verdict',
])

function defaultOperatorForField(field: string, prop?: CrmPropertyMeta): CRMFilterOp {
  if (prop) {
    const k = propertyKindOf(prop.type, prop.field_type)
    if (k === 'date' || k === 'datetime') return 'eq'
    if (k === 'number') return 'eq'
    if (k === 'enum') return 'is_any'
    if (k === 'text') return 'contains'
    return 'is'
  }
  const normalized = normalizeLegacyFieldName(field)
  if (MULTI_SELECT_FIELDS.has(normalized)) return 'is_any'
  return 'is'
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

  // Advanced filter panel
  const [filterGroups, setFilterGroups] = useState<CRMFilterGroup[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

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
  const [fieldOptionsLoaded, setFieldOptionsLoaded] = useState(false)

  // Sélection en masse + drawer
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTeleproId, setBulkTeleproId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  const [limit, setLimit] = useState(50)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedOnceRef = useRef(false)
  const contactsFetchSeqRef = useRef(0)
  const lastFetchSignatureRef = useRef('')
  const contactsAbortRef = useRef<AbortController | null>(null)
  const didInitViewFromUrlRef = useRef(false)

  // ── Charger les vues sauvegardées ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/crm/views')
      .then(r => r.json())
      .then((rows: Array<{ id: string; name: string; filter_groups: unknown; preset_flags: unknown; position: number }>) => {
        if (!Array.isArray(rows) || rows.length === 0) { setViewsLoaded(true); return }
        const dbViews: CRMSavedView[] = rows.map(r => {
          const rawGroups = (r.filter_groups as CRMFilterGroup[]) ?? []
          const nameLower = (r.name || '').toLowerCase()
          // Vue LINOVA impose explicitement les 2 forms cibles.
          const shouldForceLinova = nameLower.includes('linova')
          // Vue Edumove : tous les forms dont le nom contient "edumove".
          const shouldForceEdumove = nameLower.includes('edumove')
          const groups = shouldForceLinova
            ? buildLinovaGroups()
            : shouldForceEdumove
              ? buildEdumoveGroups()
              : rawGroups

          // Persiste la correction en base pour eviter tout drift futur.
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

          return {
            id: r.id,
            name: r.name,
            groups,
            presetFlags: r.preset_flags as CRMSavedView['presetFlags'] ?? undefined,
            isDefault: false,
          }
        })
        setCrmViews([...CRM_DEFAULT_VIEWS, ...dbViews])
        setViewsLoaded(true)
      })
      .catch(() => setViewsLoaded(true))
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
    const primaryIds = [activeViewId, 'all']
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .filter(id => !isFresh(id))
    const t1 = setTimeout(() => {
      if (primaryIds.length > 0) void fetchViewCounts(primaryIds)
    }, 300)
    const idleCb = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const remainingIds = crmViews
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
  }, [viewsLoaded, crmViews.length, activeViewId, fetchViewCounts])

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

  const fetchContacts = useCallback(async (resetPage = false) => {
    contactsAbortRef.current?.abort()
    const requestAbort = new AbortController()
    contactsAbortRef.current = requestAbort

    const currentPage = resetPage ? 0 : page
    if (resetPage) setPage(0)
    const activeView = crmViews.find(v => v.id === activeViewId)
    const activeViewName = (activeView?.name ?? '').toLowerCase()
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
    if (BYPASS_CRM_CACHE) {
      params.set('no_cache', '1')
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
          if (isLinovaView && activeViewId) {
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
      if (!response.ok && activeViewId && activeViewId !== 'all' && customFilterParam) {
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
        applyContactsRows(cachedPayload.data ?? [])
        const nextTotal = cachedPayload.total ?? 0
        setTotal(nextTotal)
        if (isLinovaView && activeViewId) {
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
          if (isLinovaView && activeViewId) {
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
      if (isLinovaView && activeViewId) {
        setViewCounts(prev => ({ ...prev, [activeViewId]: nextTotal }))
      }
      setTotalEstimated(payload.total_estimated === true)
      setLastFetchClientMs(clientMs)
      setLastFetchServerMs(serverMs)
      hasLoadedOnceRef.current = true
      if (payload.total_estimated === true) void refreshExactTotal()
    } catch {
      // garde le state precedent en cas d'erreur reseau
    } finally {
      if (requestSeq === contactsFetchSeqRef.current) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, stage, closerHsId, closerContactHsId, closerContactNot, contactOwnerHsId, teleproHsId, noTelepro, ownerExclude, recentFormMonths, recentFormDays, createdBeforeDays, showExternal, allClasses, leadStatus, source, formEvent, parcoursupVerdict, zoneFilter, deptFilter, stageNot, leadStatusNot, sourceNot, formEventNot, zoneNot, deptNot, closerNot, contactOwnerNot, teleproNot, formationNot, pipeline, pipelineNot, priorPreinscription, emptyFields, notEmptyFields, formation, classe, period, sortBy, sortDir, limit, page, extraColumns, customFilterParam, activeViewId, crmViews])

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
    return isAllLeadsView || activeName.includes('linova') || activeName.includes('edumove') || source === 'meta_lead_ads' || customFilterParam.includes('"meta_lead_ads"')
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
    // Evite qu'un ancien état UI (classes/externe) réduise silencieusement
    // les résultats d'une vue sauvegardée.
    setShowExternal(true)
    setAllClasses(true)
    syncViewIdInUrl(view.id, 'push')
    setActiveViewId(view.id)
    setFilterGroups(view.groups)
    applyGroupsToFilters(view.groups, view.presetFlags)
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
    syncViewIdInUrl(id, 'push')
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

  function reorderCRMViews(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromView = crmViews.find(v => v.id === fromId)
    const toView = crmViews.find(v => v.id === toId)
    if (!fromView || !toView || fromView.isDefault || toView.isDefault) return

    const customViews = crmViews.filter(v => !v.isDefault)
    const fromIdx = customViews.findIndex(v => v.id === fromId)
    const toIdx = customViews.findIndex(v => v.id === toId)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return

    const reordered = [...customViews]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    const defaults = crmViews.filter(v => v.isDefault)
    setCrmViews([...defaults, ...reordered])

    reordered.forEach((v, i) => {
      void persistViewUpdate(v.id, { position: i })
    })
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
  const totalPages = Math.ceil(total / limit)

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
    const selectedTelepro = telepros.find(u => u.id === bulkTeleproId)
    if (!selectedTelepro) return
    const teleproHsUserId = selectedTelepro.hubspot_user_id || selectedTelepro.hubspot_owner_id || null
    setBulkAssigning(true)
    try {
      const res = await fetch('/api/crm/contacts/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_ids: [...selectedIds],
          telepro_rdv_user_id: selectedTelepro.id,
          telepro_user_id: teleproHsUserId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Erreur attribution en masse')
      }
      setSelectedIds(new Set())
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
      const res = await fetch('/api/crm/contacts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: [...selectedIds] }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Erreur suppression en masse')
      }
      setSelectedIds(new Set())
      await fetchContacts(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur suppression en masse')
    } finally {
      setBulkDeleting(false)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F5F0E8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px',
        height: 96,
        background: '#ffffff',
        borderBottom: '1px solid #e5ddc8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma-2026.png" alt="Diploma Santé" style={{ height: 72, width: 'auto' }} />
          <div style={{ width: 1, height: 56, background: '#D4C4A0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} style={{ color: '#C9A84C' }} />
            <span style={{ fontSize: 12, color: '#3D5275', fontWeight: 600 }}>CRM — Contacts & Transactions</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Navigation déplacée dans la sidebar gauche */}
        </div>
      </div>

      {/* ── Sync bar ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 20px',
        background: '#ffffff',
        borderBottom: '1px solid #e5ddc8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        flexShrink: 0,
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ingestionHealth && (
            <span
              title="Basé sur meta_lead_events.processed_at et crm_contacts.synced_at"
              style={{
                fontSize: 11,
                color: ingestionHealth.is_stale ? '#b45309' : '#0F1F3D',
                fontWeight: ingestionHealth.is_stale ? 700 : 500,
              }}
            >
              {ingestionHealth.is_stale ? '⚠' : '●'} Dernier lead {formatSignalTime(
                ingestionHealth.latest_meta_event?.processed_at ?? ingestionHealth.latest_contact?.synced_at,
              )} · 24h: {ingestionHealth.meta_events_24h} events Meta / {ingestionHealth.contacts_24h} contacts MAJ
            </span>
          )}
        </div>

        {/* ── Outils ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 1, height: 20, background: '#D4C4A0', marginRight: 4 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#0F1F3D', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>Outils</span>
          <CRMToolBtn icon={<BookOpen size={11} />}      label="Journal Repop"     onClick={() => setShowRepop(true)} />
        </div>

      </div>

      {/* ── Views Tab Bar (HubSpot-style) ─────────────────────────────────── */}
      <div style={{
        padding: '0 20px', background: '#F5F0E8',
        borderBottom: '1px solid #e5ddc8', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 0,
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        {crmViews.map(view => {
          const isActive = activeViewId === view.id
          const isRenaming = renamingViewId === view.id
          const Icon = view.id === 'a_attribuer' ? Zap : view.id === 'recents' ? Bell : List
          const isDraggable = !view.isDefault && !isRenaming
          const isDragOver = dragOverViewId === view.id && draggedViewId && draggedViewId !== view.id

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
              style={{
                padding: '10px 14px',
                borderBottom: `2px solid ${isActive ? '#C9A84C' : 'transparent'}`,
                borderLeft: isDragOver ? '2px solid #C9A84C' : '2px solid transparent',
                background: isDragOver ? 'rgba(204,172,113,0.10)' : 'transparent',
                cursor: isRenaming ? 'text' : isDraggable ? 'grab' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                flexShrink: 0,
                opacity: draggedViewId === view.id ? 0.5 : 1,
              }}
            >
              {view.isDefault && <Icon size={12} style={{ color: isActive ? '#C9A84C' : '#3D5275' }} />}

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
                    background: 'rgba(204,172,113,0.08)', border: '1px solid #C9A84C',
                    borderRadius: 4, padding: '2px 6px', color: '#C9A84C',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    outline: 'none', width: Math.max(60, renameValue.length * 8),
                  }}
                />
              ) : (
                <span style={{
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  color: isActive ? '#C9A84C' : '#3D5275',
                }}>
                  {view.name}
                </span>
              )}

              {/* Badge count — tous les onglets */}
              {viewCounts[view.id] !== undefined && viewCounts[view.id] > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isActive ? '#3D5275' : '#3D5275',
                  background: isActive ? '#EDE6D6' : '#F5F0E8',
                  border: `1px solid ${isActive ? '#D4C4A0' : '#F5F0E8'}`,
                  borderRadius: 6, padding: '1px 7px',
                  letterSpacing: '0.01em',
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'all 0.2s',
                }}>
                  {fmtCount(viewCounts[view.id])}
                </span>
              )}

              {/* Delete button */}
              {!view.isDefault && isActive && !isRenaming && (
                <button
                  onClick={e => { e.stopPropagation(); deleteCRMView(view.id) }}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: '#3D5275', cursor: 'pointer', display: 'flex', marginLeft: 2,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )
        })}

        {/* HubSpot-style "+" tab to create a new view */}
        {creatingView ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', flexShrink: 0,
              borderBottom: '2px solid #C9A84C',
            }}
          >
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
                background: 'rgba(204,172,113,0.08)', border: '1px solid #C9A84C',
                borderRadius: 4, padding: '3px 8px', color: '#C9A84C',
                fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 140,
              }}
            />
            <button
              onClick={() => createCRMView(newViewName)}
              title="Créer la vue"
              style={{ background: '#C9A84C', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex' }}
            >
              <Check size={12} color="#f7f4ee" />
            </button>
            <button
              onClick={() => { setCreatingView(false); setNewViewName('') }}
              title="Annuler"
              style={{ background: 'none', border: 'none', padding: 0, color: '#3D5275', cursor: 'pointer', display: 'flex' }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setCreatingView(true); setNewViewName('') }}
            title="Créer une vue à partir des filtres actuels"
            style={{
              padding: '10px 12px',
              background: 'none', border: 'none',
              color: '#3D5275', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
              whiteSpace: 'nowrap', flexShrink: 0,
              borderBottom: '2px solid transparent',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C9A84C')}
            onMouseLeave={e => (e.currentTarget.style.color = '#3D5275')}
          >
            <Plus size={14} /> Vue
          </button>
        )}

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: '#D4C4A0', margin: '0 6px', flexShrink: 0 }} />

        {/* Filtres avancés button */}
        <button
          onClick={() => setFilterPanelOpen(o => !o)}
          style={{
            padding: '7px 12px',
            background: filterPanelOpen ? 'rgba(204,172,113,0.12)' : 'none',
            border: filterPanelOpen ? '1px solid rgba(204,172,113,0.3)' : '1px solid transparent',
            borderRadius: 6, color: totalFilterRules > 0 ? '#C9A84C' : '#3D5275',
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
              color: '#C9A84C', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
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
              borderRadius: 6, color: '#0F1F3D', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#3D5275'; e.currentTarget.style.borderColor = '#D4C4A0' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#0F1F3D'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <SlidersHorizontal size={11} /> Gérer
          </button>
        )}

        {/* Create new view (legacy entry — duplique le bouton "+ Vue" dans la barre d'onglets) */}
        {creatingView ? null : (
          <button
            onClick={() => { setCreatingView(true); setNewViewName('') }}
            style={{
              padding: '8px 12px', background: 'none', border: 'none',
              color: '#0F1F3D', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'inherit',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C9A84C')}
            onMouseLeave={e => (e.currentTarget.style.color = '#0F1F3D')}
          >
            <Plus size={12} /> Enregistrer la vue
          </button>
        )}

        {/* Export CSV button */}
        <button
          onClick={() => setExportModalOpen(true)}
          style={{
            padding: '7px 12px',
            background: 'none',
            border: '1px solid #e5ddc8',
            borderRadius: 8, color: '#4cabdb',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <Download size={12} /> Exporter CSV
        </button>

        {/* Nouveau contact */}
        <button
          onClick={() => setShowNewContact(true)}
          style={{
            padding: '7px 12px',
            background: '#12314d',
            border: '1px solid #12314d',
            borderRadius: 8, color: '#ffffff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <Plus size={12} /> Nouveau contact
        </button>

        {/* Import CSV link */}
        <a
          href="/admin/crm/import"
          style={{
            padding: '7px 12px',
            background: 'none',
            border: '1px solid #e5ddc8',
            borderRadius: 8, color: '#4cabdb',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none',
          }}
        >
          <Upload size={12} /> Importer CSV
        </a>

        {/* Transactions link */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <a
            href="/admin/crm/transactions"
            style={{
              background: 'rgba(204,172,113,0.10)',
              border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 8, padding: '6px 14px', color: '#C9A84C',
              fontSize: 12, textDecoration: 'none', display: 'flex',
              alignItems: 'center', gap: 6, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            <GraduationCap size={13} /> Transactions 2026-2027
          </a>
        </div>
      </div>

      {/* ── Search + quick dropdowns ──────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px', background: '#ffffff',
        borderBottom: '1px solid #e5ddc8', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#F5F0E8', border: '1px solid #e5ddc8', borderRadius: 8,
            padding: '7px 12px', flex: '1 1 auto', maxWidth: 380,
          }}>
            <Search size={13} style={{ color: '#0F1F3D', flexShrink: 0 }} />
            <input
              type="text" placeholder="Nom, email, téléphone…"
              value={search}
              onChange={e => { setSearch(e.target.value) }}
              onKeyDown={e => { if (e.key === 'Enter') fetchContacts(true) }}
              style={{ background: 'transparent', border: 'none', color: '#0F1F3D', fontSize: 13, outline: 'none', flex: 1, fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => { setSearch('') }} style={{ background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', padding: 0, display: 'flex' }}>
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
          <FilterMultiSelect value={closerContactHsId} onChange={v => { setCloserContactHsId(v); scheduleRefetch() }} options={closerOptions} />
          <FilterMultiSelect value={teleproHsId} onChange={v => { setTeleproHsId(v); scheduleRefetch() }} options={teleproOptions} />
          <FilterSelect value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        </div>
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#0F1F3D' }}>Filtres :</span>
            {noTelepro && <FilterPill label="Sans télépro" onRemove={() => { setNoTelepro(false); scheduleRefetch() }} />}
            {recentFormMonths > 0 && <FilterPill label={`Form. < ${recentFormMonths} mois`} onRemove={() => { setRecentFormMonths(0); scheduleRefetch() }} />}
            {recentFormDays > 0 && <FilterPill label={`Form. < ${recentFormDays} j`} onRemove={() => { setRecentFormDays(0); scheduleRefetch() }} />}
            {createdBeforeDays > 0 && <FilterPill label={`Créé > ${createdBeforeDays} j`} onRemove={() => { setCreatedBeforeDays(0); scheduleRefetch() }} />}
            {stage && <FilterPill label={stage.includes(',') ? `${stage.split(',').length} étapes` : STAGE_OPTIONS.find(o => o.id === stage)?.label ?? stage} onRemove={() => { setStage(''); scheduleRefetch() }} />}
            {closerContactHsId && <FilterPill label={closerContactHsId.includes(',') ? `${closerContactHsId.split(',').length} closers` : closerOptions.find(o => o.id === closerContactHsId)?.label ?? 'Closer du contact'} onRemove={() => { setCloserContactHsId(''); scheduleRefetch() }} />}
            {teleproHsId && <FilterPill label={teleproHsId.includes(',') ? `${teleproHsId.split(',').length} télépros` : teleproOptions.find(o => o.id === teleproHsId)?.label ?? 'Télépro'} onRemove={() => { setTeleproHsId(''); scheduleRefetch() }} />}
            {formEvent && <FilterPill label={formEvent.includes(',') ? `${formEvent.split(',').length} formulaires` : formEvent} onRemove={() => { setFormEvent(''); scheduleRefetch() }} />}
            {formEventNot && <FilterPill label={`Formulaire ≠ ${formEventNot.includes(',') ? `${formEventNot.split(',').length} valeurs` : formEventNot}`} onRemove={() => { setFormEventNot(''); scheduleRefetch() }} />}
            {period && <FilterPill label={PERIOD_OPTIONS.find(o => o.id === period)?.label ?? period} onRemove={() => setPeriod('')} />}
            {search && <FilterPill label={`"${search}"`} onRemove={() => { setSearch(''); scheduleRefetch() }} />}
          </div>
        )}
      </div>

      {/* ── Table + Advanced Filter Panel ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Table area ──────────────────────────────────────────────────────── */}
      <div ref={tableScrollRef} style={{ flex: 1, overflow: 'auto', padding: '0 0 20px', WebkitOverflowScrolling: 'touch' }}>
        {/* Compteur contacts */}
        <div style={{ padding: '10px 20px 6px' }}>
          {loading ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(58,80,112,0.15)', borderRadius: 20,
              padding: '5px 12px',
            }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #e5ddc8', borderTopColor: '#4cabdb', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 12, color: '#0F1F3D' }}>Chargement…</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 5,
                background: 'rgba(76,171,219,0.07)',
                border: '1px solid rgba(76,171,219,0.18)',
                borderRadius: '10px 0 0 10px',
                padding: '5px 14px',
              }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#4cabdb', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                  {totalEstimated ? `≈ ${total.toLocaleString('fr')}` : total.toLocaleString('fr')}
                </span>
                <span style={{ fontSize: 11, color: '#4a6a8a', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  contact{total !== 1 ? 's' : ''}
                </span>
              </div>
              {(formation || classe || period) ? (
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 4,
                  background: 'rgba(58,80,112,0.12)',
                  border: '1px solid rgba(58,80,112,0.25)',
                  borderLeft: 'none',
                  borderRadius: '0 10px 10px 0',
                  padding: '5px 12px',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#3D5275' }}>{displayed.length}</span>
                  <span style={{ fontSize: 10, color: '#0F1F3D' }}>affiché{displayed.length !== 1 ? 's' : ''}</span>
                </div>
              ) : (
                <div style={{
                  width: 10, height: '100%',
                  background: 'rgba(76,171,219,0.07)',
                  border: '1px solid rgba(76,171,219,0.18)',
                  borderLeft: 'none',
                  borderRadius: '0 10px 10px 0',
                }} />
              )}
            </div>
          )}
          {lastFetchClientMs !== null && (
            <div style={{ marginTop: 6, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                fontSize: 10,
                color: '#3D5275',
                border: '1px solid rgba(81,111,144,0.25)',
                borderRadius: 999,
                padding: '2px 8px',
                background: '#fff',
              }}>
                API {lastFetchClientMs}ms
                {lastFetchServerMs !== null ? ` (srv ${lastFetchServerMs}ms)` : ''}
              </span>
            </div>
          )}
        </div>

        {/* ── Barre sélection en masse ───────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: '#ffffff', border: `1px solid #e5ddc8`,
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
                style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, padding: '4px 10px', color: '#C9A84C', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Tout ({displayed.length})
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                style={{ background: 'transparent', border: '1px solid #e5ddc8', borderRadius: 6, padding: '4px 10px', color: '#3D5275', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Désélectionner
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                title={`Supprimer ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''} et leurs transactions`}
                style={{
                  background: bulkDeleting ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.45)',
                  borderRadius: 6, padding: '4px 10px',
                  color: '#ef4444', fontSize: 11, fontWeight: 700,
                  cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', opacity: bulkDeleting ? 0.6 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <Trash2 size={12} />
                {bulkDeleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#3D5275' }}>Assigner à :</span>
            <select
              value={bulkTeleproId}
              onChange={e => setBulkTeleproId(e.target.value)}
              style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 6, padding: '6px 10px', color: '#3D5275', fontSize: 12, fontFamily: 'inherit' }}
            >
              <option value="">— Choisir un télépro —</option>
              {telepros.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
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
        {!loading && displayed.length === 0 && totalFilterRules > 0 && (
          <div style={{
            margin: '0 0 10px',
            background: 'rgba(204,172,113,0.1)',
            border: '1px solid rgba(204,172,113,0.35)',
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <span style={{ fontSize: 12, color: '#6b5630' }}>
              Les filtres avancés actifs masquent tous les résultats.
            </span>
            <button
              onClick={clearAdvancedFilters}
              style={{
                background: '#ffffff',
                border: '1px solid rgba(204,172,113,0.45)',
                borderRadius: 8,
                padding: '6px 10px',
                color: '#8a6e3a',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Retirer les filtres avancés
            </button>
          </div>
        )}
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
        /></div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingBottom: 20 }}>
          {/* Sélecteur nb par page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: 11, color: '#0F1F3D' }}>Par page :</span>
            {[25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => { setLimit(n); setPage(0) }}
                style={{
                  background: limit === n ? 'rgba(204,172,113,0.12)' : 'transparent',
                  border: `1px solid ${limit === n ? 'rgba(204,172,113,0.35)' : '#D4C4A0'}`,
                  borderRadius: 6,
                  padding: '4px 10px',
                  color: limit === n ? '#C9A84C' : '#0F1F3D',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  fontWeight: limit === n ? 700 : 400,
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ background: '#F5F0E8', border: '1px solid #e5ddc8', borderRadius: 7, padding: '6px 16px', color: page === 0 ? '#D4C4A0' : '#3D5275', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
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
                        color: p === page ? '#C9A84C' : '#0F1F3D',
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
                style={{ background: '#F5F0E8', border: '1px solid #e5ddc8', borderRadius: 7, padding: '6px 16px', color: page >= totalPages - 1 ? '#D4C4A0' : '#3D5275', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
              >
                Suivant →
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Advanced Filter Side Panel — RIGHT (HubSpot-style) ────────────── */}
      {filterPanelOpen && (
        <div style={{
          width: 380, flexShrink: 0,
          background: '#ffffff', borderLeft: '1px solid #e5ddc8',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #e5ddc8',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F1F3D' }}>Tous les filtres</span>
            <button onClick={() => setFilterPanelOpen(false)} style={{
              background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', display: 'flex', padding: 2,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3D5275', marginBottom: 12 }}>
              Filtres avancés
            </div>


            {filterGroups.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#D4C4A0' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#3D5275', background: '#ffffff', padding: '2px 10px', border: '1px solid #e5ddc8', borderRadius: 4 }}>ou</span>
                    <div style={{ flex: 1, height: 1, background: '#D4C4A0' }} />
                  </div>
                )}

                <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 10, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#3D5275' }}>Groupe {gi + 1}</span>
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
                      }
                    }

                    // Décompose la valeur "between" (format "v1|v2")
                    const isRange = opIsRange(rule.operator)
                    const [v1, v2] = isRange ? (rule.value || '').split('|') : [rule.value || '', '']

                    const inputStyle: React.CSSProperties = { background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 6, padding: '6px 8px', color: '#0F1F3D', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%' }

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
                            />
                          )
                        }
                        return (
                          <SearchableSelect
                            options={evOpts}
                            value={rule.value}
                            onChange={v => updateRule(group.id, rule.id, { value: v })}
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
                          <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ ...inputStyle, color: rule.value ? '#C9A84C' : '#3D5275', cursor: 'pointer' }}>
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
                        if (opIsMulti(rule.operator)) {
                          return (
                            <MultiSelectDropdown
                              options={valueOptions}
                              value={rule.value}
                              onChange={v => updateRule(group.id, rule.id, { value: v })}
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
                          <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ ...inputStyle, color: rule.value ? '#C9A84C' : '#3D5275', cursor: 'pointer' }}>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#F5F0E8', border: '1px solid #e5ddc8', borderRadius: 8, padding: '24px 10px 8px', position: 'relative' }}>
                          {/* z-index 5 : le CRMFieldPicker (position: relative) est rendu APRÈS
                              et le recouvrait → bouton invisible / inactif. */}
                          <button
                            type="button"
                            onClick={() => removeRule(group.id, rule.id)}
                            title="Supprimer ce filtre"
                            style={{ position: 'absolute', top: 4, right: 4, background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 6, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, width: 22, height: 22, zIndex: 5 }}
                          ><X size={13} /></button>
                          <CRMFieldPicker
                            value={normalizedField}
                            onChange={(field) => {
                              // Opérateur par défaut selon le type du champ :
                              // les champs "select" multi-capables (ex. Origine)
                              // basculent sur "est parmi" pour permettre la
                              // sélection de plusieurs valeurs directement.
                              const next = allCrmProps.find(p => 'custom:' + p.name === field)
                              const defaultOp = defaultOperatorForField(field, next)
                              updateRule(group.id, rule.id, { field: field as CRMFilterField, operator: defaultOp, value: '' })
                            }}
                            crmProps={allCrmProps}
                          />
                          <select value={rule.operator} onChange={e => updateRule(group.id, rule.id, { operator: e.target.value as CRMFilterOp })} style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 6, padding: '6px 8px', color: '#3D5275', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                            {ops.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
                          </select>
                          {renderValueInput()}
                        </div>
                      </div>
                    )
                  })}

                  <button onClick={() => addRuleToGroup(group.id)} style={{ marginTop: 8, padding: '6px 12px', background: 'transparent', border: '1px solid #e5ddc8', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={11} /> Ajouter un filtre
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: filterGroups.length > 0 ? 12 : 0 }}>
              {filterGroups.length > 0 && (
                <>
                  <div style={{ flex: 1, height: 1, background: '#D4C4A0' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#3D5275' }}>ou</span>
                </>
              )}
              <button onClick={addFilterGroup} style={{ padding: '8px 14px', background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <Plus size={12} /> Ajouter un groupe de filtres
              </button>
            </div>
          </div>

          {/* Panel footer */}
          {totalFilterRules > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #e5ddc8', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                <button onClick={() => setCreatingView(true)} style={{ flex: 1, padding: '8px', background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, color: '#C9A84C', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
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
        ::-webkit-scrollbar-thumb { background: #e5ddc8; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a5a7a; }
      `}</style>

      {/* ── Manage Views Modal ──────────────────────────────────────────────── */}
      {manageViewsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setManageViewsOpen(false)}
        >
          <div
            style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 14, width: 420, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0F1F3D' }}>Gérer les vues</span>
              <button onClick={() => setManageViewsOpen(false)} style={{ background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div style={{ overflow: 'auto', padding: '12px 16px', flex: 1 }}>
              {crmViews.filter(v => !v.isDefault).length === 0 ? (
                <p style={{ color: '#3D5275', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune vue personnalisée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {crmViews.filter(v => !v.isDefault).map(view => {
                    const isRenaming = renamingViewId === view.id
                    const ruleCount = view.groups.reduce((s, g) => s + g.rules.length, 0)
                    return (
                      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8, padding: '10px 12px' }}>
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
                              style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid #C9A84C', borderRadius: 5, padding: '3px 8px', color: '#C9A84C', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', width: '100%' }}
                            />
                          ) : (
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#3D5275' }}>{view.name}</span>
                              {ruleCount > 0 && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: '#0F1F3D' }}>{ruleCount} filtre{ruleCount > 1 ? 's' : ''}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { setRenamingViewId(view.id); setRenameValue(view.name) }}
                          title="Renommer"
                          style={{ background: 'none', border: 'none', color: '#0F1F3D', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#C9A84C')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#0F1F3D')}
                        >
                          <Pen size={13} />
                        </button>
                        <button
                          onClick={() => { deleteCRMView(view.id); if (crmViews.filter(v => !v.isDefault).length <= 1) setManageViewsOpen(false) }}
                          title="Supprimer"
                          style={{ background: 'none', border: 'none', color: '#3D5275', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#3D5275')}
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
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e5ddc8' }}>
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,26,45,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget && !newContactSaving) { setShowNewContact(false); setNewContactExisting(null) } }}
        >
          <style>{`
            .crm-newcontact-input { color: #12314d !important; background: #ffffff !important; }
            .crm-newcontact-input::placeholder { color: #4a6070 !important; opacity: 1 !important; }
            .crm-newcontact-input:focus { outline: none !important; border-color: #12314d !important; box-shadow: 0 0 0 3px rgba(18,49,77,0.12) !important; }
          `}</style>
          <div style={{ background: '#ffffff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <button
              onClick={() => { if (!newContactSaving) { setShowNewContact(false); setNewContactExisting(null) } }}
              style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', cursor: 'pointer', color: '#3D5275', padding: 4 }}
            >
              <X size={18} />
            </button>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c6aa7c', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Nouveau contact</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#12314d' }}>Créer un contact dans le CRM</div>
            </div>

            {/* Email en premier — avec validation live */}
            <div style={{ position: 'relative', marginBottom: newContactEmailFormatError ? 6 : 10 }}>
              <input
                type="email" placeholder="Email *" value={newContact.email}
                onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))}
                className="crm-newcontact-input"
                style={{
                  width: '100%', padding: '10px 12px',
                  border: `1px solid ${newContactEmailFormatError ? '#ef4444' : newContactExisting ? '#f0d28a' : '#D4C4A0'}`,
                  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                autoFocus
              />
              {newContactEmailChecking && (
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#a89e8a' }}>
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
                style={{ padding: '10px 12px', border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
              <input
                type="text" placeholder="Nom *" value={newContact.lastname}
                onChange={e => setNewContact(c => ({ ...c, lastname: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <input
              type="tel" placeholder="Téléphone *" value={newContact.phone}
              onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))}
              className="crm-newcontact-input"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                type="text" placeholder="Département *" value={newContact.departement}
                onChange={e => setNewContact(c => ({ ...c, departement: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
              <input
                type="text" placeholder="Classe actuelle *" value={newContact.classe_actuelle}
                onChange={e => setNewContact(c => ({ ...c, classe_actuelle: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #e5ddc8', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            {newContactError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                {newContactError}
              </div>
            )}

            {newContactExisting && (
              <div style={{ background: '#fff8e6', border: '1px solid #f0d28a', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
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
                    style={{ padding: '8px 14px', background: '#c6aa7c', border: 'none', borderRadius: 6, color: '#0f2842', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    Voir la fiche existante →
                  </button>
                  <button
                    onClick={() => setNewContactExisting(null)}
                    style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #e0d0a8', borderRadius: 6, color: '#8a6e3a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
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
                  <button
                    onClick={() => { setShowNewContact(false); setNewContactExisting(null) }}
                    disabled={newContactSaving}
                    style={{ padding: '10px 18px', background: 'transparent', border: '1px solid #e5ddc8', borderRadius: 8, color: '#5b6b7a', fontSize: 13, fontWeight: 600, cursor: newContactSaving ? 'not-allowed' : 'pointer' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateContact}
                    disabled={!canCreate}
                    style={{
                      padding: '10px 22px',
                      background: canCreate ? '#12314d' : '#D4C4A0',
                      border: 'none', borderRadius: 8,
                      color: canCreate ? '#ffffff' : '#a89e8a',
                      fontSize: 13, fontWeight: 700,
                      cursor: !canCreate ? 'not-allowed' : (newContactSaving ? 'wait' : 'pointer'),
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: canCreate ? 1 : 0.85,
                      transition: 'background 0.15s',
                    }}
                  >
                    {newContactSaving ? 'Création…' : <><Plus size={14} /> Créer le contact</>}
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {showRepop && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRepop(false) }}
        >
          <div style={{ background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 16, width: '100%', maxWidth: 860, padding: '24px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', position: 'relative' }}>
            <button onClick={() => setShowRepop(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: '#3D5275', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center' }}>✕</button>
            <RepopJournal scope="admin" />
          </div>
        </div>
      )}
    </div>
  )
}

// fmtCount, StatChip, FilterPill, CRMToolBtn → extraits dans @/components/crm/CRMUIBits
