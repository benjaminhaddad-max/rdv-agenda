'use client'

/**
 * Agenda des forums d'orientation / interventions de la saison (onglet Lycées) :
 * regroupé par mois, forums inter-lycées mis en avant, forums détectés par la
 * veille à valider (confirmer / masquer).
 */

import { useMemo, useState } from 'react'
import { Check, EyeOff, ExternalLink, MapPin, Radar, Sparkles, Users } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button, CrmV2Empty, CrmV2StatusPill, hexA } from '@/components/crm-v2/primitives'
import { AdminPillSelect } from '@/components/crm-v2/admin/AdminUi'
import { DEPARTMENTS, EVENT_KINDS, EVENT_SCOPES, EVENT_STATUSES, lookup } from '@/lib/lycees'
import {
  type AgendaEvent, DateBlock, Dept, EventStatusPill, fmtDateTime, KindPill, ModePill, parisTodayKey, relDays, UserChip, type TeamUser,
} from './ui'

export default function ForumsAgenda({
  events, users, onOpenLycee, onEdit, onQuickPatch, lastScan, canScan, scanning, onScan,
}: {
  events: AgendaEvent[]
  users: TeamUser[]
  onOpenLycee: (uai: string) => void
  onEdit: (e: AgendaEvent) => void
  onQuickPatch: (id: string, patch: Record<string, unknown>) => Promise<void>
  lastScan: { started_at: string; finished_at: string | null; found: number; inserted: number; errors: string | null } | null
  canScan: boolean
  scanning: boolean
  onScan: (departments: string[]) => void
}) {
  const isMobile = useIsMobile()
  const today = parisTodayKey()
  const [dept, setDept] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [scope, setScope] = useState('')
  const [past, setPast] = useState(false)
  const [scanDept, setScanDept] = useState('')
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])

  const deptOf = (e: AgendaEvent) => e.lycee?.department ?? (/\((\d{2})\)/.exec(e.location ?? '')?.[1] ?? null)

  const filtered = useMemo(() => events.filter(e => {
    if (e.kind === 'flying' && kind !== 'flying') return false
    if (!past && e.date && e.date < today) return false
    if (past && (!e.date || e.date >= today)) return false
    if (dept && deptOf(e) !== dept) return false
    if (kind && e.kind !== kind) return false
    if (status && e.status !== status) return false
    if (scope === 'big' ? !(e.scope === 'inter_lycees' || e.scope === 'departement' || e.scope === 'ville') : scope && e.scope !== scope) return false
    return true
  }), [events, dept, kind, status, scope, past, today])

  const groups = useMemo(() => {
    const m = new Map<string, AgendaEvent[]>()
    const sorted = [...filtered].sort((a, b) => past
      ? (b.date || '').localeCompare(a.date || '')
      : (a.date || '9999').localeCompare(b.date || '9999'))
    for (const e of sorted) {
      const k = e.date ? e.date.slice(0, 7) : 'sans-date'
      const list = m.get(k) || []
      list.push(e)
      m.set(k, list)
    }
    return [...m.entries()]
  }, [filtered, past])

  const detected = events.filter(e => e.status === 'detecte' && (!e.date || e.date >= today)).length
  const monthLabel = (k: string) => {
    if (k === 'sans-date') return 'Date à caler'
    const [y, m] = k.split('-').map(Number)
    const s = new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px', background: crmV2.bg,
        border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow,
      }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Radar size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: crmV2.textMuted, lineHeight: 1.45 }}>
          <b style={{ color: crmV2.text }}>Veille automatique des forums</b> — chaque matin, le bot cherche sur le web les forums d’orientation
          de 3 départements (tous les départements en 3 jours).
          {lastScan && <> Dernier passage : {fmtDateTime(lastScan.started_at)} · {lastScan.found} trouvé(s), {lastScan.inserted} nouveau(x){lastScan.errors ? ' · erreurs' : ''}.</>}
          {detected > 0 && <> <b style={{ color: '#e8833a' }}>{detected} forum(s) détecté(s) à vérifier.</b></>}
        </div>
        {canScan && (
          <>
            <AdminPillSelect value={scanDept} onChange={e => setScanDept(e.target.value)} disabled={scanning}>
              <option value="">Départements du jour</option>
              {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </AdminPillSelect>
            <CrmV2Button size="sm" variant="gold" icon={<Sparkles size={13} />} disabled={scanning} onClick={() => onScan(scanDept ? [scanDept] : [])}>
              {scanning ? 'Recherche en cours (2-4 min)…' : 'Lancer la veille'}
            </CrmV2Button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <AdminPillSelect value={past ? 'past' : 'next'} onChange={e => setPast(e.target.value === 'past')}>
          <option value="next">À venir</option>
          <option value="past">Passés</option>
        </AdminPillSelect>
        <AdminPillSelect value={dept} onChange={e => setDept(e.target.value)}>
          <option value="">Départements</option>
          {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </AdminPillSelect>
        <AdminPillSelect value={scope} onChange={e => setScope(e.target.value)}>
          <option value="">Toutes portées</option>
          <option value="big">Gros forums (inter-lycées, ville, département)</option>
          {EVENT_SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </AdminPillSelect>
        <AdminPillSelect value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Forums, inters, conférences</option>
          {EVENT_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </AdminPillSelect>
        <AdminPillSelect value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {EVENT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </AdminPillSelect>
        <span style={{ fontSize: 12.5, color: crmV2.textMuted }}>{filtered.length} événement(s)</span>
      </div>

      {!groups.length && <CrmV2Empty icon={<Radar size={26} />} title="Aucun forum" description="Ajoute un forum à la main ou lance la veille automatique." />}

      {groups.map(([month, list]) => (
        <div key={month}>
          <div style={{ fontSize: 12, fontWeight: 800, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 2px 8px' }}>
            {monthLabel(month)} <span style={{ color: crmV2.textFaint }}>· {list.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(440px, 1fr))', gap: 10 }}>
            {list.map(e => {
              const big = e.scope !== 'lycee'
              const assignee = usersById.get(e.lycee?.assigned_to ?? '')
              const soon = e.date && e.date >= today && relDays(today, e.date)
              return (
                <div key={e.id} style={{
                  display: 'flex', gap: 12, padding: 12, background: crmV2.bg, borderRadius: crmV2.radiusLg,
                  border: `1px solid ${e.status === 'detecte' ? 'rgba(232,131,58,0.45)' : big ? crmV2.goldBorder : crmV2.border}`,
                  boxShadow: big ? `0 0 0 3px ${hexA('#C9A84C', 0.10)}` : crmV2.shadow, minWidth: 0,
                }}>
                  <DateBlock date={e.date} unconfirmed={!e.date_confirmed} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {e.lycee ? (
                        <button type="button" onClick={() => onOpenLycee(e.lycee!.uai)} style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                          color: crmV2.link, textAlign: 'left',
                        }}>{e.lycee.name}</button>
                      ) : <span style={{ fontSize: 14, fontWeight: 700 }}>{e.title ?? 'Forum'}</span>}
                      <Dept d={deptOf(e)} />
                    </div>
                    {e.lycee && e.title && <div style={{ fontSize: 12.5, color: crmV2.textMuted, marginTop: 1 }}>{e.title}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <KindPill kind={e.kind} />
                      {big && <CrmV2StatusPill label={lookup(EVENT_SCOPES, e.scope)?.label ?? ''} color="#8a6d22" dot={false} bordered />}
                      <EventStatusPill status={e.status} />
                      {e.mode && <ModePill mode={e.mode} empty={null} />}
                      {!e.date_confirmed && e.date && <span style={{ fontSize: 11.5, color: '#e8833a', fontWeight: 700 }}>date probable</span>}
                      {soon && <span style={{ fontSize: 11.5, color: crmV2.textFaint }}>{soon}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: crmV2.textMuted }}>
                      {(e.time_start || e.time_end) && <span>{e.time_start ?? '?'} – {e.time_end ?? '?'}</span>}
                      {!e.lycee && e.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{e.location}</span>}
                      {e.lycee?.city && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{e.lycee.city}</span>}
                      {e.intervenants
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: crmV2.text, fontWeight: 600 }}><Users size={11} />{e.intervenants}</span>
                        : e.date && e.date >= today && e.status !== 'detecte' && <span style={{ color: '#d13a41', fontWeight: 700 }}>Personne d’envoyé</span>}
                      {e.leads_count != null && <span style={{ color: '#16a34a', fontWeight: 700 }}>{e.leads_count} leads</span>}
                      {assignee && <UserChip user={assignee} />}
                    </div>
                    {(e.audience || e.notes || e.organizer_contact) && (
                      <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6, lineHeight: 1.45 }}>
                        {e.audience && <div>👥 {e.audience}</div>}
                        {e.organizer_contact && <div>☎ {e.organizer_contact}</div>}
                        {e.notes && <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.notes}</div>}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {e.status === 'detecte' && (
                        <>
                          <CrmV2Button size="sm" variant="primary" icon={<Check size={13} />} onClick={() => onQuickPatch(e.id, { status: 'a_confirmer' })}>C’est bon</CrmV2Button>
                          <CrmV2Button size="sm" icon={<EyeOff size={13} />} onClick={() => onQuickPatch(e.id, { hidden: true })}>Faux positif</CrmV2Button>
                        </>
                      )}
                      {e.status === 'a_confirmer' && (
                        <CrmV2Button size="sm" variant="gold" icon={<Check size={13} />} onClick={() => onQuickPatch(e.id, { status: 'confirme', date_confirmed: true })}>Confirmé, on y va</CrmV2Button>
                      )}
                      <CrmV2Button size="sm" variant="ghost" onClick={() => onEdit(e)}>Modifier</CrmV2Button>
                      {e.source_url && (
                        <a href={e.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>
                          Source <ExternalLink size={11} />
                        </a>
                      )}
                      {e.source === 'bot' && <span style={{ fontSize: 11, color: crmV2.textFaint, marginLeft: 'auto' }}>trouvé par la veille</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
