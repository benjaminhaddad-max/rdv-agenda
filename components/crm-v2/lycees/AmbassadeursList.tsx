'use client'

/**
 * Ambassadeurs : nos élèves de l'année rattachés à leur ancien lycée, avec
 * leurs signaux Diploma Lab (assiduité, réussite, examens, humeur analysée).
 * Liste « appelable » comme des leads : on appelle les élèves motivés et
 * contents pour qu'ils parlent de nous à leur ancien lycée.
 */

import { useMemo, useState } from 'react'
import { Phone } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Empty, CrmV2Pagination, CrmV2Search, CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { AdminMobileList, AdminMobileRow, AdminNotice, AdminPillSelect } from '@/components/crm-v2/admin/AdminUi'
import { AMB_LABELS, AMB_STATUSES, DEPARTMENTS, lookup, normalizeName, type AmbassadeurRow, type LyceeRow } from '@/lib/lycees'
import { Dept, LastCallCell, NextCallCell, parisTodayKey, UserChip, type TeamUser } from './ui'

export type AmbassadeurItem = AmbassadeurRow & {
  lycee: Pick<LyceeRow, 'uai' | 'name' | 'city' | 'department' | 'assigned_to' | 'status' | 'priority'> | null
}

type View = 'a_appeler' | 'rappels' | 'mes' | 'ok' | 'mecontents' | 'tous'
const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: 'a_appeler', label: 'À appeler', hint: 'Top ambassadeurs et bons profils pas encore appelés' },
  { id: 'rappels', label: 'À rappeler', hint: 'Rappel prévu aujourd’hui ou en retard' },
  { id: 'mes', label: 'Mes élèves', hint: 'Attribués à moi (ou leur lycée)' },
  { id: 'ok', label: 'OK, en parlent', hint: 'Ont accepté de parler de nous à leur lycée' },
  { id: 'mecontents', label: 'Mécontents', hint: 'Humeur négative ou plaintes : à ne pas solliciter' },
  { id: 'tous', label: 'Tous', hint: '' },
]

const FORMATION_GROUPS: { id: string; label: string; re: RegExp }[] = [
  { id: 'pass', label: 'PASS', re: /\bPASS\b/i },
  { id: 'las', label: 'LAS / LSPS', re: /\bLAS\b|LSPS/i },
  { id: 'paes', label: 'PAES FR/EU', re: /PAES/i },
  { id: 'term', label: 'Terminale Santé', re: /Terminale/i },
  { id: 'prem', label: 'Première', re: /Premi[eè]re/i },
]

const moodColor = { positif: '#16a34a', neutre: '#7c98b6', negatif: '#d13a41' } as const

function daysAgo(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - Date.parse(iso)) / 86400_000)
}

export default function AmbassadeursList({
  items, users, me, isManager, missingMigration, onOpenLycee, onCall, onBulk,
}: {
  items: AmbassadeurItem[]
  users: TeamUser[]
  me: string | null
  isManager: boolean
  missingMigration: boolean
  onOpenLycee: (uai: string) => void
  onCall: (a: AmbassadeurItem) => void
  onBulk: (ids: string[], patch: Record<string, unknown>) => Promise<void>
}) {
  const isMobile = useIsMobile()
  const today = parisTodayKey()
  const [view, setView] = useState<View>('a_appeler')
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [formation, setFormation] = useState('')
  const [label, setLabel] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])

  const base = useMemo(() => {
    const n = normalizeName(q)
    const fg = FORMATION_GROUPS.find(f => f.id === formation)
    return items.filter(a => {
      if (n) {
        const hay = normalizeName(`${a.first_name ?? ''} ${a.last_name ?? ''} ${a.lycee?.name ?? a.school_name ?? ''} ${a.lycee?.city ?? ''}`)
        if (!n.split(' ').every(p => hay.includes(p))) return false
      }
      if (dept && a.lycee?.department !== dept) return false
      if (fg && !fg.re.test(a.formation ?? '')) return false
      if (label && a.label !== label) return false
      return true
    })
  }, [items, q, dept, formation, label])

  const who = (a: AmbassadeurItem) => a.assigned_to ?? a.lycee?.assigned_to ?? null
  const inView = (a: AmbassadeurItem, v: View) => {
    switch (v) {
      case 'a_appeler': return a.status === 'a_appeler' && (a.label === 'top' || a.label === 'bon')
      case 'rappels': return !!a.next_action_at && a.next_action_at <= today
      case 'mes': return who(a) === me
      case 'ok': return a.status === 'ok'
      case 'mecontents': return a.label === 'mecontent'
      default: return true
    }
  }
  const list = useMemo(() => base.filter(a => inView(a, view)).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [base, view, today, me])
  const pageSize = 50
  const pageItems = list.slice((page - 1) * pageSize, page * pageSize)

  if (missingMigration) {
    return <AdminNotice tone="warning">Il faut lancer la migration <b>supabase-migration-crm-v61-lycee-ambassadeurs.sql</b> dans Supabase pour afficher les ambassadeurs.</AdminNotice>
  }

  const viewPills = (
    <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {VIEWS.map(v => {
        const on = view === v.id
        const n = base.filter(a => inView(a, v.id)).length
        return (
          <button key={v.id} type="button" title={v.hint} onClick={() => { setView(v.id); setPage(1); setSelected(new Set()) }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontFamily: 'inherit', fontSize: 13,
            fontWeight: on ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            border: `1px solid ${on ? crmV2.primary : crmV2.borderStrong}`, background: on ? crmV2.primary : crmV2.bg, color: on ? '#fff' : crmV2.text,
          }}>
            {v.label}<span style={{ fontSize: 11.5, fontWeight: 700, color: on ? 'rgba(255,255,255,0.8)' : crmV2.textFaint }}>{n}</span>
          </button>
        )
      })}
    </div>
  )

  const toolbar = (
    <>
      <CrmV2Search value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Élève, lycée, ville…" style={{ flex: isMobile ? '1 1 100%' : '0 1 240px' }} />
      <AdminPillSelect value={dept} onChange={e => { setDept(e.target.value); setPage(1) }}>
        <option value="">Départements</option>
        {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
      </AdminPillSelect>
      <AdminPillSelect value={formation} onChange={e => { setFormation(e.target.value); setPage(1) }}>
        <option value="">Toutes formations</option>
        {FORMATION_GROUPS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </AdminPillSelect>
      <AdminPillSelect value={label} onChange={e => { setLabel(e.target.value); setPage(1) }}>
        <option value="">Tous profils</option>
        {AMB_LABELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
      </AdminPillSelect>
    </>
  )

  const bulkBar = isManager && selected.size > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: crmV2.goldSoft, borderBottom: `1px solid ${crmV2.goldBorder}`, fontSize: 13 }}>
      <b>{selected.size} élève(s)</b>
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
        <option value="">Statut…</option>
        {AMB_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </AdminPillSelect>
      <CrmV2Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Désélectionner</CrmV2Button>
    </div>
  )

  const name = (a: AmbassadeurItem) => [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Élève'
  const labelPill = (a: AmbassadeurItem) => {
    const l = lookup(AMB_LABELS, a.label)
    return l ? <CrmV2StatusPill label={`${l.label}${a.score != null ? ` · ${a.score}` : ''}`} color={l.color} dot={false} /> : null
  }
  const signals = (a: AmbassadeurItem) => {
    const d = daysAgo(a.last_seen_at)
    return (
      <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.45 }}>
        <div><b style={{ color: crmV2.text }}>{a.series_count ?? 0}</b> séries{a.success_pct != null ? <> · <b style={{ color: crmV2.text }}>{Math.round(a.success_pct)} %</b> réussite</> : null}{a.exam_avg != null ? <> · exam <b style={{ color: crmV2.text }}>{a.exam_avg}/20</b></> : null}</div>
        <div>
          {d == null ? 'Jamais connecté' : d === 0 ? 'Connecté aujourd’hui' : `Vu il y a ${d} j`}
          {a.coach_messages ? ` · ${a.coach_messages} msg coach` : ''}
          {a.tickets_problems ? <span style={{ color: '#d13a41' }}>{` · ${a.tickets_problems} plainte(s)`}</span> : a.tickets_count ? ` · ${a.tickets_count} ticket(s)` : ''}
        </div>
      </div>
    )
  }
  const mood = (a: AmbassadeurItem) => a.mood ? (
    <div style={{ maxWidth: 280 }} title={a.mood_summary ?? undefined}>
      <CrmV2StatusPill label={a.mood === 'positif' ? 'Content' : a.mood === 'negatif' ? 'Mécontent' : 'Neutre'} color={moodColor[a.mood]} />
      {a.mood_summary && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.mood_summary}</div>}
    </div>
  ) : <span style={{ fontSize: 12, color: crmV2.textFaint }}>Pas d’échanges</span>
  const lyceeCell = (a: AmbassadeurItem) => (
    <div style={{ minWidth: 0 }}>
      {a.lycee ? (
        <button type="button" onClick={ev => { ev.stopPropagation(); onOpenLycee(a.lycee!.uai) }} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: crmV2.link, textAlign: 'left',
        }}>{a.lycee.name}</button>
      ) : <span>{a.school_name}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: crmV2.textFaint }}><Dept d={a.lycee?.department ?? null} />{a.lycee?.city ?? a.school_city}</div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {viewPills}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{toolbar}</div>
        {!list.length ? <CrmV2Empty title="Aucun élève" description="Rien dans cette vue." /> : (
          <AdminMobileList>
            {pageItems.map((a, i) => (
              <AdminMobileRow key={a.id} last={i === pageItems.length - 1} onClick={() => onCall(a)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{name(a)} <span style={{ fontWeight: 500, color: crmV2.textMuted, fontSize: 12 }}>· {a.formation}</span></div>
                  {lyceeCell(a)}
                  <div style={{ marginTop: 4 }}>{labelPill(a)}</div>
                  {signals(a)}
                </div>
                <span style={{ width: 38, height: 38, borderRadius: 999, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Phone size={16} /></span>
              </AdminMobileRow>
            ))}
          </AdminMobileList>
        )}
      </div>
    )
  }

  const allOnPage = pageItems.length > 0 && pageItems.every(a => selected.has(a.id))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>
        Élèves Diploma 2026-27 venant d’un lycée d’Île-de-France. Profil calculé avec Diploma Lab : assiduité (séries de QCM, connexions),
        niveau (réussite, examens blancs) et humeur (analyse de leurs messages au coach, tickets et notes des coachs).
      </div>
      {viewPills}
      <CrmV2TableCard toolbar={toolbar} footer={<><span>{list.length} élève(s)</span><CrmV2Pagination page={page} pageSize={pageSize} total={list.length} onChange={setPage} /></>}
        scrollStyle={{ maxHeight: 'calc(100vh - 360px)', minHeight: 300 }}>
        {bulkBar}
        {!list.length ? <CrmV2Empty title="Aucun élève" description="Rien dans cette vue." /> : (
          <CrmV2Table>
            <thead>
              <tr>
                {isManager && (
                  <CrmV2Th style={{ width: 36, paddingRight: 0 }}>
                    <input type="checkbox" checked={allOnPage} onChange={() => setSelected(s => {
                      const n = new Set(s)
                      if (allOnPage) pageItems.forEach(a => n.delete(a.id))
                      else pageItems.forEach(a => n.add(a.id))
                      return n
                    })} />
                  </CrmV2Th>
                )}
                <CrmV2Th>Élève</CrmV2Th>
                <CrmV2Th>Ancien lycée</CrmV2Th>
                <CrmV2Th>Profil</CrmV2Th>
                <CrmV2Th>Diploma Lab</CrmV2Th>
                <CrmV2Th>Humeur</CrmV2Th>
                <CrmV2Th>Statut</CrmV2Th>
                <CrmV2Th>Dernier appel</CrmV2Th>
                <CrmV2Th>Rappel</CrmV2Th>
                <CrmV2Th style={{ width: 90 }}> </CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(a => {
                const st = lookup(AMB_STATUSES, a.status)
                const assignee = usersById.get(who(a) ?? '')
                return (
                  <CrmV2Tr key={a.id} onClick={() => onCall(a)}>
                    {isManager && (
                      <CrmV2Td style={{ paddingRight: 0 }}>
                        <span onClick={ev => ev.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(a.id)} onChange={() => setSelected(s => {
                            const n = new Set(s)
                            if (n.has(a.id)) n.delete(a.id)
                            else n.add(a.id)
                            return n
                          })} />
                        </span>
                      </CrmV2Td>
                    )}
                    <CrmV2Td style={{ maxWidth: 220 }}>
                      <div style={{ fontWeight: 700 }}>{name(a)}</div>
                      <div style={{ fontSize: 11.5, color: crmV2.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.formation}</div>
                      {a.phone && <div style={{ fontSize: 12, color: crmV2.link, fontWeight: 600 }}>{a.phone}</div>}
                    </CrmV2Td>
                    <CrmV2Td style={{ maxWidth: 240 }}>{lyceeCell(a)}</CrmV2Td>
                    <CrmV2Td>{labelPill(a)}</CrmV2Td>
                    <CrmV2Td>{signals(a)}</CrmV2Td>
                    <CrmV2Td>{mood(a)}</CrmV2Td>
                    <CrmV2Td>
                      {st && <CrmV2StatusPill label={st.label} color={st.color} />}
                      {assignee && <div style={{ marginTop: 3 }}><UserChip user={assignee} /></div>}
                    </CrmV2Td>
                    <CrmV2Td><LastCallCell at={a.last_contact_at} outcome={a.last_outcome} note={a.last_note} count={a.calls_count || 0} /></CrmV2Td>
                    <CrmV2Td><NextCallCell date={a.next_action_at} today={today} /></CrmV2Td>
                    <CrmV2Td>
                      <span onClick={ev => ev.stopPropagation()}>
                        <CrmV2Button size="sm" variant="gold" icon={<Phone size={12} />} onClick={() => onCall(a)}>Appel</CrmV2Button>
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
