'use client'

/**
 * Lecture d'un mail partenariat et de son fil Gmail (envoyés + réponses).
 * Ouvrir une réponse la marque comme lue ; on peut y répondre (même fil, même
 * boîte), ouvrir la fiche du lycée, ou rattacher un mail orphelin à un lycée.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Paperclip, Reply } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Input, CrmV2Spinner, hexA } from '@/components/crm-v2/primitives'
import { AdminModal, AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import type { LyceeMode, LyceeRow } from '@/lib/lycees'
import { MAIL_BRANDS } from '@/lib/lycee-mail-shared'
import { api, fmtDateTime, ModePill } from './ui'
import type { ComposeTarget } from './EmailComposeModal'

type ThreadMsg = {
  id: string
  direction: 'in' | 'out'
  from_email: string | null
  from_name: string | null
  to_emails: string[]
  cc_emails: string[]
  subject: string | null
  body_text: string | null
  has_attachments: boolean
  author_name: string | null
  sent_at: string
  mode: LyceeMode
}

type EmailDetail = {
  email: ThreadMsg & { uai: string | null; event_id: string | null; read_at: string | null; mailbox: string }
  thread: ThreadMsg[]
}

type LyceeOption = Pick<LyceeRow, 'uai' | 'name' | 'city' | 'department'>

/** Coupe le texte cité (« Le … a écrit : », lignes « > ») pour n'afficher que le nouveau message. */
function splitQuoted(text: string): [string, string] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const idx = lines.findIndex((l, i) =>
    /^(le|on)\s.+(a écrit|wrote)\s*:\s*$/i.test(l.trim())
    || /^-{2,}\s*(message d'origine|original message|message transféré)/i.test(l.trim())
    || (/^>/.test(l) && lines.slice(i).filter(x => x.trim()).every(x => /^>/.test(x))))
  if (idx <= 0) return [text.trim(), '']
  return [lines.slice(0, idx).join('\n').trim(), lines.slice(idx).join('\n').trim()]
}

export default function EmailThreadModal({ emailId, lycees, onClose, onOpenLycee, onReply, onChanged }: {
  emailId: string
  lycees: LyceeOption[]
  onClose: () => void
  onOpenLycee: (uai: string) => void
  onReply: (target: ComposeTarget) => void
  onChanged: () => void
}) {
  const [d, setD] = useState<EmailDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showQuoted, setShowQuoted] = useState<Set<string>>(new Set())
  const [attachQuery, setAttachQuery] = useState('')
  const changed = useRef(onChanged)
  useEffect(() => { changed.current = onChanged })

  useEffect(() => {
    api<EmailDetail>(`/api/crm/lycees/emails/${emailId}`)
      .then(r => {
        setD(r)
        if (r.thread.some(m => m.direction === 'in') && !r.email.read_at) {
          void api(`/api/crm/lycees/emails/${emailId}`, { method: 'PATCH', json: { read: true } }).then(() => changed.current()).catch(() => {})
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [emailId])

  const e = d?.email
  const lycee = e?.uai ? lycees.find(l => l.uai === e.uai) : undefined
  const lastIn = d ? [...d.thread].reverse().find(m => m.direction === 'in') : undefined
  const subject = d?.thread[0]?.subject ?? e?.subject ?? '(sans objet)'

  const attachTo = async (uai: string) => {
    try {
      await api(`/api/crm/lycees/emails/${emailId}`, { method: 'PATCH', json: { uai } })
      setD(prev => prev ? { ...prev, email: { ...prev.email, uai } } : prev)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }
  const matches = attachQuery.trim().length >= 2
    ? lycees.filter(l => `${l.name} ${l.city ?? ''} ${l.uai}`.toLowerCase().includes(attachQuery.trim().toLowerCase())).slice(0, 8)
    : []

  return (
    <AdminModal
      open
      onClose={onClose}
      width={760}
      title={subject}
      subtitle={e ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ModePill mode={e.mode} /> {e.mailbox}{lycee ? ` · ${lycee.name}` : ''}</span> : undefined}
      footer={
        <>
          {e?.uai && (
            <CrmV2Button onClick={() => { onOpenLycee(e.uai!); onClose() }} style={{ marginRight: 'auto' }}>Ouvrir la fiche du lycée</CrmV2Button>
          )}
          <CrmV2Button onClick={onClose}>Fermer</CrmV2Button>
          {e && (e.uai || e.event_id) && (
            <CrmV2Button variant="primary" icon={<Reply size={14} />} onClick={() => {
              const target = lastIn ?? d!.thread[d!.thread.length - 1]
              onReply({
                uai: e.uai, eventId: e.event_id, name: lycee?.name ?? 'Réponse', mode: e.mode,
                replyTo: {
                  id: target.id, subject: target.subject, mode: e.mode,
                  from_email: target.direction === 'in' ? target.from_email : target.to_emails[0] ?? null,
                  from_name: target.direction === 'in' ? target.from_name : null,
                },
              })
              onClose()
            }}>Répondre</CrmV2Button>
          )}
        </>
      }
    >
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {!d ? (!error && <CrmV2Spinner />) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!e!.uai && !e!.event_id && (
            <div style={{ padding: 12, borderRadius: 12, background: crmV2.bgHover, border: `1px solid ${crmV2.border}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Ce mail n’est rattaché à aucun lycée. À quel lycée correspond-il ?</div>
              <CrmV2Input value={attachQuery} onChange={ev => setAttachQuery(ev.target.value)} placeholder="Nom du lycée, ville ou UAI…" style={{ width: '100%' }} />
              {matches.map(l => (
                <button key={l.uai} type="button" onClick={() => attachTo(l.uai)} style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 13, borderRadius: 8,
                }}
                  onMouseEnter={ev => { ev.currentTarget.style.background = crmV2.rowHover }}
                  onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}
                ><b>{l.name}</b> <span style={{ color: crmV2.textMuted }}>· {l.city} ({l.department})</span></button>
              ))}
            </div>
          )}
          {d.thread.map(m => {
            const [main, quoted] = splitQuoted(m.body_text || '')
            const isIn = m.direction === 'in'
            const brand = MAIL_BRANDS[m.mode]
            return (
              <div key={m.id} style={{
                borderRadius: 12, border: `1px solid ${isIn ? hexA('#16a34a', 0.3) : crmV2.border}`,
                background: isIn ? hexA('#16a34a', 0.04) : crmV2.bg, padding: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: hexA(isIn ? '#16a34a' : brand.color, 0.12), color: isIn ? '#16a34a' : brand.color,
                  }}>{isIn ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}</span>
                  <b>{isIn ? (m.from_name || m.from_email) : (m.author_name || brand.senderName)}</b>
                  <span style={{ color: crmV2.textMuted }}>{isIn ? m.from_email : `→ ${m.to_emails.join(', ')}`}</span>
                  {m.has_attachments && <Paperclip size={12} color={crmV2.textFaint} />}
                  <span style={{ marginLeft: 'auto', color: crmV2.textFaint }}>{fmtDateTime(m.sent_at)}</span>
                </div>
                <div style={{ fontSize: 13.5, color: crmV2.text, whiteSpace: 'pre-wrap', lineHeight: 1.55, marginTop: 8, wordBreak: 'break-word' }}>
                  {main || <span style={{ color: crmV2.textFaint }}>(message vide)</span>}
                </div>
                {quoted && (
                  <>
                    <button type="button" onClick={() => setShowQuoted(s => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}
                      style={{ marginTop: 6, background: 'none', border: 'none', color: crmV2.link, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      {showQuoted.has(m.id) ? 'Masquer le message cité' : '… afficher le message cité'}
                    </button>
                    {showQuoted.has(m.id) && (
                      <div style={{ fontSize: 12.5, color: crmV2.textMuted, whiteSpace: 'pre-wrap', marginTop: 6, paddingLeft: 10, borderLeft: `3px solid ${crmV2.border}` }}>{quoted}</div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AdminModal>
  )
}
