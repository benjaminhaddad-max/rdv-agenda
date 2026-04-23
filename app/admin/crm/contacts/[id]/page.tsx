'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  StickyNote, Mail, Phone, CheckSquare, Calendar, ChevronDown, ChevronRight,
  Plus, Search, Settings, Briefcase, Clock, User, TrendingUp, Award, FileText,
} from 'lucide-react'

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
}

type TimelineTab = 'all' | 'note' | 'email' | 'call' | 'task' | 'meeting'

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
  { name: 'hubspot_owner_id',      label: 'Propriétaire' },
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/contacts/${id}/details`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
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

  const { contact, deals, appointments, properties, dealProperties, groups, activities, formSubmissions, owners } = data

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
    zone___localite:  contact.zone_localite,
    formation_souhaitee:                contact.formation_souhaitee,
    diploma_sante___formation_demandee: contact.formation_demandee,
  }

  const propMeta: Record<string, CRMProperty> = {}
  for (const p of properties) propMeta[p.name] = p

  const dealPropMeta: Record<string, { label?: string; options?: Array<{ label: string; value: string }> }> = {}
  for (const p of dealProperties) dealPropMeta[p.name] = { label: p.label, options: p.options }

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
      await load()
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
    type: 'note' | 'call' | 'email' | 'meeting' | 'form' | 'rdv' | 'task'
    timestamp: number
    title: string
    body?: string
    subtitle?: string
    ownerId?: string
  }
  const timeline: TimelineItem[] = []
  for (const a of activities) {
    const t = a.activity_type.toLowerCase()
    const valid: TimelineItem['type'][] = ['note', 'call', 'email', 'meeting', 'task']
    const type = (valid.includes(t as TimelineItem['type']) ? t : 'note') as TimelineItem['type']
    timeline.push({
      id: `act-${a.id}`,
      type,
      timestamp: new Date(a.occurred_at).getTime(),
      title: a.subject || labelForType(type),
      body: a.body ?? undefined,
      subtitle: a.direction ? `Direction : ${a.direction}` : undefined,
      ownerId: a.owner_id,
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
              <QuickAction icon={<StickyNote size={14} />} label="Note" color="bg-amber-50 text-amber-700 border-amber-200" />
              <QuickAction icon={<Mail size={14} />}       label="E-mail" color="bg-blue-50 text-blue-700 border-blue-200" />
              <QuickAction icon={<Phone size={14} />}      label="Appel"  color="bg-green-50 text-green-700 border-green-200" />
              <QuickAction icon={<CheckSquare size={14} />} label="Tâche" color="bg-slate-50 text-slate-700 border-slate-200" />
              <QuickAction icon={<Calendar size={14} />}   label="RDV"    color="bg-purple-50 text-purple-700 border-purple-200" />
            </div>

            <dl className="divide-y px-4 text-sm">
              {ABOUT_FIELDS.map(f => {
                const val = allValues[f.name]
                const meta = propMeta[f.name]
                const isEditing = editing === f.name
                const isOwner = f.name === 'hubspot_owner_id'
                const displayValue = isOwner ? ownerLabel(val as string) : formatPropValue(val, meta)

                return (
                  <div key={f.name} className="py-2.5">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5">{f.label}</dt>
                    <dd>
                      {isEditing ? (
                        <EditCell
                          value={editValue}
                          meta={meta}
                          onChange={setEditValue}
                          onSave={() => saveProp(f.name, editValue)}
                          onCancel={() => setEditing(null)}
                          saving={saving}
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
                                <div className="flex items-center gap-2">
                                  <TypeBadge type={t.type} />
                                  <div className="text-sm font-semibold">{t.title}</div>
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
        </aside>
      </div>

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

function QuickAction({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <button
      className={`flex flex-col items-center gap-1 py-1.5 rounded-md border ${color} hover:opacity-80 transition-opacity`}
      title={label}
    >
      {icon}
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  )
}

function EditCell({ value, meta, onChange, onSave, onCancel, saving }: {
  value: string
  meta?: CRMProperty
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="flex gap-1">
      {meta?.field_type === 'select' && meta.options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1 border rounded text-xs"
          autoFocus
        >
          <option value="">—</option>
          {meta.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : meta?.field_type === 'radio' && meta.options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1 border rounded text-xs"
          autoFocus
        >
          <option value="">—</option>
          {meta.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

function RightSection({ icon, title, count, accent, children }: {
  icon: React.ReactNode; title: string; count: number; accent: 'brand' | 'gold' | 'dark'; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const accentColor = {
    brand: 'text-[#0038f0] bg-[#2ea3f2]/10',
    gold:  'text-[#ccac71] bg-[#ccac71]/10',
    dark:  'text-[#333] bg-slate-100',
  }[accent]
  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
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
  collapsed, onToggle, editing, editValue, onEditStart, onEditChange, onEditSave, onEditCancel, saving, onClose,
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
                      <div key={p.name} className="px-3 py-2.5 grid grid-cols-5 gap-2 hover:bg-[#2ea3f2]/10/30">
                        <dt className="col-span-2 text-xs text-slate-500" title={p.name}>{p.label || p.name}</dt>
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
  const labels: Record<string, string> = { note: 'Note', call: 'Appel', email: 'E-mail', meeting: 'Réunion', task: 'Tâche', rdv: 'RDV', form: 'Formulaire' }
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
