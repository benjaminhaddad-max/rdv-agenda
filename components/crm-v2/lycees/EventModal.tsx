'use client'

/**
 * Ajout / modification d'un forum, d'une intervention, d'un flying… (onglet Lycées).
 * Un événement peut être rattaché à un lycée ou rester « hors lycée »
 * (forum d'une ville, d'un CIO).
 */

import { useEffect, useMemo, useState } from 'react'
import { Mail, Phone, Search, Trash2 } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Field, CrmV2Input, CrmV2Select, CrmV2Textarea, CrmV2Toggle } from '@/components/crm-v2/primitives'
import { AdminModal, AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import {
  EVENT_KINDS, EVENT_SCOPES, EVENT_STATUSES, LYCEE_MODES, normalizeName,
  type LyceeActivityRow, type LyceeEventRow, type LyceeRow,
} from '@/lib/lycees'
import { api, Dept, fmtDateTime, OutcomePill, type TeamUser } from './ui'

type LyceeOption = Pick<LyceeRow, 'uai' | 'name' | 'city' | 'department'>

export type EventDraft = Partial<LyceeEventRow> & { uai?: string | null }

export default function EventModal({
  open, onClose, onSaved, initial, lycees, lockLycee = false, users = [], isManager = false, onCall, onMail,
}: {
  users?: TeamUser[]
  isManager?: boolean
  /** Ouvre « Noter un appel » sur ce forum */
  onCall?: () => void
  /** Écrire à l'organisateur (mail partenariat) */
  onMail?: () => void
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial: EventDraft | null
  lycees: LyceeOption[]
  /** Depuis la fiche d'un lycée : le lycée n'est pas modifiable */
  lockLycee?: boolean
}) {
  const editing = !!initial?.id
  const [f, setF] = useState<EventDraft>(() => ({
    kind: 'forum', scope: 'lycee', status: 'a_confirmer', date_confirmed: true, ...initial,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setF(p => ({ ...p, [k]: v }))
  const [calls, setCalls] = useState<LyceeActivityRow[]>([])
  const [finding, setFinding] = useState(false)
  const [findNote, setFindNote] = useState<string | null>(null)
  // Recherche du contact de l'organisateur (robot web, 30 s à 1 min)
  const findContact = async () => {
    if (!initial?.id) return
    setFinding(true)
    setFindNote(null)
    try {
      const r = await api<{ found: boolean; event: (EventDraft & { contact_data?: { notes?: string | null; source_url?: string | null } | null }) | null }>(
        `/api/crm/lycees/events/${initial.id}/find-contact`, { method: 'POST' })
      if (r.event?.organizer_contact) set('organizer_contact', r.event.organizer_contact)
      const d = r.event?.contact_data
      setFindNote(r.found
        ? `Contact trouvé${d?.source_url ? ` (source : ${d.source_url})` : ''}.${d?.notes ? ` ${d.notes}` : ''}`
        : `Pas de contact fiable trouvé.${d?.notes ? ` ${d.notes}` : ''}`)
      onSaved()
    } catch (e) {
      setFindNote(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setFinding(false)
    }
  }
  useEffect(() => {
    if (!initial?.id) return
    api<{ activities: LyceeActivityRow[] }>(`/api/crm/lycees/events/${initial.id}`).then(d => setCalls(d.activities)).catch(() => {})
  }, [initial?.id])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const body = {
        uai: f.uai || null, kind: f.kind, scope: f.scope, status: f.status, mode: f.mode ?? null,
        title: f.title ?? null, date: f.date || null, end_date: f.end_date || null,
        time_start: f.time_start || null, time_end: f.time_end || null, date_confirmed: f.date_confirmed !== false,
        location: f.location ?? null, intervenants: f.intervenants ?? null,
        leads_count: f.leads_count ?? null, competition: f.competition ?? null, audience: f.audience ?? null,
        organizer_contact: f.organizer_contact ?? null, notes: f.notes ?? null, source_url: f.source_url ?? null,
        ...(f.season && !f.date ? { season: f.season } : {}),
        ...(isManager ? { assigned_to: f.assigned_to ?? null } : {}),
      }
      if (editing) await api(`/api/crm/lycees/events/${initial!.id}`, { method: 'PATCH', json: body })
      else await api('/api/crm/lycees/events', { method: 'POST', json: body })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!initial?.id || !confirm('Supprimer cet événement ?')) return
    setSaving(true)
    try {
      await api(`/api/crm/lycees/events/${initial.id}`, { method: 'DELETE' })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setSaving(false)
    }
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      width={640}
      closeDisabled={saving}
      title={editing ? 'Modifier l’événement' : 'Nouveau forum / intervention'}
      subtitle={f.source === 'bot' ? 'Détecté par la veille automatique — vérifie la date et la source avant de confirmer.' : undefined}
      footer={
        <>
          {editing && (
            <CrmV2Button variant="danger" icon={<Trash2 size={14} />} onClick={remove} disabled={saving} style={{ marginRight: 'auto' }}>
              Supprimer
            </CrmV2Button>
          )}
          {editing && onMail && (
            <CrmV2Button icon={<Mail size={14} />} onClick={onMail} disabled={saving}>Écrire un mail</CrmV2Button>
          )}
          {editing && onCall && (
            <CrmV2Button variant="gold" icon={<Phone size={14} />} onClick={onCall} disabled={saving}>Noter un appel</CrmV2Button>
          )}
          <CrmV2Button onClick={onClose} disabled={saving}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 16px' }}>
        {error && <AdminNotice tone="error" style={{ gridColumn: '1 / -1' }}>{error}</AdminNotice>}
        <CrmV2Field label="Lycée" span={2} style={{ gridColumn: '1 / -1' }}
          hint={lockLycee ? undefined : 'Laisse vide pour un forum hors lycée (ville, CIO, département).'}>
          {lockLycee
            ? <div style={{ fontSize: 14, fontWeight: 700 }}>{lycees.find(l => l.uai === f.uai)?.name ?? f.uai}</div>
            : <LyceePicker lycees={lycees} value={f.uai ?? null} onChange={u => set('uai', u)} />}
        </CrmV2Field>
        {!f.uai && (
          <CrmV2Field label="Nom de l’événement" style={{ gridColumn: '1 / -1' }}>
            <CrmV2Input value={f.title ?? ''} onChange={e => set('title', e.target.value)} placeholder="Forum de l’orientation de Meaux" />
          </CrmV2Field>
        )}
        {isManager && (
          <CrmV2Field label="Attribué à (appels à l’organisateur)" style={{ gridColumn: '1 / -1' }}
            hint="Vide = la personne qui a le lycée.">
            <CrmV2Select value={f.assigned_to ?? ''} onChange={e => set('assigned_to', e.target.value || null)}>
              <option value="">Personne en particulier</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </CrmV2Select>
          </CrmV2Field>
        )}
        <CrmV2Field label="Type">
          <CrmV2Select value={f.kind} onChange={e => set('kind', e.target.value as EventDraft['kind'])}>
            {EVENT_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </CrmV2Select>
        </CrmV2Field>
        <CrmV2Field label="Portée">
          <CrmV2Select value={f.scope} onChange={e => set('scope', e.target.value as EventDraft['scope'])}>
            {EVENT_SCOPES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </CrmV2Select>
        </CrmV2Field>
        <CrmV2Field label="Date">
          <CrmV2Input type="date" value={f.date ?? ''} onChange={e => set('date', e.target.value || null)} />
        </CrmV2Field>
        <CrmV2Field label="Horaires">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <CrmV2Input type="time" value={f.time_start ?? ''} onChange={e => set('time_start', e.target.value || null)} />
            <span style={{ color: crmV2.textFaint }}>→</span>
            <CrmV2Input type="time" value={f.time_end ?? ''} onChange={e => set('time_end', e.target.value || null)} />
          </div>
        </CrmV2Field>
        <CrmV2Field label="Statut">
          <CrmV2Select value={f.status} onChange={e => set('status', e.target.value as EventDraft['status'])}>
            {EVENT_STATUSES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </CrmV2Select>
        </CrmV2Field>
        <CrmV2Field label="On y va en mode">
          <CrmV2Select value={f.mode ?? ''} onChange={e => set('mode', (e.target.value || null) as EventDraft['mode'])}>
            <option value="">À définir</option>
            {LYCEE_MODES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </CrmV2Select>
        </CrmV2Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <CrmV2Toggle checked={f.date_confirmed !== false} onChange={v => set('date_confirmed', v)}
            label={f.date_confirmed !== false ? 'Date confirmée par le lycée' : 'Date probable (à confirmer)'} />
        </div>
        <CrmV2Field label="Intervenant(s) envoyé(s)">
          <CrmV2Input value={f.intervenants ?? ''} onChange={e => set('intervenants', e.target.value)} placeholder="Lirone, Raphaël" />
        </CrmV2Field>
        <CrmV2Field label="Leads / numéros récupérés">
          <CrmV2Input type="number" min={0} value={f.leads_count ?? ''} onChange={e => set('leads_count', e.target.value === '' ? null : Number(e.target.value))} />
        </CrmV2Field>
        <CrmV2Field label="Public">
          <CrmV2Input value={f.audience ?? ''} onChange={e => set('audience', e.target.value)} placeholder="Premières et terminales spé SVT" />
        </CrmV2Field>
        <CrmV2Field label="Concurrence">
          <CrmV2Input value={f.competition ?? ''} onChange={e => set('competition', e.target.value)} placeholder="Médisup en anonyme…" />
        </CrmV2Field>
        {!f.uai && (
          <CrmV2Field label="Lieu" style={{ gridColumn: '1 / -1' }}>
            <CrmV2Input value={f.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="Gymnase…, Meaux (77)" />
          </CrmV2Field>
        )}
        <CrmV2Field label="Contact organisateur" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <CrmV2Input value={f.organizer_contact ?? ''} onChange={e => set('organizer_contact', e.target.value)} placeholder="Mme X, CPE — 06… / mail" style={{ flex: 1 }} />
            {editing && (
              <CrmV2Button size="sm" icon={<Search size={13} />} onClick={findContact} disabled={finding || saving}>
                {finding ? 'Recherche… (≈ 1 min)' : 'Chercher le contact'}
              </CrmV2Button>
            )}
          </div>
          {findNote && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4, wordBreak: 'break-word' }}>{findNote}</div>}
        </CrmV2Field>
        <CrmV2Field label="Notes" style={{ gridColumn: '1 / -1' }}>
          <CrmV2Textarea value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3} />
        </CrmV2Field>
        <CrmV2Field label="Source (lien)" style={{ gridColumn: '1 / -1' }}>
          <CrmV2Input value={f.source_url ?? ''} onChange={e => set('source_url', e.target.value)} placeholder="https://…" />
        </CrmV2Field>
        {editing && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Appels ({calls.length})</div>
            {!calls.length && <div style={{ fontSize: 12.5, color: crmV2.textFaint }}>Aucun appel noté pour ce forum.</div>}
            {calls.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderTop: `1px solid ${crmV2.borderLight}`, fontSize: 12.5 }}>
                <span style={{ width: 92, color: crmV2.textFaint, flexShrink: 0 }}>{fmtDateTime(c.created_at)}</span>
                {c.outcome && <OutcomePill outcome={c.outcome} />}
                <span style={{ flex: 1, minWidth: 0 }}>{c.content} <span style={{ color: crmV2.textFaint }}>· {c.author_name}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminModal>
  )
}

/** Champ de recherche d'un lycée (nom ou ville). */
export function LyceePicker({ lycees, value, onChange }: {
  lycees: LyceeOption[]
  value: string | null
  onChange: (uai: string | null) => void
}) {
  const current = lycees.find(l => l.uai === value) ?? null
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const results = useMemo(() => {
    const n = normalizeName(q)
    if (n.length < 2) return []
    const parts = n.split(' ')
    return lycees
      .filter(l => {
        const hay = normalizeName(`${l.name} ${l.city ?? ''} ${l.department ?? ''}`)
        return parts.every(p => hay.includes(p))
      })
      .slice(0, 8)
  }, [q, lycees])

  if (current && !open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38 }}>
        <Dept d={current.department} />
        <span style={{ fontWeight: 700 }}>{current.name}</span>
        <span style={{ color: crmV2.textMuted, fontSize: 12 }}>{current.city}</span>
        <CrmV2Button size="sm" variant="ghost" onClick={() => { setOpen(true); setQ('') }}>Changer</CrmV2Button>
        <CrmV2Button size="sm" variant="ghost" onClick={() => onChange(null)}>Retirer</CrmV2Button>
      </div>
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <CrmV2Input autoFocus={open} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un lycée (nom, ville)…" />
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: 42, left: 0, right: 0, zIndex: 5, background: crmV2.bg, border: `1px solid ${crmV2.border}`,
          borderRadius: crmV2.radius, boxShadow: crmV2.shadowPanel, overflow: 'hidden',
        }}>
          {results.map(l => (
            <button key={l.uai} type="button" onClick={() => { onChange(l.uai); setOpen(false); setQ('') }} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none', background: 'none',
              borderBottom: `1px solid ${crmV2.borderLight}`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', fontSize: 13,
            }}>
              <Dept d={l.department} />
              <span style={{ fontWeight: 600, color: crmV2.text }}>{l.name}</span>
              <span style={{ color: crmV2.textMuted, fontSize: 12 }}>{l.city}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
