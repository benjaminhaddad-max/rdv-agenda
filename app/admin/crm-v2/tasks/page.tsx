'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, isPast, isToday, isTomorrow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckSquare, Columns3, Copy, Filter, Circle } from 'lucide-react'
import {
  CrmV2Avatar,
  CrmV2Button,
  CrmV2Empty,
  CrmV2Header,
  CrmV2Link,
  CrmV2Page,
  CrmV2PillTabs,
  CrmV2Search,
  CrmV2Spinner,
  CrmV2Table,
  CrmV2Td,
  CrmV2Th,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

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

  const pillItems = [
    { id: 'all', label: 'Toutes', count: filterDue === 'all' ? filtered.length : undefined },
    { id: 'today', label: "Dû aujourd'hui" },
    { id: 'overdue', label: 'En retard' },
    { id: 'week', label: 'Cette semaine' },
    { id: 'completed', label: 'Toutes les tâches terminées' },
  ]

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Tâches"
        subtitle="Suivi des tâches de l’équipe"
      />

      <div style={{ background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, padding: '16px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CrmV2PillTabs
            items={pillItems}
            value={filterDue}
            onChange={id => setFilterDue(id as FilterDue)}
          />

          <div style={{ fontSize: 13, color: crmV2.textMuted }}>
            Attribué à :{' '}
            <select
              value={filterOwner}
              onChange={e => setFilterOwner(e.target.value)}
              style={{
                border: 'none', background: 'transparent', color: crmV2.link,
                fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
              }}
            >
              <option value="">Toutes les personnes à qui la tâche est attribuée</option>
              {owners.map(o => (
                <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>
                  {ownerName(o) || o.hubspot_owner_id}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <CrmV2Search
              placeholder="Recherche"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 260 }}
            />
            <button
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', color: crmV2.link,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}
            >
              <Filter size={14} /> Filtrer
            </button>
            <button
              type="button"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', color: crmV2.link,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}
            >
              <Columns3 size={14} /> Modifier les colonnes
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 28px 40px' }}>
        <div style={{
          background: crmV2.bg,
          border: `1px solid ${crmV2.border}`,
          borderRadius: crmV2.radiusLg,
          overflow: 'hidden',
          boxShadow: crmV2.shadow,
        }}>
          {loading ? (
            <CrmV2Spinner />
          ) : filtered.length === 0 ? (
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
                    />
                  </CrmV2Th>
                  <CrmV2Th style={{ width: 52 }}>Statut</CrmV2Th>
                  <CrmV2Th>Titre</CrmV2Th>
                  <CrmV2Th sorted={sortAsc ? 'asc' : 'desc'} onClick={() => setSortAsc(v => !v)}>
                    Date d&apos;échéance
                  </CrmV2Th>
                  <CrmV2Th>Attribué à</CrmV2Th>
                  <CrmV2Th>Notes</CrmV2Th>
                  <CrmV2Th style={{ width: 48 }}> </CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(task => {
                  const due = formatDue(task.due_at)
                  const owner = task.owner_id ? ownerById.get(task.owner_id) : null
                  const oName = ownerName(owner)
                  const contact = task.hubspot_contact_id ? contacts[task.hubspot_contact_id] : null
                  const contactLabel = contact
                    ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.email
                    : null
                  const done = task.status === 'completed'

                  return (
                    <tr key={task.id} style={{ background: selected.has(task.id) ? '#f0fafb' : undefined }}>
                      <CrmV2Td>
                        <input
                          type="checkbox"
                          checked={selected.has(task.id)}
                          onChange={() => toggleOne(task.id)}
                          aria-label={`Sélectionner ${task.title}`}
                        />
                      </CrmV2Td>
                      <CrmV2Td>
                        <button
                          type="button"
                          onClick={() => !done && completeTask(task.id)}
                          title={done ? 'Terminée' : 'Marquer comme terminée'}
                          disabled={done}
                          style={{
                            width: 22, height: 22, borderRadius: '50%',
                            border: `2px solid ${done ? crmV2.success : crmV2.borderStrong}`,
                            background: done ? crmV2.success : 'transparent',
                            cursor: done ? 'default' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', padding: 0,
                          }}
                        >
                          {done ? <Circle size={8} fill="#fff" /> : null}
                        </button>
                      </CrmV2Td>
                      <CrmV2Td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {task.hubspot_contact_id ? (
                            <CrmV2Link href={`/admin/crm-v2/contacts/${task.hubspot_contact_id}`}>
                              {task.title}
                            </CrmV2Link>
                          ) : (
                            <span style={{ color: crmV2.link, fontWeight: 600 }}>{task.title}</span>
                          )}
                          {contactLabel && (
                            <span style={{ fontSize: 12, color: crmV2.textFaint }}>{contactLabel}</span>
                          )}
                        </div>
                      </CrmV2Td>
                      <CrmV2Td>
                        <span style={{
                          color: due.overdue ? crmV2.danger : crmV2.text,
                          fontWeight: due.overdue ? 600 : 400,
                        }}>
                          {due.label}
                        </span>
                      </CrmV2Td>
                      <CrmV2Td>
                        {oName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <CrmV2Avatar name={oName} color={owner?.avatar_color || crmV2.gold} />
                            <span style={{ color: crmV2.text }}>{oName}</span>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: crmV2.textMuted }}>
                            <CrmV2Avatar name="?" color={crmV2.borderStrong} />
                            Non attribué
                          </span>
                        )}
                      </CrmV2Td>
                      <CrmV2Td style={{ color: crmV2.textMuted, maxWidth: 280 }}>
                        <span style={{
                          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {task.description || '—'}
                        </span>
                      </CrmV2Td>
                      <CrmV2Td>
                        <button
                          type="button"
                          onClick={() => duplicateTask(task.id)}
                          title="Dupliquer la tâche"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, borderRadius: '50%',
                            border: `1px solid ${crmV2.border}`, background: 'transparent',
                            color: crmV2.textMuted, cursor: 'pointer', padding: 0,
                          }}
                        >
                          <Copy size={13} />
                        </button>
                      </CrmV2Td>
                    </tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </div>
      </div>
    </CrmV2Page>
  )
}
