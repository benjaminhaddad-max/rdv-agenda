'use client'

/**
 * Fiche d'un lycée (tiroir de droite) : pilotage (statut, priorité, mode
 * Diploma / AFEM, attribution, prochaine action), coordonnées, indicateurs,
 * contacts, forums & interventions par saison, journal d'échanges, notes.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CalendarPlus, ChevronDown, ExternalLink, Globe, GraduationCap, History, Mail, MapPin, MessageSquare, Pencil, Phone, Plus,
  Star, Trash2, UserRound, Users,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Button, CrmV2CloseButton, CrmV2Drawer, CrmV2Input, CrmV2Segmented, CrmV2Spinner, CrmV2Textarea, CrmV2Toggle, hexA,
} from '@/components/crm-v2/primitives'
import { AdminIconButton, AdminNotice, AdminPillSelect } from '@/components/crm-v2/admin/AdminUi'
import {
  ACTIVITY_KINDS, CURRENT_SEASON, LYCEE_MODES, LYCEE_PRIORITIES, LYCEE_STATUSES, SECTEUR_LABELS, lookup, seasonLabel,
  AMB_LABELS, AMB_STATUSES, type AmbassadeurRow,
  type LyceeActivityRow, type LyceeContactRow, type LyceeEventRow, type LyceeListItem, type LyceeRow,
} from '@/lib/lycees'
import EventModal, { type EventDraft } from './EventModal'
import {
  api, Dept, EventStatusPill, fmtDate, fmtDateTime, KindPill, mapsUrl, ModePill, OutcomePill, parisTodayKey, ScorePill, Stat, telHref,
  type TeamUser,
} from './ui'

type Detail = {
  lycee: LyceeListItem
  contacts: LyceeContactRow[]
  events: LyceeEventRow[]
  activities: LyceeActivityRow[]
  ambassadeurs?: AmbassadeurRow[]
  is_manager: boolean
}

type LyceeOption = Pick<LyceeRow, 'uai' | 'name' | 'city' | 'department'>

export default function LyceeDrawer({
  uai, onClose, onChanged, users, lycees, onCall, onCallAmbassadeur,
}: {
  /** Ouvre « Noter un appel » sur ce lycée */
  onCall: (uai: string, name: string) => void
  onCallAmbassadeur: (id: string, name: string) => void
  uai: string | null
  onClose: () => void
  /** Rafraîchit la liste derrière (statut, attribution…) */
  onChanged: () => void
  users: TeamUser[]
  lycees: LyceeOption[]
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null)

  const load = useCallback(async () => {
    if (!uai) return
    try {
      setD(await api<Detail>(`/api/crm/lycees/${uai}`))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }, [uai])

  useEffect(() => { void load() }, [load])

  const patch = async (body: Record<string, unknown>) => {
    if (!uai) return
    try {
      await api(`/api/crm/lycees/${uai}`, { method: 'PATCH', json: body })
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  // Fiche d'un autre lycée encore affichée pendant le chargement : on ne la montre pas
  const l = d?.lycee.uai === uai ? d.lycee : undefined
  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {l && <ScorePill score={l.score} size="md" />}
          <div style={{ fontSize: 17, fontWeight: 700, color: crmV2.text, letterSpacing: '-0.01em' }}>{l?.name ?? 'Lycée'}</div>
        </div>
        {l && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap', fontSize: 12.5, color: crmV2.textMuted }}>
            <Dept d={l.department} />
            <span>{l.city}</span>
            <span>·</span>
            <span>{SECTEUR_LABELS[l.secteur ?? ''] ?? '—'}</span>
            {l.sigle && <><span>·</span><span>{l.sigle}</span></>}
            {l.bassin && <><span>·</span><span title="Bassin de formation">Bassin {l.bassin}</span></>}
            {l.closed && <span style={{ color: crmV2.danger, fontWeight: 700 }}>· Absent de l’annuaire (fermé ?)</span>}
          </div>
        )}
      </div>
      <CrmV2CloseButton onClick={onClose} />
    </div>
  )

  return (
    <CrmV2Drawer open={!!uai} onClose={onClose} header={header} width={660}>
      {error && <AdminNotice tone="error" style={{ margin: 16 }} onClose={() => setError(null)}>{error}</AdminNotice>}
      {!d || !l ? <CrmV2Spinner /> : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Pilotage key={`${l.next_action}|${l.next_action_at}`} l={l} users={users} isManager={d.is_manager} onPatch={patch} />
          <Coordonnees l={l} onPatch={patch} />
          <Indicateurs l={l} />
          {!!d.ambassadeurs?.length && (
            <Ambassadeurs list={d.ambassadeurs} onCall={a => onCallAmbassadeur(a.id, `${[a.first_name, a.last_name].filter(Boolean).join(' ')} · ${l.name}`)} />
          )}
          <Contacts uai={l.uai} contacts={d.contacts} onReload={load} />
          <Evenements
            events={d.events}
            onAdd={() => setEventDraft({ uai: l.uai, kind: 'forum', scope: 'lycee', status: 'a_confirmer', mode: l.mode })}
            onEdit={ev => setEventDraft(ev)}
          />
          <Journal uai={l.uai} activities={d.activities} onReload={async () => { await load(); onChanged() }} onCall={() => onCall(l.uai, l.name)} />
          <Notes key={`${l.notes}|${l.competition}`} l={l} onPatch={patch} />
        </div>
      )}
      {eventDraft && (
        <EventModal
          open
          initial={eventDraft}
          lycees={lycees}
          lockLycee
          onClose={() => setEventDraft(null)}
          onSaved={() => { void load(); onChanged() }}
        />
      )}
    </CrmV2Drawer>
  )
}

// ── Sections ────────────────────────────────────────────────────────────────

function Block({ title, icon, count, actions, children, defaultOpen = true }: {
  title: string
  icon: ReactNode
  count?: number
  actions?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{ border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, background: crmV2.bg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left', minWidth: 0,
        }}>
          <span style={{ color: crmV2.gold, display: 'inline-flex' }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: crmV2.text }}>{title}</span>
          {typeof count === 'number' && (
            <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, background: crmV2.bgSoft, borderRadius: 999, padding: '1px 7px' }}>{count}</span>
          )}
          <ChevronDown size={14} color={crmV2.textFaint} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
        </button>
        {actions}
      </div>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
    </section>
  )
}

const label = { fontSize: 11, fontWeight: 700, color: crmV2.textMuted, marginBottom: 4 } as const

function Pilotage({ l, users, isManager, onPatch }: {
  l: LyceeListItem
  users: TeamUser[]
  isManager: boolean
  onPatch: (b: Record<string, unknown>) => Promise<void>
}) {
  const [action, setAction] = useState(l.next_action ?? '')
  const [actionAt, setActionAt] = useState(l.next_action_at ?? '')
  const status = lookup(LYCEE_STATUSES, l.status)
  const prio = lookup(LYCEE_PRIORITIES, l.priority)
  const assignee = users.find(u => u.id === l.assigned_to)
  const late = l.next_action_at && l.next_action_at < parisTodayKey()

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: 14,
      borderRadius: crmV2.radiusLg, background: crmV2.bgHover, border: `1px solid ${crmV2.border}`,
    }}>
      <div>
        <div style={label}>Statut {seasonLabel(CURRENT_SEASON)}</div>
        <AdminPillSelect color={status?.color} value={l.status} onChange={e => onPatch({ status: e.target.value })}>
          {LYCEE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </AdminPillSelect>
      </div>
      <div>
        <div style={label}>Priorité</div>
        <AdminPillSelect color={prio?.color} value={l.priority ?? ''} onChange={e => onPatch({ priority: e.target.value || null })}>
          <option value="">Non définie</option>
          {LYCEE_PRIORITIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </AdminPillSelect>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={label}>On y va en mode</div>
        <CrmV2Segmented
          size="sm"
          value={(l.mode ?? '') as string}
          onChange={v => onPatch({ mode: v || null })}
          items={[{ id: '', label: 'À définir' }, ...LYCEE_MODES.map(m => ({ id: m.id as string, label: m.label }))]}
        />
        <div style={{ fontSize: 11.5, color: crmV2.textFaint, marginTop: 4 }}>
          {lookup(LYCEE_MODES, l.mode)?.hint ?? 'Diploma Santé en direct, ou approche neutre via l’AFEM selon le profil du lycée.'}
        </div>
      </div>
      <div>
        <div style={label}>Attribué à</div>
        {isManager ? (
          <AdminPillSelect value={l.assigned_to ?? ''} onChange={e => onPatch({ assigned_to: e.target.value || null })}>
            <option value="">Non attribué</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </AdminPillSelect>
        ) : <div style={{ fontSize: 13, fontWeight: 600 }}>{assignee?.name ?? 'Moi'}</div>}
      </div>
      <div>
        <div style={label}>Dernier contact</div>
        <div style={{ fontSize: 13, color: crmV2.text, paddingTop: 6 }}>{l.last_contact_at ? fmtDateTime(l.last_contact_at) : 'Jamais'}</div>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={label}>Prochaine action {late && <span style={{ color: crmV2.danger }}>· en retard</span>}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CrmV2Input
            value={action}
            onChange={e => setAction(e.target.value)}
            onBlur={() => action !== (l.next_action ?? '') && onPatch({ next_action: action })}
            placeholder="Rappeler la CPE pour caler le forum…"
            style={{ flex: 1, minWidth: 200 }}
          />
          <CrmV2Input
            type="date"
            value={actionAt}
            onChange={e => { setActionAt(e.target.value); void onPatch({ next_action_at: e.target.value || null }) }}
            style={{ width: 160, borderColor: late ? crmV2.danger : undefined }}
          />
        </div>
      </div>
    </div>
  )
}

function Coordonnees({ l, onPatch }: { l: LyceeListItem; onPatch: (b: Record<string, unknown>) => Promise<void> }) {
  const map = mapsUrl(l.address, l.city)
  const row = (icon: ReactNode, content: ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, fontSize: 13, minWidth: 0 }}>
      <span style={{ color: crmV2.textFaint, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{content}</span>
    </div>
  )
  const link = { color: crmV2.link, fontWeight: 600, textDecoration: 'none' } as const
  return (
    <Block title="Établissement" icon={<GraduationCap size={14} />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2px 16px' }}>
        {row(<Phone size={14} />, l.phone ? <a href={telHref(l.phone)} style={link}>{l.phone}</a> : '—')}
        {row(<Mail size={14} />, l.email ? <a href={`mailto:${l.email}`} style={link}>{l.email}</a> : '—')}
        {row(<MapPin size={14} />, map ? <a href={map} target="_blank" rel="noreferrer" style={link}>{[l.address, l.postal_code, l.city].filter(Boolean).join(', ')}</a> : '—')}
        {row(<Globe size={14} />, l.website ? <a href={l.website} target="_blank" rel="noreferrer" style={link}>Site du lycée</a> : '—')}
        {l.onisep_url && row(<ExternalLink size={14} />, <a href={l.onisep_url} target="_blank" rel="noreferrer" style={link}>Fiche Onisep</a>)}
        {row(<UserRound size={14} />, <CrmV2Toggle checked={!!l.alumni_help} onChange={v => onPatch({ alumni_help: v })} label="Un ancien élève peut nous ouvrir la porte" />)}
      </div>
      <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 6 }}>UAI {l.uai}{l.nature ? ` · ${l.nature}` : ''}{l.education_prioritaire ? ` · ${l.education_prioritaire}` : ''}</div>
    </Block>
  )
}

function Indicateurs({ l }: { l: LyceeListItem }) {
  const [showScore, setShowScore] = useState(false)
  return (
    <Block title="Potentiel" icon={<Star size={14} />} actions={
      <CrmV2Button size="sm" variant="ghost" onClick={() => setShowScore(s => !s)}>{showScore ? 'Masquer le détail' : 'Détail du score'}</CrmV2Button>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
        <Stat label="Terminales" value={l.eff_terminale ?? l.eff_term_generale} hint="élèves (bac 2025)" />
        <Stat label="Spé SVT" value={l.eff_svt} hint="en terminale générale" />
        <Stat label="PC + SVT" value={l.eff_pc_svt || null} hint="doublette santé" />
        <Stat label="IPS" value={l.ips != null ? Math.round(l.ips) : null} hint="profil social (moy. ≈ 100)" />
        <Stat label="Mentions" value={l.taux_mentions != null ? `${l.taux_mentions} %` : null} hint={l.taux_reussite != null ? `réussite ${l.taux_reussite} %` : undefined} />
        <Stat label="Nos inscrits 25-26" value={l.inscrits_2526 || null} hint="venant de ce lycée (plateforme)" />
        <Stat label="Leads passés" value={l.past_leads || null} hint={`${l.past_events} forum(s) / inter(s)`} />
        <Stat label="Flying" value={l.flying_per_session != null ? `${l.flying_per_session}/session` : null}
          hint={l.flying_sessions ? `${l.flying_leads_total ?? '?'} leads · ${l.flying_sessions} session(s)` : undefined} />
      </div>
      {showScore && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {l.score_parts.map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ flex: 1, color: crmV2.textMuted }}>{p.label}</span>
              <span style={{ width: 120, height: 6, background: crmV2.bgMuted, borderRadius: 3, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.max(0, (p.points / p.max) * 100)}%`, background: crmV2.gold }} />
              </span>
              <span style={{ width: 52, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: p.points < 0 ? crmV2.danger : crmV2.text }}>
                {p.points}/{p.max}
              </span>
            </div>
          ))}
        </div>
      )}
    </Block>
  )
}

function Ambassadeurs({ list, onCall }: { list: AmbassadeurRow[]; onCall: (a: AmbassadeurRow) => void }) {
  const order = { top: 0, bon: 1, moyen: 2, peu_actif: 3, mecontent: 4 } as const
  const sorted = [...list].sort((a, b) => (order[a.label ?? 'moyen'] - order[b.label ?? 'moyen']) || ((b.score ?? 0) - (a.score ?? 0)))
  const good = list.filter(a => a.label === 'top' || a.label === 'bon').length
  return (
    <Block title={`Nos élèves 2026-27 venant de ce lycée`} icon={<GraduationCap size={14} />} count={list.length}>
      <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 6 }}>
        {good ? `${good} bon(s) profil(s) à appeler pour qu’ils parlent de nous à leur ancien lycée.` : 'Pas de profil ambassadeur fort pour l’instant.'}
      </div>
      {sorted.map(a => {
        const lb = lookup(AMB_LABELS, a.label)
        const st = lookup(AMB_STATUSES, a.status)
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: `1px solid ${crmV2.borderLight}` }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{[a.first_name, a.last_name].filter(Boolean).join(' ')}</b>
                {lb && <span style={{ fontSize: 11, fontWeight: 800, color: lb.color }}>{lb.label.toUpperCase()}{a.score != null ? ` · ${a.score}` : ''}</span>}
                {st && a.status !== 'a_appeler' && <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>· {st.label}</span>}
              </div>
              <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                {a.formation} · {a.series_count ?? 0} séries{a.success_pct != null ? ` · ${Math.round(a.success_pct)} % réussite` : ''}
                {a.phone && <> · <a href={telHref(a.phone)} style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>{a.phone}</a></>}
              </div>
              {a.mood_summary && <div style={{ fontSize: 12, color: crmV2.textMuted, fontStyle: 'italic' }}>{a.mood_summary}</div>}
            </div>
            {a.label !== 'mecontent' && <CrmV2Button size="sm" variant="gold" icon={<Phone size={12} />} onClick={() => onCall(a)}>Appel</CrmV2Button>}
          </div>
        )
      })}
    </Block>
  )
}

function Contacts({ uai, contacts, onReload }: { uai: string; contacts: LyceeContactRow[]; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Partial<LyceeContactRow> | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setErr(null)
    try {
      const body = { name: editing.name, role: editing.role, email: editing.email, phone: editing.phone, notes: editing.notes, is_alumni: !!editing.is_alumni, is_key: !!editing.is_key }
      if (editing.id) await api(`/api/crm/lycees/contacts/${editing.id}`, { method: 'PATCH', json: body })
      else await api(`/api/crm/lycees/${uai}/contacts`, { method: 'POST', json: body })
      setEditing(null)
      await onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    if (!confirm('Supprimer ce contact ?')) return
    await api(`/api/crm/lycees/contacts/${id}`, { method: 'DELETE' }).catch(() => null)
    await onReload()
  }
  const set = (k: keyof LyceeContactRow, v: unknown) => setEditing(p => ({ ...(p || {}), [k]: v }))

  return (
    <Block title="Contacts" icon={<Users size={14} />} count={contacts.length} actions={
      <CrmV2Button size="sm" variant="gold" icon={<Plus size={13} />} onClick={() => setEditing({ is_alumni: false, is_key: false })}>Contact</CrmV2Button>
    }>
      {editing && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, padding: 12, marginBottom: 10, borderRadius: 12, background: crmV2.bgHover, border: `1px solid ${crmV2.border}` }}>
          {err && <AdminNotice tone="error" style={{ gridColumn: '1 / -1' }}>{err}</AdminNotice>}
          <CrmV2Input placeholder="Nom" value={editing.name ?? ''} onChange={e => set('name', e.target.value)} />
          <CrmV2Input placeholder="Fonction (CPE, prof de SVT…)" value={editing.role ?? ''} onChange={e => set('role', e.target.value)} />
          <CrmV2Input placeholder="Mail" value={editing.email ?? ''} onChange={e => set('email', e.target.value)} />
          <CrmV2Input placeholder="Téléphone" value={editing.phone ?? ''} onChange={e => set('phone', e.target.value)} />
          <CrmV2Input placeholder="Note" value={editing.notes ?? ''} onChange={e => set('notes', e.target.value)} style={{ gridColumn: '1 / -1' }} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', gridColumn: '1 / -1' }}>
            <CrmV2Toggle checked={!!editing.is_key} onChange={v => set('is_key', v)} label="Contact clé (a permis de décrocher)" />
            <CrmV2Toggle checked={!!editing.is_alumni} onChange={v => set('is_alumni', v)} label="Ancien élève" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', gridColumn: '1 / -1' }}>
            <CrmV2Button size="sm" onClick={() => setEditing(null)}>Annuler</CrmV2Button>
            <CrmV2Button size="sm" variant="primary" onClick={save} disabled={busy}>{busy ? '…' : 'Enregistrer'}</CrmV2Button>
          </div>
        </div>
      )}
      {!contacts.length && !editing && <div style={{ fontSize: 13, color: crmV2.textFaint }}>Aucun contact pour l’instant. Ajoute le proviseur, la CPE, le prof de SVT ou un ancien élève relais.</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {contacts.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: `1px solid ${crmV2.borderLight}` }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: hexA(c.is_alumni ? '#7e22ce' : c.is_key ? '#16a34a' : '#516f90', 0.12), color: c.is_alumni ? '#7e22ce' : c.is_key ? '#16a34a' : '#516f90',
            }}>{c.is_alumni ? <GraduationCap size={14} /> : <UserRound size={14} />}</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>{c.name || 'Sans nom'}</span>
                {c.role && <span style={{ color: crmV2.textMuted }}>· {c.role}</span>}
                {c.is_key && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#16a34a' }}>CONTACT CLÉ</span>}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                {c.phone && c.phone.split(';').map(p => p.trim()).filter(Boolean).map(p => (
                  <a key={p} href={telHref(p)} style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>{p}</a>
                ))}
                {c.email && c.email.split(';').map(m => m.trim()).filter(Boolean).map(m => (
                  <a key={m} href={`mailto:${m}`} style={{ color: crmV2.link, textDecoration: 'none', wordBreak: 'break-all' }}>{m}</a>
                ))}
              </div>
              {c.notes && <div style={{ color: crmV2.textMuted, fontSize: 12, marginTop: 2 }}>{c.notes}</div>}
            </div>
            <AdminIconButton icon={<Pencil size={13} />} title="Modifier" onClick={() => setEditing(c)} />
            <AdminIconButton icon={<Trash2 size={13} />} title="Supprimer" tone="danger" onClick={() => remove(c.id)} />
          </div>
        ))}
      </div>
    </Block>
  )
}

function Evenements({ events, onAdd, onEdit }: { events: LyceeEventRow[]; onAdd: () => void; onEdit: (e: LyceeEventRow) => void }) {
  const bySeason = useMemo(() => {
    const m = new Map<string, LyceeEventRow[]>()
    for (const e of events) {
      const list = m.get(e.season) || []
      list.push(e)
      m.set(e.season, list)
    }
    const order = (s: string) => (s === CURRENT_SEASON ? '9999' : s === 'avant-2025' ? '0000' : s)
    return [...m.entries()].sort((a, b) => order(b[0]).localeCompare(order(a[0])))
  }, [events])
  const hasCurrent = events.some(e => e.season === CURRENT_SEASON)

  return (
    <Block title="Forums, interventions & flying" icon={<CalendarPlus size={14} />} count={events.length} actions={
      <CrmV2Button size="sm" variant="accent" icon={<Plus size={13} />} onClick={onAdd}>Forum / inter</CrmV2Button>
    }>
      {!hasCurrent && (
        <AdminNotice tone="warning" style={{ marginBottom: 10 }}>
          Rien de calé pour {seasonLabel(CURRENT_SEASON)} : appelle le lycée pour connaître la date de son forum d’orientation.
        </AdminNotice>
      )}
      {bySeason.map(([season, list]) => (
        <div key={season} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: season === CURRENT_SEASON ? crmV2.goldDark : crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '6px 0' }}>
            {season === 'avant-2025' ? 'Saisons précédentes' : `Saison ${seasonLabel(season)}`}
          </div>
          {list.map(e => (
            <button key={e.id} type="button" onClick={() => onEdit(e)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 10, border: 'none',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexWrap: 'wrap', fontSize: 13,
            }}
              onMouseEnter={ev => { ev.currentTarget.style.background = crmV2.rowHover }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ width: 86, fontWeight: 700, color: e.date ? crmV2.text : crmV2.textFaint, fontStyle: e.date_confirmed ? 'normal' : 'italic' }}>
                {e.date ? fmtDate(e.date, { year: true }) : season === 'avant-2025' ? 'Date ?' : 'À caler'}
              </span>
              <KindPill kind={e.kind} />
              {season === CURRENT_SEASON && <EventStatusPill status={e.status} />}
              {e.mode && <ModePill mode={e.mode} empty={null} />}
              {e.intervenants && <span style={{ color: crmV2.textMuted }}>· {e.intervenants}</span>}
              {e.leads_count != null && <span style={{ color: '#16a34a', fontWeight: 700 }}>· {e.leads_count} leads</span>}
              {e.title && e.kind !== 'flying' && <span style={{ color: crmV2.textMuted, flexBasis: '100%', paddingLeft: 94, fontSize: 12 }}>{e.title}</span>}
              {e.competition && <span style={{ color: '#d13a41', flexBasis: '100%', paddingLeft: 94, fontSize: 12 }}>Concurrence : {e.competition}</span>}
            </button>
          ))}
        </div>
      ))}
    </Block>
  )
}

function Journal({ uai, activities, onReload, onCall }: { uai: string; activities: LyceeActivityRow[]; onReload: () => Promise<void>; onCall: () => void }) {
  const [kind, setKind] = useState<'note' | 'call' | 'email' | 'visit'>('note')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await api(`/api/crm/lycees/${uai}/activities`, { method: 'POST', json: { kind, content: text } })
      setText('')
      await onReload()
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    if (!confirm('Supprimer ce commentaire ?')) return
    await api(`/api/crm/lycees/${uai}/activities?id=${id}`, { method: 'DELETE' }).catch(() => null)
    await onReload()
  }
  const color: Record<string, string> = { note: crmV2.gold, call: '#00a38d', email: '#0091ae', visit: '#7e22ce', status: '#516f90', assign: '#516f90' }
  return (
    <Block title="Appels & commentaires" icon={<MessageSquare size={14} />} count={activities.length} actions={
      <CrmV2Button size="sm" variant="gold" icon={<Phone size={13} />} onClick={onCall}>Noter un appel</CrmV2Button>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <CrmV2Segmented size="sm" value={kind} onChange={setKind} items={[
          { id: 'note', label: 'Commentaire' }, { id: 'email', label: 'Mail' }, { id: 'visit', label: 'Visite' },
        ]} />
        <CrmV2Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Commentaire sur le lycée (pour un appel, utilise « Noter un appel »)…"
          rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add() }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <CrmV2Button size="sm" variant="primary" onClick={add} disabled={busy || !text.trim()}>{busy ? '…' : 'Ajouter au journal'}</CrmV2Button>
        </div>
      </div>
      {activities.map(a => (
        <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${crmV2.borderLight}` }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color[a.kind] ?? crmV2.gold, marginTop: 6, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: crmV2.textFaint, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <b style={{ color: crmV2.textMuted }}>{lookup(ACTIVITY_KINDS, a.kind)?.label}</b>
              {a.outcome && <OutcomePill outcome={a.outcome} />}
              <span>· {a.author_name ?? '—'} · {fmtDateTime(a.created_at)}</span>
            </div>
            <div style={{ fontSize: 13, color: crmV2.text, whiteSpace: 'pre-wrap', marginTop: 2 }}>{a.content}</div>
          </div>
          {['note', 'call', 'email', 'visit'].includes(a.kind) && (
            <button type="button" onClick={() => remove(a.id)} title="Supprimer" style={{ background: 'none', border: 'none', color: crmV2.textFaint, cursor: 'pointer', padding: 2, alignSelf: 'flex-start' }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </Block>
  )
}

function Notes({ l, onPatch }: { l: LyceeListItem; onPatch: (b: Record<string, unknown>) => Promise<void> }) {
  const [notes, setNotes] = useState(l.notes ?? '')
  const [comp, setComp] = useState(l.competition ?? '')
  return (
    <Block title="Ambiance & historique" icon={<History size={14} />}>
      <div style={label}>Ambiance du lycée, conseils pour y aller</div>
      <CrmV2Textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (l.notes ?? '') && onPatch({ notes })}
        rows={3} placeholder="Lycée très réceptif, amphi avec premières et terminales, bien confirmer la veille…" />
      <div style={{ ...label, marginTop: 10 }}>Concurrence constatée</div>
      <CrmV2Input value={comp} onChange={e => setComp(e.target.value)} onBlur={() => comp !== (l.competition ?? '') && onPatch({ competition: comp })}
        placeholder="Médisup présent en anonyme…" />
      {l.history_notes && (
        <>
          <div style={{ ...label, marginTop: 12 }}>Historique de prospection (fichier importé)</div>
          <div style={{
            fontSize: 12.5, color: crmV2.textMuted, whiteSpace: 'pre-wrap', background: crmV2.bgHover, borderRadius: 10, padding: 10,
            border: `1px solid ${crmV2.borderLight}`, maxHeight: 260, overflowY: 'auto', lineHeight: 1.5,
          }}>{l.history_notes}</div>
        </>
      )}
    </Block>
  )
}

