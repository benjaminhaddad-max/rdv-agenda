'use client'

import { useEffect, useState, useCallback, use, useRef, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarPlus, Check, ChevronDown, ChevronRight, GripVertical, History, Mail, MapPin,
  Phone, Plus, Search, SquareCheckBig, StickyNote, Trash2, User, X,
} from 'lucide-react'
import type { QuickActionType } from '@/components/crm/QuickActionModal'
import { resolveActivityAuthorLabel } from '@/lib/activity-author'
import { getCached, prefetch, refetch, invalidate, jsonFetcher } from '@/lib/client-cache'
import { telHref } from '@/lib/phone-e164'
import { usePageTitle } from '@/components/DocumentTitle'
import { mergeCrmOrigineOptions } from '@/lib/origine-normalization'
import { appEventLabel, type AppActivitySession } from '@/lib/app-activity'
import { crmV2 } from '@/lib/crm-v2-theme'
import { getStageMeta } from '@/lib/crm-stages'
import { useIsMobile } from '@/lib/useIsMobile'
import { STATUS_CONFIG } from '@/components/StatusBadge'
import { CrmV2Button, CrmV2Page, CrmV2Pill, CrmV2Section, CrmV2Segmented, CrmV2Spinner, CrmV2StatusPill } from '@/components/crm-v2/primitives'
import ActivityTimeline from '@/components/crm-v2/contact/ActivityTimeline'
import { AddPropertyPicker, FicheField } from '@/components/crm-v2/contact/Coordinates'
import {
  AdTrackingSection, AppointmentsSection, DealsSection, FormsSection, InscriptionSections, PlatformsSection,
  TasksSection, WebActivitySection, normalizedParcoursup,
} from '@/components/crm-v2/contact/RightSections'
import type {
  Activity, Any, ContactDetails, CRMProperty, ParcoursupPayload, ParcoursupQ1, ParcoursupQ3Voeu, TimelineItem, TimelineTab, WebActivity,
} from '@/components/crm-v2/contact/types'
import { appSessionTitle, appTabLabel, formatGroup, formatSeconds, labelForType, visitSourceLabel } from '@/components/crm-v2/contact/utils'
import { neutralPropLabel } from '@/components/crm-v2/filters/labels'

// Modals/panels rendus sur action utilisateur uniquement -> hors bundle initial.
const QuickActionModal = dynamic(() => import('@/components/crm/QuickActionModal'), { ssr: false })
const PropertyHistoryPanel = dynamic(() => import('@/components/crm/PropertyHistoryPanel'), { ssr: false })
const LinovaAppointmentModal = dynamic(() => import('@/components/crm/LinovaAppointmentModal'), { ssr: false })
const DiplomaAppointmentModal = dynamic(() => import('@/components/crm/DiplomaAppointmentModal'), { ssr: false })

// Liste par défaut des propriétés ajoutées sous « Coordonnées » (ex-carte « À propos »).
// Chaque utilisateur peut la personnaliser (stockée dans crm_user_prefs.contact_about_fields).
const DEFAULT_ABOUT_FIELDS: Array<{ name: string; label: string }> = [
  { name: 'firstname',             label: 'Prénom' },
  { name: 'lastname',              label: 'Nom' },
  { name: 'email',                 label: 'E-mail' },
  { name: 'phone',                 label: 'Téléphone' },
  { name: 'hs_lead_status',        label: 'Statut du lead' },
  { name: 'classe_actuelle',       label: 'Classe actuelle' },
  { name: 'departement',           label: 'Département' },
  { name: 'zone___localite',       label: 'Zone / Localité' },
  { name: 'origine',               label: 'Origine' },
  { name: 'diploma_sante___formation_demandee', label: 'Formation demandée' },
  { name: 'formation_souhaitee',   label: 'Formation souhaitée' },
  { name: 'hubspot_owner_id',           label: 'Propriétaire' },
  { name: 'closer_du_contact_owner_id', label: 'Closer du contact' },
  { name: 'linova_status',              label: 'Statut Linova' },
  { name: 'linova_appointment_id',      label: 'RDV Linova ID' },
]
const DEFAULT_ABOUT_FIELD_NAMES = DEFAULT_ABOUT_FIELDS.map(f => f.name)
const ABOUT_FIELDS_LS_KEY = 'crm-contact-about-fields'
// Libellés « jolis » pour les propriétés qui n'ont pas toujours de metadata.
const ABOUT_FIELD_FALLBACK_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_ABOUT_FIELDS.map(f => [f.name, f.label])
)

// Bloc « Coordonnées » (gabarit B) : toujours affiché, dans cet ordre.
// Plusieurs noms possibles par champ : on affiche le premier renseigné.
const COORD_FIELDS: Array<{ label: string; names: string[]; kind?: 'email' | 'phone' }> = [
  { label: 'Prénom',           names: ['firstname'] },
  { label: 'Nom',              names: ['lastname'] },
  { label: 'E-mail',           names: ['email'], kind: 'email' },
  { label: 'Téléphone',        names: ['phone', 'mobilephone'], kind: 'phone' },
  { label: 'Téléphone parent', names: ['telephone_parent', 'telephone_du_responsable_legal_1'], kind: 'phone' },
  { label: 'E-mail parent',    names: ['email_parent', 'email_du_responsable_legal_1'], kind: 'email' },
  { label: 'Adresse',          names: ['address', 'adresse'] },
  { label: 'Ville',            names: ['city', 'ville'] },
  { label: 'Code postal',      names: ['zip', 'code_postal'] },
]
const COORD_NAMES = new Set(COORD_FIELDS.flatMap(f => f.names))

const OWNER_PROPS = new Set(['hubspot_owner_id', 'closer_du_contact_owner_id', 'teleprospecteur', 'telepro_user_id'])

const PROP_NAME_TO_COLUMN: Record<string, string> = {
  firstname: 'firstname',
  lastname: 'lastname',
  email: 'email',
  phone: 'phone',
  classe_actuelle: 'classe_actuelle',
  departement: 'departement',
  hs_lead_status: 'hs_lead_status',
  origine: 'origine',
  hubspot_owner_id: 'hubspot_owner_id',
  closer_du_contact_owner_id: 'closer_du_contact_owner_id',
  telepro_user_id: 'telepro_user_id',
  formation_souhaitee: 'formation_souhaitee',
  'zone___localite': 'zone_localite',
  'diploma_sante___formation_demandee': 'formation_demandee',
}

const hasValue = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== ''

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<ContactDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  usePageTitle(
    data?.contact
      ? [data.contact.firstname, data.contact.lastname].filter(Boolean).join(' ')
        || data.contact.email
        || 'Contact'
      : undefined,
  )
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  // Ref vers le champ d'édition inline actif (aside « À propos »).
  const editFieldRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)
  // Ouvre l'éditeur inline ET force le focus dans le geste tactile (clavier iOS).
  const startInlineEdit = useCallback((name: string, rawValue: Any, m?: CRMProperty) => {
    flushSync(() => {
      setEditing(name)
      setEditValue(normalizeValueForEditor(rawValue, m))
    })
    editFieldRef.current?.focus()
  }, [])
  const [timelineTab, setTimelineTab] = useState<TimelineTab>('all')
  const [timelineSearch, setTimelineSearch] = useState('')
  // Parcours web (diploma-tracker.js) : section dédiée + visites dans la timeline
  const [webActivity, setWebActivity] = useState<WebActivity | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/crm/contacts/${id}/web-activity`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setWebActivity(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])
  // Activité dans les applications (Diplomalab…) : sessions dans la timeline
  const [appSessions, setAppSessions] = useState<AppActivitySession[]>([])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/crm/contacts/${id}/app-activity`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && Array.isArray(d?.sessions)) setAppSessions(d.sessions) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])
  const [showAllProps, setShowAllProps] = useState(false)
  const [propSearch, setPropSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [quickAction, setQuickAction] = useState<QuickActionType | null>(null)
  const [historyProp, setHistoryProp] = useState<{ name: string; label: string; options?: Array<{ label: string; value: string }> } | null>(null)
  const [showLinovaModal, setShowLinovaModal] = useState(false)
  const [showDiplomaModal, setShowDiplomaModal] = useState(false)
  // Personnalisation par utilisateur des propriétés de la carte « À propos »
  const [aboutFieldNames, setAboutFieldNames] = useState<string[] | null>(null)
  const [showCustomize, setShowCustomize] = useState(false)
  const [savingAboutFields, setSavingAboutFields] = useState(false)
  const [parcoursupEditor, setParcoursupEditor] = useState<{ preInscriptionId: number; data: ParcoursupPayload } | null>(null)
  const [savingParcoursup, setSavingParcoursup] = useState(false)
  // Édition inline d'une note / activité native dans la timeline
  const [savingNote, setSavingNote] = useState(false)
  const [crmUsers, setCrmUsers] = useState<Array<{ id: string; name: string; email?: string | null; hubspot_owner_id?: string | null; hubspot_user_id?: string | null }>>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; hubspot_owner_id?: string | null } | null>(null)
  const loadGenRef = useRef(0)
  const isMobile = useIsMobile()
  // Mobile (M3) : À propos / Activité / Transaction
  const [mobileTab, setMobileTab] = useState<'about' | 'activity' | 'deal'>('about')
  const [coordsOpen, setCoordsOpen] = useState(true)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCrmUsers(d) })
      .catch(() => {})
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.id) setCurrentUser(d) })
      .catch(() => {})
  }, [])

  const load = useCallback(async (opts?: { force?: boolean; silent?: boolean }) => {
    const force = opts?.force === true
    const silent = opts?.silent === true
    const gen = ++loadGenRef.current
    const isStale = () => loadGenRef.current !== gen
    const coreKey = `/api/crm/contacts/${id}/details?phase=core`
    const extKey  = `/api/crm/contacts/${id}/details?phase=extended`
    const metaKey = '/api/crm/metadata'

    if (silent) {
      invalidate(coreKey)
      try {
        const core = await refetch<Any>(coreKey, () => jsonFetcher(coreKey), 30_000)
        if (isStale()) return
        setData(prev => (prev ? { ...prev, ...core } : { ...core }))
      } catch { /* ignore */ }
      return
    }

    if (force) {
      invalidate(coreKey)
      invalidate(extKey)
    }

    // Cache hit (typiquement issu du prefetch au hover) → render immediat,
    // puis revalidation silencieuse en arriere-plan.
    if (!force) {
      const cachedCore = getCached<Any>(coreKey)
      const cachedMeta = getCached<Any>(metaKey)
      const cachedExt  = getCached<Any>(extKey)
      if (cachedCore && cachedMeta) {
        if (!isStale()) {
          setData({ ...cachedCore, ...(cachedExt ?? {}), ...cachedMeta })
          setLoading(false)
        }
        // revalidate background (toutes les sections, sans await)
        Promise.all([
          refetch<Any>(coreKey, () => jsonFetcher(coreKey), 30_000),
          refetch<Any>(metaKey, () => jsonFetcher(metaKey), 5 * 60_000),
        ]).then(([c, m]) => {
          if (isStale()) return
          setData(prev => prev ? { ...prev, ...c, ...m } : { ...c, ...m })
        }).catch(() => {})
        // Extended : si pas de cache, fetch en background et merge
        if (!cachedExt) {
          void prefetch<Any>(extKey, () => jsonFetcher(extKey), 60_000)
            .then(ext => {
              if (isStale()) return
              setData(prev => prev ? { ...prev, ...ext } : prev)
            })
            .catch(() => {})
        } else {
          void refetch<Any>(extKey, () => jsonFetcher(extKey), 60_000)
            .then(ext => {
              if (isStale()) return
              setData(prev => prev ? { ...prev, ...ext } : prev)
            })
            .catch(() => {})
        }
        return
      }
    }

    setLoading(true)
    try {
      // Phase 1 : core + meta en parallele -> render rapidement
      const [core, meta] = await Promise.all([
        force
          ? refetch<Any>(coreKey, () => jsonFetcher(coreKey), 30_000)
          : prefetch<Any>(coreKey, () => jsonFetcher(coreKey), 30_000),
        prefetch<Any>(metaKey, () => jsonFetcher(metaKey), 5 * 60_000),
      ])
      if (isStale()) return
      setData({ ...core, ...meta })
      setLoading(false)

      // Phase 2 : sections lentes (SMS, emails de campagne, clics) en
      // arriere-plan, merge dans le state une fois arrivees.
      void (force
        ? refetch<Any>(extKey, () => jsonFetcher(extKey), 60_000)
        : prefetch<Any>(extKey, () => jsonFetcher(extKey), 60_000))
        .then(ext => {
          if (isStale()) return
          setData(prev => prev ? { ...prev, ...ext } : prev)
        })
        .catch(() => {})
    } catch (e) {
      if (isStale()) return
      setErr(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Les appels Aircall arrivent via webhook pendant que la fiche est ouverte :
  // on rafraîchit la timeline sans spinner (focus + toutes les 12 s).
  useEffect(() => {
    const refresh = () => { void load({ silent: true }) }
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onVis)
    document.addEventListener('visibilitychange', onVis)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 12_000)
    return () => {
      window.removeEventListener('focus', onVis)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(interval)
    }
  }, [load])

  // Pousse le contact dans Aircall dès l'ouverture de la fiche, pour que
  // le prénom/nom s'affichent quand le télépro compose le numéro.
  useEffect(() => {
    if (!id) return
    const key = `aircall-sync:${id}`
    try {
      const last = Number(sessionStorage.getItem(key) || '0')
      if (Date.now() - last < 10 * 60 * 1000) return
      sessionStorage.setItem(key, String(Date.now()))
    } catch { /* ignore */ }
    void fetch(`/api/crm/contacts/${id}/aircall-sync`, { method: 'POST' }).catch(() => {})
  }, [id])

  // Charge les préférences utilisateur des propriétés « À propos »
  // (localStorage pour un affichage instantané, puis API pour la synchro cross-device).
  useEffect(() => {
    try {
      const ls = localStorage.getItem(ABOUT_FIELDS_LS_KEY)
      if (ls) {
        const parsed = JSON.parse(ls)
        if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
          setAboutFieldNames(parsed)
        }
      }
    } catch { /* ignore */ }

    fetch('/api/crm/prefs')
      .then(r => (r.ok ? r.json() : null))
      .then(prefs => {
        if (prefs && Array.isArray(prefs.contact_about_fields) && prefs.contact_about_fields.length) {
          const names: string[] = prefs.contact_about_fields.filter((x: unknown) => typeof x === 'string')
          setAboutFieldNames(names)
          try { localStorage.setItem(ABOUT_FIELDS_LS_KEY, JSON.stringify(names)) } catch { /* ignore */ }
        }
      })
      .catch(() => {})
  }, [])

  const saveAboutFields = useCallback(async (names: string[]) => {
    setAboutFieldNames(names)
    try { localStorage.setItem(ABOUT_FIELDS_LS_KEY, JSON.stringify(names)) } catch { /* ignore */ }
    setSavingAboutFields(true)
    try {
      await fetch('/api/crm/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_about_fields: names }),
      })
    } catch { /* la version localStorage reste appliquée */ }
    finally { setSavingAboutFields(false) }
  }, [])

  if (loading) return <LoadingScreen />
  if (err) return <MessageScreen text={`Erreur : ${err}`} error />
  if (!data) return <MessageScreen text="Aucune donnée." />

  const { contact, deals, appointments, properties: rawProperties, dealProperties, groups, activities, formSubmissions, owners, tasks = [], emailStatsByMessageId = {}, preInscriptions = [], smsMessages = [], emailCampaigns = [] } = data
  const properties = rawProperties.map(p =>
    p.name === 'origine'
      ? { ...p, options: mergeCrmOrigineOptions(p.options) }
      : p,
  )

  const fullName = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || '(sans nom)'
  const initials = ((contact.firstname?.[0] ?? '') + (contact.lastname?.[0] ?? '')).toUpperCase() || '?'

  // Merge hubspot_raw + colonnes. Les colonnes natives priment, mais on n'écrase
  // jamais une valeur de hubspot_raw par une colonne null/undefined (fallback).
  const columnOverrides: Record<string, Any> = {
    firstname:        contact.firstname,
    lastname:         contact.lastname,
    email:            contact.email,
    phone:            contact.phone,
    classe_actuelle:  contact.classe_actuelle,
    departement:      contact.departement,
    hs_lead_status:   contact.hs_lead_status,
    origine:          contact.origine,
    hubspot_owner_id: contact.hubspot_owner_id,
    closer_du_contact_owner_id: contact.closer_du_contact_owner_id,
    telepro_user_id:  contact.telepro_user_id,
    teleprospecteur:  contact.teleprospecteur,
    source:           contact.source,
    contact_createdate: contact.contact_createdate,
    // Propriété HubSpot « Create date » : les leads natifs (Thotis, Meta…)
    // remplissent la colonne contact_createdate, pas hubspot_raw.createdate.
    createdate:         contact.contact_createdate,
    linova_status:        contact.linova_status,
    linova_appointment_id: contact.linova_appointment_id,
    zone___localite:  contact.zone_localite,
    formation_souhaitee:                contact.formation_souhaitee,
    diploma_sante___formation_demandee: contact.formation_demandee,
  }
  const allValues: Record<string, Any> = { ...(contact.hubspot_raw ?? {}) }
  for (const [k, v] of Object.entries(columnOverrides)) {
    if (v !== undefined && v !== null) allValues[k] = v
  }

  const isLinovaContact = String(contact.recent_conversion_event || contact.origine || '').toLowerCase().includes('linova')

  const propMeta: Record<string, CRMProperty> = {}
  for (const p of properties) propMeta[p.name] = p

  // Résout le libellé d'une propriété (fallback hérité du défaut, puis metadata, puis nom brut)
  const labelForProp = (name: string) =>
    ABOUT_FIELD_FALLBACK_LABELS[name] ?? neutralPropLabel(propMeta[name]?.label, name)

  // Liste effective des champs de la carte « À propos » selon les préférences user
  const aboutFields: Array<{ name: string; label: string }> =
    (aboutFieldNames ?? DEFAULT_ABOUT_FIELD_NAMES).map(name => ({ name, label: labelForProp(name) }))

  const dealPropMeta: Record<string, { label?: string; options?: Array<{ label: string; value: string }> }> = {}
  for (const p of dealProperties) dealPropMeta[p.name] = { label: p.label ? neutralPropLabel(p.label, p.name) : p.label, options: p.options }

  // Options pour les dropdowns Propriétaire / Closer du contact / Télépro :
  // rdv_users en priorité (noms explicites), complété par les owners actifs.
  const ownerLabelMap: Record<string, string> = {}
  for (const u of crmUsers) {
    const label = u.name || u.email || u.id
    if (u.hubspot_owner_id) ownerLabelMap[u.hubspot_owner_id] = label
    if (u.hubspot_user_id) ownerLabelMap[u.hubspot_user_id] = label
    ownerLabelMap[u.id] = label
  }
  for (const o of owners) {
    if (!ownerLabelMap[o.hubspot_owner_id]) {
      ownerLabelMap[o.hubspot_owner_id] =
        [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id
    }
  }
  const ownerOptions = Object.entries(ownerLabelMap)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))

  const ownerLabel = (id?: string | null) => {
    if (!id) return '—'
    return ownerLabelMap[id] || id
  }

  const actorOwnerId = currentUser?.hubspot_owner_id ?? currentUser?.id ?? null

  const stageLabel = (value?: string | null) => {
    if (!value) return '—'
    const opt = dealPropMeta.dealstage?.options?.find(o => o.value === value)
    return opt?.label ?? value
  }

  const pipelineLabel = (value?: string | null) => {
    if (!value) return '—'
    const opt = dealPropMeta.pipeline?.options?.find(o => o.value === value)
    return opt?.label ?? value
  }

  const saveProp = async (propName: string, value: string) => {
    const meta = propMeta[propName]
    if (isReadOnlyPropertyType(meta)) {
      alert('Cette propriété est en lecture seule dans le CRM.')
      return
    }
    const normalizedValue = normalizeValueForSave(value, meta)
    const col = PROP_NAME_TO_COLUMN[propName]
    const snapshot = data

    // Mise à jour optimiste immédiate (pas d'écran de chargement)
    setData(prev => {
      if (!prev?.contact) return prev
      const nextContact = {
        ...prev.contact,
        hubspot_raw: { ...(prev.contact.hubspot_raw ?? {}), [propName]: normalizedValue },
      }
      if (col) (nextContact as Record<string, unknown>)[col] = normalizedValue
      return { ...prev, contact: nextContact }
    })
    setEditing(null)

    try {
      const res = await fetch(`/api/crm/contacts/${id}/prop`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property: propName, value: normalizedValue }),
      })
      if (!res.ok) throw new Error(await res.text())
      // Revalidation silencieuse du cache en arrière-plan
      const coreKey = `/api/crm/contacts/${id}/details?phase=core`
      invalidate(coreKey)
      void refetch<Any>(coreKey, () => jsonFetcher(coreKey), 30_000).then(core => {
        setData(prev => prev ? { ...prev, ...core } : prev)
      }).catch(() => {})
    } catch (e) {
      if (snapshot) setData(snapshot)
      alert(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Édition inline d'une note / activité native dans la timeline (brouillon tenu par la carte)
  const saveNote = async (activityId: string, subject: string, body: string): Promise<boolean> => {
    setSavingNote(true)
    try {
      const res = await fetch(`/api/crm/activities/${activityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load({ force: true })
      return true
    } catch (e) {
      alert(`Échec de la modification : ${e instanceof Error ? e.message : String(e)}`)
      return false
    } finally {
      setSavingNote(false)
    }
  }

  const deleteNote = async (activityId: string) => {
    if (!window.confirm('Supprimer cette note définitivement ?')) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/crm/activities/${activityId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      await load({ force: true })
    } catch (e) {
      alert(`Échec de la suppression : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSavingNote(false)
    }
  }

  const saveParcoursup = async (preInscriptionId: number, payload: ParcoursupPayload) => {
    setSavingParcoursup(true)
    try {
      const res = await fetch(`/api/crm/contacts/${id}/parcoursup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preInscriptionId, parcoursup: payload }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load({ force: true })
      setParcoursupEditor(null)
    } catch (e) {
      alert(`Échec sauvegarde Parcoursup : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSavingParcoursup(false)
    }
  }

  // ── KPI values ─────────────────────────────────────────────────────────
  const leadStatus   = allValues.hs_lead_status as string | undefined
  const leadStatusLabel = formatPropValue(leadStatus, propMeta.hs_lead_status)
  const ownerName    = ownerLabel(contact.hubspot_owner_id)
  const createdAt    = contact.contact_createdate ? new Date(contact.contact_createdate) : null
  const lastFormDate = contact.recent_conversion_date ? new Date(contact.recent_conversion_date) : null

  // ── Timeline ──────────────────────────────────────────────────────────
  const timeline: TimelineItem[] = []
  for (const a of activities) {
    const t = a.activity_type.toLowerCase()
    const valid: TimelineItem['type'][] = ['note', 'call', 'email', 'meeting', 'task']
    const type = (valid.includes(t as TimelineItem['type']) ? t : 'note') as TimelineItem['type']
    const msgId = a.metadata?.brevo_message_id as string | undefined
    const stats = type === 'email' && msgId ? emailStatsByMessageId[msgId] : undefined
    // Activités natives (saisies dans le CRM) = éditables. Les notes/appels/
    // emails loggés/réunions sont modifiables ; pas les SMS ni les emails de campagne.
    const isNativeEditable = ['note', 'call', 'email', 'meeting'].includes(type) && !a.hubspot_engagement_id
    const dir = String(a.direction || '').toUpperCase()
    const dirLabel = dir === 'INCOMING' ? 'Entrant' : dir === 'OUTGOING' ? 'Sortant' : a.direction
    const aircallCallId = aircallCallIdFromActivity(a)
    const isVoicemail = String(a.status || '').toUpperCase() === 'LEFT_VOICEMAIL'
    timeline.push({
      id: `act-${a.id}`,
      type,
      timestamp: new Date(a.occurred_at).getTime(),
      title: a.subject || labelForType(type),
      body: a.body ?? undefined,
      subtitle: dirLabel ? `Direction : ${dirLabel}` : undefined,
      ownerId: a.owner_id ?? (a.metadata?.author_user_id as string | undefined),
      authorLabel: resolveActivityAuthorLabel(
        { owner_id: a.owner_id, metadata: a.metadata, hubspot_engagement_id: a.hubspot_engagement_id },
        ownerLabelMap,
      ),
      emailStats: stats,
      sendStatus: type === 'email' ? a.status : undefined,
      activityId: String(a.id),
      editable: isNativeEditable,
      aircallCallId: aircallCallId && activityHasAircallAudio(a) ? aircallCallId : undefined,
      callDuration: Number(a.metadata?.duration) > 0 ? Number(a.metadata?.duration) : undefined,
      isVoicemail,
    })
  }
  for (const f of formSubmissions) {
    timeline.push({
      id: `form-${f.id}`,
      type: 'form',
      timestamp: new Date(f.submitted_at).getTime(),
      title: f.form_title || f.form_id,
      subtitle: f.page_url,
    })
  }
  for (const v of webActivity?.visits ?? []) {
    const n = v.pages.length
    timeline.push({
      id: `web-${v.session_id}`,
      type: 'web',
      timestamp: new Date(v.started_at).getTime(),
      title: `Visite du site · ${n} page${n > 1 ? 's' : ''} · ${formatSeconds(v.total_seconds)}`,
      subtitle: `Source : ${visitSourceLabel(v)}`,
      webVisit: v,
    })
  }
  for (const s of appSessions) {
    timeline.push({
      id: `app-${s.key}`,
      type: 'app',
      timestamp: new Date(s.started_at).getTime(),
      title: appSessionTitle(s),
      appSession: s,
      searchText: s.events.map(e => `${appEventLabel(e)} ${e.title ?? ''} ${e.details.subject ?? ''}`).join(' '),
    })
  }
  for (const a of appointments) {
    const startAt = a.start_at ? new Date(a.start_at as string).getTime() : 0
    timeline.push({
      id: `rdv-${a.id}`,
      type: 'rdv',
      timestamp: startAt,
      title: `Rendez-vous — ${(STATUS_CONFIG as Record<string, { label: string }>)[String(a.status ?? '')]?.label ?? a.status ?? 'programmé'}`,
      body: a.notes as string | undefined,
    })
  }
  for (const t of tasks) {
    if (t.status !== 'completed') continue
    timeline.push({
      id: `task-${t.id}`,
      type: 'task',
      timestamp: new Date(t.completed_at ?? t.created_at).getTime(),
      title: `Tâche terminée : ${t.title}`,
      body: t.description ?? undefined,
      ownerId: t.owner_id,
    })
  }
  for (const sms of smsMessages) {
    const ts = sms.sent_at ? new Date(sms.sent_at).getTime() : new Date(sms.created_at).getTime()
    const campaignName = sms.campaign?.name || 'Campagne SMS'
    const sender = sms.campaign?.sender ? ` · ${sms.campaign.sender}` : ''
    const segs = sms.segments_count ? ` · ${sms.segments_count} segment${sms.segments_count > 1 ? 's' : ''}` : ''
    timeline.push({
      id: `sms-${sms.id}`,
      type: 'sms',
      timestamp: ts,
      title: campaignName,
      subtitle: `SMS${sender}${segs}${sms.status !== 'sent' ? ` · ${sms.status}` : ''}`,
      body: sms.rendered_message ?? undefined,
      sms,
      sendStatus: sms.status,
    })
  }
  for (const ec of emailCampaigns) {
    const ts = ec.sent_at ? new Date(ec.sent_at).getTime() : new Date(ec.created_at).getTime()
    const subject = ec.campaign?.subject || ec.campaign?.name || 'Email de campagne'
    const senderName = ec.campaign?.sender_name || ec.campaign?.sender_email || 'Brevo'
    const statusBit = (ec.status && ec.status !== 'sent' && ec.status !== 'delivered') ? ` · ${ec.status}` : ''
    timeline.push({
      id: `email-camp-${ec.id}`,
      type: 'email',
      timestamp: ts,
      title: subject,
      subtitle: `Campagne · ${senderName}${statusBit}`,
      sendStatus: ec.status ?? undefined,
      emailStats: ec.stats ?? undefined,
      emailCampaign: ec,
    })
  }
  timeline.sort((a, b) => b.timestamp - a.timestamp)

  const lastActivity = timeline[0]?.timestamp ? new Date(timeline[0].timestamp) : lastFormDate

  // Props modale
  const lc = propSearch.toLowerCase()
  const filteredGroups: Record<string, CRMProperty[]> = {}
  for (const [g, props] of Object.entries(groups)) {
    const f = props.filter(p => !lc || (p.label ?? '').toLowerCase().includes(lc) || p.name.toLowerCase().includes(lc))
    if (f.length > 0) filteredGroups[g] = f
  }
  const toggleGroup = (g: string) => setCollapsed(s => ({ ...s, [g]: !s[g] }))


  // ── Gabarit B : coordonnées + propriétés ajoutées ─────────────────────
  const coordFields = COORD_FIELDS.map(f => ({
    ...f,
    name: f.names.find(n => hasValue(allValues[n])) ?? f.names.find(n => propMeta[n]) ?? f.names[0],
  }))
  const addedFields = aboutFields.filter(f => !COORD_NAMES.has(f.name))
  const shownNames = new Set<string>([...COORD_NAMES, ...addedFields.map(f => f.name)])
  const currentAboutNames = aboutFieldNames ?? DEFAULT_ABOUT_FIELD_NAMES
  const addAboutField = (name: string) => {
    if (currentAboutNames.includes(name) || currentAboutNames.length >= ABOUT_FIELDS_MAX) return
    void saveAboutFields([...currentAboutNames, name])
  }
  const removeAboutField = (name: string) => {
    void saveAboutFields(currentAboutNames.filter(n => n !== name))
  }

  const renderField = (name: string, label: string, opts: { kind?: 'email' | 'phone'; removable?: boolean; inline?: boolean } = {}) => {
    const val = allValues[name]
    const meta = propMeta[name]
    const isOwnerField = OWNER_PROPS.has(name)
    const display = isOwnerField ? (hasValue(val) ? ownerLabel(String(val)) : '') : formatPropValue(val, meta)
    const href = hasValue(val)
      ? opts.kind === 'email' ? `mailto:${String(val).trim()}` : opts.kind === 'phone' ? telHref(String(val)) : undefined
      : undefined
    return (
      <FicheField
        key={name}
        label={label}
        value={display}
        href={href}
        inline={opts.inline}
        readOnly={isReadOnlyPropertyType(meta)}
        onEdit={() => startInlineEdit(name, val, meta)}
        editing={editing === name}
        editor={
          <EditCell
            value={editValue}
            meta={meta}
            onChange={setEditValue}
            onSave={() => saveProp(name, editValue)}
            onCancel={() => setEditing(null)}
            saving={saving}
            customOptions={isOwnerField ? ownerOptions : undefined}
            fieldRef={editFieldRef}
          />
        }
        onRemove={opts.removable ? () => removeAboutField(name) : undefined}
        onHistory={() => setHistoryProp({ name, label, options: meta?.options })}
      />
    )
  }

  const coordinatesList = (inline: boolean) => (
    <>
      {coordFields.map(f => renderField(f.name, f.label, { kind: f.kind, inline }))}
      {addedFields.map(f => renderField(f.name, f.label, { removable: true, inline }))}
      <AddPropertyPicker
        properties={properties}
        exclude={shownNames}
        onAdd={addAboutField}
        disabled={savingAboutFields || currentAboutNames.length >= ABOUT_FIELDS_MAX}
      />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setShowAllProps(true)} style={linkBtn}>
          Voir les {properties.length} propriétés
        </button>
        <button type="button" onClick={() => setShowCustomize(true)} style={linkBtn}>
          Réorganiser
        </button>
      </div>
    </>
  )

  // ── En-tête : ville, étape, formation, propriétaire ───────────────────
  const cityText = [
    ['city', 'ville'].map(n => allValues[n]).find(hasValue),
    hasValue(allValues.zone___localite) ? `Zone ${formatPropValue(allValues.zone___localite, propMeta.zone___localite)}` : null,
  ].filter(Boolean).join(' · ')
  const mainDeal = deals[0]
  const stageMeta = mainDeal ? getStageMeta(String(mainDeal.dealstage ?? '')) : undefined
  const stageText = mainDeal?.dealstage ? (stageMeta?.label ?? stageLabel(mainDeal.dealstage as string)) : null
  const formationValue = hasValue(allValues.formation_souhaitee)
    ? formatPropValue(allValues.formation_souhaitee, propMeta.formation_souhaitee)
    : hasValue(allValues.diploma_sante___formation_demandee)
      ? formatPropValue(allValues.diploma_sante___formation_demandee, propMeta.diploma_sante___formation_demandee)
      : (mainDeal?.formation as string | undefined) ?? ''
  const classeValue = formatPropValue(allValues.classe_actuelle, propMeta.classe_actuelle)
  const formationText = [formationValue, classeValue].filter(Boolean).join(' · ')
  const hasOwner = hasValue(contact.hubspot_owner_id)

  const callContact = () => {
    if (contact.phone) {
      void fetch(`/api/crm/contacts/${id}/aircall-sync`, { method: 'POST' }).catch(() => {})
      window.location.href = telHref(String(contact.phone))
    } else {
      setQuickAction('call')
    }
  }
  const openAppointment = () => (isLinovaContact ? setShowLinovaModal(true) : setShowDiplomaModal(true))

  const pills = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: isMobile ? 12 : 14, flexWrap: 'wrap' }}>
      {leadStatusLabel && <CrmV2Pill style={{ padding: '3px 12px' }}>{leadStatusLabel}</CrmV2Pill>}
      {stageText && (
        <CrmV2StatusPill label={stageText} color={stageMeta?.color ?? crmV2.textMuted} bg={stageMeta?.bg} style={{ padding: '3px 12px' }} />
      )}
      {formationText && (
        <span style={{
          background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, color: crmV2.goldDark, borderRadius: 999,
          padding: '3px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
        }}>{formationText}</span>
      )}
      {hasOwner && !isMobile && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted, marginLeft: 4 }}>
          <span style={{
            width: 20, height: 20, borderRadius: '50%', background: crmV2.gold, color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{initialsOf(ownerName)}</span>
          Propriétaire : {ownerName}
        </span>
      )}
      {!isMobile && (lastActivity || createdAt) && (
        <span style={{ fontSize: 12, color: crmV2.textFaint, marginLeft: 4 }}>
          {[
            lastActivity ? `Dernière activité ${formatDistanceToNow(lastActivity, { locale: fr, addSuffix: true })}` : null,
            createdAt ? `Créé le ${format(createdAt, 'd MMM yyyy', { locale: fr })}` : null,
          ].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  )

  const avatar = (
    <div style={{
      width: isMobile ? 52 : 56, height: isMobile ? 52 : 56, borderRadius: '32%', background: crmV2.goldGradient, color: '#fff',
      fontSize: isMobile ? 18 : 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 12px rgba(184,150,62,0.35)', flexShrink: 0,
    }}>{initials}</div>
  )

  const backLink = (
    <Link href="/admin/crm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: crmV2.textMuted, textDecoration: 'none' }}>
      <ArrowLeft size={14} /> Contacts
    </Link>
  )

  // ── Colonne droite (ordinateur) / onglets du mobile ───────────────────
  const tasksSection = (
    <TasksSection tasks={tasks.filter(t => t.status === 'pending')} owners={owners} onUpdated={load} onAdd={() => setQuickAction('task')} />
  )
  const dealsSection = <DealsSection deals={deals} stageLabel={stageLabel} pipelineLabel={pipelineLabel} ownerLabel={ownerLabel} />
  const rdvSection = <AppointmentsSection appointments={appointments} isLinova={isLinovaContact} onSchedule={openAppointment} ownerLabel={ownerLabel} />
  const formsSection = <FormsSection forms={formSubmissions} />
  // Inscription par saison — alimenté par la plateforme externe
  const inscriptionSections = preInscriptions.map(pi => (
    <InscriptionSections
      key={`pi-block-${pi.id}`}
      pi={pi}
      onEditParcoursup={clone => setParcoursupEditor({ preInscriptionId: pi.id, data: clone })}
    />
  ))
  const platformsSection = <PlatformsSection sessions={appSessions} />
  // Tracking publicitaire (gclid, fbclid, UTM…) — visible si au moins une donnée d'attribution
  const adsSection = <AdTrackingSection raw={contact.hubspot_raw as Record<string, unknown> | null | undefined} />
  // Parcours web (diploma-tracker.js) — pages vues + temps passé
  const webSection = <WebActivitySection data={webActivity} />

  const timelineNode = (
    <ActivityTimeline
      timeline={timeline}
      appTabLabel={appTabLabel(appSessions)}
      tab={timelineTab}
      onTabChange={(t: TimelineTab) => {
        setTimelineTab(t)
        if (t === 'call') void load({ silent: true })
      }}
      search={timelineSearch}
      onSearchChange={setTimelineSearch}
      onAdd={setQuickAction}
      ownerLabel={ownerLabel}
      onSaveNote={saveNote}
      onDeleteNote={deleteNote}
      savingNote={savingNote}
      compact={isMobile}
    />
  )

  const modals = (
    <>
      {/* Modal Quick Action (note / appel / email / tâche / réunion) */}
      {quickAction && (
        <QuickActionModal
          type={quickAction}
          contactId={id}
          owners={owners}
          defaultOwnerId={contact.hubspot_owner_id as string | undefined}
          actorOwnerId={actorOwnerId}
          onClose={() => setQuickAction(null)}
          onSaved={() => load({ force: true })}
        />
      )}

      {showLinovaModal && (
        <LinovaAppointmentModal
          contact={{
            id,
            firstname: contact.firstname,
            lastname: contact.lastname,
            email: contact.email,
            phone: contact.phone,
            classe_actuelle: contact.classe_actuelle,
          }}
          onClose={() => setShowLinovaModal(false)}
          onSaved={() => load({ force: true })}
        />
      )}

      {showDiplomaModal && (
        <DiplomaAppointmentModal
          contact={{
            id,
            firstname: contact.firstname,
            lastname: contact.lastname,
            email: contact.email,
            phone: contact.phone,
            classe_actuelle: contact.classe_actuelle,
            departement: contact.departement,
          }}
          onClose={() => setShowDiplomaModal(false)}
          onSaved={() => load({ force: true })}
        />
      )}

      {parcoursupEditor && (
        <ParcoursupEditorModal
          value={parcoursupEditor.data}
          saving={savingParcoursup}
          onClose={() => setParcoursupEditor(null)}
          onSave={(next) => saveParcoursup(parcoursupEditor.preInscriptionId, next)}
        />
      )}

      {/* Panneau historique d'une propriété */}
      {historyProp && (
        <PropertyHistoryPanel
          contactId={id}
          propertyName={historyProp.name}
          propertyLabel={historyProp.label}
          options={historyProp.options}
          onClose={() => setHistoryProp(null)}
        />
      )}

      {/* Modale d'organisation des propriétés ajoutées à la fiche */}
      {showCustomize && (
        <CustomizeAboutModal
          allProperties={properties}
          labelForProp={labelForProp}
          selected={currentAboutNames}
          saving={savingAboutFields}
          onClose={() => setShowCustomize(false)}
          onSave={async (names) => { await saveAboutFields(names); setShowCustomize(false) }}
          onReset={async () => { await saveAboutFields(DEFAULT_ABOUT_FIELD_NAMES); setShowCustomize(false) }}
        />
      )}

      {/* Modale toutes les propriétés */}
      {showAllProps && (
        <PropertiesModal
          properties={properties}
          filteredGroups={filteredGroups}
          allValues={allValues}
          propSearch={propSearch}
          onSearchChange={setPropSearch}
          collapsed={collapsed}
          onToggle={toggleGroup}
          editing={editing}
          editValue={editValue}
          onEditStart={(name, v) => {
            const meta = propMeta[name]
            setEditing(name)
            setEditValue(normalizeValueForEditor(v, meta))
          }}
          onEditChange={setEditValue}
          onEditSave={saveProp}
          onEditCancel={() => setEditing(null)}
          saving={saving}
          onClose={() => setShowAllProps(false)}
          onShowHistory={(p) => setHistoryProp({ name: p.name, label: neutralPropLabel(p.label, p.name), options: p.options })}
        />
      )}
    </>
  )

  /* ═════ Mobile (M3) ═════ */
  if (isMobile) {
    const roundActions: Array<{ label: string; icon: ReactNode; onClick: () => void; bg: string; border: string; color: string }> = [
      { label: 'Appeler', icon: <Phone size={18} />, onClick: callContact, bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.30)', color: '#15803d' },
      { label: 'Email', icon: <Mail size={18} />, onClick: () => setQuickAction('email'), bg: crmV2.bg, border: crmV2.borderStrong, color: crmV2.text },
      { label: 'Note', icon: <StickyNote size={18} />, onClick: () => setQuickAction('note'), bg: crmV2.bg, border: crmV2.borderStrong, color: crmV2.text },
      { label: 'Tâche', icon: <SquareCheckBig size={18} />, onClick: () => setQuickAction('task'), bg: crmV2.bg, border: crmV2.borderStrong, color: crmV2.text },
      { label: 'RDV', icon: <CalendarPlus size={18} />, onClick: openAppointment, bg: crmV2.goldSoft, border: crmV2.goldBorder, color: crmV2.goldDark },
    ]
    const subtitle = [classeValue, formationValue, ['city', 'ville'].map(n => allValues[n]).find(hasValue)].filter(Boolean).join(' · ')
    return (
      <CrmV2Page>
        <div style={{ background: crmV2.bg, borderBottom: `1px solid ${crmV2.thBorder}`, padding: '12px 12px 14px' }}>
          {backLink}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            {avatar}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{fullName}</h1>
              {subtitle && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          {pills}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 14 }}>
            {roundActions.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                  padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 46, height: 46, borderRadius: 999, background: a.bg, border: `1px solid ${a.border}`, color: a.color,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{a.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: crmV2.textMuted }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}` }}>
          <CrmV2Segmented
            stretch
            value={mobileTab}
            onChange={setMobileTab}
            items={[
              { id: 'about', label: 'À propos' },
              { id: 'activity', label: 'Activité' },
              { id: 'deal', label: 'Transaction' },
            ]}
          />
        </div>
        <div style={{ padding: '12px 12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mobileTab === 'about' && (
            <>
              <CrmV2Section title="Coordonnées" icon={<User size={15} />} count={coordFields.length + addedFields.length} storageKey="rs-open:Coordonnées">
                {coordinatesList(true)}
              </CrmV2Section>
              {formsSection}
              {platformsSection}
              {adsSection}
              {webSection}
            </>
          )}
          {mobileTab === 'activity' && timelineNode}
          {mobileTab === 'deal' && (
            <>
              {dealsSection}
              {rdvSection}
              {tasksSection}
              {inscriptionSections}
            </>
          )}
        </div>
        {modals}
      </CrmV2Page>
    )
  }

  /* ═════ Ordinateur (gabarit B) ═════ */
  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ background: crmV2.bg, borderBottom: `1px solid ${crmV2.thBorder}`, padding: '16px 28px', flexShrink: 0 }}>
        {backLink}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          {avatar}
          <div style={{ flex: '1 1 320px', minWidth: 260 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: crmV2.text, overflowWrap: 'anywhere' }}>{fullName}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
              {contact.email && (
                <a href={`mailto:${contact.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'inherit', textDecoration: 'none', minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Mail size={13} /> {contact.email}
                </a>
              )}
              {contact.phone && (
                <a
                  href={telHref(String(contact.phone))}
                  onClick={() => {
                    void fetch(`/api/crm/contacts/${id}/aircall-sync`, { method: 'POST' }).catch(() => {})
                  }}
                  className="crm-phone-cell"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'inherit', textDecoration: 'none' }}
                >
                  <Phone size={13} /> {contact.phone}
                </a>
              )}
              {cityText && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} /> {cityText}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2Button icon={<StickyNote size={14} />} onClick={() => setQuickAction('note')}>Note</CrmV2Button>
            <CrmV2Button icon={<Mail size={14} />} onClick={() => setQuickAction('email')}>Email</CrmV2Button>
            <CrmV2Button icon={<Phone size={14} />} onClick={callContact}>Appeler</CrmV2Button>
            <CrmV2Button icon={<SquareCheckBig size={14} />} onClick={() => setQuickAction('task')}>Tâche</CrmV2Button>
            <CrmV2Button variant="accent" icon={<CalendarPlus size={14} />} onClick={openAppointment}>Prendre RDV</CrmV2Button>
          </div>
        </div>
        {pills}
      </div>

      {/* Corps 3 colonnes : chaque colonne défile séparément */}
      <div style={{
        flex: 1, minHeight: 0, padding: '16px 28px 20px', overflowX: 'auto', display: 'grid',
        gridTemplateColumns: 'minmax(240px,300px) minmax(420px,1fr) minmax(260px,320px)', gridTemplateRows: 'minmax(0, 1fr)',
        gap: 16, alignItems: 'stretch',
      }}>
        {/* Colonne gauche — Coordonnées */}
        <div style={{
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowRecord,
          display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => setCoordsOpen(o => !o)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: crmV2.text, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <ChevronDown size={14} color={crmV2.textFaint} style={{ transform: coordsOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
              Coordonnées
            </button>
            <button type="button" onClick={() => setShowCustomize(true)} style={{ ...linkBtn, fontSize: 12 }}>Modifier</button>
          </div>
          {coordsOpen && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 16px', display: 'flex', flexDirection: 'column' }}>
              {coordinatesList(false)}
            </div>
          )}
        </div>

        {/* Colonne centrale — Activité */}
        {timelineNode}

        {/* Colonne droite — sections repliables */}
        <div style={{ display: 'grid', gridAutoRows: 'max-content', alignContent: 'start', gap: 12, minHeight: 0, overflowY: 'auto', paddingBottom: 4 }}>
          {tasksSection}
          {dealsSection}
          {rdvSection}
          {formsSection}
          {inscriptionSections}
          {platformsSection}
          {adsSection}
          {webSection}
        </div>
      </div>

      {modals}
    </CrmV2Page>
  )
}

const linkBtn: React.CSSProperties = {
  appearance: 'none', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, color: crmV2.link,
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/* ═════════════════════ Composants visuels ═════════════════════ */

function LoadingScreen() {
  return (
    <CrmV2Page>
      <CrmV2Spinner />
    </CrmV2Page>
  )
}

function MessageScreen({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <CrmV2Page>
      <div style={{ padding: 28, fontSize: 14, color: error ? '#b91c1c' : crmV2.textMuted }}>{text}</div>
    </CrmV2Page>
  )
}

const editField: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 34, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '0 10px',
  fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, outline: 'none', boxSizing: 'border-box',
}
const editBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0, padding: 0,
}

function EditCell({ value, meta, onChange, onSave, onCancel, saving, customOptions, fieldRef }: {
  value: string
  meta?: CRMProperty
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  customOptions?: Array<{ value: string; label: string }>
  fieldRef?: React.RefObject<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>
}) {
  const editorValue = normalizeValueForEditor(value, meta)
  // customOptions prend priorité (ex: liste des propriétaires pour hubspot_owner_id)
  const options = customOptions ?? (
    (meta?.field_type === 'select' || meta?.field_type === 'radio') ? meta.options : undefined
  )
  const isMultiSelect =
    meta?.field_type === 'checkbox' &&
    meta?.type !== 'bool' &&
    Array.isArray(meta?.options) &&
    meta.options.length > 0
  const selectedMultiValues = editorValue
    .split(';')
    .map(v => v.trim())
    .filter(Boolean)
  const toggleMultiValue = (optValue: string) => {
    const next = new Set(selectedMultiValues)
    if (next.has(optValue)) next.delete(optValue)
    else next.add(optValue)
    onChange([...next].join(';'))
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      {isMultiSelect ? (
        <div style={{ ...editField, height: 'auto', maxHeight: 140, overflowY: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(meta?.options ?? []).map(o => {
            const checked = selectedMultiValues.includes(o.value)
            return (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleMultiValue(o.value)} />
                <span>{o.label}</span>
              </label>
            )
          })}
        </div>
      ) : options ? (
        <select
          ref={fieldRef as React.RefObject<HTMLSelectElement>}
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          style={{ ...editField, cursor: 'pointer' }}
          autoFocus
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : isBooleanProperty(meta) ? (
        <select
          ref={fieldRef as React.RefObject<HTMLSelectElement>}
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          style={{ ...editField, cursor: 'pointer' }}
          autoFocus
        >
          <option value="">—</option>
          <option value="true">Oui</option>
          <option value="false">Non</option>
        </select>
      ) : isDateProperty(meta) ? (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="date"
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          style={editField}
          autoFocus
        />
      ) : isDateTimeProperty(meta) ? (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="datetime-local"
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          style={editField}
          autoFocus
        />
      ) : isNumberProperty(meta) ? (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="number"
          step="any"
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          style={editField}
          autoFocus
        />
      ) : isTextareaProperty(meta) ? (
        <textarea
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          style={{ ...editField, height: 'auto', minHeight: 68, padding: '6px 10px', resize: 'vertical', lineHeight: 1.45 }}
          autoFocus
        />
      ) : (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          style={editField}
          autoFocus
        />
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        title="Enregistrer"
        aria-label="Enregistrer"
        style={{ ...editBtn, background: crmV2.primary, border: `1px solid ${crmV2.primary}`, color: '#fff', opacity: saving ? 0.55 : 1 }}
      >
        <Check size={15} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Annuler"
        aria-label="Annuler"
        style={{ ...editBtn, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, color: crmV2.textMuted }}
      >
        <X size={15} />
      </button>
    </div>
  )
}

function ParcoursupEditorModal({
  value,
  saving,
  onClose,
  onSave,
}: {
  value: ParcoursupPayload
  saving: boolean
  onClose: () => void
  onSave: (next: ParcoursupPayload) => void
}) {
  const [draft, setDraft] = useState<ParcoursupPayload>(normalizedParcoursup(value))
  useEffect(() => { setDraft(normalizedParcoursup(value)) }, [value])
  const verdictChoices: Array<{ value: string; label: string; manual: boolean; status?: string; verdictLabel?: string }> = [
    { value: 'auto', label: 'Auto (recalculé)', manual: false },
    { value: 'ok_valide', label: 'OK VALIDÉ', manual: true, status: 'ok_valide', verdictLabel: 'OK VALIDÉ' },
    { value: 'ok_attente', label: 'OK EN ATTENTE', manual: true, status: 'ok_attente', verdictLabel: 'OK EN ATTENTE' },
    { value: 'good', label: 'GOOD EN PRINCIPE', manual: true, status: 'good', verdictLabel: 'GOOD EN PRINCIPE' },
    { value: 'attention', label: 'ATTENTION JUSTE', manual: true, status: 'attention', verdictLabel: 'ATTENTION JUSTE' },
    { value: 'bascule', label: 'BASCULE COMPLÈTE PAES', manual: true, status: 'bascule', verdictLabel: 'BASCULE COMPLÈTE PAES' },
  ]

  const baseChoices = [
    'PASS — Université Paris Cité',
    'PASS — Sorbonne Université',
    'PASS — Université Paris-Saclay (Orsay)',
    'PASS — Sorbonne Paris Nord (Bobigny)',
    'PASS — Autre université',
    'LSPS — Université Paris-Est Créteil (UPEC)',
    'LSPS — Université Versailles Saint-Quentin (UVSQ)',
    'LSPS — Sorbonne Paris Nord (Bobigny)',
    'LAS — Université Paris Cité',
    'LAS — Université Paris-Saclay',
    'LAS — Université Paris-Est',
    'LAS — Sorbonne Université',
  ]
  const baseParcoursChoices = [
    'Biologie, Physique et Chimie (BPC)',
    'Mathématiques-Informatique',
    'Sciences fondamentales',
    'Sciences de la vie',
    'Droit',
    'Économie-Gestion',
    'Psychologie',
    'STAPS',
    'SVT',
    'Autre',
  ]
  const selectedFormations = draft.q1?.formations ?? []
  const formationChoices = [...new Set([...baseChoices, ...selectedFormations])]
  const voeux = draft.q3?.voeux ?? []
  const parcoursChoices = [...new Set([...baseParcoursChoices, ...voeux.map(v => String(v.mineure || '').trim()).filter(Boolean)])]

  const setQ1 = (patch: Partial<ParcoursupQ1>) => {
    setDraft(prev => ({ ...prev, q1: { ...(prev.q1 ?? {}), ...patch } }))
  }

  const toggleFormation = (label: string) => {
    const next = new Set(draft.q1?.formations ?? [])
    if (next.has(label)) next.delete(label)
    else next.add(label)
    setQ1({ formations: [...next] })
  }

  const patchVoeu = (index: number, patch: Partial<ParcoursupQ3Voeu>) => {
    const next = [...voeux]
    next[index] = { ...(next[index] ?? {}), ...patch }
    setDraft(prev => ({ ...prev, q3: { ...(prev.q3 ?? {}), voeux: next } }))
  }

  const removeVoeu = (index: number) => {
    const next = voeux.filter((_, i) => i !== index)
    setDraft(prev => ({ ...prev, q3: { ...(prev.q3 ?? {}), voeux: next } }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">Parcoursup 2026</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-[#dfe3eb] text-[#516f90] hover:bg-[#f5f8fa] flex items-center justify-center" title="Fermer" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-slate-500">Verdict</div>
              <select
                value={draft.verdict?.manual ? (draft.verdict?.status || 'ok_attente') : 'auto'}
                onChange={e => {
                  const next = verdictChoices.find(v => v.value === e.target.value) ?? verdictChoices[0]
                  setDraft(prev => ({
                    ...prev,
                    verdict: {
                      ...(prev.verdict ?? {}),
                      manual: next.manual,
                      status: next.status ?? prev.verdict?.status ?? null,
                      label: next.verdictLabel ?? prev.verdict?.label ?? null,
                    },
                  }))
                }}
                className="w-full border rounded px-2 py-2"
              >
                {verdictChoices.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-slate-500">Proposition reçue ?</div>
              <select
                value={draft.q1?.proposition ?? ''}
                onChange={e => setQ1({ proposition: e.target.value || null })}
                className="w-full border rounded px-2 py-2"
              >
                <option value="">—</option>
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-slate-500">Validera</div>
              <input
                value={draft.q1?.va_valider ?? ''}
                onChange={e => setQ1({ va_valider: e.target.value || null })}
                className="w-full border rounded px-2 py-2"
                placeholder="Pas encore décidé"
              />
            </label>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Formations avec proposition</div>
            <div className="grid grid-cols-3 gap-2">
              {formationChoices.map(label => {
                const checked = (draft.q1?.formations ?? []).includes(label)
                return (
                  <label key={label} className={`flex items-center gap-2 border rounded px-2 py-1.5 cursor-pointer ${checked ? 'bg-[#ccac71]/10 border-[#ccac71]/40' : 'bg-white'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleFormation(label)} />
                    <span>{label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Voeux en attente</div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 px-1">
                <span className="col-span-4">Formation</span>
                <span className="col-span-4">Mineure/Majeure/Parcours</span>
                <span className="col-span-1 text-center">Mon rang</span>
                <span className="col-span-2 text-center">Dernier admis</span>
                <span className="col-span-1" />
              </div>
              {voeux.map((v, idx) => (
                <div key={`edit-voeu-${idx}`} className="grid grid-cols-12 gap-2">
                  <select
                    className="col-span-4 border rounded px-2 py-1.5 bg-white"
                    value={v.formation ?? ''}
                    onChange={e => patchVoeu(idx, { formation: e.target.value || null })}
                  >
                    <option value="">Formation</option>
                    {formationChoices.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <select
                    className="col-span-4 border rounded px-2 py-1.5 bg-white"
                    value={v.mineure ?? ''}
                    onChange={e => patchVoeu(idx, { mineure: e.target.value || null })}
                  >
                    <option value="">Mineure/Majeure</option>
                    {parcoursChoices.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <input className="col-span-1 border rounded px-2 py-1.5" value={v.rang ?? ''} onChange={e => patchVoeu(idx, { rang: e.target.value ? Number(e.target.value) : null })} placeholder="Rang" />
                  <input className="col-span-2 border rounded px-2 py-1.5" value={v.rang_dernier_admis ?? ''} onChange={e => patchVoeu(idx, { rang_dernier_admis: e.target.value ? Number(e.target.value) : null })} placeholder="Dern. admis" />
                  <button className="col-span-1 border rounded-[10px] text-red-600 hover:bg-red-50 flex items-center justify-center" onClick={() => removeVoeu(idx)} type="button" title="Retirer ce vœu" aria-label="Retirer ce vœu"><X size={14} /></button>
                </div>
              ))}
              <button
                type="button"
                className="border rounded px-2 py-1.5 text-xs hover:bg-slate-50"
                onClick={() => setDraft(prev => ({ ...prev, q3: { ...(prev.q3 ?? {}), voeux: [...(prev.q3?.voeux ?? []), {}] } }))}
              >
                + Ajouter un voeu
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold border border-[#cbd6e2] rounded-full hover:bg-[#f5f8fa]">Annuler</button>
          <button
            onClick={() => onSave({ ...draft, updated_at: new Date().toISOString() })}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-full bg-[#2d3e50] hover:bg-[#1f2d3b] text-white disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ABOUT_FIELDS_MAX = 50

function CustomizeAboutModal({
  allProperties, labelForProp, selected, saving, onClose, onSave, onReset,
}: {
  allProperties: CRMProperty[]
  labelForProp: (name: string) => string
  selected: string[]
  saving: boolean
  onClose: () => void
  onSave: (names: string[]) => void | Promise<void>
  onReset: () => void | Promise<void>
}) {
  const [current, setCurrent] = useState<string[]>(selected)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const currentSet = new Set(current)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= current.length) return
    setCurrent(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const remove = (name: string) => setCurrent(prev => prev.filter(n => n !== name))

  const add = (name: string) => {
    setCurrent(prev => (prev.includes(name) || prev.length >= ABOUT_FIELDS_MAX ? prev : [...prev, name]))
  }

  const q = search.trim().toLowerCase()
  const candidates = allProperties
    .filter(p => !currentSet.has(p.name))
    .filter(p => !q || (p.label ?? '').toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
    .slice(0, 60)

  const atMax = current.length >= ABOUT_FIELDS_MAX

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
      <div
        className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#dfe3eb] flex items-start justify-between gap-3 bg-white text-[#2d3e50]">
          <div>
            <h2 className="text-base font-bold">Propriétés de la fiche</h2>
            <p className="text-xs text-[#516f90] mt-1 leading-relaxed">
              Réorganisez les propriétés affichées sous les coordonnées. Les modifications ne seront visibles que pour vous.
            </p>
          </div>
          <button onClick={onClose} className="text-[#7c98b6] hover:text-[#2d3e50] shrink-0" title="Fermer">
            <X size={18} />
          </button>
        </div>

        {/* Add properties */}
        <div className="px-5 py-3 border-b relative">
          <button
            onClick={() => setShowAdd(v => !v)}
            disabled={atMax}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm font-medium ${
              atMax
                ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
                : 'bg-[#f5f8fa] text-[#2d3e50] border-[#dfe3eb] hover:bg-[#eef1f6]'
            }`}
          >
            <span className="flex items-center gap-2"><Plus size={14} /> Ajouter des propriétés</span>
            <span className="text-xs text-[#7c98b6]">({current.length}/{ABOUT_FIELDS_MAX})</span>
          </button>

          {showAdd && !atMax && (
            <div className="mt-2 border rounded-md shadow-sm">
              <div className="relative p-2 border-b">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7c98b6]" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher une propriété…"
                  autoFocus
                  className="w-full pl-8 pr-2 py-1.5 text-sm border rounded outline-none focus:ring-2 focus:ring-[#C9A84C]/20"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {candidates.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-[#7c98b6]">
                    {q ? 'Aucun résultat' : 'Toutes les propriétés sont déjà ajoutées'}
                  </div>
                ) : (
                  candidates.map(p => (
                    <button
                      key={p.name}
                      onClick={() => { add(p.name); setSearch('') }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#f5f8fa] flex items-center gap-2"
                      title={p.name}
                    >
                      <Plus size={13} className="text-[#7c98b6] shrink-0" />
                      <span className="truncate">{neutralPropLabel(p.label, p.name)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected list (reorderable) */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {current.length === 0 ? (
            <p className="text-sm text-[#7c98b6] text-center py-8">
              Aucune propriété sélectionnée. Ajoutez-en ci-dessus.
            </p>
          ) : (
            <ul className="space-y-1">
              {current.map((name, idx) => (
                <li
                  key={name}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={e => { e.preventDefault() }}
                  onDrop={() => { if (dragIndex !== null && dragIndex !== idx) move(dragIndex, idx); setDragIndex(null) }}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center gap-2 px-2 py-2 rounded-md border bg-white group ${
                    dragIndex === idx ? 'border-[#C9A84C] opacity-60' : 'border-slate-200'
                  }`}
                >
                  <GripVertical size={14} className="text-[#cbbfa6] cursor-grab shrink-0" />
                  <span className="flex-1 text-sm truncate" title={name}>{labelForProp(name)}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => move(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1 text-[#7c98b6] hover:text-[#2d3e50] disabled:opacity-30"
                      title="Monter"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => move(idx, idx + 1)}
                      disabled={idx === current.length - 1}
                      className="p-1 text-[#7c98b6] hover:text-[#2d3e50] disabled:opacity-30"
                      title="Descendre"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => remove(name)}
                      className="p-1 text-[#7c98b6] hover:text-red-600"
                      title="Retirer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center gap-2">
          <button
            onClick={() => onSave(current)}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-full bg-[#2d3e50] text-white font-semibold text-sm hover:bg-[#1f2d3b] disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={onReset}
            disabled={saving}
            className="px-4 py-2 rounded-full border border-[#cbd6e2] text-[#2d3e50] text-sm font-semibold hover:bg-[#f5f8fa] disabled:opacity-60"
          >
            Rétablir le système par défaut
          </button>
        </div>
      </div>
    </div>
  )
}

function PropertiesModal({
  properties, filteredGroups, allValues, propSearch, onSearchChange,
  collapsed, onToggle, editing, editValue, onEditStart, onEditChange, onEditSave, onEditCancel, saving, onClose, onShowHistory,
}: {
  properties: CRMProperty[]
  filteredGroups: Record<string, CRMProperty[]>
  allValues: Record<string, Any>
  propSearch: string
  onSearchChange: (v: string) => void
  collapsed: Record<string, boolean>
  onToggle: (g: string) => void
  editing: string | null
  editValue: string
  onEditStart: (name: string, v: Any) => void
  onEditChange: (v: string) => void
  onEditSave: (name: string, v: string) => void
  onEditCancel: () => void
  saving: boolean
  onClose: () => void
  onShowHistory?: (p: CRMProperty) => void
}) {
  const editFieldRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold">Toutes les propriétés</h2>
            <p className="text-xs text-[#516f90] mt-0.5">{properties.length} propriétés</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-[#dfe3eb] text-[#516f90] hover:bg-[#f5f8fa] flex items-center justify-center" title="Fermer" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7c98b6]" />
            <input
              type="text"
              value={propSearch}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Rechercher une propriété…"
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {!properties.length && (
            <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded">
              Aucune propriété en base. Lance un full sync.
            </p>
          )}
          {Object.entries(filteredGroups).map(([group, props]) => (
            <div key={group} className="mb-3 border rounded-lg overflow-hidden">
              <button
                onClick={() => onToggle(group)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[#f5f8fa] hover:bg-[#f5f8fa] text-sm font-semibold"
              >
                <span>{formatGroup(group)} <span className="text-xs text-[#516f90] ml-1">({props.length})</span></span>
                {collapsed[group] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              {!collapsed[group] && (
                <dl className="divide-y text-sm">
                  {props.map(p => {
                    const val = allValues[p.name] ?? ''
                    const isEditing = editing === p.name
                    const isReadOnly = isReadOnlyPropertyType(p)
                    return (
                      <div key={p.name} className="px-3 py-2.5 grid grid-cols-5 gap-2 hover:bg-[#C9A84C]/10/30 group">
                        <dt className="col-span-2 text-xs text-[#516f90] flex items-center justify-between gap-1" title={p.name}>
                          <span className="truncate">{neutralPropLabel(p.label, p.name)}</span>
                          {onShowHistory && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onShowHistory(p) }}
                              className="opacity-0 group-hover:opacity-100 text-[#7c98b6] hover:text-[#2d3e50] flex-shrink-0"
                              title="Historique"
                            >
                              <History size={11} />
                            </button>
                          )}
                        </dt>
                        <dd className="col-span-3 text-xs">
                          {isEditing ? (
                            <EditCell
                              value={editValue}
                              meta={p}
                              onChange={onEditChange}
                              onSave={() => onEditSave(p.name, editValue)}
                              onCancel={onEditCancel}
                              saving={saving}
                              fieldRef={editFieldRef}
                            />
                          ) : (
                            <button
                              onClick={() => {
                                if (isReadOnly) return
                                flushSync(() => onEditStart(p.name, val))
                                editFieldRef.current?.focus()
                              }}
                              className={`text-left w-full block break-words ${isReadOnly ? 'text-slate-400 cursor-not-allowed' : 'hover:text-[#2d3e50]'}`}
                            >
                              {formatPropValue(val, p) || <span className="text-slate-300">—</span>}
                              {isReadOnly && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">(lecture seule)</span>
                              )}
                            </button>
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═════════ Helpers ═════════ */

function formatPropValue(v: Any, p?: CRMProperty) {
  if (v === null || v === undefined || v === '') return ''
  const str = String(v)
  if (!p) return str
  if (p.type === 'datetime' || p.type === 'date') {
    const ts = parseInt(str, 10)
    if (!isNaN(ts) && ts > 1e12) {
      return p.type === 'date'
        ? format(new Date(ts), 'PP', { locale: fr })
        : format(new Date(ts), 'PPp', { locale: fr })
    }
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      return p.type === 'date'
        ? format(d, 'PP', { locale: fr })
        : format(d, 'PPp', { locale: fr })
    }
  }
  if ((p.field_type === 'select' || p.field_type === 'radio') && p.options) {
    const o = p.options.find(o => o.value === str)
    if (o) return o.label
  }
  if (p.field_type === 'checkbox' && p.type !== 'bool' && p.options) {
    const selected = str
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    if (!selected.length) return ''
    const labels = selected.map(sel => p.options?.find(o => o.value === sel)?.label ?? sel)
    return labels.join(', ')
  }
  if (p.type === 'bool' || (p.field_type === 'checkbox' && !p.options)) {
    return str === 'true' || str === '1' ? 'Oui' : 'Non'
  }
  return str
}

function isReadOnlyPropertyType(p?: CRMProperty): boolean {
  if (!p) return false
  const type = String(p.type || '').toLowerCase()
  const fieldType = String(p.field_type || '').toLowerCase()
  return (
    type.includes('calculation') ||
    fieldType.includes('calculation') ||
    type === 'file' ||
    fieldType === 'file'
  )
}

function isBooleanProperty(p?: CRMProperty): boolean {
  if (!p) return false
  const type = String(p.type || '').toLowerCase()
  const fieldType = String(p.field_type || '').toLowerCase()
  return type === 'bool' || fieldType === 'booleancheckbox'
}

function isDateProperty(p?: CRMProperty): boolean {
  return String(p?.type || '').toLowerCase() === 'date'
}

function isDateTimeProperty(p?: CRMProperty): boolean {
  return String(p?.type || '').toLowerCase() === 'datetime'
}

function isNumberProperty(p?: CRMProperty): boolean {
  return String(p?.type || '').toLowerCase() === 'number'
}

function isTextareaProperty(p?: CRMProperty): boolean {
  return String(p?.field_type || '').toLowerCase() === 'textarea'
}

function normalizeValueForEditor(v: Any, p?: CRMProperty): string {
  if (v === null || v === undefined) return ''
  const raw = String(v)
  if (!p) return raw

  if (isDateProperty(p)) {
    const ts = Number(raw)
    if (!Number.isNaN(ts) && ts > 1e12) return new Date(ts).toISOString().slice(0, 10)
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return ''
  }

  if (isDateTimeProperty(p)) {
    const ts = Number(raw)
    const d = !Number.isNaN(ts) && ts > 1e12 ? new Date(ts) : new Date(raw)
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    return ''
  }

  if (isBooleanProperty(p)) {
    const low = raw.toLowerCase()
    if (low === '1' || low === 'true' || low === 'yes' || low === 'oui') return 'true'
    if (low === '0' || low === 'false' || low === 'no' || low === 'non') return 'false'
    return ''
  }

  return raw
}

function normalizeValueForSave(value: string, p?: CRMProperty): string {
  const raw = String(value ?? '').trim()
  if (!p) return raw
  if (!raw) return ''

  if (isDateProperty(p)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (!m) return raw
    const y = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    return String(Date.UTC(y, month - 1, day))
  }

  if (isDateTimeProperty(p)) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return String(d.getTime())
    return raw
  }

  if (isBooleanProperty(p)) {
    if (raw === 'true') return 'true'
    if (raw === 'false') return 'false'
  }

  if (isNumberProperty(p)) {
    const n = Number(raw.replace(',', '.'))
    if (!Number.isNaN(n)) return String(n)
  }

  return raw
}

function aircallCallIdFromActivity(a: Activity): number | undefined {
  const meta = Number(a.metadata?.aircall_call_id)
  if (Number.isInteger(meta) && meta > 0) return meta
  const eng = String(a.hubspot_engagement_id || '')
  const m = /^aircall_(\d+)$/.exec(eng)
  if (!m) return undefined
  const id = Number(m[1])
  return Number.isInteger(id) && id > 0 ? id : undefined
}

function activityHasAircallAudio(a: Activity): boolean {
  if (a.metadata?.recording || a.metadata?.voicemail) return true
  const status = String(a.status || '').toUpperCase()
  return status === 'COMPLETED' || status === 'LEFT_VOICEMAIL'
}
