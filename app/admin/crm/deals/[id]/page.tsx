'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  StickyNote, Mail, Phone, CheckSquare, Calendar, ChevronDown, ChevronRight,
  Plus, Search, Settings, DollarSign,
} from 'lucide-react'
import QuickActionModal, { type QuickActionType } from '@/components/crm/QuickActionModal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface CRMProperty {
  name: string
  label: string
  group_name: string
  type: string
  field_type: string
  options?: Array<{ label: string; value: string }>
  display_order?: number
}

interface Activity {
  id: number
  activity_type: string
  subject?: string
  body?: string
  direction?: string
  status?: string
  occurred_at: string
}

interface DealDetails {
  deal: Record<string, Any>
  contact: Record<string, Any> | null
  appointment: Record<string, Any> | null
  properties: CRMProperty[]
  groups: Record<string, CRMProperty[]>
  activities: Activity[]
}

type TimelineTab = 'all' | 'note' | 'email' | 'call' | 'task' | 'meeting'

const ABOUT_FIELDS: Array<{ name: string; label: string }> = [
  { name: 'dealname',                     label: 'Nom de la transaction' },
  { name: 'dealstage',                    label: 'Étape' },
  { name: 'pipeline',                     label: 'Pipeline' },
  { name: 'diploma_sante___formation',    label: 'Formation' },
  { name: 'closedate',                    label: 'Date de clôture' },
  { name: 'createdate',                   label: 'Date de création' },
  { name: 'hubspot_owner_id',             label: 'Propriétaire' },
  { name: 'teleprospecteur',              label: 'Téléprospecteur' },
  { name: 'description',                  label: 'Description' },
]

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<DealDetails | null>(null)
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/deals/${id}/details`)
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

  const { deal, contact, appointment, properties, groups, activities } = data

  const allValues: Record<string, Any> = {
    ...(deal.hubspot_raw ?? {}),
    dealname:                   deal.dealname,
    dealstage:                  deal.dealstage,
    pipeline:                   deal.pipeline,
    hubspot_owner_id:           deal.hubspot_owner_id,
    teleprospecteur:            deal.teleprospecteur,
    closedate:                  deal.closedate,
    createdate:                 deal.createdate,
    description:                deal.description,
    diploma_sante___formation:  deal.formation,
  }

  const propMeta: Record<string, CRMProperty> = {}
  for (const p of properties) propMeta[p.name] = p

  const saveProp = async (propName: string, value: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/crm/deals/${id}/prop`, {
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

  type TimelineItem = {
    id: string
    type: 'note' | 'call' | 'email' | 'meeting' | 'task'
    timestamp: number
    title: string
    body?: string
    subtitle?: string
  }
  const timeline: TimelineItem[] = activities.map(a => {
    const t = a.activity_type.toLowerCase()
    const valid: TimelineItem['type'][] = ['note', 'call', 'email', 'meeting', 'task']
    const type = (valid.includes(t as TimelineItem['type']) ? t : 'note') as TimelineItem['type']
    return {
      id: `act-${a.id}`,
      type,
      timestamp: new Date(a.occurred_at).getTime(),
      title: a.subject || labelForType(type),
      body: a.body ?? undefined,
      subtitle: a.direction ? `Direction : ${a.direction}` : undefined,
    }
  })
  timeline.sort((a, b) => b.timestamp - a.timestamp)

  const timelineFiltered = timeline.filter(t => {
    if (timelineTab === 'all') return true
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
    meeting: timeline.filter(t => t.type === 'meeting').length,
  }

  const lc = propSearch.toLowerCase()
  const filteredGroups: Record<string, CRMProperty[]> = {}
  for (const [g, props] of Object.entries(groups)) {
    const f = props.filter(p => !lc || (p.label ?? '').toLowerCase().includes(lc) || p.name.toLowerCase().includes(lc))
    if (f.length > 0) filteredGroups[g] = f
  }

  const toggleGroup = (g: string) => setCollapsed(s => ({ ...s, [g]: !s[g] }))

  return (
    <div className="min-h-screen bg-[#f5f8fa] text-[#33475b]">
      <div className="bg-white border-b px-5 py-2 flex items-center gap-3 text-sm">
        <Link href="/admin/crm" className="text-[#506e91] hover:text-[#0070e0]">← Transactions</Link>
      </div>

      <div className="grid grid-cols-12 min-h-[calc(100vh-40px)]">
        {/* ══ Gauche ══ */}
        <aside className="col-span-3 bg-white border-r px-5 py-5 overflow-y-auto">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded bg-gradient-to-br from-[#2ea3f2] to-[#0038f0] text-white flex items-center justify-center">
              <DollarSign size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight break-words">{deal.dealname || '(sans nom)'}</h1>
              {deal.formation && <div className="text-sm text-[#516f90] mt-0.5">{deal.formation as string}</div>}
            </div>
          </div>

          <div className="flex items-center justify-between gap-1 mt-5 pb-4 border-b">
            <ActionButton icon={<StickyNote size={16} />}  label="Note"    onClick={() => setQuickAction('note')} />
            <ActionButton icon={<Mail size={16} />}        label="E-mail"  onClick={() => setQuickAction('email')} />
            <ActionButton icon={<Phone size={16} />}       label="Appel"   onClick={() => setQuickAction('call')} />
            <ActionButton icon={<CheckSquare size={16} />} label="Tâche"   onClick={() => setQuickAction('task')} />
            <ActionButton icon={<Calendar size={16} />}    label="Réunion" onClick={() => setQuickAction('meeting')} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">À propos de la transaction</h2>
              <button className="text-xs text-[#0038f0] hover:underline">Actions</button>
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
                              {meta.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="flex-1 px-1 py-0.5 border rounded text-xs"
                              autoFocus
                            />
                          )}
                          <button onClick={() => saveProp(f.name, editValue)} disabled={saving} className="px-2 text-white bg-[#0038f0] rounded text-xs">✓</button>
                          <button onClick={() => setEditing(null)} className="px-2 border rounded text-xs">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditing(f.name); setEditValue(String(val ?? '')) }}
                          className="text-left w-full block hover:text-[#0038f0]"
                        >
                          {formatPropValue(val, meta) || <span className="text-gray-400">—</span>}
                        </button>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
            <button onClick={() => setShowAllProps(true)} className="mt-3 text-xs text-[#0038f0] hover:underline">
              Voir toutes les propriétés ({properties.length})
            </button>
          </div>
        </aside>

        {/* ══ Centre ══ */}
        <section className="col-span-6 bg-[#f5f8fa] p-5 overflow-y-auto">
          <div className="bg-white rounded-lg border">
            <div className="flex border-b px-2 overflow-x-auto">
              <TimelineTabBtn active={timelineTab === 'all'}     onClick={() => setTimelineTab('all')}     label="Toutes les activités" count={counts.all} />
              <TimelineTabBtn active={timelineTab === 'note'}    onClick={() => setTimelineTab('note')}    label="Notes"    count={counts.note} />
              <TimelineTabBtn active={timelineTab === 'email'}   onClick={() => setTimelineTab('email')}   label="E-mails"  count={counts.email} />
              <TimelineTabBtn active={timelineTab === 'call'}    onClick={() => setTimelineTab('call')}    label="Appels"   count={counts.call} />
              <TimelineTabBtn active={timelineTab === 'task'}    onClick={() => setTimelineTab('task')}    label="Tâches"   count={counts.task} />
              <TimelineTabBtn active={timelineTab === 'meeting'} onClick={() => setTimelineTab('meeting')} label="Réunions" count={counts.meeting} />
            </div>
            <div className="p-3 border-b">
              <div className="relative">
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
            <div className="p-4">
              {timelineFiltered.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Aucune activité enregistrée sur cette transaction.
                </p>
              ) : (
                Object.entries(grouped).map(([month, items]) => (
                  <div key={month} className="mb-5">
                    <div className="text-xs text-[#7c98b6] uppercase tracking-wide mb-2 capitalize">{month}</div>
                    <ul className="space-y-3">
                      {items.map(t => (
                        <li key={t.id} className="bg-white border rounded-md p-3 hover:shadow-sm">
                          <div className="flex items-start gap-3">
                            <TypeIcon type={t.type} />
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

        {/* ══ Droite ══ */}
        <aside className="col-span-3 bg-white border-l px-5 py-5 overflow-y-auto">
          <Section title="Contact" count={contact ? 1 : 0}>
            {!contact ? (
              <EmptySection text="Aucun contact associé." />
            ) : (
              <Link
                href={`/admin/crm/contacts/${contact.hubspot_contact_id}`}
                className="block border rounded p-3 hover:bg-[#f5f8fa]"
              >
                <div className="text-sm font-medium text-[#0038f0]">
                  {[contact.firstname, contact.lastname].filter(Boolean).join(' ') || '—'}
                </div>
                {contact.email && <div className="text-xs text-[#7c98b6] mt-0.5">{contact.email as string}</div>}
                {contact.phone && <div className="text-xs text-[#7c98b6]">{contact.phone as string}</div>}
              </Link>
            )}
          </Section>

          <Section title="RDV" count={appointment ? 1 : 0}>
            {!appointment ? (
              <EmptySection text="Aucun RDV associé." />
            ) : (
              <div className="border rounded p-3 text-sm">
                <div>{appointment.start_at ? format(new Date(appointment.start_at as string), 'PPp', { locale: fr }) : '—'}</div>
                <div className="text-xs text-[#7c98b6]">{appointment.status as string}</div>
                {appointment.notes !== undefined && appointment.notes !== null && appointment.notes !== '' && (
                  <div className="text-sm mt-2 whitespace-pre-wrap">{appointment.notes as string}</div>
                )}
              </div>
            )}
          </Section>
        </aside>
      </div>

      {/* Modal Quick Action */}
      {quickAction && (
        <QuickActionModal
          type={quickAction}
          dealId={id}
          contactId={contact?.hubspot_contact_id as string | undefined}
          defaultOwnerId={deal.hubspot_owner_id as string | undefined}
          onClose={() => setQuickAction(null)}
          onSaved={() => load()}
        />
      )}

      {/* Modal props */}
      {showAllProps && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAllProps(false)}>
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h2 className="text-lg font-semibold">Toutes les propriétés ({properties.length})</h2>
              <button onClick={() => setShowAllProps(false)} className="text-[#7c98b6] hover:text-black">✕</button>
            </div>
            <div className="px-5 py-3 border-b">
              <input
                type="text"
                value={propSearch}
                onChange={e => setPropSearch(e.target.value)}
                placeholder="Rechercher une propriété..."
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {!properties.length && (
                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded">
                  Metadata propriétés absente — lance un full sync.
                </p>
              )}
              {Object.entries(filteredGroups).map(([group, props]) => (
                <div key={group} className="mb-3 border rounded">
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-[#f5f8fa] text-sm font-medium"
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
                          <div key={p.name} className="px-3 py-2 grid grid-cols-5 gap-2">
                            <dt className="col-span-2 text-xs text-[#7c98b6]">{p.label || p.name}</dt>
                            <dd className="col-span-3 text-xs">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  {p.field_type === 'select' && p.options ? (
                                    <select value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs" autoFocus>
                                      <option value="">—</option>
                                      {p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                  ) : (
                                    <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs" autoFocus />
                                  )}
                                  <button onClick={() => saveProp(p.name, editValue)} disabled={saving} className="px-2 text-white bg-[#0038f0] rounded text-xs">✓</button>
                                  <button onClick={() => setEditing(null)} className="px-2 border rounded text-xs">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditing(p.name); setEditValue(String(val ?? '')) }}
                                  className="text-left w-full block break-words hover:text-[#0038f0]"
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

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-1.5 px-2 rounded hover:bg-[#f5f8fa] text-[#506e91] w-full cursor-pointer"
      title={label}
    >
      <div className="w-7 h-7 rounded-full border-2 border-[#cbd6e2] flex items-center justify-center">{icon}</div>
      <span className="text-[10px]">{label}</span>
    </button>
  )
}

function TimelineTabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 text-sm border-b-2 whitespace-nowrap ${
        active ? 'border-[#0038f0] text-[#33475b] font-semibold' : 'border-transparent text-[#516f90] hover:text-[#33475b]'
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
  }
  const m = map[type] ?? map.note
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${m.bg}`}>{m.icon}</div>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between py-1.5 text-sm font-semibold hover:bg-[#f5f8fa] px-1 rounded">
        <div className="flex items-center gap-1">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{title}{count !== undefined && ` (${count})`}</span>
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-[#0038f0]"><Plus size={14} /></span>
          <span className="text-[#7c98b6]"><Settings size={13} /></span>
        </div>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

function EmptySection({ text }: { text: string }) {
  return <div className="text-xs text-[#7c98b6] text-center py-3 px-2 border border-dashed rounded">{text}</div>
}

function labelForType(t: string) {
  const labels: Record<string, string> = { note: 'Note', call: 'Appel', email: 'E-mail', meeting: 'Réunion', task: 'Tâche' }
  return labels[t] ?? t
}

function formatGroup(g: string) {
  const map: Record<string, string> = {
    dealinformation: 'Informations transaction',
    contactinformation: 'Contact',
    conversioninformation: 'Conversion',
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
