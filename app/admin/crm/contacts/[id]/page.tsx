'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  StickyNote, Mail, Phone, CheckSquare, Calendar, ChevronDown, ChevronRight,
  Plus, Search, Settings,
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
  display_order?: number
}

interface Activity {
  id: number
  hubspot_engagement_id?: string
  activity_type: string
  hubspot_deal_id?: string
  owner_id?: string
  subject?: string
  body?: string
  direction?: string
  status?: string
  metadata?: Any
  occurred_at: string
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

interface ContactDetails {
  contact: Record<string, Any>
  deals: Array<Record<string, Any>>
  appointments: Array<Record<string, Any>>
  properties: CRMProperty[]
  groups: Record<string, CRMProperty[]>
  activities: Activity[]
  formSubmissions: FormSubmission[]
}

type TimelineTab = 'all' | 'note' | 'email' | 'call' | 'task' | 'meeting'

// Champs affichés en priorité dans la section "À propos"
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

  if (loading) return <div className="p-8 text-gray-500">Chargement…</div>
  if (err) return <div className="p-8 text-red-600">Erreur : {err}</div>
  if (!data) return <div className="p-8">Aucune donnée.</div>

  const { contact, deals, appointments, properties, groups, activities, formSubmissions } = data

  const fullName = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || '(sans nom)'
  const initials = (contact.firstname?.[0] ?? '') + (contact.lastname?.[0] ?? '')

  // Merge hubspot_raw + colonnes individuelles
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

  // Metadata prop par nom (pour format, options, type)
  const propMeta: Record<string, CRMProperty> = {}
  for (const p of properties) propMeta[p.name] = p

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

  // ── Timeline ──────────────────────────────────────────────────────────
  type TimelineItem = {
    id: string
    type: 'note' | 'call' | 'email' | 'meeting' | 'form' | 'rdv' | 'task'
    timestamp: number
    title: string
    body?: string
    subtitle?: string
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
    })
  }
  for (const f of formSubmissions) {
    timeline.push({
      id: `form-${f.id}`,
      type: 'form',
      timestamp: new Date(f.submitted_at).getTime(),
      title: `Soumission de formulaire — ${f.form_title || f.form_id}`,
      subtitle: f.page_url,
    })
  }
  for (const a of appointments) {
    const startAt = a.start_at ? new Date(a.start_at as string).getTime() : 0
    timeline.push({
      id: `rdv-${a.id}`,
      type: 'rdv',
      timestamp: startAt,
      title: `RDV — ${a.status ?? 'programmé'}`,
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

  // Group by month (FR)
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

  // ── Groupes de propriétés (pour le modal "Voir toutes les propriétés")
  const lc = propSearch.toLowerCase()
  const filteredGroups: Record<string, CRMProperty[]> = {}
  for (const [g, props] of Object.entries(groups)) {
    const f = props.filter(p => !lc || (p.label ?? '').toLowerCase().includes(lc) || p.name.toLowerCase().includes(lc))
    if (f.length > 0) filteredGroups[g] = f
  }

  const toggleGroup = (g: string) => setCollapsed(s => ({ ...s, [g]: !s[g] }))

  return (
    <div className="min-h-screen bg-[#f5f8fa] text-[#33475b]">
      {/* Header top */}
      <div className="bg-white border-b px-5 py-2 flex items-center gap-3 text-sm">
        <Link href="/admin/crm" className="text-[#506e91] hover:text-[#0070e0] flex items-center gap-1">
          <ChevronRight size={14} className="rotate-180" /> Contacts
        </Link>
      </div>

      {/* 3 colonnes */}
      <div className="grid grid-cols-12 gap-0 min-h-[calc(100vh-40px)]">
        {/* ════════ Colonne gauche — À propos ════════ */}
        <aside className="col-span-3 bg-white border-r px-5 py-5 overflow-y-auto">
          <div className="flex flex-col items-start gap-3">
            <div className="w-14 h-14 rounded-full bg-[#ff7a59] text-white flex items-center justify-center font-bold text-lg">
              {initials || '?'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#33475b]">{fullName}</h1>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="text-sm text-[#0091ae] hover:underline block mt-0.5">
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="text-sm text-[#0091ae] hover:underline block">
                  {contact.phone}
                </a>
              )}
            </div>
          </div>

          {/* Actions row */}
          <div className="flex items-center justify-between gap-1 mt-5 pb-4 border-b">
            <ActionButton icon={<StickyNote size={16} />} label="Note" />
            <ActionButton icon={<Mail size={16} />} label="E-mail" />
            <ActionButton icon={<Phone size={16} />} label="Appel" />
            <ActionButton icon={<CheckSquare size={16} />} label="Tâche" />
            <ActionButton icon={<Calendar size={16} />} label="Réunion" />
          </div>

          {/* Section : À propos */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">À propos de ce contact</h2>
              <button className="text-xs text-[#0091ae] hover:underline">Actions</button>
            </div>
            <dl className="divide-y">
              {ABOUT_FIELDS.map(f => {
                const val = allValues[f.name]
                const meta = propMeta[f.name]
                const isEditing = editing === f.name
                return (
                  <div key={f.name} className="py-2">
                    <dt className="text-xs text-[#7c98b6] mb-0.5">{f.label}</dt>
                    <dd className="text-sm">
                      {isEditing ? (
                        <div className="flex gap-1">
                          {meta?.field_type === 'select' && meta.options ? (
                            <select
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="flex-1 px-1 py-0.5 border rounded text-xs"
                              autoFocus
                            >
                              <option value="">—</option>
                              {meta.options.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="flex-1 px-1 py-0.5 border rounded text-xs"
                              autoFocus
                            />
                          )}
                          <button
                            onClick={() => saveProp(f.name, editValue)}
                            disabled={saving}
                            className="px-2 text-white bg-[#0070e0] rounded text-xs disabled:opacity-50"
                          >✓</button>
                          <button
                            onClick={() => setEditing(null)}
                            className="px-2 border rounded text-xs"
                          >✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditing(f.name); setEditValue(String(val ?? '')) }}
                          className="text-left w-full block hover:text-[#0091ae]"
                        >
                          {formatPropValue(val, meta) || <span className="text-gray-400">—</span>}
                        </button>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
            <button
              onClick={() => setShowAllProps(true)}
              className="mt-3 text-xs text-[#0091ae] hover:underline"
            >
              Voir toutes les propriétés ({properties.length})
            </button>
          </div>
        </aside>

        {/* ════════ Colonne centre — Activités ════════ */}
        <section className="col-span-6 bg-[#f5f8fa] p-5 overflow-y-auto">
          <div className="bg-white rounded-lg border">
            {/* Tabs */}
            <div className="flex border-b px-2">
              <TimelineTabBtn active={timelineTab === 'all'}     onClick={() => setTimelineTab('all')}     label="Toutes les activités" count={counts.all} />
              <TimelineTabBtn active={timelineTab === 'note'}    onClick={() => setTimelineTab('note')}    label="Notes"     count={counts.note} />
              <TimelineTabBtn active={timelineTab === 'email'}   onClick={() => setTimelineTab('email')}   label="E-mails"   count={counts.email} />
              <TimelineTabBtn active={timelineTab === 'call'}    onClick={() => setTimelineTab('call')}    label="Appels"    count={counts.call} />
              <TimelineTabBtn active={timelineTab === 'task'}    onClick={() => setTimelineTab('task')}    label="Tâches"    count={counts.task} />
              <TimelineTabBtn active={timelineTab === 'meeting'} onClick={() => setTimelineTab('meeting')} label="Réunions"  count={counts.meeting} />
            </div>

            {/* Search */}
            <div className="p-3 border-b flex items-center gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={timelineSearch}
                  onChange={e => setTimelineSearch(e.target.value)}
                  placeholder="Rechercher des activités"
                  className="w-full pl-8 pr-3 py-1.5 border rounded text-sm"
                />
              </div>
            </div>

            {/* Timeline */}
            <div className="p-4">
              {timelineFiltered.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Aucune activité enregistrée pour ce contact.
                </p>
              ) : (
                Object.entries(grouped).map(([month, items]) => (
                  <div key={month} className="mb-5">
                    <div className="text-xs text-[#7c98b6] uppercase tracking-wide mb-2 capitalize">{month}</div>
                    <ul className="space-y-3">
                      {items.map(t => (
                        <li key={t.id} className="bg-white border rounded-md p-3 hover:shadow-sm transition-shadow">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5"><TypeIcon type={t.type} /></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium">{t.title}</div>
                                <div className="text-xs text-[#7c98b6] whitespace-nowrap">
                                  {format(new Date(t.timestamp), "d MMM 'à' HH:mm", { locale: fr })}
                                </div>
                              </div>
                              {t.subtitle && <div className="text-xs text-[#516f90] mt-0.5">{t.subtitle}</div>}
                              {t.body && (
                                <div
                                  className="text-sm text-[#33475b] mt-1.5 whitespace-pre-wrap"
                                  dangerouslySetInnerHTML={{ __html: sanitize(t.body) }}
                                />
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ════════ Colonne droite — Associations ════════ */}
        <aside className="col-span-3 bg-white border-l px-5 py-5 overflow-y-auto">
          <Section title="Transactions" count={deals.length}>
            {deals.length === 0 ? (
              <EmptySection text="Aucune transaction liée." />
            ) : (
              <ul className="space-y-2">
                {deals.map(d => (
                  <li key={d.hubspot_deal_id}>
                    <Link
                      href={`/admin/crm/deals/${d.hubspot_deal_id}`}
                      className="block border rounded p-2 hover:bg-[#f5f8fa]"
                    >
                      <div className="text-sm font-medium text-[#0091ae]">{d.dealname || '(sans nom)'}</div>
                      <div className="text-xs text-[#7c98b6] mt-0.5">{d.formation || '—'}</div>
                      <div className="text-xs text-[#7c98b6]">
                        {d.createdate ? format(new Date(d.createdate), 'PP', { locale: fr }) : ''}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="RDV" count={appointments.length}>
            {appointments.length === 0 ? (
              <EmptySection text="Aucun RDV enregistré." />
            ) : (
              <ul className="space-y-2">
                {appointments.map(a => (
                  <li key={a.id as string} className="border rounded p-2 text-sm">
                    <div>{a.start_at ? format(new Date(a.start_at as string), 'PPp', { locale: fr }) : '—'}</div>
                    <div className="text-xs text-[#7c98b6]">{a.status as string}</div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Formulaires soumis" count={formSubmissions.length}>
            {formSubmissions.length === 0 ? (
              <EmptySection text="Aucune soumission." />
            ) : (
              <ul className="space-y-2">
                {formSubmissions.slice(0, 10).map(f => (
                  <li key={f.id} className="border rounded p-2 text-sm">
                    <div className="font-medium">{f.form_title || f.form_id}</div>
                    <div className="text-xs text-[#7c98b6]">
                      {format(new Date(f.submitted_at), 'PP', { locale: fr })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>

      {/* Modal : toutes les propriétés */}
      {showAllProps && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAllProps(false)}>
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h2 className="text-lg font-semibold">Toutes les propriétés ({properties.length})</h2>
              <button onClick={() => setShowAllProps(false)} className="text-[#7c98b6] hover:text-black">✕</button>
            </div>
            <div className="px-5 py-3 border-b">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={propSearch}
                  onChange={e => setPropSearch(e.target.value)}
                  placeholder="Rechercher une propriété..."
                  className="w-full pl-8 pr-3 py-2 border rounded text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {!properties.length && (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded">
                  Metadata propriétés absente. Lance un full sync pour remplir <code>crm_properties</code>.
                </p>
              )}
              {Object.entries(filteredGroups).map(([group, props]) => (
                <div key={group} className="mb-3 border rounded">
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-[#f5f8fa] hover:bg-[#eaf0f6] text-sm font-medium"
                  >
                    <span>{formatGroup(group)} ({props.length})</span>
                    {collapsed[group] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {!collapsed[group] && (
                    <dl className="divide-y text-sm">
                      {props.map(p => {
                        const val = allValues[p.name] ?? ''
                        const isEditing = editing === p.name
                        return (
                          <div key={p.name} className="px-3 py-2 grid grid-cols-5 gap-2 hover:bg-blue-50/30">
                            <dt className="col-span-2 text-xs text-[#7c98b6]" title={p.name}>{p.label || p.name}</dt>
                            <dd className="col-span-3 text-xs">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  {p.field_type === 'select' && p.options ? (
                                    <select
                                      value={editValue}
                                      onChange={e => setEditValue(e.target.value)}
                                      className="w-full px-1 py-0.5 border rounded text-xs"
                                      autoFocus
                                    >
                                      <option value="">—</option>
                                      {p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      value={editValue}
                                      onChange={e => setEditValue(e.target.value)}
                                      className="w-full px-1 py-0.5 border rounded text-xs"
                                      autoFocus
                                    />
                                  )}
                                  <button onClick={() => saveProp(p.name, editValue)} disabled={saving} className="px-2 text-white bg-[#0070e0] rounded text-xs">✓</button>
                                  <button onClick={() => setEditing(null)} className="px-2 border rounded text-xs">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditing(p.name); setEditValue(String(val ?? '')) }}
                                  className="text-left w-full block break-words hover:text-[#0091ae]"
                                >
                                  {formatPropValue(val, p) || <span className="text-gray-400">—</span>}
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
      )}
    </div>
  )
}

/* ═════════ Composants ═════════ */

function ActionButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      className="flex flex-col items-center gap-1 py-1.5 px-2 rounded hover:bg-[#f5f8fa] text-[#506e91] w-full"
      title={label}
    >
      <div className="w-7 h-7 rounded-full border-2 border-[#cbd6e2] flex items-center justify-center">
        {icon}
      </div>
      <span className="text-[10px]">{label}</span>
    </button>
  )
}

function TimelineTabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-[#ff7a59] text-[#33475b] font-semibold' : 'border-transparent text-[#516f90] hover:text-[#33475b]'
      }`}
    >
      {label} {count > 0 && <span className="text-xs text-[#7c98b6]">({count})</span>}
    </button>
  )
}

function TypeIcon({ type }: { type: string }) {
  const map: Record<string, { icon: React.ReactNode; bg: string }> = {
    note:    { icon: <StickyNote size={14} />, bg: 'bg-[#fef3c7] text-[#92400e]' },
    email:   { icon: <Mail size={14} />,       bg: 'bg-[#dbeafe] text-[#1e40af]' },
    call:    { icon: <Phone size={14} />,      bg: 'bg-[#dcfce7] text-[#166534]' },
    task:    { icon: <CheckSquare size={14} />, bg: 'bg-[#f3f4f6] text-[#374151]' },
    meeting: { icon: <Calendar size={14} />,   bg: 'bg-[#f3e8ff] text-[#6b21a8]' },
    rdv:     { icon: <Calendar size={14} />,   bg: 'bg-[#e0e7ff] text-[#3730a3]' },
    form:    { icon: <span className="text-xs font-bold">F</span>, bg: 'bg-[#fce7f3] text-[#9f1239]' },
  }
  const m = map[type] ?? map.note
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${m.bg}`}>
      {m.icon}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-1.5 text-sm font-semibold text-[#33475b] hover:bg-[#f5f8fa] px-1 rounded"
      >
        <div className="flex items-center gap-1">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{title}{count !== undefined && ` (${count})`}</span>
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-[#0091ae] hover:text-[#0070e0]"><Plus size={14} /></span>
          <span className="text-[#7c98b6]"><Settings size={13} /></span>
        </div>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="text-xs text-[#7c98b6] text-center py-3 px-2 border border-dashed rounded">{text}</div>
  )
}

/* ═════════ Helpers ═════════ */

function labelForType(t: string) {
  const labels: Record<string, string> = {
    note: 'Note', call: 'Appel', email: 'E-mail', meeting: 'Réunion',
    task: 'Tâche', rdv: 'RDV', form: 'Formulaire',
  }
  return labels[t] ?? t
}

function formatGroup(g: string) {
  const map: Record<string, string> = {
    contactinformation: 'Informations du contact',
    diploma_sante: 'Diploma Santé',
    emailinformation: 'Informations e-mail',
    conversioninformation: 'Informations de conversion',
    leadstatus: 'Statut du lead',
    activityinformation: 'Informations d\'activité',
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
  if (p.field_type === 'select' && p.options) {
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
