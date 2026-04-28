'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { format, isPast, isToday, isTomorrow, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckSquare, Clock, AlertCircle, User, Plus, Filter, Copy } from 'lucide-react'

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
  hubspot_contact_id?: string
  hubspot_deal_id?: string
}

interface Owner {
  hubspot_owner_id: string
  email?: string
  firstname?: string
  lastname?: string
}

type FilterDue = 'today' | 'overdue' | 'week' | 'all'

const PRIORITY_COLORS: Record<string, string> = {
  low:    'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const TASK_TYPE_LABELS: Record<string, string> = {
  call_back: 'À rappeler',
  follow_up: 'Relance',
  email:     'E-mail',
  meeting:   'Réunion',
  other:     'Autre',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<CRMTask[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [contacts, setContacts] = useState<Record<string, { firstname?: string; lastname?: string; email?: string }>>({})
  const [filterDue, setFilterDue]   = useState<FilterDue>('all')
  const [filterOwner, setFilterOwner] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterOwner) params.set('owner', filterOwner)
      if (filterDue !== 'all') params.set('due', filterDue)
      params.set('status', 'pending')

      const res = await fetch(`/api/crm/tasks?${params.toString()}`)
      const json = await res.json()
      const list: CRMTask[] = json.tasks ?? []
      setTasks(list)

      // Charger les owners + contacts liés en // (best-effort)
      const ownersRes = await fetch('/api/crm/owners').catch(() => null)
      if (ownersRes?.ok) {
        const o = await ownersRes.json()
        setOwners(o.owners ?? [])
      }

      const contactIds = [...new Set(list.map(t => t.hubspot_contact_id).filter((v): v is string => !!v))]
      if (contactIds.length > 0) {
        const cRes = await fetch(`/api/crm/contacts?ids=${contactIds.join(',')}&limit=200`).catch(() => null)
        if (cRes?.ok) {
          const cj = await cRes.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const map: Record<string, any> = {}
          for (const c of cj.contacts ?? []) {
            map[c.hubspot_contact_id] = c
          }
          setContacts(map)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [filterDue, filterOwner])

  useEffect(() => { load() }, [load])

  const completeTask = async (id: number) => {
    await fetch(`/api/crm/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    load()
  }

  const duplicateTask = async (id: number) => {
    const res = await fetch(`/api/crm/tasks/${id}/duplicate`, { method: 'POST' })
    if (!res.ok) {
      alert('Erreur lors de la duplication')
      return
    }
    load()
  }

  const ownerLabel = (id?: string | null) => {
    if (!id) return '—'
    const o = owners.find(o => o.hubspot_owner_id === id)
    if (!o) return id
    return [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || id
  }

  const contactLabel = (id?: string | null) => {
    if (!id) return null
    const c = contacts[id]
    if (!c) return null
    return [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email || id
  }

  // Buckets
  const overdue = tasks.filter(t => t.due_at && isPast(new Date(t.due_at)) && !isToday(new Date(t.due_at)))
  const today   = tasks.filter(t => t.due_at && isToday(new Date(t.due_at)))
  const tomorrow = tasks.filter(t => t.due_at && isTomorrow(new Date(t.due_at)))
  const later   = tasks.filter(t => t.due_at && !isPast(new Date(t.due_at)) && !isToday(new Date(t.due_at)) && !isTomorrow(new Date(t.due_at)))
  const undated = tasks.filter(t => !t.due_at)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <CheckSquare size={22} className="text-[#2ea3f2]" />
              Mes tâches
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {tasks.length} tâche{tasks.length > 1 ? 's' : ''} en cours
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="max-w-[1400px] mx-auto px-6 pb-4 flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          <FilterPill active={filterDue === 'all'}     onClick={() => setFilterDue('all')}     label="Toutes" />
          <FilterPill active={filterDue === 'today'}   onClick={() => setFilterDue('today')}   label="Aujourd'hui" />
          <FilterPill active={filterDue === 'overdue'} onClick={() => setFilterDue('overdue')} label="En retard" />
          <FilterPill active={filterDue === 'week'}    onClick={() => setFilterDue('week')}    label="Cette semaine" />

          <div className="ml-3">
            <select
              value={filterOwner}
              onChange={e => setFilterOwner(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">Tous les propriétaires</option>
              {owners.map(o => (
                <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>
                  {[o.firstname, o.lastname].filter(Boolean).join(' ') || o.email}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-[#2ea3f2] rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            <Bucket title="En retard"     icon={<AlertCircle size={16} />} color="text-red-600"   tasks={overdue} onComplete={completeTask} onDuplicate={duplicateTask} ownerLabel={ownerLabel} contactLabel={contactLabel} />
            <Bucket title="Aujourd'hui"   icon={<Clock size={16} />}       color="text-[#0038f0]" tasks={today}   onComplete={completeTask} onDuplicate={duplicateTask} ownerLabel={ownerLabel} contactLabel={contactLabel} />
            <Bucket title="Demain"        icon={<Clock size={16} />}       color="text-amber-600" tasks={tomorrow} onComplete={completeTask} onDuplicate={duplicateTask} ownerLabel={ownerLabel} contactLabel={contactLabel} />
            <Bucket title="Plus tard"     icon={<Clock size={16} />}       color="text-slate-500" tasks={later}    onComplete={completeTask} onDuplicate={duplicateTask} ownerLabel={ownerLabel} contactLabel={contactLabel} />
            <Bucket title="Sans échéance" icon={<Clock size={16} />}       color="text-slate-400" tasks={undated}  onComplete={completeTask} onDuplicate={duplicateTask} ownerLabel={ownerLabel} contactLabel={contactLabel} />
          </div>
        )}
      </div>
    </div>
  )
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-[#2ea3f2] text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )
}

function Bucket({ title, icon, color, tasks, onComplete, onDuplicate, ownerLabel, contactLabel }: {
  title: string
  icon: React.ReactNode
  color: string
  tasks: CRMTask[]
  onComplete: (id: number) => void
  onDuplicate: (id: number) => void
  ownerLabel: (id?: string | null) => string
  contactLabel: (id?: string | null) => string | null
}) {
  if (tasks.length === 0) return null
  return (
    <div>
      <h2 className={`text-sm font-bold uppercase tracking-wide flex items-center gap-2 mb-3 ${color}`}>
        {icon}
        {title}
        <span className="text-xs text-slate-400 font-normal">({tasks.length})</span>
      </h2>
      <ul className="space-y-2">
        {tasks.map(t => (
          <TaskRow key={t.id} task={t} onComplete={onComplete} onDuplicate={onDuplicate} ownerLabel={ownerLabel} contactLabel={contactLabel} />
        ))}
      </ul>
    </div>
  )
}

function TaskRow({ task, onComplete, onDuplicate, ownerLabel, contactLabel }: {
  task: CRMTask
  onComplete: (id: number) => void
  onDuplicate: (id: number) => void
  ownerLabel: (id?: string | null) => string
  contactLabel: (id?: string | null) => string | null
}) {
  const isOverdue = task.due_at && isPast(new Date(task.due_at)) && !isToday(new Date(task.due_at))
  const cName = contactLabel(task.hubspot_contact_id)

  return (
    <li className={`bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow ${isOverdue ? 'border-red-200' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onComplete(task.id)}
          className="mt-0.5 w-5 h-5 rounded border-2 border-slate-300 hover:border-[#0038f0] hover:bg-[#0038f0]/10 flex-shrink-0"
          title="Marquer comme terminée"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm">{task.title}</div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {task.due_at && (
                <div className={`text-xs whitespace-nowrap ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                  {format(new Date(task.due_at), "PP 'à' HH:mm", { locale: fr })}
                  <span className="text-slate-400 ml-1">
                    ({formatDistanceToNow(new Date(task.due_at), { locale: fr, addSuffix: true })})
                  </span>
                </div>
              )}
              <button
                onClick={() => onDuplicate(task.id)}
                className="text-slate-400 hover:text-[#0038f0] p-1"
                title="Dupliquer la tâche"
              >
                <Copy size={13} />
              </button>
            </div>
          </div>
          {task.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{task.description}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
            {task.priority !== 'normal' && (
              <span className={`px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                {task.priority === 'urgent' ? 'Urgent' : task.priority === 'high' ? 'Haute' : 'Basse'}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {TASK_TYPE_LABELS[task.task_type] ?? task.task_type}
            </span>
            {task.owner_id && (
              <span className="text-slate-500 flex items-center gap-1">
                <User size={11} /> {ownerLabel(task.owner_id)}
              </span>
            )}
            {task.hubspot_contact_id && (
              <Link
                href={`/admin/crm/contacts/${task.hubspot_contact_id}`}
                className="text-[#0038f0] hover:underline"
              >
                {cName ?? `Contact #${task.hubspot_contact_id}`}
              </Link>
            )}
            {task.hubspot_deal_id && (
              <Link
                href={`/admin/crm/deals/${task.hubspot_deal_id}`}
                className="text-[#0038f0] hover:underline"
              >
                Transaction
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#2ea3f2]/10 text-[#2ea3f2] mb-4">
        <CheckSquare size={36} />
      </div>
      <h2 className="text-lg font-semibold text-slate-700">Aucune tâche en cours</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Ouvre la fiche d&apos;un contact ou d&apos;une transaction et clique sur <strong>Tâche</strong> pour en créer une.
      </p>
      <Link
        href="/admin/crm"
        className="inline-flex items-center gap-1 mt-4 px-4 py-2 bg-gradient-to-r from-[#2ea3f2] to-[#0038f0] text-white text-sm rounded-md hover:opacity-90"
      >
        <Plus size={14} /> Aller au CRM
      </Link>
    </div>
  )
}
