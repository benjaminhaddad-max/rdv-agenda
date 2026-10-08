'use client'

/**
 * « Noter un appel » — lycée ou organisateur de forum, comme pour un lead :
 * numéros à appeler, résultat, remarque, prochain rappel, et l'historique des
 * appels précédents.
 */

import { useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Input, CrmV2Segmented, CrmV2Textarea, hexA } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminModal } from '@/components/crm-v2/admin/AdminUi'
import { CALL_OUTCOMES, type CallOutcome, type LyceeActivityRow, type LyceeContactRow } from '@/lib/lycees'
import { api, fmtDate, fmtDateTime, OutcomePill, parisTodayKey, telHref } from './ui'

export type CallTarget =
  | { type: 'lycee'; uai: string; name: string }
  | { type: 'event'; id: string; name: string }

type Phoneline = { label: string; value: string }

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10)
}

export default function CallLogModal({ target, onClose, onSaved }: {
  target: CallTarget | null
  onClose: () => void
  onSaved: () => void
}) {
  const today = parisTodayKey()
  const [kind, setKind] = useState<'call' | 'email' | 'visit'>('call')
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [text, setText] = useState('')
  const [next, setNext] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phones, setPhones] = useState<Phoneline[]>([])
  const [extra, setExtra] = useState<string | null>(null)
  const [history, setHistory] = useState<LyceeActivityRow[]>([])

  useEffect(() => {
    if (!target) return
    const url = target.type === 'lycee' ? `/api/crm/lycees/${target.uai}` : `/api/crm/lycees/events/${target.id}`
    api<{
      lycee?: { phone?: string | null; email?: string | null } | null
      contacts?: LyceeContactRow[]
      event?: { organizer_contact: string | null; source_url: string | null }
      activities: LyceeActivityRow[]
    }>(url).then(d => {
      const list: Phoneline[] = []
      if (d.lycee?.phone) list.push({ label: 'Standard du lycée', value: d.lycee.phone })
      for (const c of d.contacts ?? []) {
        if (c.is_alumni) continue
        for (const p of (c.phone || '').split(';').map(x => x.trim()).filter(Boolean)) {
          list.push({ label: [c.name, c.role].filter(Boolean).join(' · ') || 'Contact', value: p })
        }
      }
      setPhones(list)
      setExtra(d.event?.organizer_contact ?? null)
      setHistory(d.activities.filter(a => a.kind === 'call' || a.kind === 'email' || a.kind === 'visit' || a.outcome).slice(0, 8))
    }).catch(() => {})
  }, [target])

  if (!target) return null

  // Rappel proposé selon le résultat (modifiable)
  const pick = (o: CallOutcome) => {
    setOutcome(o)
    if (o === 'no_answer' || o === 'voicemail') setNext(addDays(today, 2))
    else if (o === 'callback' || o === 'mail_sent') setNext(addDays(today, 3))
    else if (o === 'interested') setNext(addDays(today, 7))
    else setNext('')
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const url = target.type === 'lycee' ? `/api/crm/lycees/${target.uai}/activities` : `/api/crm/lycees/events/${target.id}/activities`
      await api(url, { method: 'POST', json: { kind, outcome, content: text, next_action_at: next || null } })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      width={600}
      closeDisabled={saving}
      title={target.type === 'event' ? 'Appel — organisateur du forum' : 'Noter un appel'}
      subtitle={target.name}
      footer={
        <>
          <CrmV2Button onClick={onClose} disabled={saving}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={save} disabled={saving || (!outcome && !text.trim())}>{saving ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        {(phones.length > 0 || extra) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 12, background: crmV2.bgHover, border: `1px solid ${crmV2.border}` }}>
            {phones.map(p => (
              <a key={p.label + p.value} href={telHref(p.value)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: crmV2.text, textDecoration: 'none' }}>
                <Phone size={13} color={crmV2.link} />
                <b style={{ color: crmV2.link }}>{p.value}</b>
                <span style={{ color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
              </a>
            ))}
            {extra && <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>Organisateur : <b style={{ color: crmV2.text }}>{extra}</b></div>}
          </div>
        )}

        <CrmV2Segmented size="sm" value={kind} onChange={setKind} items={[
          { id: 'call', label: 'Appel' }, { id: 'email', label: 'Mail' }, { id: 'visit', label: 'Visite' },
        ]} />

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Résultat</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 6 }}>
            {CALL_OUTCOMES.map(o => {
              const on = outcome === o.id
              return (
                <button key={o.id} type="button" onClick={() => pick(o.id)} style={{
                  padding: '8px 10px', borderRadius: 10, fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 700 : 600, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${on ? o.color : crmV2.border}`, background: on ? hexA(o.color, 0.1) : crmV2.bg, color: on ? o.color : crmV2.text,
                }}>{o.label}</button>
              )
            })}
          </div>
        </div>

        <CrmV2Textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder="Remarque : à qui tu as parlé, ce qu’il faut retenir (ex. CPE Mme X, forum fin janvier, envoyer la plaquette AFEM)…" />

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Prochain rappel</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ l: 'Demain', d: 1 }, { l: '+3 j', d: 3 }, { l: '+1 sem.', d: 7 }, { l: '+1 mois', d: 30 }].map(x => (
              <CrmV2Button key={x.l} size="sm" variant={next === addDays(today, x.d) ? 'gold' : 'secondary'} onClick={() => setNext(addDays(today, x.d))}>{x.l}</CrmV2Button>
            ))}
            <CrmV2Input type="date" value={next} onChange={e => setNext(e.target.value)} style={{ width: 160 }} />
            <CrmV2Button size="sm" variant={!next ? 'gold' : 'ghost'} onClick={() => setNext('')}>Aucun</CrmV2Button>
          </div>
          {next && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>Rappel le {fmtDate(next, { weekday: true })}</div>}
        </div>

        {history.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Appels précédents</div>
            {history.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderTop: `1px solid ${crmV2.borderLight}`, fontSize: 12.5 }}>
                <span style={{ width: 92, color: crmV2.textFaint, flexShrink: 0 }}>{fmtDateTime(h.created_at)}</span>
                {h.outcome && <OutcomePill outcome={h.outcome} />}
                <span style={{ color: crmV2.text, flex: 1, minWidth: 0 }}>{h.content} <span style={{ color: crmV2.textFaint }}>· {h.author_name}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminModal>
  )
}
