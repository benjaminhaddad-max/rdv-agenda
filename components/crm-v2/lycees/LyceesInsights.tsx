'use client'

/**
 * Vues de pilotage de l'onglet Lycées :
 *  - « À ne pas louper » : forums détectés à vérifier, forums proches sans
 *    intervenant, forums de l'an dernier à recaler, relances en retard,
 *    lycées prioritaires non attribués ;
 *  - « Flying » : classement des lycées par leads récupérés par session ;
 *  - « Équipe » : avancement par personne.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarClock, Radar, RotateCcw, UserPlus, Users } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Empty, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr, hexA,
} from '@/components/crm-v2/primitives'
import { AdminPillSelect, AdminProgress } from '@/components/crm-v2/admin/AdminUi'
import { DEPARTMENTS, type LyceeListItem } from '@/lib/lycees'
import {
  type AgendaEvent, Dept, fmtDate, KindPill, parisTodayKey, PriorityPill, relDays, ScorePill, StatusPill, UserChip, type TeamUser,
} from './ui'

// ── À ne pas louper ─────────────────────────────────────────────────────────

function AlertGroup({ icon, color, title, hint, count, children }: {
  icon: ReactNode
  color: string
  title: string
  hint: string
  count: number
  children: ReactNode
}) {
  const [all, setAll] = useState(false)
  return (
    <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: count ? `1px solid ${crmV2.borderLight}` : 'none' }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: hexA(color, 0.12), color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title} <span style={{ color, marginLeft: 4 }}>{count}</span></div>
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>{hint}</div>
        </div>
      </div>
      {count > 0 && (
        <div style={{ maxHeight: all ? 'none' : 330, overflow: 'hidden' }}>{children}</div>
      )}
      {count > 6 && (
        <div style={{ padding: '6px 14px', borderTop: `1px solid ${crmV2.borderLight}` }}>
          <CrmV2Button size="sm" variant="ghost" onClick={() => setAll(a => !a)}>{all ? 'Réduire' : `Tout voir (${count})`}</CrmV2Button>
        </div>
      )}
    </div>
  )
}

function Row({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', borderBottom: `1px solid ${crmV2.borderLight}`,
      background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left', color: crmV2.text, minWidth: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = crmV2.rowHover }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >{children}</button>
  )
}

const nameCell = (name: string, city: string | null, dept: string | null) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
    <Dept d={dept} />
    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    {city && <span style={{ color: crmV2.textFaint, fontSize: 12, whiteSpace: 'nowrap' }}>{city}</span>}
  </span>
)

export function AlertsTab({ lycees, events, users, isManager, onOpenLycee, onEditEvent }: {
  lycees: LyceeListItem[]
  events: AgendaEvent[]
  users: TeamUser[]
  isManager: boolean
  onOpenLycee: (uai: string) => void
  onEditEvent: (e: AgendaEvent) => void
}) {
  const isMobile = useIsMobile()
  const today = parisTodayKey()
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const in21 = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + 21)).toISOString().slice(0, 10)

  const detected = events.filter(e => e.status === 'detecte' && (!e.date || e.date >= today))
  const soonNoOne = events.filter(e => e.kind !== 'flying' && e.date && e.date >= today && e.date <= in21
    && ['a_confirmer', 'confirme'].includes(e.status) && !e.intervenants)
  const toReschedule = lycees.filter(l => l.had_previous_season && !l.current_season_events && l.status !== 'refus' && l.status !== 'non_cible')
    .sort((a, b) => b.score - a.score)
  const late = lycees.filter(l => l.next_action_at && l.next_action_at < today).sort((a, b) => (a.next_action_at || '').localeCompare(b.next_action_at || ''))
  const unassigned = isManager
    ? lycees.filter(l => !l.assigned_to && (l.priority === 'tres_important' || l.priority === 'important' || l.score >= 65) && l.status !== 'refus' && l.status !== 'non_cible')
      .sort((a, b) => b.score - a.score)
    : []

  const evRow = (e: AgendaEvent) => (
    <Row key={e.id} onClick={() => (e.lycee ? onOpenLycee(e.lycee.uai) : onEditEvent(e))}>
      <span style={{ width: 70, fontWeight: 700, flexShrink: 0, fontStyle: e.date_confirmed ? 'normal' : 'italic' }}>{fmtDate(e.date)}</span>
      {nameCell(e.lycee?.name ?? e.title ?? 'Forum', e.lycee?.city ?? e.location, e.lycee?.department ?? null)}
      <KindPill kind={e.kind} />
      {!isMobile && e.date && <span style={{ fontSize: 12, color: crmV2.textFaint, whiteSpace: 'nowrap' }}>{relDays(today, e.date)}</span>}
    </Row>
  )
  const lyRow = (l: LyceeListItem, right: ReactNode) => (
    <Row key={l.uai} onClick={() => onOpenLycee(l.uai)}>
      <ScorePill score={l.score} />
      {nameCell(l.name, l.city, l.department)}
      {right}
    </Row>
  )

  const total = detected.length + soonNoOne.length + toReschedule.length + late.length + unassigned.length
  if (!total) return <CrmV2Empty icon={<Radar size={26} />} title="Rien en retard" description="Aucun forum à vérifier, aucune relance en retard. 👌" />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(460px, 1fr))', gap: 12, alignItems: 'start' }}>
      <AlertGroup icon={<Radar size={15} />} color="#e8833a" title="Forums détectés à vérifier" count={detected.length}
        hint="Trouvés par la veille web : vérifie la source, puis valide ou masque.">
        {detected.map(evRow)}
      </AlertGroup>
      <AlertGroup icon={<Users size={15} />} color="#d13a41" title="Forums dans les 3 semaines sans intervenant" count={soonNoOne.length}
        hint="Il faut envoyer quelqu’un : renseigne l’intervenant dans le forum.">
        {soonNoOne.map(evRow)}
      </AlertGroup>
      <AlertGroup icon={<RotateCcw size={15} />} color="#0091ae" title="Forum ou inter l’an dernier, rien de calé cette année" count={toReschedule.length}
        hint="Ces lycées nous ont déjà ouvert la porte en 2025-2026 : appeler pour recaler la date.">
        {toReschedule.map(l => lyRow(l, <UserChip user={usersById.get(l.assigned_to ?? '')} />))}
      </AlertGroup>
      <AlertGroup icon={<CalendarClock size={15} />} color="#b8963e" title="Relances en retard" count={late.length}
        hint="La date de prochaine action est passée.">
        {late.map(l => lyRow(l, <span style={{ fontSize: 12, color: crmV2.danger, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtDate(l.next_action_at)} · {relDays(today, l.next_action_at)}</span>))}
      </AlertGroup>
      {isManager && (
        <AlertGroup icon={<UserPlus size={15} />} color="#7e22ce" title="Lycées prioritaires non attribués" count={unassigned.length}
          hint="Très importants, importants ou score ≥ 65 : à confier à quelqu’un de l’équipe.">
          {unassigned.map(l => lyRow(l, <PriorityPill priority={l.priority} empty="" />))}
        </AlertGroup>
      )}
    </div>
  )
}

// ── Flying ──────────────────────────────────────────────────────────────────

export function FlyingTab({ lycees, onOpenLycee }: { lycees: LyceeListItem[]; onOpenLycee: (uai: string) => void }) {
  const [dept, setDept] = useState('')
  const [top, setTop] = useState(20)
  const ranked = useMemo(() => lycees
    .filter(l => l.flying_per_session && (!dept || l.department === dept))
    .sort((a, b) => (b.flying_per_session ?? 0) - (a.flying_per_session ?? 0)), [lycees, dept])
  // Lycées jamais « flyés » mais à fort potentiel (beaucoup d'élèves en SVT, bon profil)
  const untested = useMemo(() => lycees
    .filter(l => !l.flying_sessions && l.voie_generale !== false && (l.eff_svt ?? 0) >= 60 && (!dept || l.department === dept))
    .sort((a, b) => (b.eff_svt ?? 0) - (a.eff_svt ?? 0)).slice(0, 15), [lycees, dept])
  const sel = ranked.slice(0, top)
  const expected = sel.reduce((s, l) => s + (l.flying_per_session ?? 0), 0)
  const avg = ranked.length ? Math.round(ranked.reduce((s, l) => s + (l.flying_per_session ?? 0), 0) / ranked.length) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <CrmV2KpiGrid>
        <CrmV2KpiCard label="Lycées déjà flyés" value={ranked.length} detail="historique 2021-2022" />
        <CrmV2KpiCard label="Leads / session (moy.)" value={avg} detail="devant un lycée" />
        <CrmV2KpiCard label={`Leads attendus · top ${top}`} value={expected} color="#16a34a" detail="1 session devant chacun" />
      </CrmV2KpiGrid>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <AdminPillSelect value={dept} onChange={e => setDept(e.target.value)}>
          <option value="">Tous départements</option>
          {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </AdminPillSelect>
        <AdminPillSelect value={String(top)} onChange={e => setTop(Number(e.target.value))}>
          {[10, 20, 30, 50].map(n => <option key={n} value={n}>Tournée des {n} meilleurs</option>)}
        </AdminPillSelect>
        <span style={{ fontSize: 12.5, color: crmV2.textMuted }}>
          Classement par leads récupérés par session de distribution (fichier « Distributions lycées »).
        </span>
      </div>
      <CrmV2TableCard>
        <CrmV2Table>
          <thead>
            <tr>
              <CrmV2Th style={{ width: 40 }}>#</CrmV2Th>
              <CrmV2Th>Lycée</CrmV2Th>
              <CrmV2Th>Leads / session</CrmV2Th>
              <CrmV2Th>Leads total</CrmV2Th>
              <CrmV2Th>Sessions</CrmV2Th>
              <CrmV2Th>Spé SVT</CrmV2Th>
              <CrmV2Th>Score</CrmV2Th>
              <CrmV2Th>Statut</CrmV2Th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((l, i) => (
              <CrmV2Tr key={l.uai} onClick={() => onOpenLycee(l.uai)} style={i < top ? { background: hexA('#16a34a', 0.035) } : undefined}>
                <CrmV2Td style={{ color: crmV2.textFaint, fontWeight: 700 }}>{i + 1}</CrmV2Td>
                <CrmV2Td>{nameCell(l.name, l.city, l.department)}</CrmV2Td>
                <CrmV2Td><AdminProgress pct={((l.flying_per_session ?? 0) / Math.max(1, ranked[0]?.flying_per_session ?? 1)) * 100} color="#16a34a" label={String(l.flying_per_session)} /></CrmV2Td>
                <CrmV2Td>{l.flying_leads_total ?? '—'}</CrmV2Td>
                <CrmV2Td>{l.flying_sessions ?? '—'}</CrmV2Td>
                <CrmV2Td>{l.eff_svt ?? '—'}</CrmV2Td>
                <CrmV2Td><ScorePill score={l.score} /></CrmV2Td>
                <CrmV2Td><StatusPill status={l.status} /></CrmV2Td>
              </CrmV2Tr>
            ))}
          </tbody>
        </CrmV2Table>
      </CrmV2TableCard>
      {untested.length > 0 && (
        <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${crmV2.borderLight}` }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Jamais testés en flying, gros vivier SVT</div>
            <div style={{ fontSize: 12, color: crmV2.textMuted }}>Lycées avec 60+ terminales en spé SVT sans historique de distribution : à tester.</div>
          </div>
          {untested.map(l => (
            <Row key={l.uai} onClick={() => onOpenLycee(l.uai)}>
              <ScorePill score={l.score} />
              {nameCell(l.name, l.city, l.department)}
              <span style={{ fontSize: 12.5, color: crmV2.textMuted, whiteSpace: 'nowrap' }}><b style={{ color: crmV2.text }}>{l.eff_svt}</b> en spé SVT</span>
            </Row>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Équipe ──────────────────────────────────────────────────────────────────

export function TeamTab({ lycees, events, users, onFilterAssignee }: {
  lycees: LyceeListItem[]
  events: AgendaEvent[]
  users: TeamUser[]
  onFilterAssignee: (id: string) => void
}) {
  const today = parisTodayKey()
  const rows = useMemo(() => {
    const ids = [...new Set(lycees.map(l => l.assigned_to).filter(Boolean))] as string[]
    return ids.map(id => {
      const mine = lycees.filter(l => l.assigned_to === id)
      const uais = new Set(mine.map(l => l.uai))
      return {
        user: users.find(u => u.id === id) ?? { id, name: 'Utilisateur inconnu', role: '' },
        total: mine.length,
        touched: mine.filter(l => l.status !== 'a_contacter').length,
        obtained: mine.filter(l => l.status === 'obtenu').length,
        refused: mine.filter(l => l.status === 'refus').length,
        late: mine.filter(l => l.next_action_at && l.next_action_at < today).length,
        upcoming: events.filter(e => e.uai && uais.has(e.uai) && e.date && e.date >= today && e.status !== 'annule').length,
      }
    }).sort((a, b) => b.total - a.total)
  }, [lycees, events, users, today])
  const unassigned = lycees.filter(l => !l.assigned_to).length

  if (!rows.length) {
    return <CrmV2Empty icon={<Users size={26} />} title="Aucun lycée attribué" description="Dans l’onglet Lycées, coche des lycées puis « Attribuer à… » pour les confier à un télépro." />
  }
  return (
    <CrmV2TableCard footer={<span>{unassigned} lycée(s) non attribué(s)</span>}>
      <CrmV2Table>
        <thead>
          <tr>
            <CrmV2Th>Personne</CrmV2Th>
            <CrmV2Th>Lycées</CrmV2Th>
            <CrmV2Th>Contactés</CrmV2Th>
            <CrmV2Th>Forums / inters obtenus</CrmV2Th>
            <CrmV2Th>Refus</CrmV2Th>
            <CrmV2Th>Événements à venir</CrmV2Th>
            <CrmV2Th>Relances en retard</CrmV2Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <CrmV2Tr key={r.user.id} onClick={() => onFilterAssignee(r.user.id)}>
              <CrmV2Td><UserChip user={r.user} /></CrmV2Td>
              <CrmV2Td><b>{r.total}</b></CrmV2Td>
              <CrmV2Td><AdminProgress pct={r.total ? (r.touched / r.total) * 100 : 0} label={`${r.touched}/${r.total}`} /></CrmV2Td>
              <CrmV2Td style={{ color: '#16a34a', fontWeight: 700 }}>{r.obtained}</CrmV2Td>
              <CrmV2Td style={{ color: r.refused ? '#d13a41' : crmV2.textFaint }}>{r.refused}</CrmV2Td>
              <CrmV2Td>{r.upcoming}</CrmV2Td>
              <CrmV2Td>{r.late ? <span style={{ color: crmV2.danger, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} />{r.late}</span> : '0'}</CrmV2Td>
            </CrmV2Tr>
          ))}
        </tbody>
      </CrmV2Table>
    </CrmV2TableCard>
  )
}
