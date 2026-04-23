'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

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

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<ContactDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/contacts/${id}/details`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setData(d)
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
  const hasPropsMetadata = properties.length > 0

  const fullName = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || '(sans nom)'

  // Toutes les valeurs disponibles pour ce contact :
  // hubspot_raw (toutes les props HubSpot) + fallback sur colonnes individuelles
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
    formation_souhaitee:                   contact.formation_souhaitee,
    diploma_sante___formation_demandee:    contact.formation_demandee,
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

  const toggleGroup = (g: string) => setCollapsed(s => ({ ...s, [g]: !s[g] }))

  // Timeline unifiée : activities + form submissions + RDV
  type TimelineItem = {
    id: string
    type: 'note' | 'call' | 'email' | 'meeting' | 'form' | 'rdv' | 'task' | 'sms'
    timestamp: number
    title: string
    body?: string
    subtitle?: string
  }
  const timeline: TimelineItem[] = []

  for (const a of activities) {
    const t = a.activity_type.toLowerCase()
    const validTypes: TimelineItem['type'][] = ['note', 'call', 'email', 'meeting', 'task', 'sms']
    const type = (validTypes.includes(t as TimelineItem['type']) ? t : 'note') as TimelineItem['type']
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
      title: `Formulaire soumis : ${f.form_title || f.form_id}`,
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
      subtitle: a.start_at ? format(new Date(a.start_at as string), 'PPp', { locale: fr }) : undefined,
    })
  }
  timeline.sort((a, b) => b.timestamp - a.timestamp)

  // Recherche dans les propriétés
  const lc = search.toLowerCase()
  const filteredGroups: Record<string, CRMProperty[]> = {}
  for (const [g, props] of Object.entries(groups)) {
    const filtered = props.filter(p => {
      if (!lc) return true
      return (p.label ?? '').toLowerCase().includes(lc) || p.name.toLowerCase().includes(lc)
    })
    if (filtered.length > 0) filteredGroups[g] = filtered
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <Link href="/admin/crm" className="text-sm text-gray-600 hover:text-gray-900">← CRM</Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{fullName}</h1>
          <div className="text-sm text-gray-600 flex flex-wrap gap-3 mt-0.5">
            {contact.email && <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>}
            {contact.phone && <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>}
            {contact.classe_actuelle && <span>· {contact.classe_actuelle}</span>}
            {contact.departement && <span>· Dép. {contact.departement}</span>}
          </div>
        </div>
      </div>

      {/* Layout 3 colonnes */}
      <div className="max-w-[1600px] mx-auto px-4 py-6 grid grid-cols-12 gap-4">
        {/* Gauche — Deals + RDV */}
        <aside className="col-span-3 space-y-4">
          <Card title={`Transactions (${deals.length})`}>
            {deals.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune transaction.</p>
            ) : (
              <ul className="divide-y">
                {deals.map(d => (
                  <li key={d.hubspot_deal_id} className="py-2">
                    <Link
                      href={`/admin/crm/deals/${d.hubspot_deal_id}`}
                      className="block hover:bg-gray-50 rounded p-2 -m-2"
                    >
                      <div className="font-medium text-sm">{d.dealname || '(sans nom)'}</div>
                      <div className="text-xs text-gray-600 mt-0.5">{d.formation || '—'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {d.createdate ? format(new Date(d.createdate), 'PP', { locale: fr }) : ''}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`RDV (${appointments.length})`}>
            {appointments.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun RDV.</p>
            ) : (
              <ul className="divide-y">
                {appointments.map(a => (
                  <li key={a.id as string} className="py-2">
                    <div className="text-sm">
                      {a.start_at ? format(new Date(a.start_at as string), 'PPp', { locale: fr }) : '—'}
                    </div>
                    <div className="text-xs text-gray-500">{a.status as string}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>

        {/* Centre — Timeline d'activité */}
        <section className="col-span-5 space-y-4">
          <Card title={`Activité (${timeline.length})`}>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune activité enregistrée.</p>
            ) : (
              <ul className="space-y-4">
                {timeline.map(t => (
                  <li key={t.id} className="border-l-2 pl-3 border-blue-200">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <TypeBadge type={t.type} />
                      <span>{format(new Date(t.timestamp), 'PPp', { locale: fr })}</span>
                    </div>
                    <div className="text-sm font-medium mt-1">{t.title}</div>
                    {t.subtitle && <div className="text-xs text-gray-600">{t.subtitle}</div>}
                    {t.body && (
                      <div
                        className="text-sm text-gray-700 mt-1 whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: sanitize(t.body) }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* Droite — Propriétés groupées */}
        <aside className="col-span-4">
          <Card title="Propriétés">
            {!hasPropsMetadata && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-3">
                Metadata propriétés absente — lance un full sync pour remplir <code>crm_properties</code>.
              </p>
            )}
            <input
              type="text"
              placeholder="Rechercher une propriété..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded mb-3"
            />
            {Object.entries(filteredGroups).map(([group, props]) => (
              <div key={group} className="mb-2 border rounded">
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
                >
                  <span>{formatGroup(group)} ({props.length})</span>
                  <span>{collapsed[group] ? '+' : '−'}</span>
                </button>
                {!collapsed[group] && (
                  <dl className="divide-y text-sm">
                    {props.map(p => {
                      const val = allValues[p.name] ?? ''
                      const isEditing = editing === p.name
                      return (
                        <div key={p.name} className="px-3 py-2 grid grid-cols-5 gap-2 hover:bg-blue-50/30">
                          <dt className="col-span-2 text-xs text-gray-600" title={p.name}>
                            {p.label || p.name}
                          </dt>
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
                                    {p.options.map(o => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    className="w-full px-1 py-0.5 border rounded text-xs"
                                    autoFocus
                                  />
                                )}
                                <button
                                  onClick={() => saveProp(p.name, editValue)}
                                  disabled={saving}
                                  className="px-2 text-white bg-blue-600 rounded text-xs disabled:opacity-50"
                                >✓</button>
                                <button
                                  onClick={() => setEditing(null)}
                                  className="px-2 border rounded text-xs"
                                >✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditing(p.name); setEditValue(String(val ?? '')) }}
                                className="text-left w-full block break-words hover:text-blue-700"
                                title="Cliquer pour éditer"
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
            {Object.keys(filteredGroups).length === 0 && (
              <p className="text-sm text-gray-500">Aucune propriété ne correspond.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}

/* ───── Components ───── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm">
      <div className="px-4 py-2 border-b text-sm font-semibold">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    note: 'bg-yellow-100 text-yellow-800',
    call: 'bg-green-100 text-green-800',
    email: 'bg-blue-100 text-blue-800',
    meeting: 'bg-purple-100 text-purple-800',
    form: 'bg-pink-100 text-pink-800',
    rdv: 'bg-indigo-100 text-indigo-800',
    task: 'bg-gray-100 text-gray-800',
    sms: 'bg-teal-100 text-teal-800',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${map[type] ?? 'bg-gray-100'}`}>
      {labelForType(type)}
    </span>
  )
}

/* ───── Helpers ───── */

function labelForType(t: string): string {
  const labels: Record<string, string> = {
    note: 'Note', call: 'Appel', email: 'Email', meeting: 'Meeting',
    form: 'Formulaire', rdv: 'RDV', task: 'Tâche', sms: 'SMS',
  }
  return labels[t] ?? t
}

function formatGroup(g: string): string {
  const map: Record<string, string> = {
    contactinformation: 'Informations',
    diploma_sante: 'Diploma Santé',
    emailinformation: 'Email',
    conversioninformation: 'Conversion',
    leadstatus: 'Lead',
    salesforceinformation: 'Salesforce',
    activityinformation: 'Activité',
    socialmediainformation: 'Réseaux sociaux',
    analyticsinformation: 'Analytics',
    dealinformation: 'Informations deal',
    other: 'Autres',
  }
  return map[g] || g.replace(/_/g, ' ')
}

function formatPropValue(v: Any, p: CRMProperty): string {
  if (v === null || v === undefined || v === '') return ''
  const str = String(v)
  if (p.type === 'datetime' || p.type === 'date') {
    const ts = parseInt(str, 10)
    if (!isNaN(ts) && ts > 1000000000000) return format(new Date(ts), 'PPp', { locale: fr })
    const d = new Date(str)
    if (!isNaN(d.getTime())) return format(d, 'PPp', { locale: fr })
  }
  if (p.field_type === 'select' && p.options) {
    const opt = p.options.find(o => o.value === str)
    if (opt) return opt.label
  }
  if (p.field_type === 'checkbox' || p.type === 'bool') {
    return str === 'true' || str === '1' ? 'Oui' : 'Non'
  }
  return str
}

function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}
