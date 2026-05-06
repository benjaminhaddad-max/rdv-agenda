'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  StickyNote, Mail, Phone, CheckSquare, Calendar, ChevronDown, ChevronRight,
  Plus, Search, Settings, Briefcase, Clock, User, TrendingUp, Award, FileText, History,
  GraduationCap,
} from 'lucide-react'
import QuickActionModal, { type QuickActionType } from '@/components/crm/QuickActionModal'
import PropertyHistoryPanel from '@/components/crm/PropertyHistoryPanel'
import { getCached, prefetch, refetch, invalidate, jsonFetcher } from '@/lib/client-cache'

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

type TimelineTab = 'all' | 'note' | 'email' | 'sms' | 'call' | 'task' | 'meeting'

const ABOUT_FIELDS: Array<{ name: string; label: string }> = [
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
]

// Couleurs pour les status de lead (pills)
const LEAD_STATUS_COLORS: Record<string, string> = {
  'Nouveau':              'bg-blue-100 text-blue-800 border-blue-200',
  'Nouveau - Chaud':      'bg-red-100 text-red-800 border-red-200',
  'Rdv pris':             'bg-green-100 text-green-800 border-green-200',
  'Pré-inscription':      'bg-purple-100 text-purple-800 border-purple-200',
  'Inscrit':              'bg-emerald-100 text-emerald-800 border-emerald-200',
  'NRP1':                 'bg-amber-100 text-amber-800 border-amber-200',
  'NRP2':                 'bg-amber-100 text-amber-800 border-amber-200',
  'NRP3':                 'bg-orange-100 text-orange-800 border-orange-200',
  'Délai de réflexion':   'bg-yellow-100 text-yellow-800 border-yellow-200',
  'À replanifier':        'bg-[#2ea3f2]/15 text-indigo-800 border-[#2ea3f2]/20',
  'Perdu':                'bg-gray-100 text-gray-800 border-gray-200',
}

// Charte Diploma Santé : bleu ciel (#2ea3f2) → bleu foncé (#0038f0)
const BRAND_GRADIENT = 'bg-gradient-to-br from-[#2ea3f2] to-[#0038f0]'

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<ContactDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [timelineTab, setTimelineTab] = useState<TimelineTab>('all')
  const [timelineSearch, setTimelineSearch] = useState('')
  const [showAllProps, setShowAllProps] = useState(false)
  const [propSearch, setPropSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [quickAction, setQuickAction] = useState<QuickActionType | null>(null)
  const [historyProp, setHistoryProp] = useState<{ name: string; label: string; options?: Array<{ label: string; value: string }> } | null>(null)

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true
    const detailKey = `/api/crm/contacts/${id}/details`
    const metaKey   = '/api/crm/metadata'

    // Si on force (ex: apres un save) → on invalide le cache details (la
    // metadata change rarement, on garde le cache 5min).
    if (force) invalidate(detailKey)

    // Cache hit (typiquement issu du prefetch au hover) → render immediat,
    // puis revalidation silencieuse en arriere-plan.
    if (!force) {
      const cachedDetails = getCached<Any>(detailKey)
      const cachedMeta    = getCached<Any>(metaKey)
      if (cachedDetails && cachedMeta) {
        setData({ ...cachedDetails, ...cachedMeta })
        setLoading(false)
        // revalidate background — pas de await
        Promise.all([
          refetch<Any>(detailKey, () => jsonFetcher(detailKey), 60_000),
          refetch<Any>(metaKey,   () => jsonFetcher(metaKey),   5 * 60_000),
        ]).then(([d, m]) => setData({ ...d, ...m })).catch(() => {})
        return
      }
    }

    setLoading(true)
    try {
      const [details, meta] = await Promise.all([
        force
          ? refetch<Any>(detailKey, () => jsonFetcher(detailKey), 60_000)
          : prefetch<Any>(detailKey, () => jsonFetcher(detailKey), 60_000),
        prefetch<Any>(metaKey, () => jsonFetcher(metaKey), 5 * 60_000),
      ])
      setData({ ...details, ...meta })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingScreen />
  if (err) return <div className="p-8 text-red-600">Erreur : {err}</div>
  if (!data) return <div className="p-8">Aucune donnée.</div>

  const { contact, deals, appointments, properties, dealProperties, groups, activities, formSubmissions, owners, tasks = [], emailStatsByMessageId = {}, preInscriptions = [], smsMessages = [], emailCampaigns = [] } = data

  const fullName = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || '(sans nom)'
  const initials = ((contact.firstname?.[0] ?? '') + (contact.lastname?.[0] ?? '')).toUpperCase() || '?'

  // Merge hubspot_raw + colonnes
  const allValues: Record<string, Any> = {
    ...(contact.hubspot_raw ?? {}),
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
    zone___localite:  contact.zone_localite,
    formation_souhaitee:                contact.formation_souhaitee,
    diploma_sante___formation_demandee: contact.formation_demandee,
  }

  const propMeta: Record<string, CRMProperty> = {}
  for (const p of properties) propMeta[p.name] = p

  const dealPropMeta: Record<string, { label?: string; options?: Array<{ label: string; value: string }> }> = {}
  for (const p of dealProperties) dealPropMeta[p.name] = { label: p.label, options: p.options }

  // Options pour les dropdowns "Propriétaire" / "Téléprospecteur" :
  // toutes les valeurs possibles = tous les owners HubSpot actifs
  const ownerOptions = owners.map(o => ({
    value: o.hubspot_owner_id,
    label: [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id,
  }))

  const ownerMap: Record<string, Owner> = {}
  for (const o of owners) ownerMap[o.hubspot_owner_id] = o

  const ownerLabel = (id?: string | null) => {
    if (!id) return '—'
    const o = ownerMap[id]
    if (!o) return id
    return [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || id
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
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/contacts/${id}/prop`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property: propName, value }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load({ force: true })
      setEditing(null)
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // ── KPI values ─────────────────────────────────────────────────────────
  const leadStatus   = allValues.hs_lead_status as string | undefined
  const leadStatusLabel = formatPropValue(leadStatus, propMeta.hs_lead_status)
  const leadStatusColor = LEAD_STATUS_COLORS[leadStatusLabel] ?? 'bg-slate-100 text-slate-700 border-slate-200'
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
  }
  const timeline: TimelineItem[] = []
  for (const a of activities) {
    const t = a.activity_type.toLowerCase()
    const valid: TimelineItem['type'][] = ['note', 'call', 'email', 'meeting', 'task']
    const type = (valid.includes(t as TimelineItem['type']) ? t : 'note') as TimelineItem['type']
    const msgId = a.metadata?.brevo_message_id as string | undefined
    const stats = type === 'email' && msgId ? emailStatsByMessageId[msgId] : undefined
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
    <div className="min-h-screen bg-slate-50 text-slate-700">
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
            color="bg-gradient-to-br from-[#2ea3f2] to-[#0038f0]"
          />
          <KpiCard
            icon={<Award size={18} />}
            label="Statut du lead"
            value={leadStatusLabel || '—'}
            pillColor={leadStatusColor}
            color="bg-gradient-to-br from-[#ccac71] to-[#b08f50]"
          />
          <KpiCard
            icon={<Clock size={18} />}
            label="Dernière activité"
            value={lastActivity ? formatDistanceToNow(lastActivity, { locale: fr, addSuffix: true }) : '—'}
            hint={lastActivity ? format(lastActivity, 'PP', { locale: fr }) : undefined}
            color="bg-gradient-to-br from-[#4cabdb] to-[#2ea3f2]"
          />
          <KpiCard
            icon={<User size={18} />}
            label="Propriétaire"
            value={ownerName}
            hint={createdAt ? `Créé ${formatDistanceToNow(createdAt, { locale: fr, addSuffix: true })}` : undefined}
            color="bg-gradient-to-br from-[#0038f0] to-[#0028b0]"
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
              <button className="text-xs text-[#0038f0] hover:underline">Actions</button>
            </div>

            {/* Quick actions */}
            <div className="px-4 py-3 border-b grid grid-cols-5 gap-2">
              <QuickAction icon={<StickyNote size={14} />} label="Note"   color="bg-amber-50 text-amber-700 border-amber-200"   onClick={() => setQuickAction('note')} />
              <QuickAction icon={<Mail size={14} />}       label="E-mail" color="bg-blue-50 text-blue-700 border-blue-200"     onClick={() => setQuickAction('email')} />
              <QuickAction icon={<Phone size={14} />}      label="Appel"  color="bg-green-50 text-green-700 border-green-200"  onClick={() => setQuickAction('call')} />
              <QuickAction icon={<CheckSquare size={14} />} label="Tâche" color="bg-slate-50 text-slate-700 border-slate-200"  onClick={() => setQuickAction('task')} />
              <QuickAction icon={<Calendar size={14} />}   label="RDV"    color="bg-purple-50 text-purple-700 border-purple-200" onClick={() => setQuickAction('meeting')} />
            </div>

            <dl className="divide-y px-4 text-sm">
              {ABOUT_FIELDS.map(f => {
                const val = allValues[f.name]
                const meta = propMeta[f.name]
                const isEditing = editing === f.name
                const isOwnerField = f.name === 'hubspot_owner_id' || f.name === 'closer_du_contact_owner_id' || f.name === 'teleprospecteur'
                const isOwner = f.name === 'hubspot_owner_id'
                const displayValue = isOwnerField ? ownerLabel(val as string) : formatPropValue(val, meta)

                return (
                  <div key={f.name} className="py-2.5 group">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5 flex items-center justify-between">
                      <span>{f.label}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setHistoryProp({ name: f.name, label: f.label, options: meta?.options }) }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#0038f0] transition"
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
                        />
                      ) : f.name === 'hs_lead_status' && displayValue && displayValue !== '—' ? (
                        <button
                          onClick={() => { setEditing(f.name); setEditValue(String(val ?? '')) }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${leadStatusColor}`}
                        >{displayValue}</button>
                      ) : (
                        <button
                          onClick={() => { setEditing(f.name); setEditValue(String(val ?? '')) }}
                          className="text-left w-full block text-sm hover:text-[#0038f0] truncate"
                        >
                          {displayValue || <span className="text-slate-300">—</span>}
                        </button>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>

            <div className="px-4 py-3 border-t bg-slate-50">
              <button
                onClick={() => setShowAllProps(true)}
                className="text-xs text-[#0038f0] hover:underline font-medium"
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
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={timelineSearch}
                  onChange={e => setTimelineSearch(e.target.value)}
                  placeholder="Rechercher dans la timeline…"
                  className="w-full pl-9 pr-3 py-2 border rounded-md text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#2ea3f2]/20"
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
                      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 -ml-8 pl-8 sticky top-0 bg-white py-1">{month}</div>
                      <ul className="space-y-3">
                        {items.map(t => (
                          <li key={t.id} className="relative">
                            <div className="absolute -left-[22px] top-3">
                              <TypeDot type={t.type} />
                            </div>
                            <div className="bg-white border rounded-lg p-3 hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <TypeBadge type={t.type} />
                                  <div className="text-sm font-semibold">{t.title}</div>
                                  {t.type === 'email' && <EmailStatusBadges sendStatus={t.sendStatus} stats={t.emailStats} />}
                                  {t.type === 'sms' && <SMSStatusBadges status={t.sendStatus} totalClicks={t.sms?.total_clicks} />}
                                </div>
                                <div className="text-xs text-slate-400 whitespace-nowrap">
                                  {format(new Date(t.timestamp), "d MMM 'à' HH:mm", { locale: fr })}
                                </div>
                              </div>
                              {t.subtitle && <div className="text-xs text-slate-500 mt-1">{t.subtitle}</div>}
                              {t.ownerId && (
                                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                  <User size={11} /> {ownerLabel(t.ownerId)}
                                </div>
                              )}
                              {t.body && (
                                <div
                                  className="text-sm text-slate-700 mt-2 whitespace-pre-wrap bg-slate-50 p-2 rounded"
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
            {appointments.length === 0 ? (
              <EmptyRight text="Aucun RDV." />
            ) : (
              <ul className="space-y-2">
                {appointments.map(a => (
                  <li key={a.id as string} className="border rounded-lg p-3 text-sm bg-[#ccac71]/5">
                    <div className="font-medium">
                      {a.start_at ? format(new Date(a.start_at as string), 'PPp', { locale: fr }) : '—'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.status as string}</div>
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
                  <li key={f.id} className="border rounded-lg p-3 text-sm bg-slate-50">
                    <div className="font-medium">{f.form_title || f.form_id}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {format(new Date(f.submitted_at), 'PP', { locale: fr })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RightSection>

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

            const status = (() => {
              const s = pi.paiement_status
              if (s === 'archivee')   return { label: 'Inscription finalisée', color: 'bg-green-600 text-white', dot: 'bg-green-300' }
              if (s === 'en_cours' && formStarted) return { label: 'Finalisation – lien rempli', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' }
              if (s === 'en_cours')   return { label: 'Finalisation – lien envoyé', color: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' }
              // payee + finalisation_step>0 = onglet "En finalisation" cote plateforme
              if (s === 'payee' && finalisationStep > 0 && formStarted) return { label: 'Finalisation – lien rempli', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' }
              if (s === 'payee' && finalisationStep > 0) return { label: 'Finalisation – lien envoyé', color: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' }
              if (s === 'payee')      return { label: 'Pré-inscrit', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' }
              if (s === 'en_attente') return { label: 'En attente paiement', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' }
              if (s === 'brouillon')  return { label: 'Brouillon', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }
              if (s === 'annulee')    return { label: 'Inscription annulée', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' }
              return { label: 'En attente données…', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' }
            })()

            return (
              <RightSection
                key={pi.id}
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
                      <div className="text-slate-500">Formation</div>
                      <div className="font-medium text-slate-800">{pi.formation}</div>
                    </div>
                  )}

                  {/* Bloc montants */}
                  {(pi.montant != null || acompteEuros > 0) && (
                    <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5">
                      {pi.montant != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Total formule</span>
                          <span className="font-semibold">{Number(pi.montant).toLocaleString('fr-FR')} €</span>
                        </div>
                      )}
                      {acompteEuros > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Acompte payé</span>
                          <span className="font-medium text-emerald-700">{acompteEuros.toLocaleString('fr-FR')} €</span>
                        </div>
                      )}
                      {paidAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Date paiement</span>
                          <span>{format(new Date(paidAt), 'PP', { locale: fr })}</span>
                        </div>
                      )}
                      {ext.payment_method && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Méthode</span>
                          <span className="capitalize">{String(ext.payment_method).replace(/_/g, ' ')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {pi.notes && (
                    <div className="space-y-1">
                      <div className="text-slate-500">Notes</div>
                      <div className="whitespace-pre-wrap text-slate-700 bg-amber-50 rounded p-2 leading-relaxed">{pi.notes}</div>
                    </div>
                  )}

                  {/* Date detection (footer discret) */}
                  <div className="text-slate-400 pt-1 border-t flex items-center justify-between">
                    <span>Détectée le {format(new Date(pi.detected_at), 'd MMM yyyy', { locale: fr })}</span>
                    {ext.inscription_id && (
                      <span title="ID plateforme">{String(ext.inscription_id).slice(0, 8)}…</span>
                    )}
                  </div>
                </div>
              </RightSection>
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
          onEditStart={(name, v) => { setEditing(name); setEditValue(String(v ?? '')) }}
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
      <div className="flex items-center gap-3 text-slate-500">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-[#2ea3f2] rounded-full animate-spin" />
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
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</div>
        {pillColor ? (
          <div className="mt-1">
            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${pillColor}`}>{value}</span>
          </div>
        ) : (
          <div className="text-base font-bold text-slate-800 truncate mt-0.5">{value}</div>
        )}
        {hint && <div className="text-[11px] text-slate-500 truncate mt-0.5">{hint}</div>}
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

function EditCell({ value, meta, onChange, onSave, onCancel, saving, customOptions }: {
  value: string
  meta?: CRMProperty
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  customOptions?: Array<{ value: string; label: string }>
}) {
  // customOptions prend priorité (ex: liste des owners pour hubspot_owner_id)
  const options = customOptions ?? (
    (meta?.field_type === 'select' || meta?.field_type === 'radio') ? meta.options : undefined
  )
  return (
    <div className="flex gap-1">
      {options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1 border rounded text-xs"
          autoFocus
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1 border rounded text-xs"
          autoFocus
        />
      )}
      <button
        onClick={onSave}
        disabled={saving}
        className="px-2.5 text-white bg-[#0038f0] rounded text-xs disabled:opacity-50 hover:bg-[#0038f0]"
      >✓</button>
      <button
        onClick={onCancel}
        className="px-2.5 border rounded text-xs hover:bg-slate-50"
      >✕</button>
    </div>
  )
}

function TimelineTabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-[#2ea3f2] text-[#0038f0] font-semibold' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label} {count > 0 && <span className={`text-xs ${active ? 'text-[#2ea3f2]' : 'text-slate-400'}`}>({count})</span>}
    </button>
  )
}

function TypeDot({ type }: { type: string }) {
  const map: Record<string, string> = {
    note: 'bg-amber-400',
    email: 'bg-blue-500',
    sms: 'bg-violet-500',
    call: 'bg-green-500',
    task: 'bg-slate-400',
    meeting: 'bg-purple-500',
    rdv: 'bg-[#2ea3f2]',
    form: 'bg-rose-500',
  }
  return <div className={`w-3 h-3 rounded-full ring-4 ring-white ${map[type] ?? 'bg-slate-400'}`} />
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { icon: React.ReactNode; bg: string }> = {
    note:    { icon: <StickyNote size={11} />, bg: 'bg-amber-100 text-amber-700' },
    email:   { icon: <Mail size={11} />,       bg: 'bg-blue-100 text-blue-700' },
    sms:     { icon: <Phone size={11} />,      bg: 'bg-violet-100 text-violet-700' },
    call:    { icon: <Phone size={11} />,      bg: 'bg-green-100 text-green-700' },
    task:    { icon: <CheckSquare size={11} />, bg: 'bg-slate-100 text-slate-700' },
    meeting: { icon: <Calendar size={11} />,   bg: 'bg-purple-100 text-purple-700' },
    rdv:     { icon: <Calendar size={11} />,   bg: 'bg-[#2ea3f2]/15 text-[#0038f0]' },
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
    pending: { label: 'En attente', bg: 'bg-slate-100 text-slate-600 border border-slate-200' },
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
          <div key={key} className="text-xs border rounded-md bg-slate-50 px-2 py-1.5">
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
              {link.label && <span className="text-slate-400 italic">({link.label})</span>}
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold ${hasClicks ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
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
              <div className="text-[10px] text-slate-500 mt-0.5">
                Dernier clic : {(() => {
                  try { return formatDistanceToNow(new Date(link.last_clicked_at), { addSuffix: true, locale: fr }) }
                  catch { return link.last_clicked_at }
                })()}
              </div>
            )}
            {isExpanded && link.clicks.length > 0 && (
              <ul className="mt-2 space-y-1 border-t pt-2">
                {link.clicks.map((c, i) => (
                  <li key={i} className="text-[10px] text-slate-600 flex items-center gap-2">
                    <span className="text-slate-400">•</span>
                    <span className="font-mono">
                      {format(new Date(c.clicked_at), "d MMM 'à' HH:mm:ss", { locale: fr })}
                    </span>
                    {c.ip && <span className="text-slate-400">IP {c.ip}</span>}
                    {c.user_agent && (
                      <span className="text-slate-400 truncate max-w-[200px]" title={c.user_agent}>
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
          <div key={key} className="text-xs border rounded-md bg-slate-50 px-2 py-1.5">
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
              <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                {link.click_count} clic{link.click_count > 1 ? 's' : ''}
              </span>
              {link.clicks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  {isExpanded ? 'Masquer' : 'Détails'}
                </button>
              )}
            </div>
            {link.clicks.length > 0 && link.clicks[0]?.at && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                Dernier clic : {(() => {
                  try { return formatDistanceToNow(new Date(link.clicks[0].at), { addSuffix: true, locale: fr }) }
                  catch { return link.clicks[0].at }
                })()}
              </div>
            )}
            {isExpanded && link.clicks.length > 0 && (
              <ul className="mt-2 space-y-1 border-t pt-2">
                {link.clicks.map((c, i) => (
                  <li key={i} className="text-[10px] text-slate-600 flex items-center gap-2">
                    <span className="text-slate-400">•</span>
                    <span className="font-mono">
                      {format(new Date(c.at), "d MMM 'à' HH:mm:ss", { locale: fr })}
                    </span>
                    {c.ip && <span className="text-slate-400">IP {c.ip}</span>}
                    {c.ua && (
                      <span className="text-slate-400 truncate max-w-[200px]" title={c.ua}>
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
    items.push({ label: 'Envoyé', bg: 'bg-slate-100 text-slate-600' })
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
        bg: 'bg-blue-100 text-blue-700',
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
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(storageKey)
    if (saved === '1') setOpen(true)
  }, [storageKey])
  const toggle = () => {
    setOpen(o => {
      const next = !o
      if (typeof window !== 'undefined') localStorage.setItem(storageKey, next ? '1' : '0')
      return next
    })
  }
  const accentColor = {
    brand: 'text-[#0038f0] bg-[#2ea3f2]/10',
    gold:  'text-[#ccac71] bg-[#ccac71]/10',
    dark:  'text-[#333] bg-slate-100',
  }[accent]
  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md ${accentColor} flex items-center justify-center`}>
            {icon}
          </div>
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-slate-400 hover:text-slate-600 p-1"><Plus size={14} /></span>
          <span className="text-slate-400 hover:text-slate-600 p-1"><Settings size={13} /></span>
          {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
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
      className="block border rounded-lg p-3 bg-gradient-to-br from-[#2ea3f2]/5 to-white hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#2ea3f2] to-[#0038f0] text-white flex items-center justify-center shadow-sm">
          <Briefcase size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">
            {deal.dealname || '(sans nom)'}
          </div>
          {deal.formation && (
            <div className="text-xs text-slate-500 mt-0.5">{deal.formation as string}</div>
          )}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="font-medium text-[#0038f0]">{stageLabel}</span>
          <span className="text-slate-400">{pipelineLabel}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#2ea3f2] to-[#0038f0]" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
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
    low:    'bg-slate-100 text-slate-600',
    normal: 'bg-blue-100 text-blue-700',
    high:   'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
  }

  return (
    <>
      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-1 mb-2 py-1.5 text-xs text-[#0038f0] border border-dashed border-[#2ea3f2]/40 rounded-md hover:bg-[#2ea3f2]/5"
      >
        <Plus size={12} /> Créer une tâche
      </button>
      {tasks.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-3 px-2 border border-dashed rounded-lg">
          Aucune tâche en cours.
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map(t => {
            const isOverdue = t.due_at && new Date(t.due_at).getTime() < Date.now()
            return (
              <li
                key={t.id}
                className={`border rounded-lg p-2.5 text-sm bg-white hover:shadow-sm ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => completeTask(t.id)}
                    className="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 hover:border-[#0038f0] hover:bg-[#0038f0]/10 flex-shrink-0"
                    title="Marquer comme terminée"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{t.title}</div>
                    {t.description && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.description}</div>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.priority !== 'normal' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityColor[t.priority] ?? ''}`}>
                          {t.priority === 'urgent' ? 'Urgent' : t.priority === 'high' ? 'Haute' : 'Basse'}
                        </span>
                      )}
                      {t.due_at && (
                        <span className={`text-[10px] ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                          {format(new Date(t.due_at), "PP 'à' HH:mm", { locale: fr })}
                        </span>
                      )}
                      {t.owner_id && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
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
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400 mb-3">
        <TrendingUp size={28} />
      </div>
      <p className="text-sm font-medium text-slate-600">Pas encore d&apos;activité</p>
      <p className="text-xs text-slate-400 mt-1">Les notes, appels, emails, formulaires apparaîtront ici.</p>
    </div>
  )
}

function EmptyRight({ text }: { text: string }) {
  return (
    <div className="text-xs text-slate-400 text-center py-4 px-2 border border-dashed rounded-lg">{text}</div>
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
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold">Toutes les propriétés</h2>
            <p className="text-xs text-slate-500 mt-0.5">{properties.length} propriétés synchronisées depuis HubSpot</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-sm font-semibold"
              >
                <span>{formatGroup(group)} <span className="text-xs text-slate-500 ml-1">({props.length})</span></span>
                {collapsed[group] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              {!collapsed[group] && (
                <dl className="divide-y text-sm">
                  {props.map(p => {
                    const val = allValues[p.name] ?? ''
                    const isEditing = editing === p.name
                    return (
                      <div key={p.name} className="px-3 py-2.5 grid grid-cols-5 gap-2 hover:bg-[#2ea3f2]/10/30 group">
                        <dt className="col-span-2 text-xs text-slate-500 flex items-center justify-between gap-1" title={p.name}>
                          <span className="truncate">{p.label || p.name}</span>
                          {onShowHistory && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onShowHistory(p) }}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#0038f0] flex-shrink-0"
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
                            />
                          ) : (
                            <button
                              onClick={() => onEditStart(p.name, val)}
                              className="text-left w-full block break-words hover:text-[#0038f0]"
                            >
                              {formatPropValue(val, p) || <span className="text-slate-300">—</span>}
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
    if (!isNaN(ts) && ts > 1e12) return format(new Date(ts), 'PPp', { locale: fr })
    const d = new Date(str)
    if (!isNaN(d.getTime())) return format(d, 'PPp', { locale: fr })
  }
  if ((p.field_type === 'select' || p.field_type === 'radio') && p.options) {
    const o = p.options.find(o => o.value === str)
    if (o) return o.label
  }
  if (p.field_type === 'checkbox' || p.type === 'bool') {
    return str === 'true' || str === '1' ? 'Oui' : 'Non'
  }
  return str
}

function sanitize(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}
