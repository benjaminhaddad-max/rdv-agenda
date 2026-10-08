'use client'

/**
 * Tableau des lycées (onglet « Lycées »), traité comme une liste de leads :
 * vues rapides (à rappeler, jamais appelés, à recaler…), dernier appel avec la
 * remarque, prochain rappel, bouton « Appel », attribution groupée.
 */

import { useMemo, useState, type CSSProperties } from 'react'
import { Download, Phone, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Pagination, CrmV2Search, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr, CrmV2Empty,
} from '@/components/crm-v2/primitives'
import { AdminMobileList, AdminMobileRow, AdminPillSelect } from '@/components/crm-v2/admin/AdminUi'
import {
  DEPARTMENTS, LYCEE_MODES, LYCEE_PRIORITIES, LYCEE_STATUSES, SECTEUR_LABELS, normalizeName, lookup,
  type LyceeListItem,
} from '@/lib/lycees'
import {
  Dept, fmtDate, KindPill, LastCallCell, ModePill, NextCallCell, parisTodayKey, PriorityPill, ScorePill, StatusPill, UserChip, type TeamUser,
} from './ui'

export type LyceeFilters = {
  q: string
  dept: string
  status: string
  priority: string
  assignee: string
  mode: string
  voie: string
  secteur: string
  /** Vue rapide (pilules au-dessus du tableau) */
  quick: LyceeView
}

export type LyceeView = '' | 'a_traiter' | 'rappels' | 'jamais' | 'recaler' | 'prioritaires' | 'obtenus'

export const LYCEE_VIEWS: { id: LyceeView; label: string; managerOnly?: boolean; hint: string }[] = [
  { id: 'a_traiter', label: 'À traiter', hint: 'Ni obtenu, ni refus, ni hors cible' },
  { id: 'rappels', label: 'À rappeler', hint: 'Rappel prévu aujourd’hui ou en retard' },
  { id: 'jamais', label: 'Jamais appelés', hint: 'Aucun appel noté' },
  { id: 'recaler', label: 'À recaler', hint: 'Forum ou inter l’an dernier, rien de calé cette année' },
  { id: 'prioritaires', label: 'Prioritaires non attribués', managerOnly: true, hint: 'Très importants / importants / score ≥ 65, sans personne' },
  { id: 'obtenus', label: 'Obtenus', hint: 'Forum, conférence ou intervention obtenu(e)' },
  { id: '', label: 'Tous', hint: '' },
]

export function matchLyceeView(l: LyceeListItem, v: LyceeView, today: string): boolean {
  const open = l.status !== 'obtenu' && l.status !== 'refus' && l.status !== 'non_cible'
  switch (v) {
    case 'a_traiter': return open
    case 'rappels': return !!l.next_action_at && l.next_action_at <= today
    case 'jamais': return !l.calls_count && !l.last_contact_at && open
    case 'recaler': return l.had_previous_season && !l.current_season_events && open
    case 'prioritaires': return !l.assigned_to && open && (l.priority === 'tres_important' || l.priority === 'important' || l.score >= 65)
    case 'obtenus': return l.status === 'obtenu'
    default: return true
  }
}

export const EMPTY_FILTERS: LyceeFilters = {
  q: '', dept: '', status: '', priority: '', assignee: '', mode: '', voie: '', secteur: '', quick: '',
}

type SortKey = 'score' | 'name' | 'next' | 'last' | 'rappel'

export function applyLyceeFilters(items: LyceeListItem[], f: LyceeFilters, me: string | null, today: string): LyceeListItem[] {
  const q = normalizeName(f.q)
  const parts = q ? q.split(' ') : []
  return items.filter(l => {
    if (parts.length) {
      const hay = normalizeName(`${l.name} ${l.city ?? ''} ${l.uai} ${l.department ?? ''}`)
      if (!parts.every(p => hay.includes(p))) return false
    }
    if (f.dept && l.department !== f.dept) return false
    if (f.status && l.status !== f.status) return false
    if (f.priority === 'none' ? !!l.priority : f.priority && l.priority !== f.priority) return false
    if (f.assignee === 'me' ? l.assigned_to !== me : f.assignee === 'none' ? !!l.assigned_to : f.assignee && l.assigned_to !== f.assignee) return false
    if (f.mode === 'none' ? !!l.mode : f.mode && l.mode !== f.mode) return false
    if (f.voie === 'gen' && l.voie_generale === false) return false
    if (f.voie === 'pro' && l.voie_generale !== false) return false
    if (f.secteur && l.secteur !== f.secteur) return false
    return matchLyceeView(l, f.quick, today)
  })
}

export default function LyceesTable({
  items, viewBase, allCount, filters, setFilters, users, isManager, onOpen, onCall, onBulk,
}: {
  /** Lycées filtrés hors vue rapide (pour les compteurs des pilules) */
  viewBase: LyceeListItem[]
  items: LyceeListItem[]
  allCount: number
  filters: LyceeFilters
  setFilters: (f: LyceeFilters) => void
  users: TeamUser[]
  isManager: boolean
  onOpen: (uai: string) => void
  onCall: (l: LyceeListItem) => void
  onBulk: (uais: string[], patch: Record<string, unknown>) => Promise<void>
}) {
  const isMobile = useIsMobile()
  const today = parisTodayKey()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const pageSize = 50
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])

  const sorted = useMemo(() => {
    const v = (l: LyceeListItem): number | string => {
      switch (sort.key) {
        case 'name': return normalizeName(l.name)
        case 'next': return l.next_event?.date ?? (sort.dir === 1 ? '9999' : '0000')
        case 'last': return l.last_contact_at ?? ''
        case 'rappel': return l.next_action_at ?? (sort.dir === 1 ? '9999' : '0000')
        default: return l.score
      }
    }
    return [...items].sort((a, b) => {
      const x = v(a), y = v(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [items, sort])

  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize)
  const set = (patch: Partial<LyceeFilters>) => { setFilters({ ...filters, ...patch }); setPage(1) }
  const th = (key: SortKey, label: string, style?: CSSProperties) => (
    <CrmV2Th style={style} sorted={sort.key === key ? (sort.dir === 1 ? 'asc' : 'desc') : false}
      onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : (key === 'name' || key === 'next' || key === 'rappel' ? 1 : -1) }))}>
      {label}
    </CrmV2Th>
  )
  const toggle = (uai: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(uai)) n.delete(uai)
    else n.add(uai)
    return n
  })
  const allOnPage = pageItems.length > 0 && pageItems.every(l => selected.has(l.uai))
  const activeFilters = Object.entries(filters).filter(([, v]) => v).length

  const exportCsv = () => {
    const cols = ['UAI', 'Lycée', 'Ville', 'Dépt', 'Score', 'Priorité', 'Statut', 'Mode', 'Attribué à', 'Téléphone', 'Mail', 'Dernier appel', 'Résultat', 'Remarque', 'Rappel', 'Prochain événement']
    const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const lines = sorted.map(l => [
      l.uai, l.name, l.city, l.department, l.score, lookup(LYCEE_PRIORITIES, l.priority)?.label, lookup(LYCEE_STATUSES, l.status)?.label,
      lookup(LYCEE_MODES, l.mode)?.short, usersById.get(l.assigned_to ?? '')?.name, l.phone, l.email,
      l.last_contact_at?.slice(0, 10), l.last_outcome, l.last_note, l.next_action_at, l.next_event?.date,
    ].map(esc).join(';'))
    const blob = new Blob(['﻿' + [cols.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lycees-${today}.csv`
    a.click()
  }

  const toolbar = (
    <>
      <CrmV2Search value={filters.q} onChange={e => set({ q: e.target.value })} placeholder="Lycée, ville, UAI…" style={{ flex: isMobile ? '1 1 100%' : '0 1 260px' }} />
      <AdminPillSelect value={filters.dept} onChange={e => set({ dept: e.target.value })}>
        <option value="">Départements</option>
        {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
      </AdminPillSelect>
      <AdminPillSelect value={filters.status} onChange={e => set({ status: e.target.value })}>
        <option value="">Statuts</option>
        {LYCEE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </AdminPillSelect>
      <AdminPillSelect value={filters.priority} onChange={e => set({ priority: e.target.value })}>
        <option value="">Priorités</option>
        {LYCEE_PRIORITIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        <option value="none">Non définie</option>
      </AdminPillSelect>
      {isManager && (
        <AdminPillSelect value={filters.assignee} onChange={e => set({ assignee: e.target.value })}>
          <option value="">Attribution</option>
          <option value="me">Mes lycées</option>
          <option value="none">Non attribués</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </AdminPillSelect>
      )}
      <AdminPillSelect value={filters.mode} onChange={e => set({ mode: e.target.value })}>
        <option value="">Mode</option>
        {LYCEE_MODES.map(m => <option key={m.id} value={m.id}>{m.short}</option>)}
        <option value="none">À définir</option>
      </AdminPillSelect>
      <AdminPillSelect value={filters.voie} onChange={e => set({ voie: e.target.value })}>
        <option value="">Toutes voies</option>
        <option value="gen">Général & techno</option>
        <option value="pro">Professionnel</option>
      </AdminPillSelect>
      <AdminPillSelect value={filters.secteur} onChange={e => set({ secteur: e.target.value })}>
        <option value="">Public & privé</option>
        {Object.entries(SECTEUR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </AdminPillSelect>
      {activeFilters > 0 && (
        <CrmV2Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => set(EMPTY_FILTERS)}>Effacer</CrmV2Button>
      )}
      <span style={{ flex: 1 }} />
      {!isMobile && <CrmV2Button size="sm" icon={<Download size={13} />} onClick={exportCsv}>Export</CrmV2Button>}
    </>
  )

  const bulkBar = isManager && selected.size > 0 && (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: crmV2.goldSoft,
      borderBottom: `1px solid ${crmV2.goldBorder}`, fontSize: 13,
    }}>
      <b>{selected.size} lycée(s) sélectionné(s)</b>
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
        await onBulk([...selected], { status: e.target.value })
        setSelected(new Set())
      }}>
        <option value="">Changer le statut…</option>
        {LYCEE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </AdminPillSelect>
      <AdminPillSelect value="" onChange={async e => {
        if (!e.target.value) return
        await onBulk([...selected], { priority: e.target.value === '__none' ? null : e.target.value })
        setSelected(new Set())
      }}>
        <option value="">Priorité…</option>
        {LYCEE_PRIORITIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        <option value="__none">Non définie</option>
      </AdminPillSelect>
      <AdminPillSelect value="" onChange={async e => {
        if (!e.target.value) return
        await onBulk([...selected], { mode: e.target.value === '__none' ? null : e.target.value })
        setSelected(new Set())
      }}>
        <option value="">Mode…</option>
        {LYCEE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        <option value="__none">À définir</option>
      </AdminPillSelect>
      <CrmV2Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Désélectionner</CrmV2Button>
      {sorted.length > selected.size && (
        <CrmV2Button size="sm" variant="ghost" onClick={() => setSelected(new Set(sorted.map(l => l.uai)))}>
          Tout sélectionner ({sorted.length})
        </CrmV2Button>
      )}
    </div>
  )

  const views = LYCEE_VIEWS.filter(v => isManager || !v.managerOnly)
  const viewPills = (
    <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {views.map(v => {
        const on = filters.quick === v.id
        const n = viewBase.filter(l => matchLyceeView(l, v.id, today)).length
        return (
          <button key={v.id || 'tous'} type="button" title={v.hint} onClick={() => set({ quick: v.id })} style={{
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

  const footer = (
    <>
      <span>{items.length !== allCount ? `${items.length.toLocaleString('fr-FR')} lycées filtrés sur ${allCount.toLocaleString('fr-FR')}` : null}</span>
      <CrmV2Pagination page={page} pageSize={pageSize} total={sorted.length} onChange={setPage} />
    </>
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {viewPills}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{toolbar}</div>
        {!sorted.length ? <CrmV2Empty title="Aucun lycée" description="Change les filtres." /> : (
          <AdminMobileList>
            {pageItems.map((l, i) => (
              <AdminMobileRow key={l.uai} onClick={() => onOpen(l.uai)} last={i === pageItems.length - 1}>
                <ScorePill score={l.score} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted, marginTop: 2, flexWrap: 'wrap' }}>
                    <Dept d={l.department} /> {l.city} <StatusPill status={l.status} />
                  </div>
                  {(l.last_note || l.next_action_at) && (
                    <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 3 }}>
                      <NextCallCell date={l.next_action_at} today={today} /> {l.last_note}
                    </div>
                  )}
                </div>
                <span onClick={e => { e.stopPropagation(); onCall(l) }} style={{
                  width: 38, height: 38, borderRadius: 999, background: crmV2.goldSoft, color: crmV2.goldDark,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}><Phone size={16} /></span>
              </AdminMobileRow>
            ))}
          </AdminMobileList>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: crmV2.textMuted, flexWrap: 'wrap', gap: 8 }}>{footer}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {viewPills}
    <CrmV2TableCard toolbar={toolbar} footer={footer} scrollStyle={{ maxHeight: 'calc(100vh - 330px)', minHeight: 300 }}>
      {bulkBar}
      {!sorted.length ? <CrmV2Empty title="Aucun lycée" description="Aucun lycée ne correspond à ces filtres." /> : (
        <CrmV2Table>
          <thead>
            <tr>
              {isManager && (
                <CrmV2Th style={{ width: 36, paddingRight: 0 }}>
                  <input type="checkbox" checked={allOnPage} onChange={() => setSelected(s => {
                    const n = new Set(s)
                    if (allOnPage) pageItems.forEach(l => n.delete(l.uai))
                    else pageItems.forEach(l => n.add(l.uai))
                    return n
                  })} />
                </CrmV2Th>
              )}
              {th('name', 'Lycée')}
              {th('score', 'Score')}
              <CrmV2Th>Priorité</CrmV2Th>
              <CrmV2Th>Statut</CrmV2Th>
              <CrmV2Th>Mode</CrmV2Th>
              {isManager && <CrmV2Th>Attribué à</CrmV2Th>}
              {th('last', 'Dernier appel')}
              {th('rappel', 'Rappel')}
              {th('next', 'Forum 26-27')}
              <CrmV2Th style={{ width: 90 }}> </CrmV2Th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(l => {
              return (
                <CrmV2Tr key={l.uai} onClick={() => onOpen(l.uai)}>
                  {isManager && (
                    <CrmV2Td style={{ paddingRight: 0 }}>
                      <span onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(l.uai)} onChange={() => toggle(l.uai)} />
                      </span>
                    </CrmV2Td>
                  )}
                  <CrmV2Td style={{ maxWidth: 300 }}>
                    <div style={{ fontWeight: 700, color: crmV2.link, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: crmV2.textFaint, marginTop: 1 }}>
                      <Dept d={l.department} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.city}{l.secteur !== 'public' ? ' · privé' : ''}{l.voie_generale === false ? ' · pro' : ''}
                        {l.past_events ? ` · ${l.past_events} déjà fait(s)${l.past_leads ? `, ${l.past_leads} leads` : ''}` : ''}
                        {l.inscrits_2526 ? <b style={{ color: crmV2.goldDark }}>{` · ${l.inscrits_2526} inscrit${l.inscrits_2526 > 1 ? 's' : ''} 25-26`}</b> : null}
                        {l.eleves_2627 ? <b style={{ color: '#16a34a' }}>{` · ${l.eleves_2627} élève${l.eleves_2627 > 1 ? 's' : ''} 26-27${l.ambassadeurs_bons ? ` (${l.ambassadeurs_bons} ambassadeur${l.ambassadeurs_bons > 1 ? 's' : ''})` : ''}`}</b> : null}
                      </span>
                    </div>
                  </CrmV2Td>
                  <CrmV2Td><ScorePill score={l.score} /></CrmV2Td>
                  <CrmV2Td><PriorityPill priority={l.priority} /></CrmV2Td>
                  <CrmV2Td><StatusPill status={l.status} /></CrmV2Td>
                  <CrmV2Td><ModePill mode={l.mode} /></CrmV2Td>
                  {isManager && <CrmV2Td style={{ maxWidth: 150 }}><UserChip user={usersById.get(l.assigned_to ?? '')} /></CrmV2Td>}
                  <CrmV2Td><LastCallCell at={l.last_contact_at} outcome={l.last_outcome} note={l.last_note} count={l.calls_count || 0} /></CrmV2Td>
                  <CrmV2Td><NextCallCell date={l.next_action_at} today={today} /></CrmV2Td>
                  <CrmV2Td>
                    {l.next_event ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <KindPill kind={l.next_event.kind} />
                        <span style={{ fontWeight: 700, fontStyle: l.next_event.date_confirmed ? 'normal' : 'italic' }}>{fmtDate(l.next_event.date)}</span>
                      </span>
                    ) : l.had_previous_season ? (
                      <span style={{ color: '#e8833a', fontWeight: 700, fontSize: 12 }}>À recaler</span>
                    ) : <span style={{ color: crmV2.textFaint }}>—</span>}
                  </CrmV2Td>
                  <CrmV2Td>
                    <span onClick={e => e.stopPropagation()}>
                      <CrmV2Button size="sm" variant="gold" icon={<Phone size={12} />} onClick={() => onCall(l)}>Appel</CrmV2Button>
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
