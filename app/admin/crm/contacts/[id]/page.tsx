'use client'

import { useEffect, useState, useCallback, use, useRef } from 'react'
import { flushSync } from 'react-dom'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  StickyNote, Mail, Phone, CheckSquare, Calendar, ChevronDown, ChevronRight,
  Plus, Search, Settings, Briefcase, Clock, User, TrendingUp, Award, FileText, History,
  GraduationCap, AlertTriangle, Circle, Pencil, Megaphone, Copy, Check, Trash2,
  SlidersHorizontal, ArrowUp, ArrowDown, X, GripVertical,
} from 'lucide-react'
import type { QuickActionType } from '@/components/crm/QuickActionModal'
import { getCached, prefetch, refetch, invalidate, jsonFetcher } from '@/lib/client-cache'

// Modals/panels rendus sur action utilisateur uniquement -> hors bundle initial.
const QuickActionModal = dynamic(() => import('@/components/crm/QuickActionModal'), { ssr: false })
const PropertyHistoryPanel = dynamic(() => import('@/components/crm/PropertyHistoryPanel'), { ssr: false })
const LinovaAppointmentModal = dynamic(() => import('@/components/crm/LinovaAppointmentModal'), { ssr: false })
const DiplomaAppointmentModal = dynamic(() => import('@/components/crm/DiplomaAppointmentModal'), { ssr: false })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface CRMProperty {
  name: string
  label: string
  description?: string
  group_name: string
  type: string
  field_type: string
  options?: Array<{ label: string; value: string; displayOrder?: number }>
}

interface Activity {
  id: number
  hubspot_engagement_id?: string
  activity_type: string
  subject?: string
  body?: string
  direction?: string
  status?: string
  owner_id?: string
  metadata?: Any
  occurred_at: string
  hubspot_deal_id?: string
}

interface FormSubmission {
  id: number
  form_id: string
  form_title?: string
  form_type?: string
  page_url?: string
  values?: Any
  submitted_at: string
}

interface Owner {
  hubspot_owner_id: string
  email?: string
  firstname?: string
  lastname?: string
}

interface CRMTask {
  id: number
  title: string
  description?: string
  owner_id?: string
  status: 'pending' | 'completed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  task_type: string
  due_at?: string
  completed_at?: string
  created_at: string
  hubspot_deal_id?: string
}

interface EmailStats {
  sent: number
  delivered: number
  opens: number
  clicks: number
  bounces: number
  spam: number
  lastEventAt?: string
  events?: Array<{ type: string; at: string; data?: Any }>
}

interface SMSLinkClick {
  clicked_at: string
  ip?: string | null
  user_agent?: string | null
}

interface SMSLink {
  placeholder: string
  label?: string | null
  original_url: string
  click_count: number
  first_clicked_at?: string | null
  last_clicked_at?: string | null
  clicks: SMSLinkClick[]
}

interface SMSMessage {
  id: string
  campaign_id: string
  phone: string | null
  sent_at: string | null
  created_at: string
  status: string
  rendered_message: string | null
  error_message?: string | null
  segments_count?: number | null
  campaign: { id: string; name: string | null; sender: string | null; campaign_type: string | null } | null
  links: SMSLink[]
  total_clicks: number
}

interface EmailCampaignLinkClick {
  at: string
  ip?: string | null
  ua?: string | null
}

interface EmailCampaignLink {
  url: string
  click_count: number
  clicks: EmailCampaignLinkClick[]
}

interface EmailCampaign {
  id: string
  campaign_id: string | null
  contact_id?: string | null
  email: string | null
  status: string | null
  error_message?: string | null
  sent_at: string | null
  delivered_at: string | null
  first_open_at: string | null
  last_open_at: string | null
  open_count: number
  first_click_at: string | null
  last_click_at: string | null
  click_count: number
  brevo_message_id: string | null
  created_at: string
  campaign: { id: string; name: string | null; subject: string | null; sender_name: string | null; sender_email: string | null } | null
  stats: EmailStats | null
  links: EmailCampaignLink[]
}

interface ContactDetails {
  contact: Record<string, Any>
  deals: Array<Record<string, Any>>
  appointments: Array<Record<string, Any>>
  properties: CRMProperty[]
  dealProperties: Array<{ name: string; label?: string; options?: Array<{ label: string; value: string }> }>
  groups: Record<string, CRMProperty[]>
  activities: Activity[]
  formSubmissions: FormSubmission[]
  owners: Owner[]
  tasks: CRMTask[]
  emailStatsByMessageId?: Record<string, EmailStats>
  preInscriptions?: PreInscription[]
  smsMessages?: SMSMessage[]
  emailCampaigns?: EmailCampaign[]
}

interface PreInscription {
  id: number
  saison: string                      // ex: "2026-2027"
  detected_at: string                 // ISO timestamp
  paiement_status: string | null      // 'en_attente' | 'paye' | 'partiel' | null
  formation: string | null
  montant: number | null
  notes: string | null
  external_data: Record<string, Any>
  updated_at: string
}

interface ParcoursupVerdict {
  status?: string | null
  label?: string | null
  ratio_pct?: number | null
  formation?: string | null
  manual?: boolean | null
}

interface ParcoursupQ1 {
  proposition?: string | null
  formations?: string[] | null
  va_valider?: string | null
}

interface ParcoursupQ3Voeu {
  formation?: string | null
  mineure?: string | null
  rang?: number | null
  rang_dernier_admis?: number | null
}

interface ParcoursupPayload {
  verdict?: ParcoursupVerdict | null
  voeux_alert?: { flagged?: boolean | null; formations?: string[] | null } | null
  q1?: ParcoursupQ1 | null
  q3?: { voeux?: ParcoursupQ3Voeu[] | null } | null
  updated_at?: string | null
}

type TimelineTab = 'all' | 'note' | 'email' | 'sms' | 'call' | 'task' | 'meeting'

// Liste par défaut des propriétés affichées dans la carte « À propos ».
// Chaque utilisateur peut la personnaliser (stockée dans crm_user_prefs).
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

// Couleurs pour les status de lead (pills)
const LEAD_STATUS_COLORS: Record<string, string> = {
  'Nouveau':              'bg-amber-100 text-amber-800 border-amber-200',
  'Nouveau - Chaud':      'bg-red-100 text-red-800 border-red-200',
  'Rdv pris':             'bg-green-100 text-green-800 border-green-200',
  'Pré-inscription':      'bg-purple-100 text-purple-800 border-purple-200',
  'Inscrit':              'bg-emerald-100 text-emerald-800 border-emerald-200',
  'NRP1':                 'bg-amber-100 text-amber-800 border-amber-200',
  'NRP2':                 'bg-amber-100 text-amber-800 border-amber-200',
  'NRP3':                 'bg-orange-100 text-orange-800 border-orange-200',
  'Délai de réflexion':   'bg-yellow-100 text-yellow-800 border-yellow-200',
  'À replanifier':        'bg-[#C9A84C]/15 text-[#0e1e35] border-[#C9A84C]/20',
  'Perdu':                'bg-gray-100 text-gray-800 border-gray-200',
}

// Charte Diploma Santé : base navy, gold en accents uniquement
const BRAND_GRADIENT = 'bg-gradient-to-br from-[#0e1e35] to-[#1f3553]'

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

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<ContactDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraftSubject, setNoteDraftSubject] = useState('')
  const [noteDraftBody, setNoteDraftBody] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [crmUsers, setCrmUsers] = useState<Array<{ id: string; name: string; hubspot_owner_id?: string | null; hubspot_user_id?: string | null }>>([])
  const loadGenRef = useRef(0)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCrmUsers(d) })
      .catch(() => {})
  }, [])

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true
    const gen = ++loadGenRef.current
    const isStale = () => loadGenRef.current !== gen
    const coreKey = `/api/crm/contacts/${id}/details?phase=core`
    const extKey  = `/api/crm/contacts/${id}/details?phase=extended`
    const metaKey = '/api/crm/metadata'

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
  if (err) return <div className="p-8 text-red-600">Erreur : {err}</div>
  if (!data) return <div className="p-8">Aucune donnée.</div>

  const { contact, deals, appointments, properties, dealProperties, groups, activities, formSubmissions, owners, tasks = [], emailStatsByMessageId = {}, preInscriptions = [], smsMessages = [], emailCampaigns = [] } = data

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
    ABOUT_FIELD_FALLBACK_LABELS[name] ?? propMeta[name]?.label ?? name

  // Liste effective des champs de la carte « À propos » selon les préférences user
  const aboutFields: Array<{ name: string; label: string }> =
    (aboutFieldNames ?? DEFAULT_ABOUT_FIELD_NAMES).map(name => ({ name, label: labelForProp(name) }))

  const dealPropMeta: Record<string, { label?: string; options?: Array<{ label: string; value: string }> }> = {}
  for (const p of dealProperties) dealPropMeta[p.name] = { label: p.label, options: p.options }

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

  const startEditNote = (timelineId: string, subject: string, currentBody: string) => {
    setEditingNoteId(timelineId)
    setNoteDraftSubject(subject)
    setNoteDraftBody(currentBody)
  }

  const saveNote = async (activityId: string) => {
    setSavingNote(true)
    try {
      const res = await fetch(`/api/crm/activities/${activityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: noteDraftSubject, body: noteDraftBody }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditingNoteId(null)
      await load({ force: true })
    } catch (e) {
      alert(`Échec de la modification : ${e instanceof Error ? e.message : String(e)}`)
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
      setEditingNoteId(null)
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
  const leadStatusColor = LEAD_STATUS_COLORS[leadStatusLabel] ?? 'bg-slate-100 text-slate-700 border-[#e5ddc8]'
  const ownerName    = ownerLabel(contact.hubspot_owner_id)
  const createdAt    = contact.contact_createdate ? new Date(contact.contact_createdate) : null
  const lastFormDate = contact.recent_conversion_date ? new Date(contact.recent_conversion_date) : null

  // ── Timeline ──────────────────────────────────────────────────────────
  type TimelineItem = {
    id: string
    type: 'note' | 'call' | 'email' | 'sms' | 'meeting' | 'form' | 'rdv' | 'task'
    timestamp: number
    title: string
    body?: string
    subtitle?: string
    ownerId?: string
    emailStats?: EmailStats
    sendStatus?: string
    sms?: SMSMessage
    emailCampaign?: EmailCampaign
    // Renseigné pour les activités natives (crm_activities) → édition/suppression
    activityId?: string
    editable?: boolean
  }
  const timeline: TimelineItem[] = []
  for (const a of activities) {
    const t = a.activity_type.toLowerCase()
    const valid: TimelineItem['type'][] = ['note', 'call', 'email', 'meeting', 'task']
    const type = (valid.includes(t as TimelineItem['type']) ? t : 'note') as TimelineItem['type']
    const msgId = a.metadata?.brevo_message_id as string | undefined
    const stats = type === 'email' && msgId ? emailStatsByMessageId[msgId] : undefined
    // Activités natives (saisies dans le CRM) = éditables. Les notes/appels/
    // emails loggés/réunions sont modifiables ; pas les SMS ni les emails de campagne.
    const isNativeEditable = ['note', 'call', 'email', 'meeting'].includes(type)
    timeline.push({
      id: `act-${a.id}`,
      type,
      timestamp: new Date(a.occurred_at).getTime(),
      title: a.subject || labelForType(type),
      body: a.body ?? undefined,
      subtitle: a.direction ? `Direction : ${a.direction}` : undefined,
      ownerId: a.owner_id,
      emailStats: stats,
      sendStatus: type === 'email' ? a.status : undefined,
      activityId: String(a.id),
      editable: isNativeEditable,
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
  for (const a of appointments) {
    const startAt = a.start_at ? new Date(a.start_at as string).getTime() : 0
    timeline.push({
      id: `rdv-${a.id}`,
      type: 'rdv',
      timestamp: startAt,
      title: `Rendez-vous — ${a.status ?? 'programmé'}`,
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

  const timelineFiltered = timeline.filter(t => {
    if (timelineTab === 'all') return true
    if (timelineTab === 'meeting') return t.type === 'meeting' || t.type === 'rdv'
    return t.type === timelineTab
  }).filter(t => {
    if (!timelineSearch) return true
    const s = timelineSearch.toLowerCase()
    return t.title.toLowerCase().includes(s) || (t.body ?? '').toLowerCase().includes(s)
  })

  const grouped: Record<string, TimelineItem[]> = {}
  for (const it of timelineFiltered) {
    const key = format(new Date(it.timestamp), 'MMMM yyyy', { locale: fr })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(it)
  }

  const counts = {
    all: timeline.length,
    note: timeline.filter(t => t.type === 'note').length,
    email: timeline.filter(t => t.type === 'email').length,
    sms: timeline.filter(t => t.type === 'sms').length,
    call: timeline.filter(t => t.type === 'call').length,
    task: timeline.filter(t => t.type === 'task').length,
    meeting: timeline.filter(t => t.type === 'meeting' || t.type === 'rdv').length,
  }

  const lastActivity = timeline[0]?.timestamp ? new Date(timeline[0].timestamp) : lastFormDate

  // Props modale
  const lc = propSearch.toLowerCase()
  const filteredGroups: Record<string, CRMProperty[]> = {}
  for (const [g, props] of Object.entries(groups)) {
    const f = props.filter(p => !lc || (p.label ?? '').toLowerCase().includes(lc) || p.name.toLowerCase().includes(lc))
    if (f.length > 0) filteredGroups[g] = f
  }
  const toggleGroup = (g: string) => setCollapsed(s => ({ ...s, [g]: !s[g] }))

  return (
    <div className="min-h-screen bg-[#f7f4ee] text-slate-700">
      {/* ═════ Header banner avec gradient Diploma Santé ═════ */}
      <div className={`${BRAND_GRADIENT} text-white px-6 pt-3 pb-20 relative`}>
        <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-xs text-white/80">
          <Link href="/admin/crm" className="hover:text-white">Contacts</Link>
          <ChevronRight size={12} />
          <span>{fullName}</span>
        </div>
        <div className="max-w-[1600px] mx-auto flex items-start gap-5 mt-4">
          <div className="w-20 h-20 rounded-full bg-white/25 backdrop-blur-sm border-2 border-white/60 flex items-center justify-center text-3xl font-bold shadow-xl">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight drop-shadow-sm">{fullName}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-white/90 text-sm">
              {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-white"><Mail size={14} /> {contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-white"><Phone size={14} /> {contact.phone}</a>}
            </div>
          </div>
        </div>
      </div>

      {/* ═════ KPI row ═════ */}
      <div className="max-w-[1600px] mx-auto px-6 -mt-14 relative z-10">
        <div className="grid grid-cols-4 gap-3">
          <KpiCard
            icon={<Briefcase size={18} />}
            label="Transactions"
            value={String(deals.length)}
            hint={deals[0]?.dealname as string | undefined}
            color="bg-gradient-to-br from-[#C9A84C] to-[#0e1e35]"
          />
          <KpiCard
            icon={<Award size={18} />}
            label="Statut du lead"
            value={leadStatusLabel || '—'}
            pillColor={leadStatusColor}
            color="bg-gradient-to-br from-[#C9A84C] to-[#b08f50]"
          />
          <KpiCard
            icon={<Clock size={18} />}
            label="Dernière activité"
            value={lastActivity ? formatDistanceToNow(lastActivity, { locale: fr, addSuffix: true }) : '—'}
            hint={lastActivity ? format(lastActivity, 'PP', { locale: fr }) : undefined}
            color="bg-gradient-to-br from-[#b08f50] to-[#C9A84C]"
          />
          <KpiCard
            icon={<User size={18} />}
            label="Propriétaire"
            value={ownerName}
            hint={createdAt ? `Créé ${formatDistanceToNow(createdAt, { locale: fr, addSuffix: true })}` : undefined}
            color="bg-gradient-to-br from-[#0e1e35] to-[#1f3553]"
          />
        </div>
      </div>

      {/* ═════ Layout 3 colonnes ═════ */}
      <div className="max-w-[1600px] mx-auto px-6 py-6 grid grid-cols-12 gap-4">
        {/* Colonne gauche */}
        <aside className="col-span-3">
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <User size={15} /> À propos
              </div>
              <button
                onClick={() => setShowCustomize(true)}
                className="text-xs text-[#0e1e35] hover:underline flex items-center gap-1"
                title="Personnaliser les propriétés affichées"
              >
                <SlidersHorizontal size={12} /> Personnaliser
              </button>
            </div>

            {/* Quick actions */}
            <div className="px-4 py-3 border-b grid grid-cols-5 gap-2">
              <QuickAction icon={<StickyNote size={14} />} label="Note"   color="bg-amber-50 text-amber-700 border-amber-200"   onClick={() => setQuickAction('note')} />
              <QuickAction icon={<Mail size={14} />}       label="E-mail" color="bg-[#f7f4ee] text-[#0e1e35] border-amber-200"   onClick={() => setQuickAction('email')} />
              <QuickAction icon={<Phone size={14} />}      label="Appel"  color="bg-green-50 text-green-700 border-green-200"  onClick={() => setQuickAction('call')} />
              <QuickAction icon={<CheckSquare size={14} />} label="Tâche" color="bg-[#f7f4ee] text-slate-700 border-[#e5ddc8]"  onClick={() => setQuickAction('task')} />
              <QuickAction icon={<Calendar size={14} />}   label="RDV"    color="bg-purple-50 text-purple-700 border-purple-200" onClick={() => setQuickAction('meeting')} />
            </div>

            <dl className="divide-y px-4 text-sm">
              {aboutFields.length === 0 && (
                <div className="py-6 text-center text-xs text-[#a89e8a]">
                  Aucune propriété affichée.{' '}
                  <button onClick={() => setShowCustomize(true)} className="text-[#0e1e35] hover:underline font-medium">
                    Personnaliser
                  </button>
                </div>
              )}
              {aboutFields.map(f => {
                const val = allValues[f.name]
                const meta = propMeta[f.name]
                const isEditing = editing === f.name
                const isOwnerField = f.name === 'hubspot_owner_id' || f.name === 'closer_du_contact_owner_id' || f.name === 'teleprospecteur' || f.name === 'telepro_user_id'
                const isReadOnly = isReadOnlyPropertyType(meta)
                const displayValue = isOwnerField ? ownerLabel(val as string) : formatPropValue(val, meta)

                return (
                  <div key={f.name} className="py-2.5 group">
                    <dt className="text-[11px] uppercase tracking-wide text-[#a89e8a] mb-0.5 flex items-center justify-between">
                      <span>{f.label}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setHistoryProp({ name: f.name, label: f.label, options: meta?.options }) }}
                        className="opacity-0 group-hover:opacity-100 text-[#a89e8a] hover:text-[#0e1e35] transition"
                        title="Historique des changements"
                      >
                        <History size={11} />
                      </button>
                    </dt>
                    <dd>
                      {isEditing ? (
                        <EditCell
                          value={editValue}
                          meta={meta}
                          onChange={setEditValue}
                          onSave={() => saveProp(f.name, editValue)}
                          onCancel={() => setEditing(null)}
                          saving={saving}
                          customOptions={isOwnerField ? ownerOptions : undefined}
                          fieldRef={editFieldRef}
                        />
                      ) : f.name === 'hs_lead_status' && displayValue && displayValue !== '—' ? (
                        <button
                          onClick={() => {
                            if (isReadOnly) return
                            startInlineEdit(f.name, val, meta)
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${leadStatusColor}`}
                        >{displayValue}</button>
                      ) : (
                        <button
                          onClick={() => {
                            if (isReadOnly) return
                            startInlineEdit(f.name, val, meta)
                          }}
                          className={`text-left w-full block text-sm truncate ${isReadOnly ? 'text-slate-400 cursor-not-allowed' : 'hover:text-[#0e1e35]'}`}
                        >
                          {displayValue || <span className="text-slate-300">—</span>}
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

            <div className="px-4 py-3 border-t bg-[#f7f4ee]">
              <button
                onClick={() => setShowAllProps(true)}
                className="text-xs text-[#0e1e35] hover:underline font-medium"
              >
                Voir les {properties.length} propriétés →
              </button>
            </div>
          </div>
        </aside>

        {/* Colonne centrale */}
        <section className="col-span-6">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="flex border-b px-2 overflow-x-auto">
              <TimelineTabBtn active={timelineTab === 'all'}     onClick={() => setTimelineTab('all')}     label="Toutes" count={counts.all} />
              <TimelineTabBtn active={timelineTab === 'note'}    onClick={() => setTimelineTab('note')}    label="Notes"     count={counts.note} />
              <TimelineTabBtn active={timelineTab === 'email'}   onClick={() => setTimelineTab('email')}   label="E-mails"   count={counts.email} />
              <TimelineTabBtn active={timelineTab === 'sms'}     onClick={() => setTimelineTab('sms')}     label="SMS"       count={counts.sms} />
              <TimelineTabBtn active={timelineTab === 'call'}    onClick={() => setTimelineTab('call')}    label="Appels"    count={counts.call} />
              <TimelineTabBtn active={timelineTab === 'task'}    onClick={() => setTimelineTab('task')}    label="Tâches"    count={counts.task} />
              <TimelineTabBtn active={timelineTab === 'meeting'} onClick={() => setTimelineTab('meeting')} label="Réunions"  count={counts.meeting} />
            </div>
            <div className="p-3 border-b">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89e8a]" />
                <input
                  type="text"
                  value={timelineSearch}
                  onChange={e => setTimelineSearch(e.target.value)}
                  placeholder="Rechercher dans la timeline…"
                  className="w-full pl-9 pr-3 py-2 border rounded-md text-sm bg-[#f7f4ee] focus:bg-white focus:ring-2 focus:ring-[#C9A84C]/20"
                />
              </div>
            </div>
            <div className="p-4">
              {timelineFiltered.length === 0 ? (
                <EmptyTimeline />
              ) : (
                <div className="relative pl-8">
                  <div className="absolute left-3.5 top-3 bottom-3 w-px bg-slate-200" />
                  {Object.entries(grouped).map(([month, items]) => (
                    <div key={month} className="mb-6">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-[#a89e8a] mb-3 -ml-8 pl-8 sticky top-0 bg-white py-1">{month}</div>
                      <ul className="space-y-3">
                        {items.map(t => (
                          <li key={t.id} className="relative">
                            <div className="absolute -left-[22px] top-3">
                              <TypeDot type={t.type} />
                            </div>
                            <div className="group bg-white border rounded-lg p-3 hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <TypeBadge type={t.type} />
                                  <div className="text-sm font-semibold">{t.title}</div>
                                  {t.type === 'email' && <EmailStatusBadges sendStatus={t.sendStatus} stats={t.emailStats} />}
                                  {t.type === 'sms' && <SMSStatusBadges status={t.sendStatus} totalClicks={t.sms?.total_clicks} />}
                                </div>
                                <div className="flex items-center gap-2">
                                  {t.editable && t.activityId && editingNoteId !== t.id && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => startEditNote(t.id, t.title, t.body ?? '')}
                                        className="p-1 rounded text-[#4a6070] hover:bg-[#f7f4ee] hover:text-[#0e1e35]"
                                        title="Modifier"
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        onClick={() => deleteNote(t.activityId!)}
                                        className="p-1 rounded text-red-500 hover:bg-red-50"
                                        title="Supprimer"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  )}
                                  <div className="text-xs text-[#a89e8a] whitespace-nowrap">
                                    {format(new Date(t.timestamp), "d MMM 'à' HH:mm", { locale: fr })}
                                  </div>
                                </div>
                              </div>
                              {t.subtitle && <div className="text-xs text-[#4a6070] mt-1">{t.subtitle}</div>}
                              {t.ownerId && (
                                <div className="text-xs text-[#4a6070] mt-1 flex items-center gap-1">
                                  <User size={11} /> {ownerLabel(t.ownerId)}
                                </div>
                              )}
                              {editingNoteId === t.id ? (
                                <div className="mt-2 space-y-2">
                                  <input
                                    type="text"
                                    value={noteDraftSubject}
                                    onChange={e => setNoteDraftSubject(e.target.value)}
                                    placeholder="Titre (optionnel)"
                                    className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] outline-none"
                                  />
                                  <textarea
                                    value={noteDraftBody}
                                    onChange={e => setNoteDraftBody(e.target.value)}
                                    rows={4}
                                    autoFocus
                                    placeholder="Contenu…"
                                    className="w-full px-3 py-2 border rounded-md text-sm resize-y focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] outline-none"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => setEditingNoteId(null)}
                                      disabled={savingNote}
                                      className="px-3 py-1.5 text-sm border rounded-md hover:bg-[#f7f4ee] disabled:opacity-50"
                                    >
                                      Annuler
                                    </button>
                                    <button
                                      onClick={() => saveNote(t.activityId!)}
                                      disabled={savingNote}
                                      className="px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50 hover:opacity-90 bg-[#C9A84C]"
                                    >
                                      {savingNote ? 'Enregistrement…' : 'Enregistrer'}
                                    </button>
                                  </div>
                                </div>
                              ) : t.body && (
                                <div
                                  className="text-sm text-slate-700 mt-2 whitespace-pre-wrap bg-[#f7f4ee] p-2 rounded"
                                  dangerouslySetInnerHTML={{ __html: sanitize(t.body) }}
                                />
                              )}
                              {t.type === 'sms' && t.sms?.error_message && (
                                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">
                                  Erreur : {t.sms.error_message}
                                </div>
                              )}
                              {t.type === 'sms' && t.sms?.links && t.sms.links.length > 0 && (
                                <SMSLinksSection links={t.sms.links} />
                              )}
                              {t.type === 'email' && t.emailCampaign?.error_message && (
                                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">
                                  Erreur : {t.emailCampaign.error_message}
                                </div>
                              )}
                              {t.type === 'email' && t.emailCampaign?.links && t.emailCampaign.links.length > 0 && (
                                <EmailLinksSection links={t.emailCampaign.links} />
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Colonne droite */}
        <aside className="col-span-3 space-y-3">
          {/* Tâches en cours */}
          <RightSection icon={<CheckSquare size={14} />} title="Tâches" count={tasks.filter(t => t.status === 'pending').length} accent="brand">
            <PendingTasks
              tasks={tasks.filter(t => t.status === 'pending')}
              owners={owners}
              onUpdated={load}
              onAdd={() => setQuickAction('task')}
            />
          </RightSection>

          <RightSection icon={<Briefcase size={14} />} title="Transactions" count={deals.length} accent="brand">
            {deals.length === 0 ? (
              <EmptyRight text="Aucune transaction." />
            ) : (
              <ul className="space-y-2">
                {deals.map(d => (
                  <li key={d.hubspot_deal_id as string}>
                    <DealCard
                      deal={d}
                      stageLabel={stageLabel(d.dealstage as string)}
                      pipelineLabel={pipelineLabel(d.pipeline as string)}
                      ownerLabel={ownerLabel(d.hubspot_owner_id as string)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </RightSection>

          <RightSection icon={<Calendar size={14} />} title="Rendez-vous" count={appointments.length} accent="gold">
            <div className="mb-2">
              <button
                onClick={() => (isLinovaContact ? setShowLinovaModal(true) : setShowDiplomaModal(true))}
                className="w-full text-sm font-semibold px-3 py-2 rounded-lg bg-[#0e1e35] text-white hover:bg-[#1f3553]"
              >
                {isLinovaContact ? 'Programmer RDV admission Linova' : 'Programmer rendez-vous Diploma Santé'}
              </button>
            </div>
            {appointments.length === 0 ? (
              <EmptyRight text="Aucun RDV." />
            ) : (
              <ul className="space-y-2">
                {appointments.map(a => (
                  <li key={a.id as string} className="border rounded-lg p-3 text-sm bg-[#C9A84C]/5">
                    <div className="font-medium">
                      {a.start_at ? format(new Date(a.start_at as string), 'PPp', { locale: fr }) : '—'}
                    </div>
                    <div className="text-xs text-[#4a6070] mt-0.5">{a.status as string}</div>
                  </li>
                ))}
              </ul>
            )}
          </RightSection>

          <RightSection icon={<FileText size={14} />} title="Formulaires soumis" count={formSubmissions.length} accent="dark">
            {formSubmissions.length === 0 ? (
              <EmptyRight text="Aucune soumission." />
            ) : (
              <ul className="space-y-2">
                {formSubmissions.slice(0, 10).map(f => (
                  <li key={f.id} className="border rounded-lg p-3 text-sm bg-[#f7f4ee]">
                    <div className="font-medium">{f.form_title || f.form_id}</div>
                    <div className="text-xs text-[#4a6070] mt-0.5">
                      {format(new Date(f.submitted_at), 'PP', { locale: fr })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RightSection>

          {/* Tracking publicitaire (gclid, fbclid, UTM…) — visible uniquement
              si au moins une donnée d'attribution est presente sur le contact */}
          <AdTrackingSection raw={contact.hubspot_raw as Record<string, unknown> | null | undefined} />

          {/* Inscription par saison — alimenté par la plateforme externe */}
          {preInscriptions.map(pi => {
            // Titre court (26-27 au lieu de 2026-2027) pour rester sur 1 ligne
            const yyShort = pi.saison.split('-').map(y => y.slice(2)).join('-')
            const ext = pi.external_data || {}
            const finalisationStep = Number(ext.finalisation_step ?? 0)
            const paidAt = ext.paid_at as string | undefined
            const acompteCents = Number(ext.amount_paid_cents ?? 0)
            const acompteEuros = acompteCents / 100
            // "Lien rempli" cote plateforme = etape 1 du formulaire de finalisation soumise
            // (les champs fin_echeances / selected_formule / fin_remise_cheques apparaissent
            // ensemble dans finalisation_data des que l'eleve valide la 1ere etape).
            const finData = (ext.finalisation_data as Record<string, unknown> | null | undefined) ?? null
            const formStarted = !!finData?.fin_echeances
            const parcoursupOverride = ext.parcoursup_crm_override as ParcoursupPayload | undefined
            const parcoursupRaw = ext.parcoursup as ParcoursupPayload | undefined
            const parcoursupData = (parcoursupOverride ?? parcoursupRaw) ?? {}
            // Bloc visible pour toute pré-inscription 26-27 (même sans formulaire rempli).
            const showParcoursup2026 = pi.saison === '2026-2027'

            const status = (() => {
              const s = pi.paiement_status
              if (s === 'archivee')   return { label: 'Inscription finalisée', color: 'bg-green-600 text-white', dot: 'bg-green-300' }
              if (s === 'en_cours' && formStarted) return { label: 'Finalisation – lien rempli', color: 'bg-amber-100 text-amber-800', dot: 'bg-[#C9A84C]' }
              if (s === 'en_cours')   return { label: 'Finalisation – lien envoyé', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' }
              // payee + finalisation_step>0 = onglet "En finalisation" cote plateforme
              if (s === 'payee' && finalisationStep > 0 && formStarted) return { label: 'Finalisation – lien rempli', color: 'bg-amber-100 text-amber-800', dot: 'bg-[#C9A84C]' }
              if (s === 'payee' && finalisationStep > 0) return { label: 'Finalisation – lien envoyé', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' }
              if (s === 'payee')      return { label: 'Pré-inscrit', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' }
              if (s === 'en_attente') return { label: 'En attente paiement', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' }
              if (s === 'brouillon')  return { label: 'Brouillon', color: 'bg-slate-100 text-[#4a6070]', dot: 'bg-slate-400' }
              if (s === 'annulee')    return { label: 'Inscription annulée', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' }
              return { label: 'En attente données…', color: 'bg-slate-100 text-[#4a6070]', dot: 'bg-slate-300' }
            })()

            return (
              <div key={`pi-block-${pi.id}`} className="space-y-3">
                <RightSection
                  icon={<GraduationCap size={14} />}
                  title={`Inscription ${yyShort}`}
                  count={1}
                  accent="brand"
                >
                  <div className="space-y-3 text-xs">
                    {/* Statut en haut */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${status.color}`}>
                      <span className={`inline-block w-2 h-2 rounded-full ${status.dot}`} />
                      <span className="font-semibold">{status.label}</span>
                    </div>

                    {/* Formation */}
                    {pi.formation && (
                      <div className="space-y-0.5">
                        <div className="text-[#4a6070]">Formation</div>
                        <div className="font-medium text-[#0e1e35]">{pi.formation}</div>
                      </div>
                    )}

                    {/* Bloc montants */}
                    {(pi.montant != null || acompteEuros > 0) && (
                      <div className="bg-[#f7f4ee] rounded-lg p-2.5 space-y-1.5">
                        {pi.montant != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#4a6070]">Total formule</span>
                            <span className="font-semibold">{Number(pi.montant).toLocaleString('fr-FR')} €</span>
                          </div>
                        )}
                        {acompteEuros > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#4a6070]">Acompte payé</span>
                            <span className="font-medium text-emerald-700">{acompteEuros.toLocaleString('fr-FR')} €</span>
                          </div>
                        )}
                        {paidAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#4a6070]">Date paiement</span>
                            <span>{format(new Date(paidAt), 'PP', { locale: fr })}</span>
                          </div>
                        )}
                        {ext.payment_method && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#4a6070]">Méthode</span>
                            <span className="capitalize">{String(ext.payment_method).replace(/_/g, ' ')}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {pi.notes && (
                      <div className="space-y-1">
                        <div className="text-[#4a6070]">Notes</div>
                        <div className="whitespace-pre-wrap text-slate-700 bg-amber-50 rounded p-2 leading-relaxed">{pi.notes}</div>
                      </div>
                    )}

                    {/* Date detection (footer discret) */}
                    <div className="text-[#a89e8a] pt-1 border-t flex items-center justify-between">
                      <span>Détectée le {format(new Date(pi.detected_at), 'd MMM yyyy', { locale: fr })}</span>
                      {ext.inscription_id && (
                        <span title="ID plateforme">{String(ext.inscription_id).slice(0, 8)}…</span>
                      )}
                    </div>
                  </div>
                </RightSection>

                {showParcoursup2026 && (
                  <RightSection
                    icon={<GraduationCap size={14} />}
                    title="Parcoursup 2026"
                    count={1}
                    accent="brand"
                  >
                    <ParcoursupSummaryCard
                      data={parcoursupData}
                      inscriptionId={ext.inscription_id as string | undefined}
                      onEdit={() => {
                        const clone = (typeof globalThis.structuredClone === 'function')
                          ? globalThis.structuredClone(parcoursupData)
                          : JSON.parse(JSON.stringify(parcoursupData))
                        setParcoursupEditor({ preInscriptionId: pi.id, data: clone })
                      }}
                    />
                  </RightSection>
                )}
              </div>
            )
          })}
        </aside>
      </div>

      {/* Modal Quick Action (note / appel / email / tâche / réunion) */}
      {quickAction && (
        <QuickActionModal
          type={quickAction}
          contactId={id}
          owners={owners}
          defaultOwnerId={contact.hubspot_owner_id as string | undefined}
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

      {/* Side-panel historique d'une propriété */}
      {historyProp && (
        <PropertyHistoryPanel
          contactId={id}
          propertyName={historyProp.name}
          propertyLabel={historyProp.label}
          options={historyProp.options}
          onClose={() => setHistoryProp(null)}
        />
      )}

      {/* Modale personnalisation des propriétés « À propos » */}
      {showCustomize && (
        <CustomizeAboutModal
          allProperties={properties}
          labelForProp={labelForProp}
          selected={(aboutFieldNames ?? DEFAULT_ABOUT_FIELD_NAMES)}
          saving={savingAboutFields}
          onClose={() => setShowCustomize(false)}
          onSave={async (names) => { await saveAboutFields(names); setShowCustomize(false) }}
          onReset={async () => { await saveAboutFields(DEFAULT_ABOUT_FIELD_NAMES); setShowCustomize(false) }}
        />
      )}

      {/* Modale propriétés */}
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
          onShowHistory={(p) => setHistoryProp({ name: p.name, label: p.label || p.name, options: p.options })}
        />
      )}
    </div>
  )
}

/* ═════════════════════ Composants visuels ═════════════════════ */

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-[#4a6070]">
        <div className="w-6 h-6 border-2 border-[#e5ddc8] border-t-[#C9A84C] rounded-full animate-spin" />
        <span>Chargement…</span>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, hint, color, pillColor }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; color: string; pillColor?: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 flex gap-3 items-start hover:shadow-md transition-shadow">
      <div className={`${color} w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#a89e8a]">{label}</div>
        {pillColor ? (
          <div className="mt-1">
            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${pillColor}`}>{value}</span>
          </div>
        ) : (
          <div className="text-base font-bold text-[#0e1e35] truncate mt-0.5">{value}</div>
        )}
        {hint && <div className="text-[11px] text-[#4a6070] truncate mt-0.5">{hint}</div>}
      </div>
    </div>
  )
}

function QuickAction({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-1.5 rounded-md border ${color} hover:opacity-80 transition-opacity cursor-pointer`}
      title={label}
    >
      {icon}
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  )
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
  // customOptions prend priorité (ex: liste des owners pour hubspot_owner_id)
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
    <div className="flex gap-1">
      {isMultiSelect ? (
        <div className="flex-1 border rounded px-2 py-1 max-h-32 overflow-auto bg-white">
          <div className="grid grid-cols-1 gap-1">
            {(meta?.options ?? []).map(o => {
              const checked = selectedMultiValues.includes(o.value)
              return (
                <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggleMultiValue(o.value)} />
                  <span>{o.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      ) : options ? (
        <select
          ref={fieldRef as React.RefObject<HTMLSelectElement>}
          value={editorValue}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1 border rounded text-xs"
          autoFocus
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        isBooleanProperty(meta) ? (
          <select
            ref={fieldRef as React.RefObject<HTMLSelectElement>}
            value={editorValue}
            onChange={e => onChange(e.target.value)}
            className="flex-1 px-2 py-1 border rounded text-xs"
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
            className="flex-1 px-2 py-1 border rounded text-xs"
            autoFocus
          />
        ) : isDateTimeProperty(meta) ? (
          <input
            ref={fieldRef as React.RefObject<HTMLInputElement>}
            type="datetime-local"
            value={editorValue}
            onChange={e => onChange(e.target.value)}
            className="flex-1 px-2 py-1 border rounded text-xs"
            autoFocus
          />
        ) : isNumberProperty(meta) ? (
          <input
            ref={fieldRef as React.RefObject<HTMLInputElement>}
            type="number"
            step="any"
            value={editorValue}
            onChange={e => onChange(e.target.value)}
            className="flex-1 px-2 py-1 border rounded text-xs"
            autoFocus
          />
        ) : isTextareaProperty(meta) ? (
          <textarea
            ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
            value={editorValue}
            onChange={e => onChange(e.target.value)}
            className="flex-1 px-2 py-1 border rounded text-xs min-h-[68px]"
            autoFocus
          />
        ) : (
          <input
            ref={fieldRef as React.RefObject<HTMLInputElement>}
            value={editorValue}
            onChange={e => onChange(e.target.value)}
            className="flex-1 px-2 py-1 border rounded text-xs"
            autoFocus
          />
        )
      )}
      <button
        onClick={onSave}
        disabled={saving}
        className="px-2.5 text-white bg-[#0e1e35] rounded text-xs disabled:opacity-50 hover:bg-[#0e1e35]"
      >✓</button>
      <button
        onClick={onCancel}
        className="px-2.5 border rounded text-xs hover:bg-[#f7f4ee]"
      >✕</button>
    </div>
  )
}

function TimelineTabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-[#C9A84C] text-[#0e1e35] font-semibold' : 'border-transparent text-[#4a6070] hover:text-slate-700'
      }`}
    >
      {label} {count > 0 && <span className={`text-xs ${active ? 'text-[#C9A84C]' : 'text-[#a89e8a]'}`}>({count})</span>}
    </button>
  )
}

function TypeDot({ type }: { type: string }) {
  const map: Record<string, string> = {
    note: 'bg-amber-400',
    email: 'bg-[#C9A84C]',
    sms: 'bg-violet-500',
    call: 'bg-green-500',
    task: 'bg-slate-400',
    meeting: 'bg-purple-500',
    rdv: 'bg-[#C9A84C]',
    form: 'bg-rose-500',
  }
  return <div className={`w-3 h-3 rounded-full ring-4 ring-white ${map[type] ?? 'bg-slate-400'}`} />
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { icon: React.ReactNode; bg: string }> = {
    note:    { icon: <StickyNote size={11} />, bg: 'bg-amber-100 text-amber-700' },
    email:   { icon: <Mail size={11} />,       bg: 'bg-amber-100 text-[#0e1e35]' },
    sms:     { icon: <Phone size={11} />,      bg: 'bg-violet-100 text-violet-700' },
    call:    { icon: <Phone size={11} />,      bg: 'bg-green-100 text-green-700' },
    task:    { icon: <CheckSquare size={11} />, bg: 'bg-slate-100 text-slate-700' },
    meeting: { icon: <Calendar size={11} />,   bg: 'bg-purple-100 text-purple-700' },
    rdv:     { icon: <Calendar size={11} />,   bg: 'bg-[#C9A84C]/15 text-[#0e1e35]' },
    form:    { icon: <FileText size={11} />,   bg: 'bg-rose-100 text-rose-700' },
  }
  const m = map[type] ?? map.note
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${m.bg}`}>
      {m.icon}
      {labelForType(type)}
    </span>
  )
}

function SMSStatusBadges({ status, totalClicks }: { status?: string; totalClicks?: number }) {
  const items: Array<{ label: string; bg: string; title?: string }> = []
  const statusMap: Record<string, { label: string; bg: string }> = {
    sent:    { label: 'Envoyé',    bg: 'bg-green-100 text-green-700 border border-green-200' },
    failed:  { label: 'Échec',     bg: 'bg-red-100 text-red-700 border border-red-200' },
    skipped: { label: 'Ignoré',    bg: 'bg-amber-100 text-amber-700 border border-amber-200' },
    pending: { label: 'En attente', bg: 'bg-slate-100 text-[#4a6070] border border-[#e5ddc8]' },
  }
  if (status && statusMap[status]) items.push(statusMap[status])
  if ((totalClicks ?? 0) > 0) {
    items.push({
      label: `${totalClicks} clic${(totalClicks ?? 0) > 1 ? 's' : ''}`,
      bg: 'bg-violet-100 text-violet-700 border border-violet-200',
      title: 'Clics sur les liens trackés',
    })
  }
  if (items.length === 0) return null
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {items.map((b, i) => (
        <span key={i} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${b.bg}`} title={b.title}>
          {b.label}
        </span>
      ))}
    </span>
  )
}

function SMSLinksSection({ links }: { links: SMSLink[] }) {
  const [expandedToken, setExpandedToken] = useState<string | null>(null)
  return (
    <div className="mt-2 space-y-1.5">
      {links.map((link, idx) => {
        const key = link.placeholder + idx
        const isExpanded = expandedToken === key
        const hasClicks = (link.click_count ?? 0) > 0
        return (
          <div key={key} className="text-xs border rounded-md bg-[#f7f4ee] px-2 py-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-violet-700 font-semibold bg-white px-1.5 py-0.5 rounded text-[10px]">
                {link.placeholder}
              </code>
              <a
                href={link.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-700 underline-offset-2 hover:underline truncate max-w-[260px]"
                title={link.original_url}
              >
                {link.original_url}
              </a>
              {link.label && <span className="text-[#a89e8a] italic">({link.label})</span>}
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold ${hasClicks ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-[#4a6070]'}`}>
                {link.click_count ?? 0} clic{(link.click_count ?? 0) > 1 ? 's' : ''}
              </span>
              {hasClicks && link.clicks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedToken(isExpanded ? null : key)}
                  className="text-[10px] text-violet-600 hover:underline"
                >
                  {isExpanded ? 'Masquer' : 'Détails'}
                </button>
              )}
            </div>
            {hasClicks && link.last_clicked_at && (
              <div className="text-[10px] text-[#4a6070] mt-0.5">
                Dernier clic : {(() => {
                  try { return formatDistanceToNow(new Date(link.last_clicked_at), { addSuffix: true, locale: fr }) }
                  catch { return link.last_clicked_at }
                })()}
              </div>
            )}
            {isExpanded && link.clicks.length > 0 && (
              <ul className="mt-2 space-y-1 border-t pt-2">
                {link.clicks.map((c, i) => (
                  <li key={i} className="text-[10px] text-[#4a6070] flex items-center gap-2">
                    <span className="text-[#a89e8a]">•</span>
                    <span className="font-mono">
                      {format(new Date(c.clicked_at), "d MMM 'à' HH:mm:ss", { locale: fr })}
                    </span>
                    {c.ip && <span className="text-[#a89e8a]">IP {c.ip}</span>}
                    {c.user_agent && (
                      <span className="text-[#a89e8a] truncate max-w-[200px]" title={c.user_agent}>
                        {c.user_agent.split(/[/\s]/)[0]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmailLinksSection({ links }: { links: EmailCampaignLink[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  return (
    <div className="mt-2 space-y-1.5">
      {links.map((link, idx) => {
        const key = link.url + idx
        const isExpanded = expandedKey === key
        return (
          <div key={key} className="text-xs border rounded-md bg-[#f7f4ee] px-2 py-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-700 underline-offset-2 hover:underline truncate max-w-[300px]"
                title={link.url}
              >
                {link.url}
              </a>
              <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-[#0e1e35]">
                {link.click_count} clic{link.click_count > 1 ? 's' : ''}
              </span>
              {link.clicks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  className="text-[10px] text-[#0e1e35] hover:underline"
                >
                  {isExpanded ? 'Masquer' : 'Détails'}
                </button>
              )}
            </div>
            {link.clicks.length > 0 && link.clicks[0]?.at && (
              <div className="text-[10px] text-[#4a6070] mt-0.5">
                Dernier clic : {(() => {
                  try { return formatDistanceToNow(new Date(link.clicks[0].at), { addSuffix: true, locale: fr }) }
                  catch { return link.clicks[0].at }
                })()}
              </div>
            )}
            {isExpanded && link.clicks.length > 0 && (
              <ul className="mt-2 space-y-1 border-t pt-2">
                {link.clicks.map((c, i) => (
                  <li key={i} className="text-[10px] text-[#4a6070] flex items-center gap-2">
                    <span className="text-[#a89e8a]">•</span>
                    <span className="font-mono">
                      {format(new Date(c.at), "d MMM 'à' HH:mm:ss", { locale: fr })}
                    </span>
                    {c.ip && <span className="text-[#a89e8a]">IP {c.ip}</span>}
                    {c.ua && (
                      <span className="text-[#a89e8a] truncate max-w-[200px]" title={c.ua}>
                        {c.ua.split(/[/\s]/)[0]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmailStatusBadges({ sendStatus, stats }: { sendStatus?: string; stats?: EmailStats }) {
  const items: Array<{ label: string; bg: string; title?: string }> = []

  // Trouve le dernier event d'un type donné dans stats.events
  const lastEventOf = (predicate: (type: string) => boolean): string | undefined => {
    if (!stats?.events) return undefined
    const matches = stats.events.filter(e => predicate(e.type))
    if (matches.length === 0) return undefined
    // Le plus récent (occurred_at desc côté API)
    return matches.reduce((acc, e) => (!acc || e.at > acc ? e.at : acc), '' as string) || undefined
  }
  const formatRelative = (iso?: string): string | undefined => {
    if (!iso) return undefined
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr }) }
    catch { return undefined }
  }
  const formatExact = (iso?: string): string | undefined => {
    if (!iso) return undefined
    try { return format(new Date(iso), "d MMM 'à' HH:mm", { locale: fr }) }
    catch { return undefined }
  }

  if (sendStatus === 'FAILED') {
    items.push({ label: 'Échec', bg: 'bg-red-100 text-red-700' })
  } else if (sendStatus === 'SENT') {
    items.push({ label: 'Envoyé', bg: 'bg-slate-100 text-[#4a6070]' })
  }
  if (stats) {
    if (stats.delivered > 0) items.push({ label: 'Délivré', bg: 'bg-green-100 text-green-700' })
    if (stats.opens > 0) {
      const last = lastEventOf(t => t === 'open' || t === 'opened' || t === 'opens' || t === 'unique_opened' || t === 'proxy_open')
      const rel = formatRelative(last)
      const exact = formatExact(last)
      const cnt = stats.opens > 1 ? ` ×${stats.opens}` : ''
      items.push({
        label: rel ? `Ouvert${cnt} · ${rel}` : `Ouvert${cnt}`,
        bg: 'bg-amber-100 text-[#0e1e35]',
        title: exact ? `Dernière ouverture : ${exact}` : undefined,
      })
    }
    if (stats.clicks > 0) {
      const last = lastEventOf(t => t === 'click' || t === 'clicks' || t === 'unique_clicked')
      const rel = formatRelative(last)
      const exact = formatExact(last)
      const cnt = stats.clicks > 1 ? ` ×${stats.clicks}` : ''
      items.push({
        label: rel ? `Cliqué${cnt} · ${rel}` : `Cliqué${cnt}`,
        bg: 'bg-violet-100 text-violet-700',
        title: exact ? `Dernier clic : ${exact}` : undefined,
      })
    }
    if (stats.bounces > 0) items.push({ label: 'Rejeté', bg: 'bg-orange-100 text-orange-700' })
    if (stats.spam > 0) items.push({ label: 'Spam', bg: 'bg-rose-100 text-rose-700' })
  }
  if (items.length === 0) return null
  return (
    <>
      {items.map((it, i) => (
        <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${it.bg}`} title={it.title}>
          {it.label}
        </span>
      ))}
    </>
  )
}

function RightSection({ icon, title, count, accent, children }: {
  icon: React.ReactNode; title: string; count: number; accent: 'brand' | 'gold' | 'dark'; children: React.ReactNode
}) {
  // Persiste l'etat ouvert/ferme par section dans localStorage (defaut : ferme)
  const storageKey = `rs-open:${title}`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(storageKey) === '1'
  })
  const toggle = () => {
    setOpen(o => {
      const next = !o
      if (typeof window !== 'undefined') localStorage.setItem(storageKey, next ? '1' : '0')
      return next
    })
  }
  const accentColor = {
    brand: 'text-[#0e1e35] bg-[#C9A84C]/10',
    gold:  'text-[#C9A84C] bg-[#C9A84C]/10',
    dark:  'text-[#333] bg-slate-100',
  }[accent]
  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f7f4ee]"
      >
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md ${accentColor} flex items-center justify-center`}>
            {icon}
          </div>
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-[#4a6070] bg-slate-100 px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-[#a89e8a] hover:text-[#4a6070] p-1"><Plus size={14} /></span>
          <span className="text-[#a89e8a] hover:text-[#4a6070] p-1"><Settings size={13} /></span>
          {open ? <ChevronDown size={14} className="text-[#a89e8a]" /> : <ChevronRight size={14} className="text-[#a89e8a]" />}
        </div>
      </button>
      {open && <div className="p-3 pt-0">{children}</div>}
    </div>
  )
}

function DealCard({ deal, stageLabel, pipelineLabel, ownerLabel }: {
  deal: Record<string, Any>
  stageLabel: string
  pipelineLabel: string
  ownerLabel: string
}) {
  // Stages génériques pour la progress bar visuelle
  const stageOrder = ['Rdv pris', 'Délai de réflexion', 'À replanifier', 'Pré-inscription', 'Finalisation', 'Inscription confirmée']
  const stageLower = stageLabel.toLowerCase()
  const idx = stageOrder.findIndex(s => stageLower.includes(s.toLowerCase().split(' ')[0])) // best-effort
  const progress = idx >= 0 ? ((idx + 1) / stageOrder.length) * 100 : 25

  return (
    <Link
      href={`/admin/crm/deals/${deal.hubspot_deal_id}`}
      className="block border rounded-lg p-3 bg-gradient-to-br from-[#C9A84C]/5 to-white hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#0e1e35] text-white flex items-center justify-center shadow-sm">
          <Briefcase size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#0e1e35] truncate">
            {deal.dealname || '(sans nom)'}
          </div>
          {deal.formation && (
            <div className="text-xs text-[#4a6070] mt-0.5">{deal.formation as string}</div>
          )}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="font-medium text-[#0e1e35]">{stageLabel}</span>
          <span className="text-[#a89e8a]">{pipelineLabel}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#C9A84C] to-[#0e1e35]" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-[#4a6070]">
        <span className="flex items-center gap-1"><User size={10} /> {ownerLabel}</span>
        <span>{deal.createdate ? format(new Date(deal.createdate as string), 'PP', { locale: fr }) : ''}</span>
      </div>
    </Link>
  )
}

function PendingTasks({ tasks, owners, onUpdated, onAdd }: {
  tasks: CRMTask[]
  owners: Owner[]
  onUpdated: () => void
  onAdd: () => void
}) {
  const [nowMs] = useState(() => Date.now())
  const ownerLabel = (id?: string | null) => {
    if (!id) return ''
    const o = owners.find(o => o.hubspot_owner_id === id)
    if (!o) return id
    return [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || id
  }
  const completeTask = async (id: number) => {
    await fetch(`/api/crm/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    onUpdated()
  }
  const priorityColor: Record<string, string> = {
    low:    'bg-slate-100 text-[#4a6070]',
    normal: 'bg-amber-100 text-[#0e1e35]',
    high:   'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  }

  return (
    <>
      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-1 mb-2 py-1.5 text-xs text-[#0e1e35] border border-dashed border-[#C9A84C]/40 rounded-md hover:bg-[#C9A84C]/5"
      >
        <Plus size={12} /> Créer une tâche
      </button>
      {tasks.length === 0 ? (
        <div className="text-xs text-[#a89e8a] text-center py-3 px-2 border border-dashed rounded-lg">
          Aucune tâche en cours.
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map(t => {
            const isOverdue = t.due_at && new Date(t.due_at).getTime() < nowMs
            return (
              <li
                key={t.id}
                className={`border rounded-lg p-2.5 text-sm bg-white hover:shadow-sm ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => completeTask(t.id)}
                    className="mt-0.5 w-4 h-4 rounded border-2 border-[#e5ddc8] hover:border-[#0e1e35] hover:bg-[#0e1e35]/10 flex-shrink-0"
                    title="Marquer comme terminée"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{t.title}</div>
                    {t.description && <div className="text-xs text-[#4a6070] mt-0.5 line-clamp-2">{t.description}</div>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.priority !== 'normal' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityColor[t.priority] ?? ''}`}>
                          {t.priority === 'urgent' ? 'Urgent' : t.priority === 'high' ? 'Haute' : 'Basse'}
                        </span>
                      )}
                      {t.due_at && (
                        <span className={`text-[10px] ${isOverdue ? 'text-red-600 font-medium' : 'text-[#4a6070]'}`}>
                          {format(new Date(t.due_at), "PP 'à' HH:mm", { locale: fr })}
                        </span>
                      )}
                      {t.owner_id && (
                        <span className="text-[10px] text-[#4a6070] flex items-center gap-0.5">
                          <User size={9} /> {ownerLabel(t.owner_id)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function EmptyTimeline() {
  return (
    <div className="text-center py-12 px-6">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-[#a89e8a] mb-3">
        <TrendingUp size={28} />
      </div>
      <p className="text-sm font-medium text-[#4a6070]">Pas encore d&apos;activité</p>
      <p className="text-xs text-[#a89e8a] mt-1">Les notes, appels, emails, formulaires apparaîtront ici.</p>
    </div>
  )
}

function EmptyRight({ text }: { text: string }) {
  return (
    <div className="text-xs text-[#a89e8a] text-center py-4 px-2 border border-dashed rounded-lg">{text}</div>
  )
}

function parcoursupVerdictStyles(status?: string | null) {
  const v = String(status || '').toLowerCase()
  if (v === 'ok_valide') return 'bg-green-100 text-green-800 border-green-200'
  if (v === 'ok_attente') return 'bg-blue-100 text-blue-800 border-blue-200'
  if (v === 'good') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (v === 'attention') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (v === 'bascule') return 'bg-red-100 text-red-800 border-red-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function normalizedParcoursup(data: ParcoursupPayload): ParcoursupPayload {
  const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []
    return value.map(v => String(v || '').trim()).filter(Boolean)
  }
  const toVoeuxArray = (value: unknown): ParcoursupQ3Voeu[] => {
    if (!Array.isArray(value)) return []
    return value
      .filter(v => !!v && typeof v === 'object')
      .map(v => v as ParcoursupQ3Voeu)
  }

  return {
    verdict: (data.verdict && typeof data.verdict === 'object') ? data.verdict : {},
    voeux_alert: {
      flagged: !!data.voeux_alert?.flagged,
      formations: toStringArray(data.voeux_alert?.formations),
    },
    q1: {
      proposition: data.q1?.proposition ?? null,
      formations: toStringArray(data.q1?.formations),
      va_valider: data.q1?.va_valider ?? null,
    },
    q3: { voeux: toVoeuxArray(data.q3?.voeux) },
    updated_at: data.updated_at ?? null,
  }
}

function ParcoursupSummaryCard({
  data,
  inscriptionId,
  onEdit,
}: {
  data: ParcoursupPayload
  inscriptionId?: string
  onEdit: () => void
}) {
  const p = normalizedParcoursup(data)
  const verdictLabel = p.verdict?.label || 'En attente de verdict'
  const proposition = p.q1?.proposition || '—'
  const vaValider = p.q1?.va_valider || '—'
  const formations = p.q1?.formations ?? []
  const voeux = p.q3?.voeux ?? []
  const flagged = !!p.voeux_alert?.flagged
  const flaggedFormations = (p.voeux_alert?.formations ?? []).filter(Boolean)
  const link = inscriptionId ? `https://admission.diploma-sante.fr/#/parcoursup/${inscriptionId}` : null

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border font-semibold ${parcoursupVerdictStyles(p.verdict?.status)}`}>
          <Circle size={10} />
          {verdictLabel}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border bg-white hover:bg-slate-50"
        >
          <Pencil size={11} />
          Modifier
        </button>
      </div>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[11px] break-all text-[#0038f0] hover:underline"
        >
          {link}
        </a>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border bg-slate-50 px-2 py-1.5">
          <div className="text-slate-500">Proposition reçue ?</div>
          <div className="font-semibold text-slate-800 capitalize">{proposition}</div>
        </div>
        <div className="rounded border bg-slate-50 px-2 py-1.5">
          <div className="text-slate-500">Validera</div>
          <div className="font-semibold text-slate-800">{vaValider}</div>
        </div>
      </div>

      {formations.length > 0 && (
        <div>
          <div className="text-slate-500 mb-1">Formations avec proposition</div>
          <div className="flex flex-wrap gap-1">
            {formations.map((f, idx) => (
              <span key={`${f}-${idx}`} className="px-2 py-1 rounded border bg-[#ccac71]/10 border-[#ccac71]/30 text-slate-800">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {voeux.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[minmax(0,2.3fr)_minmax(0,2.3fr)_minmax(70px,0.9fr)_minmax(90px,1.1fr)] gap-2 bg-slate-50 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">
            <span className="min-w-0">Formation</span>
            <span className="min-w-0">Mineure</span>
            <span className="text-right">Rang</span>
            <span className="text-right">Dern. admis</span>
          </div>
          <div className="divide-y">
            {voeux.slice(0, 8).map((v, idx) => (
              <div key={`voeu-${idx}`} className="grid grid-cols-[minmax(0,2.3fr)_minmax(0,2.3fr)_minmax(70px,0.9fr)_minmax(90px,1.1fr)] gap-2 px-2 py-1.5 text-[11px]">
                <span className="text-slate-800 min-w-0 break-words">{v.formation || '—'}</span>
                <span className="text-slate-600 min-w-0 break-words">{v.mineure || '—'}</span>
                <span className="font-semibold text-slate-800 text-right tabular-nums">{v.rang ?? '—'}</span>
                <span className="text-slate-700 text-right tabular-nums">{v.rang_dernier_admis ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {flagged && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center gap-1 text-red-700 font-semibold">
            <AlertTriangle size={12} />
            ATTENTION — Voeux à vérifier
          </div>
          {flaggedFormations.length > 0 && (
            <div className="mt-1 text-red-700">
              {flaggedFormations.join(', ')}
            </div>
          )}
        </div>
      )}

      {p.updated_at && (
        <div className="text-slate-400 text-right">
          Mis à jour le {(() => {
            try {
              return format(new Date(p.updated_at as string), 'dd/MM/yyyy HH:mm', { locale: fr })
            } catch {
              return String(p.updated_at)
            }
          })()}
        </div>
      )}
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
    { value: 'auto', label: '🔄 Auto (recalculé)', manual: false },
    { value: 'ok_valide', label: '✅ OK VALIDÉ', manual: true, status: 'ok_valide', verdictLabel: 'OK VALIDÉ' },
    { value: 'ok_attente', label: '🔵 OK EN ATTENTE', manual: true, status: 'ok_attente', verdictLabel: 'OK EN ATTENTE' },
    { value: 'good', label: '🟢 GOOD EN PRINCIPE', manual: true, status: 'good', verdictLabel: 'GOOD EN PRINCIPE' },
    { value: 'attention', label: '🟠 ATTENTION JUSTE', manual: true, status: 'attention', verdictLabel: 'ATTENTION JUSTE' },
    { value: 'bascule', label: '🔴 BASCULE COMPLÈTE PAES', manual: true, status: 'bascule', verdictLabel: 'BASCULE COMPLÈTE PAES' },
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">Parcoursup 2026</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
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
                  <button className="col-span-1 border rounded text-red-600 hover:bg-red-50" onClick={() => removeVoeu(idx)} type="button">✕</button>
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
          <button onClick={onClose} className="px-3 py-2 text-sm border rounded hover:bg-slate-50">Annuler</button>
          <button
            onClick={() => onSave({ ...draft, updated_at: new Date().toISOString() })}
            disabled={saving}
            className="px-3 py-2 text-sm rounded bg-[#0038f0] text-white disabled:opacity-60"
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
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3 bg-gradient-to-br from-[#0e1e35] to-[#1f3553] text-white">
          <div>
            <h2 className="text-base font-bold">Modifier les propriétés de la carte</h2>
            <p className="text-xs text-white/70 mt-1 leading-relaxed">
              Réorganisez et ajoutez des propriétés à cette carte. Les modifications ne seront visibles que pour vous.
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white shrink-0" title="Fermer">
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
                : 'bg-[#f7f4ee] text-[#0e1e35] border-[#e5ddc8] hover:bg-[#f0ead9]'
            }`}
          >
            <span className="flex items-center gap-2"><Plus size={14} /> Ajouter des propriétés</span>
            <span className="text-xs text-[#a89e8a]">({current.length}/{ABOUT_FIELDS_MAX})</span>
          </button>

          {showAdd && !atMax && (
            <div className="mt-2 border rounded-md shadow-sm">
              <div className="relative p-2 border-b">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a89e8a]" />
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
                  <div className="px-3 py-3 text-xs text-[#a89e8a]">
                    {q ? 'Aucun résultat' : 'Toutes les propriétés sont déjà ajoutées'}
                  </div>
                ) : (
                  candidates.map(p => (
                    <button
                      key={p.name}
                      onClick={() => { add(p.name); setSearch('') }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#f7f4ee] flex items-center gap-2"
                      title={p.name}
                    >
                      <Plus size={13} className="text-[#a89e8a] shrink-0" />
                      <span className="truncate">{p.label || p.name}</span>
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
            <p className="text-sm text-[#a89e8a] text-center py-8">
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
                      className="p-1 text-[#a89e8a] hover:text-[#0e1e35] disabled:opacity-30"
                      title="Monter"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => move(idx, idx + 1)}
                      disabled={idx === current.length - 1}
                      className="p-1 text-[#a89e8a] hover:text-[#0e1e35] disabled:opacity-30"
                      title="Descendre"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => remove(name)}
                      className="p-1 text-[#a89e8a] hover:text-red-600"
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
            className="flex-1 px-4 py-2 rounded-md bg-[#C9A84C] text-[#0e1e35] font-semibold text-sm hover:bg-[#b8973f] disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={onReset}
            disabled={saving}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-60"
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold">Toutes les propriétés</h2>
            <p className="text-xs text-[#4a6070] mt-0.5">{properties.length} propriétés synchronisées depuis HubSpot</p>
          </div>
          <button onClick={onClose} className="text-[#a89e8a] hover:text-slate-700 text-xl">✕</button>
        </div>
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89e8a]" />
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
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[#f7f4ee] hover:bg-[#f7f4ee] text-sm font-semibold"
              >
                <span>{formatGroup(group)} <span className="text-xs text-[#4a6070] ml-1">({props.length})</span></span>
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
                        <dt className="col-span-2 text-xs text-[#4a6070] flex items-center justify-between gap-1" title={p.name}>
                          <span className="truncate">{p.label || p.name}</span>
                          {onShowHistory && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onShowHistory(p) }}
                              className="opacity-0 group-hover:opacity-100 text-[#a89e8a] hover:text-[#0e1e35] flex-shrink-0"
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
                              className={`text-left w-full block break-words ${isReadOnly ? 'text-slate-400 cursor-not-allowed' : 'hover:text-[#0e1e35]'}`}
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

function labelForType(t: string) {
  const labels: Record<string, string> = { note: 'Note', call: 'Appel', email: 'E-mail', sms: 'SMS', meeting: 'Réunion', task: 'Tâche', rdv: 'RDV', form: 'Formulaire' }
  return labels[t] ?? t
}

function formatGroup(g: string) {
  const map: Record<string, string> = {
    contactinformation: 'Informations contact',
    diploma_sante: 'Diploma Santé',
    emailinformation: 'E-mails',
    conversioninformation: 'Conversion',
    leadstatus: 'Statut lead',
    activityinformation: 'Activité',
    socialmediainformation: 'Réseaux sociaux',
    analyticsinformation: 'Analytics',
    other: 'Autres',
  }
  return map[g] || g.replace(/_/g, ' ')
}

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

function sanitize(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}

// ────────────────────────────────────────────────────────────────────────────
// Tracking publicitaire — affiche les IDs Google Ads / Meta / etc. quand
// un lead vient d'une campagne payante. Lecture des proprietes deja
// synchronisees dans `crm_contacts.hubspot_raw` (gclid, fbclid,
// hs_google_click_id, hs_facebook_click_id, utm_*, hs_analytics_*…).
// La section reste cachee si aucun tracking n'est present sur le contact.
// ────────────────────────────────────────────────────────────────────────────

interface TrackingId { key: string; label: string }
interface TrackingSource {
  id: 'google' | 'meta' | 'bing' | 'linkedin' | 'tiktok' | 'snapchat'
  label: string
  badgeClass: string
  ids: TrackingId[]
  /** boolean property HubSpot : "le lead a cliqué sur une pub de ce reseau" */
  clickedKey?: string
}

const AD_SOURCES: TrackingSource[] = [
  {
    id: 'google',
    label: 'Google Ads',
    badgeClass: 'bg-[#fef3c7] text-[#92400e] border-[#fcd34d]',
    ids: [
      { key: 'gclid', label: 'gclid' },
      { key: 'hs_google_click_id', label: 'HS Google Click ID' },
    ],
    clickedKey: 'hs_google_ad_clicked',
  },
  {
    id: 'meta',
    label: 'Meta · Facebook / Instagram',
    badgeClass: 'bg-[#dbeafe] text-[#1e40af] border-[#93c5fd]',
    ids: [
      { key: 'fbclid', label: 'fbclid' },
      { key: 'hs_facebook_click_id', label: 'HS Facebook Click ID' },
    ],
    clickedKey: 'hs_facebook_ad_clicked',
  },
  {
    id: 'bing',
    label: 'Microsoft Ads (Bing)',
    badgeClass: 'bg-[#cffafe] text-[#155e75] border-[#67e8f9]',
    ids: [{ key: 'hs_bing_click_id', label: 'Bing Click ID' }],
    clickedKey: 'hs_bing_ad_clicked',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Ads',
    badgeClass: 'bg-[#dbeafe] text-[#1e3a8a] border-[#93c5fd]',
    ids: [{ key: 'hs_linkedin_click_id', label: 'LinkedIn Click ID' }],
    clickedKey: 'hs_linkedin_ad_clicked',
  },
  {
    id: 'tiktok',
    label: 'TikTok Ads',
    badgeClass: 'bg-slate-900 text-white border-slate-700',
    ids: [{ key: 'hs_tiktok_click_id', label: 'TikTok Click ID' }],
    clickedKey: 'hs_tiktok_ad_clicked',
  },
  {
    id: 'snapchat',
    label: 'Snapchat Ads',
    badgeClass: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]',
    ids: [{ key: 'lead_id_snapchat', label: 'Snapchat Lead ID' }],
  },
]

const UTM_FIELDS: TrackingId[] = [
  { key: 'utm_source',   label: 'Source' },
  { key: 'utm_medium',   label: 'Medium' },
  { key: 'utm_campaign', label: 'Campagne' },
  { key: 'utm_content',  label: 'Content' },
  { key: 'utm_term',     label: 'Term' },
]

const HS_CAMPAIGN_FIELDS: TrackingId[] = [
  { key: 'hs_analytics_first_touch_converting_campaign', label: 'First touch' },
  { key: 'hs_analytics_last_touch_converting_campaign',  label: 'Last touch'  },
]

function rawString(raw: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!raw) return null
  const v = raw[key]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

function rawBool(raw: Record<string, unknown> | null | undefined, key: string): boolean {
  const s = rawString(raw, key)
  if (!s) return false
  return s === 'true' || s === '1'
}

function AdTrackingSection({ raw }: { raw: Record<string, unknown> | null | undefined }) {
  const sourcesPresent = AD_SOURCES
    .map(src => {
      const ids = src.ids
        .map(i => ({ ...i, value: rawString(raw, i.key) }))
        .filter(i => !!i.value)
      const clicked = src.clickedKey ? rawBool(raw, src.clickedKey) : false
      return { src, ids, clicked }
    })
    .filter(s => s.ids.length > 0 || s.clicked)

  const utms = UTM_FIELDS
    .map(f => ({ ...f, value: rawString(raw, f.key) }))
    .filter(f => !!f.value)

  const hsCampaigns = HS_CAMPAIGN_FIELDS
    .map(f => ({ ...f, value: rawString(raw, f.key) }))
    .filter(f => !!f.value)

  const totalCount =
    sourcesPresent.reduce((acc, s) => acc + s.ids.length, 0) +
    utms.length +
    hsCampaigns.length

  if (totalCount === 0) return null

  return (
    <RightSection
      icon={<Megaphone size={14} />}
      title="Tracking publicitaire"
      count={totalCount}
      accent="gold"
    >
      <div className="space-y-3 text-xs">
        {/* Badges des reseaux detectes */}
        {sourcesPresent.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sourcesPresent.map(({ src }) => (
              <span
                key={src.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${src.badgeClass}`}
              >
                {src.label}
              </span>
            ))}
          </div>
        )}

        {/* Detail par source */}
        {sourcesPresent.map(({ src, ids, clicked }) => (
          <div key={src.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="text-[11px] uppercase tracking-wide text-[#a89e8a] font-semibold">
                {src.label}
              </div>
              {clicked && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Pub cliquée
                </span>
              )}
            </div>
            {ids.map(i => (
              <CopyableId key={i.key} label={i.label} value={i.value as string} />
            ))}
          </div>
        ))}

        {/* UTM */}
        {utms.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t">
            <div className="text-[11px] uppercase tracking-wide text-[#a89e8a] font-semibold">
              UTM
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
              {utms.map(u => (
                <div key={u.key} className="contents">
                  <dt className="text-[#4a6070]">{u.label}</dt>
                  <dd className="font-medium text-[#0e1e35] truncate" title={u.value as string}>
                    {u.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* HubSpot first/last touch campaigns */}
        {hsCampaigns.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t">
            <div className="text-[11px] uppercase tracking-wide text-[#a89e8a] font-semibold">
              Campagne HubSpot
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
              {hsCampaigns.map(c => (
                <div key={c.key} className="contents">
                  <dt className="text-[#4a6070]">{c.label}</dt>
                  <dd className="font-medium text-[#0e1e35] truncate" title={c.value as string}>
                    {c.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </RightSection>
  )
}

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback silencieux
    }
  }
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-[#a89e8a]">{label}</div>
        <div className="font-mono text-[11px] text-[#0e1e35] break-all leading-snug" title={value}>
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 p-1.5 rounded border bg-white hover:bg-[#f7f4ee] text-[#4a6070]"
        title="Copier"
      >
        {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      </button>
    </div>
  )
}
