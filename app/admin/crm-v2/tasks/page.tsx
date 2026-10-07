'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, isPast, isToday, isTomorrow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckSquare, Columns3, Copy, SlidersHorizontal } from 'lucide-react'
import {
  CrmV2Body,
  CrmV2Button,
  CrmV2Empty,
  CrmV2Header,
  CrmV2Link,
  CrmV2Page,
  CrmV2Pill,
  CrmV2Search,
  CrmV2Spinner,
  CrmV2StatusPill,
  CrmV2Table,
  CrmV2TableCard,
  CrmV2Tabs,
  CrmV2Td,
  CrmV2Th,
  CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  AdminRoundCheck, AdminOwnerCell, AdminPillSelect, AdminMobileList, AdminEllipsis, AdminIconButton,
} from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

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
  avatar_color?: string
}

type FilterDue = 'all' | 'today' | 'overdue' | 'week' | 'completed'

function formatDue(dueAt?: string) {
  if (!dueAt) return { label: '—', overdue: false }
  const d = new Date(dueAt)
  const overdue = isPast(d) && !isToday(d)
  if (isToday(d)) return { label: `Aujourd'hui à ${format(d, 'HH:mm')}`, overdue: false }
  if (isTomorrow(d)) return { label: `Demain à ${format(d, 'HH:mm')}`, overdue: false }
  return {
    label: format(d, "d MMM yyyy HH:mm", { locale: fr }),
    overdue,
  }
}

/** Libellés des types de tâche (mêmes valeurs que QuickActionModal) */
const TASK_TYPE_LABELS: Record<string, string> = {
  call_back: 'À rappeler',
  follow_up: 'Relancer',
  email: 'E-mail',
  meeting: 'RDV / réunion',
  other: 'Autre',
}

const PRIORITY_PILL: Record<CRMTask['priority'], { label: string; color: string; bg?: string }> = {
  low: { label: 'Basse', color: '#516f90', bg: '#f1f4f9' },
  normal: { label: 'Normale', color: '#8a6d22', bg: 'rgba(204,172,113,0.16)' },
  high: { label: 'Haute', color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
  urgent: { label: 'Urgente', color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
}

function ownerName(o?: Owner | null) {
  if (!o) return null
  return [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || null
}

export default function TasksV2Page() {
  const [tasks, setTasks] = useState<CRMTask[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [contacts, setContacts] = useState<Record<string, { firstname?: string; lastname?: string; email?: string }>>({})
  const [filterDue, setFilterDue] = useState<FilterDue>('all')
  const [filterOwner, setFilterOwner] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortAsc, setSortAsc] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterOwner) params.set('owner', filterOwner)
      if (filterDue === 'today' || filterDue === 'overdue' || filterDue === 'week') params.set('due', filterDue)
      params.set('status', filterDue === 'completed' ? 'completed' : 'pending')

      const res = await fetch(`/api/crm/tasks?${params.toString()}`)
      const json = await res.json()
      const list: CRMTask[] = json.tasks ?? []
      setTasks(list)

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
          const map: Record<string, { firstname?: string; lastname?: string; email?: string }> = {}
          for (const c of cj.data ?? cj.contacts ?? []) {
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
    await fetch(`/api/crm/tasks/${id}/duplicate`, { method: 'POST' })
    load()
  }

  const ownerById = useMemo(() => {
    const m = new Map<string, Owner>()
    for (const o of owners) m.set(o.hubspot_owner_id, o)
    return m
  }, [owners])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = tasks
    if (q) {
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY
      const db = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY
      return sortAsc ? da - db : db - da
    })
    return list
  }, [tasks, search, sortAsc])

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(t => t.id)))
  }

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tabItems = [
    { id: 'all', label: 'À faire', count: filterDue === 'all' && !loading ? filtered.length : undefined },
    { id: 'today', label: "Aujourd'hui", count: filterDue === 'today' && !loading ? filtered.length : undefined },
    { id: 'overdue', label: 'En retard', count: filterDue === 'overdue' && !loading ? filtered.length : undefined },
    { id: 'week', label: 'Cette semaine', count: filterDue === 'week' && !loading ? filtered.length : undefined },
    { id: 'completed', label: 'Terminées' },
  ]

  const linkBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: crmV2.link,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '7px 8px', borderRadius: 999,
  }

  const ownerSelect = (
    <AdminPillSelect
      value={filterOwner}
      onChange={e => setFilterOwner(e.target.value)}
      aria-label="Assignée à"
      style={isMobile ? { minHeight: 40, maxWidth: '100%' } : { maxWidth: 260 }}
    >
      <option value="">Assignée à : tout le monde</option>
      {owners.map(o => (
        <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>
          {ownerName(o) || o.hubspot_owner_id}
        </option>
      ))}
    </AdminPillSelect>
  )

  const rowInfo = (task: CRMTask) => {
    const due = formatDue(task.due_at)
    const owner = task.owner_id ? ownerById.get(task.owner_id) : null
    const oName = ownerName(owner)
    const contact = task.hubspot_contact_id ? contacts[task.hubspot_contact_id] : null
    const contactLabel = contact
      ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.email
      : null
    const done = task.status === 'completed'
    return { due, owner, oName, contactLabel, done }
  }

  const empty = (
    <CrmV2Empty
      icon={<CheckSquare size={28} />}
      title="Aucune tâche"
      description="Ouvre une fiche contact et crée une tâche, ou change de filtre."
      action={
        <CrmV2Button variant="gold" onClick={() => { window.location.href = '/admin/crm-v2' }}>
          Aller aux contacts
        </CrmV2Button>
      }
    />
  )

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Tâches"
        subtitle="Suivi des tâches de l’équipe"
      >
        <CrmV2Tabs
          bordered={false}
          items={tabItems}
          value={filterDue}
          onChange={id => setFilterDue(id as FilterDue)}
        />
      </CrmV2Header>

      <CrmV2Body>
        {isMobile ? (
          <>
            <CrmV2Search
              placeholder="Rechercher une tâche…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', height: 40 }}
            />
            {ownerSelect}
            {loading ? (
              <CrmV2Spinner />
            ) : filtered.length === 0 ? (
              <AdminMobileList>{empty}</AdminMobileList>
            ) : (
              // Mobile : une ligne par tâche (case ronde, titre, contact · échéance, assigné)
              <AdminMobileList>
                {filtered.map((task, idx) => {
                  const { due, owner, oName, contactLabel, done } = rowInfo(task)
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, minHeight: 56,
                        padding: '8px 10px 8px 12px', borderBottom: idx === filtered.length - 1 ? 'none' : `1px solid ${crmV2.borderLight}`,
                        background: selected.has(task.id) ? '#f0fafb' : undefined,
                      }}
                    >
                      <AdminRoundCheck
                        done={done}
                        disabled={done}
                        title={done ? 'Terminée' : 'Marquer comme terminée'}
                        onClick={() => !done && completeTask(task.id)}
                        size={20}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <AdminEllipsis style={{ fontSize: 14, fontWeight: 600, textDecoration: done ? 'line-through' : undefined, color: done ? crmV2.textMuted : crmV2.text }}>
                          {task.hubspot_contact_id ? (
                            <CrmV2Link href={`/admin/crm-v2/contacts/${task.hubspot_contact_id}`}>{task.title}</CrmV2Link>
                          ) : task.title}
                        </AdminEllipsis>
                        <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>
                          {contactLabel ? `${contactLabel} · ` : ''}
                          <span style={{ color: due.overdue ? crmV2.danger : undefined, fontWeight: due.overdue ? 600 : 400 }}>{due.label}</span>
                          {' · '}{oName || 'Non attribué'}
                        </AdminEllipsis>
                      </div>
                      <span style={{ flexShrink: 0, display: 'inline-flex' }} title={oName || 'Non attribué'}>
                        <span style={{
                          width: 22, height: 22, borderRadius: '50%', background: oName ? (owner?.avatar_color || crmV2.gold) : crmV2.borderStrong,
                          color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {(oName || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'}
                        </span>
                      </span>
                      <AdminIconButton icon={<Copy size={14} />} title="Dupliquer la tâche" onClick={() => duplicateTask(task.id)} />
                    </div>
                  )
                })}
              </AdminMobileList>
            )}
          </>
        ) : (
          <CrmV2TableCard
            toolbar={
              <>
                <CrmV2Search
                  placeholder="Rechercher une tâche…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {ownerSelect}
                <button type="button" style={linkBtn}>
                  <SlidersHorizontal size={14} /> Filtres avancés
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" style={linkBtn}>
                  <Columns3 size={14} /> Colonnes
                </button>
              </>
            }
            footer={!loading && filtered.length > 0 ? (
              <span>
                {filtered.length.toLocaleString('fr-FR')} tâche{filtered.length > 1 ? 's' : ''}
                {selected.size > 0 && ` · ${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}`}
              </span>
            ) : undefined}
          >
            {loading ? (
              <CrmV2Spinner />
            ) : filtered.length === 0 ? (
              empty
            ) : (
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        aria-label="Tout sélectionner"
                        style={{ accentColor: crmV2.primary }}
                      />
                    </CrmV2Th>
                    <CrmV2Th style={{ width: 44 }}>{''}</CrmV2Th>
                    <CrmV2Th>Tâche</CrmV2Th>
                    <CrmV2Th>Contact</CrmV2Th>
                    <CrmV2Th>Type</CrmV2Th>
                    <CrmV2Th sorted={sortAsc ? 'asc' : 'desc'} onClick={() => setSortAsc(v => !v)}>
                      Échéance
                    </CrmV2Th>
                    <CrmV2Th>Priorité</CrmV2Th>
                    <CrmV2Th>Assignée à</CrmV2Th>
                    <CrmV2Th>Notes</CrmV2Th>
                    <CrmV2Th style={{ width: 52 }}>{''}</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(task => {
                    const { due, owner, oName, contactLabel, done } = rowInfo(task)
                    const prio = PRIORITY_PILL[task.priority] ?? PRIORITY_PILL.normal
                    return (
                      <CrmV2Tr key={task.id} style={selected.has(task.id) ? { background: '#f0fafb' } : undefined}>
                        <CrmV2Td>
                          <input
                            type="checkbox"
                            checked={selected.has(task.id)}
                            onChange={() => toggleOne(task.id)}
                            aria-label={`Sélectionner ${task.title}`}
                            style={{ accentColor: crmV2.primary }}
                          />
                        </CrmV2Td>
                        <CrmV2Td>
                          <AdminRoundCheck
                            done={done}
                            disabled={done}
                            title={done ? 'Terminée' : 'Marquer comme terminée'}
                            onClick={() => !done && completeTask(task.id)}
                          />
                        </CrmV2Td>
                        <CrmV2Td style={{ maxWidth: 320 }}>
                          <AdminEllipsis style={{ fontWeight: 700, color: done ? crmV2.textMuted : crmV2.text }}>{task.title}</AdminEllipsis>
                        </CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                          {task.hubspot_contact_id ? (
                            <CrmV2Link href={`/admin/crm-v2/contacts/${task.hubspot_contact_id}`}>
                              {contactLabel || 'Voir le contact'}
                            </CrmV2Link>
                          ) : (
                            <span style={{ color: crmV2.textFaint }}>—</span>
                          )}
                        </CrmV2Td>
                        <CrmV2Td>
                          {task.task_type
                            ? <CrmV2Pill>{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</CrmV2Pill>
                            : <span style={{ color: crmV2.textFaint }}>—</span>}
                        </CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{
                            color: due.overdue ? crmV2.danger : done ? crmV2.textMuted : crmV2.text,
                            fontWeight: due.overdue ? 700 : 600,
                          }}>
                            {due.label}
                          </span>
                        </CrmV2Td>
                        <CrmV2Td>
                          <CrmV2StatusPill label={prio.label} color={prio.color} bg={prio.bg} />
                        </CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                          <AdminOwnerCell name={oName} color={owner?.avatar_color || crmV2.gold} />
                        </CrmV2Td>
                        <CrmV2Td style={{ color: crmV2.textMuted, maxWidth: 260 }}>
                          <AdminEllipsis>{task.description || '—'}</AdminEllipsis>
                        </CrmV2Td>
                        <CrmV2Td>
                          <AdminIconButton icon={<Copy size={13} />} title="Dupliquer la tâche" onClick={() => duplicateTask(task.id)} />
                        </CrmV2Td>
                      </CrmV2Tr>
                    )
                  })}
                </tbody>
              </CrmV2Table>
            )}
          </CrmV2TableCard>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}
