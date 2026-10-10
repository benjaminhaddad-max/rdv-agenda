'use client'

/**
 * Espace télépro › « Mes mails » : la partie de la boîte admissions@ qui
 * concerne SES contacts (réponses aux mails de RDV, échanges avec Pascal…).
 * Il lit les fils et y répond en tant qu'admissions@ (le mail part de Gmail,
 * donc il reste visible dans la boîte admissions). Il peut aussi écrire un
 * nouveau mail à un de ses contacts.
 * API : /api/telepro/mails (lib/admissions-mail.ts).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Inbox, Mail, PenLine, RefreshCw, Search, Send, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button, CrmV2Empty } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'

type Thread = {
  thread_id: string
  contact: { id: string; name: string; email: string | null }
  subject: string | null
  snippet: string | null
  last_at: string
  last_direction: 'in' | 'out'
  count: number
  unread: number
}

type Message = {
  id: string
  contact_id: string
  direction: 'in' | 'out'
  from_email: string | null
  from_name: string | null
  to_emails: string[]
  subject: string | null
  body_text: string | null
  snippet: string | null
  has_attachments: boolean
  author_name: string | null
  sent_at: string
  gmail_thread_id: string | null
}

type ContactHit = { id: string; name: string; email: string }

function when(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  const days = (now.getTime() - d.getTime()) / 86400_000
  if (days < 6) return d.toLocaleDateString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
}

/** Sépare le message de la citation du mail précédent (« Le … a écrit : »). */
function splitQuote(text: string): { body: string; quote: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const idx = lines.findIndex((l, i) =>
    /^(le|on)\s.+(a écrit|wrote)\s*:?\s*$/i.test(l.trim())
    || (/^>/.test(l) && i > 0 && lines.slice(i).every(x => /^>|^\s*$/.test(x)))
    || /^-{2,}\s*(original message|message d'origine)/i.test(l.trim()))
  if (idx <= 0) return { body: text.trim(), quote: '' }
  return { body: lines.slice(0, idx).join('\n').trim(), quote: lines.slice(idx).join('\n').trim() }
}

export default function MyMails({ userId, readOnly = false }: { userId: string; readOnly?: boolean }) {
  const isMobile = useIsMobile()
  const endpoint = '/api/telepro/mails'
  const qs = `user_id=${encodeURIComponent(userId)}`
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${endpoint}?${qs}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMissing(!!j.missing_migration)
        setError(j.error || 'Mails indisponibles')
        return
      }
      setError(null)
      setThreads(j.threads as Thread[])
    } catch {
      setError('Mails indisponibles')
    } finally {
      setLoading(false)
    }
  }, [qs])

  useEffect(() => { load() }, [load])
  // Nouvelles réponses : la boîte est relevée toutes les 5 min
  useEffect(() => {
    const t = setInterval(load, 120_000)
    return () => clearInterval(t)
  }, [load])

  const shown = useMemo(
    () => (threads || []).filter(t => filter === 'all' || t.unread > 0),
    [threads, filter],
  )
  const unreadTotal = (threads || []).reduce((n, t) => n + t.unread, 0)
  const current = (threads || []).find(t => t.thread_id === selected) || null

  const onRead = useCallback((threadId: string) => {
    setThreads(prev => prev?.map(t => t.thread_id === threadId ? { ...t, unread: 0 } : t) ?? prev)
  }, [])

  const onSent = useCallback((threadId: string | null) => {
    setComposeOpen(false)
    if (threadId) setSelected(threadId)
    load()
  }, [load])

  if (missing) {
    return <AdminNotice tone="warning">La boîte mail arrive très bientôt (mise à jour de la base en cours).</AdminNotice>
  }

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${crmV2.border}` }}>
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            border: `1px solid ${filter === f ? crmV2.goldBorder : crmV2.border}`, background: filter === f ? crmV2.goldSoft : crmV2.bg,
            color: filter === f ? crmV2.goldDark : crmV2.textMuted, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {f === 'all' ? 'Tous' : `Non lus${unreadTotal ? ` (${unreadTotal})` : ''}`}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={load} title="Actualiser" style={{ border: 'none', background: 'none', cursor: 'pointer', color: crmV2.textMuted, display: 'flex' }}>
          {loading ? <AdminSpin /> : <RefreshCw size={14} />}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {threads === null && !error && <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><AdminSpin size={18} /></div>}
        {threads !== null && shown.length === 0 && (
          <CrmV2Empty
            icon={<Inbox size={26} />}
            title={filter === 'unread' ? 'Aucune réponse non lue' : 'Aucun mail pour l’instant'}
            description="Quand un de tes contacts écrit à admissions@ (ou répond à un mail de RDV), son mail apparaît ici."
          />
        )}
        {shown.map(t => {
          const active = t.thread_id === selected
          return (
            <button key={t.thread_id} onClick={() => setSelected(t.thread_id)} style={{
              display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${crmV2.borderLight}`,
              borderLeft: `3px solid ${active ? crmV2.gold : 'transparent'}`,
              background: active ? crmV2.goldSoft : t.unread ? '#f7fbff' : crmV2.bg, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {t.unread > 0 && <span style={{ width: 8, height: 8, borderRadius: 4, background: crmV2.info, flexShrink: 0, alignSelf: 'center' }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: t.unread ? 700 : 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.contact.name}
                </span>
                <span style={{ fontSize: 11, color: crmV2.textFaint, flexShrink: 0 }}>{when(t.last_at)}</span>
              </div>
              <div style={{ fontSize: 13, color: crmV2.text, fontWeight: t.unread ? 600 : 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.subject || '(sans objet)'}{t.count > 1 ? <span style={{ color: crmV2.textFaint }}> · {t.count}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.last_direction === 'out' ? 'Toi / admissions : ' : ''}{t.snippet}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mail size={18} color={crmV2.gold} /> Mes mails
        </div>
        <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>
          Les échanges de la boîte admissions@ avec tes contacts. Tu réponds au nom de l’équipe admissions.
        </div>
      </div>
      {!readOnly && <CrmV2Button variant="accent" icon={<PenLine size={14} />} onClick={() => setComposeOpen(true)}>Nouveau mail</CrmV2Button>}
    </div>
  )

  const threadPane = current
    ? <ThreadView key={current.thread_id} thread={current} qs={qs} readOnly={readOnly} onRead={onRead} onSent={onSent} onBack={isMobile ? () => setSelected(null) : undefined} />
    : (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: crmV2.textFaint, fontSize: 13 }}>
        Choisis un échange à gauche.
      </div>
    )

  return (
    <div style={{ padding: isMobile ? '12px 12px 24px' : 0 }}>
      {header}
      {error && <AdminNotice tone="error" style={{ marginBottom: 12 }}>{error}</AdminNotice>}
      {isMobile ? (
        <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusMain, overflow: 'hidden', minHeight: 420 }}>
          {current ? threadPane : list}
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: '360px 1fr', height: 'calc(100vh - 290px)', minHeight: 480,
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusMain, overflow: 'hidden',
        }}>
          <div style={{ borderRight: `1px solid ${crmV2.border}`, minHeight: 0 }}>{list}</div>
          <div style={{ minHeight: 0 }}>{threadPane}</div>
        </div>
      )}
      {composeOpen && <ComposeDialog qs={qs} onClose={() => setComposeOpen(false)} onSent={onSent} />}
    </div>
  )
}

function ThreadView({ thread, qs, readOnly, onRead, onSent, onBack }: {
  thread: Thread
  qs: string
  readOnly: boolean
  onRead: (threadId: string) => void
  onSent: (threadId: string | null) => void
  onBack?: () => void
}) {
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/telepro/mails/${encodeURIComponent(thread.thread_id)}?${qs}`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return
        if (!ok) { setError(j.error || 'Fil indisponible'); return }
        setMessages(j.messages as Message[])
        if (thread.unread) onRead(thread.thread_id)
      })
      .catch(() => { if (!cancelled) setError('Fil indisponible') })
    return () => { cancelled = true }
  }, [thread.thread_id, thread.unread, qs, onRead])

  async function send() {
    if (!reply.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/telepro/mails', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: thread.contact.id, thread_id: messages?.[0]?.gmail_thread_id || null, text: reply }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Envoi impossible'); return }
      setReply('')
      setMessages(prev => [...(prev || []), j.email as Message])
      onSent(null)
    } catch {
      setError('Envoi impossible')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${crmV2.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{ border: 'none', background: 'none', cursor: 'pointer', color: crmV2.textMuted, display: 'flex', padding: 0 }}>
            <ArrowLeft size={18} />
          </button>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.subject || '(sans objet)'}</div>
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>{thread.contact.name}{thread.contact.email ? ` · ${thread.contact.email}` : ''}</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', background: crmV2.bgSoft }}>
        {!messages && !error && <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><AdminSpin size={18} /></div>}
        {messages?.map(m => <MessageBubble key={m.id} m={m} />)}
      </div>
      {error && <AdminNotice tone="error" style={{ margin: '10px 18px 0' }}>{error}</AdminNotice>}
      {!readOnly && (
        <div style={{ padding: '12px 18px 16px', borderTop: `1px solid ${crmV2.border}`, background: crmV2.bg }}>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder={`Répondre à ${thread.contact.name.split(' ')[0] || 'ton contact'}… (part d’admissions@, signé à ton nom)`}
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
              padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: crmV2.text, outline: 'none', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <CrmV2Button variant="accent" icon={sending ? <AdminSpin /> : <Send size={14} />} disabled={sending || !reply.trim()} onClick={send}>
              Envoyer
            </CrmV2Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ m }: { m: Message }) {
  const [showQuote, setShowQuote] = useState(false)
  const out = m.direction === 'out'
  const { body, quote } = splitQuote(m.body_text || m.snippet || '')
  const who = out ? (m.author_name || 'Admissions') : (m.from_name || m.from_email || 'Contact')
  return (
    <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{
        maxWidth: '82%', background: out ? '#eaf2fb' : crmV2.bg, border: `1px solid ${out ? '#cfe0f3' : crmV2.border}`,
        borderRadius: 12, padding: '10px 14px', boxShadow: crmV2.shadow,
      }}>
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 6, display: 'flex', gap: 8 }}>
          <strong style={{ color: crmV2.text }}>{who}</strong>
          <span>{when(m.sent_at)}</span>
          {m.has_attachments && <span>· pièce jointe (voir Gmail)</span>}
        </div>
        <div style={{ fontSize: 14, color: crmV2.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>{body || '(message vide)'}</div>
        {quote && (
          <>
            <button onClick={() => setShowQuote(v => !v)} style={{
              marginTop: 6, border: 'none', background: crmV2.chipBg, borderRadius: 6, padding: '1px 8px', fontSize: 12,
              color: crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
            }}>•••</button>
            {showQuote && <div style={{ marginTop: 6, fontSize: 12, color: crmV2.textFaint, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{quote}</div>}
          </>
        )}
      </div>
    </div>
  )
}

function ComposeDialog({ qs, onClose, onSent }: { qs: string; onClose: () => void; onSent: (threadId: string | null) => void }) {
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<ContactHit[]>([])
  const [contact, setContact] = useState<ContactHit | null>(null)
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (contact || search.trim().length < 2) { setHits([]); return }
    const t = setTimeout(() => {
      fetch(`/api/telepro/mails?${qs}&search=${encodeURIComponent(search.trim())}`, { cache: 'no-store' })
        .then(r => r.json()).then(j => setHits((j.contacts || []) as ContactHit[])).catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [search, contact, qs])

  async function send() {
    if (!contact || !subject.trim() || !text.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/telepro/mails', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id, subject, text }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Envoi impossible'); return }
      onSent(j.email?.gmail_thread_id || null)
    } catch {
      setError('Envoi impossible')
    } finally {
      setSending(false)
    }
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
    padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', color: crmV2.text, outline: 'none',
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.35)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: crmV2.bg, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowPanel, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: crmV2.text }}>Nouveau mail</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: crmV2.textMuted, display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 12 }}>Part de <strong>admissions@diploma-sante.fr</strong>, signé à ton nom. Les réponses arrivent dans « Mes mails ».</div>

        <label style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>À</label>
        {contact ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px', padding: '8px 12px', background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: crmV2.radius }}>
            <span style={{ flex: 1, fontSize: 14, color: crmV2.text }}><strong>{contact.name}</strong> · {contact.email}</span>
            <button onClick={() => { setContact(null); setSearch('') }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: crmV2.textMuted, display: 'flex' }}><X size={14} /></button>
          </div>
        ) : (
          <div style={{ position: 'relative', margin: '4px 0 12px' }}>
            <Search size={14} color={crmV2.textFaint} style={{ position: 'absolute', left: 11, top: 12 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Un de tes contacts (nom ou email)" style={{ ...input, paddingLeft: 32 }} autoFocus />
            {hits.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius, boxShadow: crmV2.shadow, zIndex: 2, overflow: 'hidden' }}>
                {hits.map(h => (
                  <button key={h.id} onClick={() => setContact(h)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${crmV2.borderLight}`, background: crmV2.bg, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: crmV2.text }}>
                    <strong>{h.name}</strong> <span style={{ color: crmV2.textFaint }}>· {h.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>Objet</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Votre rendez-vous Diploma Santé" style={{ ...input, margin: '4px 0 12px' }} />
        <label style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>Message</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={7} placeholder="Bonjour…" style={{ ...input, margin: '4px 0 0', resize: 'vertical', lineHeight: 1.5 }} />
        {error && <AdminNotice tone="error" style={{ marginTop: 10 }}>{error}</AdminNotice>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <CrmV2Button onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="accent" icon={sending ? <AdminSpin /> : <Send size={14} />} disabled={sending || !contact || !subject.trim() || !text.trim()} onClick={send}>Envoyer</CrmV2Button>
        </div>
      </div>
    </div>
  )
}
