'use client'

/**
 * Forums en vue liste, traités comme des leads : chaque forum (son
 * organisateur) est attribué, appelé, rappelé. Dates, dernier appel avec la
 * remarque, prochain rappel, intervenants ; validation des forums détectés.
 */

import { useMemo, useState } from 'react'
import { Check, ExternalLink, EyeOff, Mail, Phone } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Empty, CrmV2Pagination, CrmV2Search, CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { AdminMobileList, AdminMobileRow, AdminPillSelect } from '@/components/crm-v2/admin/AdminUi'
import { DEPARTMENTS, EVENT_SCOPES, EVENT_STATUSES, lookup, normalizeName } from '@/lib/lycees'
import {
  type AgendaEvent, Dept, EventStatusPill, KindPill, LastCallCell, NextCallCell, parisTodayKey, UserChip, type TeamUser,
} from './ui'

type ForumView = 'a_appeler' | 'rappels' | 'mes' | 'confirmes' | 'avenir' | 'passes'

const VIEWS: { id: ForumView; label: string; hint: string }[] = [
  { id: 'a_appeler', label: 'À appeler', hint: 'Forums à venir pas encore confirmés (détectés ou à confirmer)' },
  { id: 'rappels', label: 'À rappeler', hint: 'Rappel prévu aujourd’hui ou en retard' },
  { id: 'mes', label: 'Mes forums', hint: 'Forums qui me sont attribués (ou dont le lycée m’est attribué)' },
  { id: 'confirmes', label: 'Confirmés', hint: 'On y va' },
  { id: 'avenir', label: 'Tous à venir', hint: '' },
  { id: 'passes', label: 'Passés', hint: '' },
]

export const deptOfEvent = (e: AgendaEvent) => e.lycee?.department ?? (/\((\d{2})\)/.exec(e.location ?? '')?.[1] ?? null)
export const assigneeOfEvent = (e: AgendaEvent) => e.assigned_to ?? e.lycee?.assigned_to ?? null

export default function ForumsList({
  events, users, me, isManager, onOpenLycee, onEdit, onCall, onMail, onQuickPatch, onBulk,
}: {
  events: AgendaEvent[]
  users: TeamUser[]
  me: string | null
  isManager: boolean
  onOpenLycee: (uai: string) => void
  onEdit: (e: AgendaEvent) => void
  onCall: (e: AgendaEvent) => void
  onMail?: (e: AgendaEvent) => void
  onQuickPatch: (id: string, patch: Record<string, unknown>) => Promise<void>
  onBulk: (ids: string[], patch: Record<string, unknown>) => Promise<void>
}) {
  const isMobile = useIsMobile()
  const today = parisTodayKey()
  const [view, setView] = useState<ForumView>('a_appeler')
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [scope, setScope] = useState('')
  const [assignee, setAssignee] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])

  const base = useMemo(() => {
    const n = normalizeName(q)
    return events.filter(e => {
      if (e.kind === 'flying') return false
      if (n) {
        const hay = normalizeName(`${e.lycee?.name ?? ''} ${e.title ?? ''} ${e.lycee?.city ?? ''} ${e.location ?? ''}`)
        if (!n.split(' ').every(p => hay.includes(p))) return false
      }
      if (dept && deptOfEvent(e) !== dept) return false
      if (scope === 'big' ? e.scope === 'lycee' : scope && e.scope !== scope) return false
      const who = assigneeOfEvent(e)
      if (assignee === 'none' ? !!who : assignee && who !== assignee) return false
      return true
    })
  }, [events, q, dept, scope, assignee])

  const inView = (e: AgendaEvent, v: ForumView) => {
    const upcoming = !e.date || e.date >= today
    switch (v) {
      case 'a_appeler': return upcoming && (e.status === 'detecte' || e.status === 'a_confirmer')
      case 'rappels': return !!e.next_action_at && e.next_action_at <= today
      case 'mes': return assigneeOfEvent(e) === me && upcoming
      case 'confirmes': return upcoming && e.status === 'confirme'
      case 'avenir': return upcoming
      case 'passes': return !upcoming
    }
  }

  const list = useMemo(() => base.filter(e => inView(e, view)).sort((a, b) => view === 'passes'
    ? (b.date || '').localeCompare(a.date || '')
    : view === 'rappels'
      ? (a.next_action_at || '').localeCompare(b.next_action_at || '')
      : (a.date || '9999').localeCompare(b.date || '9999')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [base, view, today, me])
  const pageSize = 50
  const pageItems = list.slice((page - 1) * pageSize, page * pageSize)

  const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

  const title = (e: AgendaEvent) => e.lycee ? (
    <button type="button" onClick={ev => { ev.stopPropagation(); onOpenLycee(e.lycee!.uai) }} style={{
      background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: crmV2.link, textAlign: 'left',
    }}>{e.lycee.name}</button>
  ) : <span style={{ fontWeight: 700 }}>{e.title ?? 'Forum'}</span>

  const toolbar = (
    <>
      <CrmV2Search value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Lycée, ville, forum…" style={{ flex: isMobile ? '1 1 100%' : '0 1 240px' }} />
      <AdminPillSelect value={dept} onChange={e => { setDept(e.target.value); setPage(1) }}>
        <option value="">Départements</option>
        {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
      </AdminPillSelect>
      <AdminPillSelect value={scope} onChange={e => { setScope(e.target.value); setPage(1) }}>
        <option value="">Toutes portées</option>
        <option value="big">Gros forums (inter-lycées, ville, département)</option>
        {EVENT_SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </AdminPillSelect>
      {isManager && (
        <AdminPillSelect value={assignee} onChange={e => { setAssignee(e.target.value); setPage(1) }}>
          <option value="">Attribution</option>
          <option value="none">Non attribués</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </AdminPillSelect>
      )}
    </>
  )

  const viewPills = (
    <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {VIEWS.map(v => {
        const on = view === v.id
        const n = base.filter(e => inView(e, v.id)).length
        return (
          <button key={v.id} type="button" title={v.hint} onClick={() => { setView(v.id); setPage(1); setSelected(new Set()) }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontFamily: 'inherit', fontSize: 13,
            fontWeight: on ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            border: `1px solid ${on ? crmV2.primary : crmV2.borderStrong}`, background: on ? crmV2.primary : crmV2.bg, color: on ? '#fff' : crmV2.text,
          }}>
            {v.label}
            <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? 'rgba(255,255,255,0.8)' : v.id === 'rappels' && n ? crmV2.danger : crmV2.textFaint }}>{n}</span>
          </button>
        )
      })}
    </div>
  )

  const bulkBar = isManager && selected.size > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: crmV2.goldSoft, borderBottom: `1px solid ${crmV2.goldBorder}`, fontSize: 13 }}>
      <b>{selected.size} forum(s) sélectionné(s)</b>
      <AdminPillSelect value="" onChange={async e => {
        if (!e.target.value) return
        await onBulk([...selected], { assigned_to: e.target.value === '__none' ? null : e.target.value })
        setSelected(new Set())
      }}>
        <option value="">Attribuer à…</option>
        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        <option value="__none">Retirer l’attribution</option>
      </AdminPillSelect>
      <AdminPillSelect value="" onChange={async e => {
        if (!e.target.value) return
        await onBulk([...selected], e.target.value === '__hide' ? { hidden: true } : { status: e.target.value })
        setSelected(new Set())
      }}>
        <option value="">Statut…</option>
        {EVENT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        <option value="__hide">Masquer (faux positifs)</option>
      </AdminPillSelect>
      <CrmV2Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Désélectionner</CrmV2Button>
      {list.length > selected.size && <CrmV2Button size="sm" variant="ghost" onClick={() => setSelected(new Set(list.map(e => e.id)))}>Tout sélectionner ({list.length})</CrmV2Button>}
    </div>
  )

  const footer = <><span>{list.length} forum(s)</span><CrmV2Pagination page={page} pageSize={pageSize} total={list.length} onChange={setPage} /></>

  // « On y sera » → statut Confirmé : le forum passe dans « Nos dates » (et le lycée en « obtenu »)
  const rowActions = (e: AgendaEvent) => (
    <>
      {e.status === 'confirme' || e.status === 'realise' ? (
        <span title="Ce forum est dans « Nos dates »" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap', padding: '0 4px' }}>
          <Check size={13} /> {e.status === 'realise' ? 'Fait' : 'On y sera'}
        </span>
      ) : (
        <CrmV2Button size="sm" icon={<Check size={12} />} onClick={() => onQuickPatch(e.id, { status: 'confirme' })}
          style={{ color: '#16a34a', borderColor: 'rgba(22,163,74,.35)' }}>On y sera</CrmV2Button>
      )}
      {e.status === 'detecte' && (
        <CrmV2Button size="sm" variant="ghost" icon={<EyeOff size={12} />} onClick={() => onQuickPatch(e.id, { hidden: true })}>Pas pour nous</CrmV2Button>
      )}
    </>
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {viewPills}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{toolbar}</div>
        {!list.length ? <CrmV2Empty title="Aucun forum" description="Rien dans cette vue." /> : (
          <AdminMobileList>
            {pageItems.map((e, i) => (
              <AdminMobileRow key={e.id} onClick={() => onEdit(e)} last={i === pageItems.length - 1}>
                <div style={{ width: 54, flexShrink: 0, fontSize: 12, fontWeight: 700, fontStyle: e.date_confirmed ? 'normal' : 'italic' }}>{e.date ? weekday(e.date) : 'Date ?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>{title(e)}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
                    <EventStatusPill status={e.status} /> <NextCallCell date={e.next_action_at} today={today} />
                  </div>
                  {e.last_note && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>{e.last_note}</div>}
                  {e.source_url && (
                    <a href={e.source_url} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: crmV2.link, fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
                      Source <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {onMail && (
                  <span onClick={ev => { ev.stopPropagation(); onMail(e) }} style={{
                    width: 38, height: 38, borderRadius: 999, background: crmV2.bgSoft, color: crmV2.link,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}><Mail size={16} /></span>
                )}
                <span onClick={ev => { ev.stopPropagation(); onCall(e) }} style={{
                  width: 38, height: 38, borderRadius: 999, background: crmV2.goldSoft, color: crmV2.goldDark,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}><Phone size={16} /></span>
              </AdminMobileRow>
            ))}
          </AdminMobileList>
        )}
      </div>
    )
  }

  const allOnPage = pageItems.length > 0 && pageItems.every(e => selected.has(e.id))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {viewPills}
      <CrmV2TableCard toolbar={toolbar} footer={footer} scrollStyle={{ maxHeight: 'calc(100vh - 330px)', minHeight: 300 }}>
        {bulkBar}
        {!list.length ? <CrmV2Empty title="Aucun forum" description="Rien dans cette vue." /> : (
          <CrmV2Table>
            <thead>
              <tr>
                {isManager && (
                  <CrmV2Th style={{ width: 36, paddingRight: 0 }}>
                    <input type="checkbox" checked={allOnPage} onChange={() => setSelected(s => {
                      const n = new Set(s)
                      if (allOnPage) pageItems.forEach(e => n.delete(e.id))
                      else pageItems.forEach(e => n.add(e.id))
                      return n
                    })} />
                  </CrmV2Th>
                )}
                <CrmV2Th>Date</CrmV2Th>
                <CrmV2Th>Forum</CrmV2Th>
                <CrmV2Th>Statut</CrmV2Th>
                <CrmV2Th>Attribué à</CrmV2Th>
                <CrmV2Th>Dernier appel</CrmV2Th>
                <CrmV2Th>Rappel</CrmV2Th>
                <CrmV2Th>Intervenants</CrmV2Th>
                <CrmV2Th style={{ width: 230 }}> </CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(e => {
                const who = assigneeOfEvent(e)
                return (
                  <CrmV2Tr key={e.id} onClick={() => onEdit(e)}>
                    {isManager && (
                      <CrmV2Td style={{ paddingRight: 0 }}>
                        <span onClick={ev => ev.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(e.id)} onChange={() => setSelected(s => {
                            const n = new Set(s)
                            if (n.has(e.id)) n.delete(e.id)
                            else n.add(e.id)
                            return n
                          })} />
                        </span>
                      </CrmV2Td>
                    )}
                    <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, fontStyle: e.date_confirmed ? 'normal' : 'italic' }}>{e.date ? weekday(e.date) : 'Date à caler'}</div>
                      <div style={{ fontSize: 11, color: e.date_confirmed ? crmV2.textFaint : '#e8833a' }}>
                        {e.date ? (e.date_confirmed ? [e.time_start, e.time_end].filter(Boolean).join('–') || 'confirmée' : 'date probable') : ''}
                      </div>
                    </CrmV2Td>
                    <CrmV2Td style={{ maxWidth: 320 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title(e)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: crmV2.textFaint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <Dept d={deptOfEvent(e)} />
                        <KindPill kind={e.kind} />
                        {e.scope !== 'lycee' && <CrmV2StatusPill label={lookup(EVENT_SCOPES, e.scope)?.label ?? ''} color="#8a6d22" dot={false} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.lycee ? e.title ?? e.lycee.city : e.location}</span>
                      </div>
                    </CrmV2Td>
                    <CrmV2Td><EventStatusPill status={e.status} /></CrmV2Td>
                    <CrmV2Td style={{ maxWidth: 160 }}>
                      <UserChip user={usersById.get(who ?? '')} />
                      {!e.assigned_to && who && <div style={{ fontSize: 10.5, color: crmV2.textFaint }}>via le lycée</div>}
                    </CrmV2Td>
                    <CrmV2Td><LastCallCell at={e.last_contact_at} outcome={e.last_outcome} note={e.last_note} count={e.calls_count || 0} /></CrmV2Td>
                    <CrmV2Td><NextCallCell date={e.next_action_at} today={today} /></CrmV2Td>
                    <CrmV2Td style={{ maxWidth: 160, fontSize: 12.5 }}>
                      {e.intervenants
                        ? <span style={{ fontWeight: 600 }}>{e.intervenants}</span>
                        : e.status === 'confirme' && e.date && e.date >= today
                          ? <span style={{ color: '#d13a41', fontWeight: 700 }}>Personne</span>
                          : <span style={{ color: crmV2.textFaint }}>—</span>}
                    </CrmV2Td>
                    <CrmV2Td>
                      <span onClick={ev => ev.stopPropagation()} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <CrmV2Button size="sm" variant="gold" icon={<Phone size={12} />} onClick={() => onCall(e)}>Appel</CrmV2Button>
                        {onMail && <CrmV2Button size="sm" icon={<Mail size={12} />} onClick={() => onMail(e)}>Mail</CrmV2Button>}
                        {e.source_url ? (
                          <a href={e.source_url} target="_blank" rel="noreferrer" title={e.source_url} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                            border: `1px solid ${crmV2.borderStrong}`, color: crmV2.link, textDecoration: 'none', whiteSpace: 'nowrap', background: crmV2.bg,
                          }}>Source <ExternalLink size={11} /></a>
                        ) : null}
                        {rowActions(e)}
                      </span>
                    </CrmV2Td>
                  </CrmV2Tr>
                )
              })}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>
    </div>
  )
}
