'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { RefreshCw, Search, LayoutDashboard, Users, X, ChevronDown, Zap, Bell, List, GraduationCap, SlidersHorizontal, Plus, Save, Check, Trash2, Copy, Pen, Download, Upload, GitMerge, AlertTriangle, BookOpen } from 'lucide-react'
import CRMContactsTable, { CRMContact } from '@/components/CRMContactsTable'
import LogoutButton from '@/components/LogoutButton'
import { fmtCount, StatChip, FilterPill, CRMToolBtn } from '@/components/crm/CRMUIBits'
import { validateEmailDomain } from '@/lib/email-validation'

// ── Lazy-loaded modals / panels ──────────────────────────────────────────────
// Composants ouverts conditionnellement (drawers, modals d'outils). Charges a
// la demande -> bundle initial bien plus leger, premier paint plus rapide.
const CRMEditDrawer = dynamic(() => import('@/components/CRMEditDrawer'), { ssr: false })
const DoublonsManager = dynamic(() => import('@/components/DoublonsManager'), { ssr: false })
const ExternalDoublonsManager = dynamic(() => import('@/components/ExternalDoublonsManager'), { ssr: false })
const DealsDoublonsManager = dynamic(() => import('@/components/DealsDoublonsManager'), { ssr: false })
const CheckRdvCloserPanel = dynamic(() => import('@/components/CheckRdvCloserPanel'), { ssr: false })
const RepopJournal = dynamic(() => import('@/components/RepopJournal'), { ssr: false })
const TeleproConflictsManager = dynamic(() => import('@/components/TeleproConflictsManager'), { ssr: false })
const OrigineMatchesManager = dynamic(() => import('@/components/OrigineMatchesManager'), { ssr: false })
import {
  CURRENT_PIPELINE_ID,
  STAGE_OPTIONS, FORMATION_OPTIONS, CLASSE_OPTIONS, PERIOD_OPTIONS,
  CRM_FILTER_FIELDS,
  opsForField, opNeedsValue, opIsMulti,
  type SelectOption,
  type CRMFilterField, type CRMFilterOp, type CRMFilterRule, type CRMFilterGroup,
} from '@/lib/crm-constants'
import {
  type CRMSavedView,
  CRM_DEFAULT_VIEWS, loadCRMViews, viewToParams,
  persistViewCreate, persistViewUpdate, persistViewDelete,
} from '@/lib/crm-views'
import { MultiSelectDropdown, FilterSelect, FilterMultiSelect } from '@/components/crm/CRMSelects'
const ExportCSVModal = dynamic(() => import('@/components/crm/CRMExportModal'), { ssr: false })
import { CRMFieldPicker, isCustomField, type CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'
import { getCached, refetch, jsonFetcher } from '@/lib/client-cache'

// Composants UI extraits dans @/components/crm/*

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

// ExportCSVModal → @/components/crm/CRMExportModal

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

  // CSV export
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Server-side filters (déclenchent un appel API)
  const [search, setSearch]           = useState('')
  const [stage, setStage]             = useState('')
  const [closerHsId, setCloserHsId]   = useState('')
  const [contactOwnerHsId, setContactOwnerHsId] = useState('') // = filtre direct sur crm_contacts.hubspot_owner_id
  const [teleproHsId, setTeleproHsId] = useState('')
  const [noTelepro, setNoTelepro]     = useState(false)
  const [ownerExclude, setOwnerExclude] = useState('')
  const [recentFormMonths, setRecentFormMonths] = useState(0)
  const [recentFormDays, setRecentFormDays]     = useState(0)
  const [createdBeforeDays, setCreatedBeforeDays] = useState(0)
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

  // Tri des colonnes — par défaut : dernière soumission de formulaire desc.
  // Un contact qui re-soumet un form remonte automatiquement en haut.
  const [sortBy,  setSortBy]  = useState<string>('form_submission')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Colonnes dynamiques (propriétés HubSpot ajoutées par l'utilisateur via le menu Colonnes)
  // Persisté en localStorage
  const [extraColumns, setExtraColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('crm-extra-columns')
      if (saved) return JSON.parse(saved) as string[]
    } catch { /* ignore */ }
    return []
  })
  function persistExtraColumns(next: string[]) {
    setExtraColumns(next)
    localStorage.setItem('crm-extra-columns', JSON.stringify(next))
  }

  // ── Outils modals ──────────────────────────────────────────────────────────
  const [showCheckRdv,      setShowCheckRdv]      = useState(false)
  const [showDoublons,      setShowDoublons]      = useState(false)
  const [showExtDoublons,   setShowExtDoublons]   = useState(false)
  const [showDealsDoublons, setShowDealsDoublons] = useState(false)
  const [showRepop,         setShowRepop]         = useState(false)
  const [showTeleproConflicts, setShowTeleproConflicts] = useState(false)
  const [showOrigineMatches, setShowOrigineMatches] = useState(false)

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
  const [leadStatusOptions, setLeadStatusOptions]   = useState<SelectOption[]>([{ id: '', label: 'Tous les statuts du lead' }])
  const [sourceOptions, setSourceOptions]           = useState<SelectOption[]>([{ id: '', label: 'Toutes les origines' }])
  const [zoneOptions, setZoneOptions]               = useState<SelectOption[]>([{ id: '', label: 'Toutes les zones / localités' }])
  const [deptOptions, setDeptOptions]               = useState<SelectOption[]>([{ id: '', label: 'Tous les départements' }])

  // Counts pré-chargés par vue
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({})

  // Sélection en masse + drawer
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTeleproId, setBulkTeleproId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  const [limit, setLimit] = useState(50)
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

  // ── Pré-charger les counts de toutes les vues ─────────────────────────────
  useEffect(() => {
    if (!viewsLoaded) return
    Promise.all(
      crmViews.map(async view => {
        const p = viewToParams(view)
        p.set('limit', '0')
        try {
          const res = await fetch(`/api/crm/contacts?${p.toString()}`)
          if (!res.ok) return [view.id, 0] as [string, number]
          const data = await res.json()
          return [view.id, data.total ?? 0] as [string, number]
        } catch {
          return [view.id, 0] as [string, number]
        }
      })
    ).then(results => setViewCounts(Object.fromEntries(results)))
  }, [viewsLoaded, crmViews.length])

  // Mettre à jour le count de la vue active quand total change
  useEffect(() => {
    if (!activeViewId || loading) return
    setViewCounts(prev => ({ ...prev, [activeViewId]: total }))
  }, [total, activeViewId, loading])

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
    // Charger TOUS les owners HubSpot (table crm_owners — 51 personnes)
    // pour alimenter complètement les dropdowns "Propriétaire du contact"
    fetch('/api/crm/owners').then(r => r.json()).then(d => {
      if (Array.isArray(d.owners)) setHubspotOwners(d.owners)
    }).catch(() => {})
    // Charger les 829 propriétés contacts pour le picker des filtres avancés
    fetch('/api/crm/properties?object=contacts&limit=2000').then(r => r.json()).then(d => {
      if (Array.isArray(d.properties)) setAllCrmProps(d.properties as CrmPropertyMeta[])
    }).catch(() => {})
    // Charger les valeurs réelles HubSpot pour statut lead + origine
    fetch('/api/crm/field-options').then(r => r.json()).then(d => {
      if (d.leadStatuses?.length) {
        setLeadStatusOptions([
          { id: '', label: 'Tous les statuts du lead' },
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
    })
  }, [])

  // ── Récupérer les contacts ───────────────────────────────────────────────────

  const fetchContacts = useCallback(async (resetPage = false) => {
    const currentPage = resetPage ? 0 : page
    if (resetPage) setPage(0)

    const params = new URLSearchParams({
      limit: String(limit),
      page: String(currentPage),
    })
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

    const url = `/api/crm/contacts?${params.toString()}`

    // Cache hit (typiquement : retour sur la page apres avoir ouvert un
    // contact) → render immediat avec les anciennes donnees, puis revalidation
    // silencieuse en arriere-plan.
    const cached = getCached<{ data?: CRMContact[]; total?: number }>(url)
    if (cached) {
      setContacts(cached.data ?? [])
      setTotal(cached.total ?? 0)
      setLoading(false)
      refetch<{ data?: CRMContact[]; total?: number }>(url, () => jsonFetcher(url), 30_000)
        .then(d => {
          setContacts(d.data ?? [])
          setTotal(d.total ?? 0)
        })
        .catch(() => {})
      return
    }

    setLoading(true)
    try {
      const data = await refetch<{ data?: CRMContact[]; total?: number }>(url, () => jsonFetcher(url), 30_000)
      setContacts(data.data ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // garde le state precedent en cas d'erreur reseau
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stage, closerHsId, contactOwnerHsId, teleproHsId, noTelepro, ownerExclude, recentFormMonths, recentFormDays, createdBeforeDays, showExternal, allClasses, leadStatus, source, zoneFilter, deptFilter, stageNot, leadStatusNot, sourceNot, zoneNot, deptNot, closerNot, contactOwnerNot, teleproNot, formationNot, pipeline, pipelineNot, priorPreinscription, emptyFields, notEmptyFields, formation, classe, period, sortBy, sortDir, limit, page, extraColumns])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const fetchRef = useRef(fetchContacts)
  fetchRef.current = fetchContacts

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchRef.current(true), 300)
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
    setSearch(''); setStage(''); setCloserHsId(''); setContactOwnerHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod(''); setLeadStatus(''); setSource('')
    setZoneFilter(''); setDeptFilter('')
    // Reset all exclusion filters
    setStageNot(''); setLeadStatusNot(''); setSourceNot(''); setZoneNot(''); setDeptNot('')
    setCloserNot(''); setContactOwnerNot(''); setTeleproNot(''); setFormationNot('')
    setPipeline(''); setPipelineNot('')
    setPriorPreinscription(false)
    // Reset empty/not-empty filters
    setEmptyFields(''); setNotEmptyFields('')
    setNoTelepro(flags?.noTelepro ?? false)
    setRecentFormMonths(flags?.recentFormMonths ?? 0)
    setRecentFormDays(flags?.recentFormDays ?? 0)
    setCreatedBeforeDays(flags?.createdBeforeDays ?? 0)

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
            case 'closer':        setCloserHsId(val); break
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
          switch (rule.field) {
            case 'stage':         setStageNot(val); break
            case 'formation':     setFormationNot(val); break
            case 'closer':        setCloserNot(val); break
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
          setEmptyFields(prev => prev ? `${prev},${rule.field}` : rule.field)
        }
        if (rule.operator === 'is_not_empty') {
          setNotEmptyFields(prev => prev ? `${prev},${rule.field}` : rule.field)
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

  // Tous les filtres sont désormais côté serveur
  const displayed = contacts
  const totalPages = Math.ceil(total / limit)

  const hasWithDeal  = contacts.filter(c => !!c.deal).length
  const hasNoTelepro = contacts.filter(c => c.deal && !c.deal.teleprospecteur).length
  const hasNoCloser  = contacts.filter(c => c.deal && !c.deal.closer).length

  const hasActiveFilters = search || stage || closerHsId || contactOwnerHsId || teleproHsId || formation || classe || period || noTelepro || ownerExclude || recentFormMonths > 0 || recentFormDays > 0 || createdBeforeDays > 0 || leadStatus || source || zoneFilter || deptFilter
  const totalFilterRules = filterGroups.reduce((sum, g) => sum + g.rules.length, 0)

  // Check if current filters changed from active view
  const activeCRMView = crmViews.find(v => v.id === activeViewId)
  const crmViewChanged = activeCRMView ? (
    JSON.stringify(filterGroups) !== JSON.stringify(activeCRMView.groups)
  ) : false

  function resetAll() {
    setSearch(''); setStage(''); setCloserHsId(''); setContactOwnerHsId(''); setTeleproHsId('')
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

  // Helper : fusionner les owners HubSpot (51) avec les rdv_users (closer/telepro),
  // dédupliquer sur hubspot_owner_id, trier par label.
  const mergeOwnersWithUsers = (users: RdvUser[]): SelectOption[] => {
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
  }

  const closerOptions: SelectOption[] = [
    { id: '', label: 'Tous les closers' },
    ...mergeOwnersWithUsers(closers),
  ]
  const teleproOptions: SelectOption[] = [
    { id: '', label: 'Tous les télépros' },
    ...mergeOwnersWithUsers(telepros),
  ]
  // Tous les utilisateurs avec un hubspot_owner_id (pour "Exclure propriétaire")
  const ownerExcludeOptions: SelectOption[] = [
    { id: '', label: 'Aucune exclusion' },
    ...mergeOwnersWithUsers(allUsers.filter(u => u.hubspot_owner_id)),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f8fa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px',
        height: 52,
        background: '#ffffff',
        borderBottom: '1px solid #cbd6e2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, width: 'auto' }} />
          <div style={{ width: 1, height: 22, background: '#cbd6e2' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 12, color: '#516f90', fontWeight: 600 }}>CRM — Contacts & Transactions</span>
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
        borderBottom: '1px solid #cbd6e2',
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
              border: '1px solid #cbd6e2',
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

        {/* ── Outils ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 1, height: 20, background: '#cbd6e2', marginRight: 4 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>Outils</span>
          <CRMToolBtn icon={<AlertTriangle size={11} />} label="Check RDV"         onClick={() => setShowCheckRdv(true)} />
          <CRMToolBtn icon={<GitMerge size={11} />}      label="Doublons contacts" onClick={() => setShowDoublons(true)} color="red" />
          <CRMToolBtn icon={<Users size={11} />}         label="Doublons externe"  onClick={() => setShowExtDoublons(true)} color="gold" />
          <CRMToolBtn icon={<RefreshCw size={11} />}     label="Doublons transac"  onClick={() => setShowDealsDoublons(true)} color="red" />
          <CRMToolBtn icon={<Users size={11} />}         label="Doublon télépro"   onClick={() => setShowTeleproConflicts(true)} color="gold" />
          <CRMToolBtn icon={<GitMerge size={11} />}      label="Récup. origine"    onClick={() => setShowOrigineMatches(true)} color="gold" />
          <CRMToolBtn icon={<BookOpen size={11} />}      label="Journal Repop"     onClick={() => setShowRepop(true)} />
        </div>

      </div>

      {/* ── Views Tab Bar (HubSpot-style) ─────────────────────────────────── */}
      <div style={{
        padding: '0 20px', background: '#f5f8fa',
        borderBottom: '1px solid #cbd6e2', flexShrink: 0,
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
              {view.isDefault && <Icon size={12} style={{ color: isActive ? '#ccac71' : '#7c98b6' }} />}

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

              {/* Badge count — tous les onglets */}
              {viewCounts[view.id] !== undefined && viewCounts[view.id] > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isActive ? '#516f90' : '#4a6080',
                  background: isActive ? '#eaf0f6' : '#f5f8fa',
                  border: `1px solid ${isActive ? '#cbd6e2' : '#f5f8fa'}`,
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
                    color: '#7c98b6', cursor: 'pointer', display: 'flex', marginLeft: 2,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )
        })}

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: '#cbd6e2', margin: '0 6px', flexShrink: 0 }} />

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
            onMouseEnter={e => { e.currentTarget.style.color = '#516f90'; e.currentTarget.style.borderColor = '#cbd6e2' }}
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
              <Check size={12} color="#f5f8fa" />
            </button>
            <button onClick={() => { setCreatingView(false); setNewViewName('') }} style={{ background: 'none', border: 'none', padding: 0, color: '#7c98b6', cursor: 'pointer', display: 'flex' }}>
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

        {/* Export CSV button */}
        <button
          onClick={() => setExportModalOpen(true)}
          style={{
            padding: '7px 12px',
            background: 'none',
            border: '1px solid #cbd6e2',
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
            border: '1px solid #cbd6e2',
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
              borderRadius: 8, padding: '6px 14px', color: '#ccac71',
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
        borderBottom: '1px solid #cbd6e2', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8,
            padding: '7px 12px', flex: '1 1 auto', maxWidth: 380,
          }}>
            <Search size={13} style={{ color: '#3a5070', flexShrink: 0 }} />
            <input
              type="text" placeholder="Nom, email, téléphone…"
              value={search}
              onChange={e => { setSearch(e.target.value); scheduleRefetch() }}
              onKeyDown={e => { if (e.key === 'Enter') fetchContacts(true) }}
              style={{ background: 'transparent', border: 'none', color: '#33475b', fontSize: 13, outline: 'none', flex: 1, fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => { setSearch(''); scheduleRefetch() }} style={{ background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', padding: 0, display: 'flex' }}>
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
          <FilterMultiSelect value={closerHsId} onChange={v => { setCloserHsId(v); scheduleRefetch() }} options={closerOptions} />
          <FilterMultiSelect value={teleproHsId} onChange={v => { setTeleproHsId(v); scheduleRefetch() }} options={teleproOptions} />
          <FilterSelect value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        </div>
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#3a5070' }}>Filtres :</span>
            {noTelepro && <FilterPill label="Sans télépro" onRemove={() => { setNoTelepro(false); scheduleRefetch() }} />}
            {recentFormMonths > 0 && <FilterPill label={`Form. < ${recentFormMonths} mois`} onRemove={() => { setRecentFormMonths(0); scheduleRefetch() }} />}
            {recentFormDays > 0 && <FilterPill label={`Form. < ${recentFormDays} j`} onRemove={() => { setRecentFormDays(0); scheduleRefetch() }} />}
            {createdBeforeDays > 0 && <FilterPill label={`Créé > ${createdBeforeDays} j`} onRemove={() => { setCreatedBeforeDays(0); scheduleRefetch() }} />}
            {stage && <FilterPill label={stage.includes(',') ? `${stage.split(',').length} étapes` : STAGE_OPTIONS.find(o => o.id === stage)?.label ?? stage} onRemove={() => { setStage(''); scheduleRefetch() }} />}
            {closerHsId && <FilterPill label={closerHsId.includes(',') ? `${closerHsId.split(',').length} closers` : closerOptions.find(o => o.id === closerHsId)?.label ?? 'Closer'} onRemove={() => { setCloserHsId(''); scheduleRefetch() }} />}
            {teleproHsId && <FilterPill label={teleproHsId.includes(',') ? `${teleproHsId.split(',').length} télépros` : teleproOptions.find(o => o.id === teleproHsId)?.label ?? 'Télépro'} onRemove={() => { setTeleproHsId(''); scheduleRefetch() }} />}
            {period && <FilterPill label={PERIOD_OPTIONS.find(o => o.id === period)?.label ?? period} onRemove={() => setPeriod('')} />}
            {search && <FilterPill label={`"${search}"`} onRemove={() => { setSearch(''); scheduleRefetch() }} />}
          </div>
        )}
      </div>

      {/* ── Table + Advanced Filter Panel ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Table area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 20px' }}>
        {/* Compteur contacts */}
        <div style={{ padding: '10px 20px 6px' }}>
          {loading ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(58,80,112,0.15)', borderRadius: 20,
              padding: '5px 12px',
            }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #cbd6e2', borderTopColor: '#4cabdb', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 12, color: '#3a5070' }}>Chargement…</span>
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
                  {total.toLocaleString('fr')}
                </span>
                <span style={{ fontSize: 11, color: '#4a6a8a', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  contact{total !== 1 ? 's' : ''}
                </span>
              </div>
              {(formation || classe || period) && displayed.length !== contacts.length ? (
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 4,
                  background: 'rgba(58,80,112,0.12)',
                  border: '1px solid rgba(58,80,112,0.25)',
                  borderLeft: 'none',
                  borderRadius: '0 10px 10px 0',
                  padding: '5px 12px',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#516f90' }}>{displayed.length}</span>
                  <span style={{ fontSize: 10, color: '#3a5070' }}>affiché{displayed.length !== 1 ? 's' : ''}</span>
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
        </div>

        {/* ── Barre sélection en masse ───────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: '#ffffff', border: `1px solid #cbd6e2`,
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
                style={{ background: 'transparent', border: '1px solid #cbd6e2', borderRadius: 6, padding: '4px 10px', color: '#7c98b6', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Désélectionner
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#516f90' }}>Assigner à :</span>
            <select
              value={bulkTeleproId}
              onChange={e => setBulkTeleproId(e.target.value)}
              style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6, padding: '6px 10px', color: '#516f90', fontSize: 12, fontFamily: 'inherit' }}
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
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          allCrmProps={allCrmProps}
          extraColumns={extraColumns}
          onExtraColumnsChange={persistExtraColumns}
        /></div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingBottom: 20 }}>
          {/* Sélecteur nb par page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: 11, color: '#3a5070' }}>Par page :</span>
            {[25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => { setLimit(n); setPage(0) }}
                style={{
                  background: limit === n ? 'rgba(204,172,113,0.12)' : 'transparent',
                  border: `1px solid ${limit === n ? 'rgba(204,172,113,0.35)' : '#cbd6e2'}`,
                  borderRadius: 6,
                  padding: '4px 10px',
                  color: limit === n ? '#ccac71' : '#3a5070',
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
                style={{ background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 7, padding: '6px 16px', color: page === 0 ? '#cbd6e2' : '#516f90', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
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
                style={{ background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 7, padding: '6px 16px', color: page >= totalPages - 1 ? '#cbd6e2' : '#516f90', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
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
          background: '#ffffff', borderLeft: '1px solid #cbd6e2',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #cbd6e2',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#33475b' }}>Tous les filtres</span>
            <button onClick={() => setFilterPanelOpen(false)} style={{
              background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', display: 'flex', padding: 2,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#516f90', marginBottom: 12 }}>
              Filtres avancés
            </div>


            {filterGroups.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#7c98b6', background: '#ffffff', padding: '2px 10px', border: '1px solid #cbd6e2', borderRadius: 4 }}>ou</span>
                    <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
                  </div>
                )}

                <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 10, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#516f90' }}>Groupe {gi + 1}</span>
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
                      case 'stage':       valueOptions = allStageOptions; break
                      case 'formation':   valueOptions = FORMATION_OPTIONS.filter(o => o.id); break
                      case 'classe':      valueOptions = CLASSE_OPTIONS.filter(o => o.id); break
                      case 'closer':        valueOptions = closerOptions.filter(o => o.id); break
                      case 'contact_owner': valueOptions = closerOptions.filter(o => o.id); break
                      case 'telepro':       valueOptions = teleproOptions.filter(o => o.id); break
                      case 'lead_status': valueOptions = leadStatusOptions.filter(o => o.id); break
                      case 'source':      valueOptions = sourceOptions.filter(o => o.id); break
                      case 'zone':        valueOptions = zoneOptions.filter(o => o.id); break
                      case 'departement': valueOptions = deptOptions.filter(o => o.id); break
                      case 'period':      valueOptions = PERIOD_OPTIONS.filter(o => o.id); break
                      case 'pipeline':    valueOptions = pipelineOptions; break
                      case 'prior_preinscription': valueOptions = [{ id: '1', label: 'Oui' }]; break
                    }
                    return (
                      <div key={rule.id}>
                        {ri > 0 && <div style={{ fontSize: 11, color: '#3a5070', padding: '4px 0 4px 4px' }}>et</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '8px 10px', position: 'relative' }}>
                          <button onClick={() => removeRule(group.id, rule.id)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={12} /></button>
                          <CRMFieldPicker
                            value={rule.field}
                            onChange={(field) => updateRule(group.id, rule.id, { field: field as CRMFilterField, operator: 'is', value: '' })}
                            crmProps={allCrmProps}
                          />
                          {isCustomField(rule.field) && (
                            <div style={{ fontSize: 10, color: '#94a3b8', padding: '0 4px' }}>
                              Filtre custom — pour appliquer ce filtre dans la liste, utilise pour l&apos;instant la page <a href="/admin/crm/recherche-prop" style={{ color: '#2ea3f2', textDecoration: 'underline' }}>Recherche propriété</a>. Intégration directe à venir.
                            </div>
                          )}
                          <select value={rule.operator} onChange={e => updateRule(group.id, rule.id, { operator: e.target.value as CRMFilterOp })} style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6, padding: '6px 8px', color: '#516f90', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
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
                                <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6, padding: '6px 8px', color: rule.value ? '#ccac71' : '#7c98b6', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                                  <option value="">Rechercher…</option>
                                  {valueOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                                </select>
                              )
                            ) : (
                              <input type="text" value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} placeholder="Valeur…" style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6, padding: '6px 8px', color: '#33475b', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%' }} />
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <button onClick={() => addRuleToGroup(group.id)} style={{ marginTop: 8, padding: '6px 12px', background: 'transparent', border: '1px solid #cbd6e2', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={11} /> Ajouter un filtre
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: filterGroups.length > 0 ? 12 : 0 }}>
              {filterGroups.length > 0 && (
                <>
                  <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c98b6' }}>ou</span>
                </>
              )}
              <button onClick={addFilterGroup} style={{ padding: '8px 14px', background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <Plus size={12} /> Ajouter un groupe de filtres
              </button>
            </div>
          </div>

          {/* Panel footer */}
          {totalFilterRules > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #cbd6e2', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        ::-webkit-scrollbar-thumb { background: #cbd6e2; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a5a7a; }
      `}</style>

      {/* ── Manage Views Modal ──────────────────────────────────────────────── */}
      {manageViewsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setManageViewsOpen(false)}
        >
          <div
            style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 14, width: 420, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #cbd6e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#33475b' }}>Gérer les vues</span>
              <button onClick={() => setManageViewsOpen(false)} style={{ background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div style={{ overflow: 'auto', padding: '12px 16px', flex: 1 }}>
              {crmViews.filter(v => !v.isDefault).length === 0 ? (
                <p style={{ color: '#7c98b6', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune vue personnalisée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {crmViews.filter(v => !v.isDefault).map(view => {
                    const isRenaming = renamingViewId === view.id
                    const ruleCount = view.groups.reduce((s, g) => s + g.rules.length, 0)
                    return (
                      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8, padding: '10px 12px' }}>
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
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#516f90' }}>{view.name}</span>
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
                          style={{ background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#7c98b6')}
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
            <div style={{ padding: '12px 16px', borderTop: '1px solid #cbd6e2' }}>
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
            if (showExternal)         p.set('show_external', '1')
            if (allClasses)           p.set('all_classes', '1')
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
              if (showExternal)         params.set('show_external', '1')
              if (allClasses)           params.set('all_classes', '1')
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
                    headers.push('Closer')
                    colMap.push({ key: 'closer', extract: c => c.deal?.closer?.name ?? c.contact_owner?.name ?? '' })
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
          onClose={() => setDrawerContact(null)}
          onRefresh={() => fetchContacts()}
          preloadedLeadStatuses={leadStatusOptions.filter(o => o.id).map(o => o.id)}
          preloadedFormations={FORMATION_OPTIONS.filter(o => o.id).map(o => o.id)}
          preloadedSources={sourceOptions.filter(o => o.id).map(o => o.id)}
          preloadedZones={zoneOptions.filter(o => o.id).map(o => o.id)}
        />
      )}

      {/* ── Outils Modals ───────────────────────────────────────────────────── */}
      {showCheckRdv      && <CheckRdvCloserPanel  onClose={() => setShowCheckRdv(false)} />}
      {showDoublons      && <DoublonsManager      onClose={() => setShowDoublons(false)} />}
      {showExtDoublons   && <ExternalDoublonsManager onClose={() => setShowExtDoublons(false)} />}
      {showDealsDoublons && <DealsDoublonsManager onClose={() => setShowDealsDoublons(false)} />}

      {/* ── Modal "Nouveau contact" ────────────────────────────────────── */}
      {showNewContact && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,26,45,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget && !newContactSaving) { setShowNewContact(false); setNewContactExisting(null) } }}
        >
          <style>{`
            .crm-newcontact-input { color: #12314d !important; background: #ffffff !important; }
            .crm-newcontact-input::placeholder { color: #64748b !important; opacity: 1 !important; }
            .crm-newcontact-input:focus { outline: none !important; border-color: #12314d !important; box-shadow: 0 0 0 3px rgba(18,49,77,0.12) !important; }
          `}</style>
          <div style={{ background: '#ffffff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <button
              onClick={() => { if (!newContactSaving) { setShowNewContact(false); setNewContactExisting(null) } }}
              style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c98b6', padding: 4 }}
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
                  border: `1px solid ${newContactEmailFormatError ? '#ef4444' : newContactExisting ? '#f0d28a' : '#cbd6e2'}`,
                  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                autoFocus
              />
              {newContactEmailChecking && (
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>
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
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
              <input
                type="text" placeholder="Nom *" value={newContact.lastname}
                onChange={e => setNewContact(c => ({ ...c, lastname: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <input
              type="tel" placeholder="Téléphone *" value={newContact.phone}
              onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))}
              className="crm-newcontact-input"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                type="text" placeholder="Département *" value={newContact.departement}
                onChange={e => setNewContact(c => ({ ...c, departement: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
              <input
                type="text" placeholder="Classe actuelle *" value={newContact.classe_actuelle}
                onChange={e => setNewContact(c => ({ ...c, classe_actuelle: e.target.value }))}
                className="crm-newcontact-input"
                style={{ padding: '10px 12px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
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
                    style={{ padding: '10px 18px', background: 'transparent', border: '1px solid #cbd6e2', borderRadius: 8, color: '#5b6b7a', fontSize: 13, fontWeight: 600, cursor: newContactSaving ? 'not-allowed' : 'pointer' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateContact}
                    disabled={!canCreate}
                    style={{
                      padding: '10px 22px',
                      background: canCreate ? '#12314d' : '#cbd6e2',
                      border: 'none', borderRadius: 8,
                      color: canCreate ? '#ffffff' : '#94a3b8',
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

      {showOrigineMatches && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,26,45,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowOrigineMatches(false) }}
        >
          <div style={{ background: '#ffffff', borderRadius: 14, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '88vh', overflow: 'auto' }}>
            <button
              onClick={() => setShowOrigineMatches(false)}
              style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c98b6', padding: 4, zIndex: 1 }}
            >
              <X size={18} />
            </button>
            <OrigineMatchesManager />
          </div>
        </div>
      )}

      {showTeleproConflicts && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,26,45,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowTeleproConflicts(false) }}
        >
          <div style={{ background: '#ffffff', borderRadius: 14, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '85vh', overflow: 'auto' }}>
            <button
              onClick={() => setShowTeleproConflicts(false)}
              style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c98b6', padding: 4, zIndex: 1 }}
            >
              <X size={18} />
            </button>
            <TeleproConflictsManager />
          </div>
        </div>
      )}

      {showRepop && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRepop(false) }}
        >
          <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 16, width: '100%', maxWidth: 860, padding: '24px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', position: 'relative' }}>
            <button onClick={() => setShowRepop(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c98b6', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center' }}>✕</button>
            <RepopJournal scope="admin" />
          </div>
        </div>
      )}
    </div>
  )
}

// fmtCount, StatChip, FilterPill, CRMToolBtn → extraits dans @/components/crm/CRMUIBits
