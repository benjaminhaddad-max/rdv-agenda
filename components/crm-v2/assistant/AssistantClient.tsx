'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button, CrmV2Header, CrmV2Page } from '@/components/crm-v2/primitives'
import type { AssignmentProposal } from '@/lib/crm-assistant'

// Historique au format de l'API (blocs de réflexion compris) : renvoyé tel
// quel au serveur à chaque tour — on ne le réécrit jamais.
type ApiMessage = { role: 'user' | 'assistant'; content: unknown }

type ProposalState = AssignmentProposal & {
  status: 'pending' | 'applying' | 'done' | 'dismissed' | 'error'
  result?: string
}
type Entry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; proposals: ProposalState[] }
  | { kind: 'error'; text: string }

const STORAGE_KEY = 'crm-assistant-leads-v1'

const SUGGESTIONS = [
  'Fais-moi un point sur l\'équipe cette semaine : qui a de la place, qui est surchargé ?',
  'Combien de leads Terminale hors IDF chauds n\'ont pas de télépro ?',
  'Trouve les leads post-bac éligibles PAES qui ont répondu à un SMS ou cliqué un lien',
  'Analyse le portefeuille de Mohamed Lassouane',
]

export default function AssistantClient() {
  const isMobile = useIsMobile()
  const [history, setHistory] = useState<ApiMessage[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { history: ApiMessage[]; entries: Entry[] }
        if (Array.isArray(saved.history) && Array.isArray(saved.entries)) {
          setHistory(saved.history)
          setEntries(saved.entries)
        }
      }
    } catch { /* stockage indisponible : conversation neuve */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ history, entries })) } catch { /* quota / navigation privée */ }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [history, entries])

  async function send(text: string) {
    const t = text.trim()
    if (!t || busy) return
    setInput('')
    setBusy(true)
    setEntries(e => [...e, { kind: 'user', text: t }])
    try {
      const res = await fetch('/api/crm/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, text: t }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`)
      setHistory(data.messages as ApiMessage[])
      setEntries(e => [...e, {
        kind: 'assistant',
        text: String(data.reply || ''),
        proposals: ((data.proposals ?? []) as AssignmentProposal[]).map(p => ({ ...p, status: 'pending' as const })),
      }])
    } catch (err) {
      setEntries(e => [...e, { kind: 'error', text: err instanceof Error ? err.message : 'Erreur' }])
    } finally {
      setBusy(false)
    }
  }

  function updateProposal(id: string, patch: Partial<ProposalState>) {
    setEntries(es => es.map(e => e.kind !== 'assistant' ? e : {
      ...e, proposals: e.proposals.map(p => p.id === id ? { ...p, ...patch } : p),
    }))
  }

  async function apply(p: ProposalState) {
    updateProposal(p.id, { status: 'applying' })
    try {
      const res = await fetch('/api/crm/assistant/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: p.contactIds, telepro_rdv_user_id: p.telepro.id, view_name: p.viewName, keep_status: p.keepStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`)
      const parts = [`${data.done} leads attribués à ${data.telepro}`]
      if (data.view_id) parts.push(`vue « ${p.viewName} » créée`)
      if (data.errors?.length) parts.push(`${data.errors.length} avertissement(s)`)
      updateProposal(p.id, { status: 'done', result: parts.join(' · ') })
    } catch (err) {
      updateProposal(p.id, { status: 'error', result: err instanceof Error ? err.message : 'Erreur' })
    }
  }

  function reset() {
    if (busy) return
    setHistory([])
    setEntries([])
  }

  const pad = isMobile ? 12 : 28

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CrmV2Header
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkles size={18} color={crmV2.gold} /> Assistant leads</span>}
        subtitle="Analyse les portefeuilles des télépros et prépare la distribution des leads. Rien n'est attribué sans ta confirmation."
        actions={entries.length > 0 ? (
          <CrmV2Button onClick={reset} disabled={busy} icon={<RotateCcw size={14} />}>Nouvelle conversation</CrmV2Button>
        ) : undefined}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: `16px ${pad}px` }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {entries.length === 0 && (
            <div style={{ padding: '24px 0' }}>
              <div style={{ fontSize: 14, color: crmV2.textMuted, marginBottom: 12 }}>Quelques idées pour commencer :</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} type="button" onClick={() => send(s)} style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: crmV2.radius, cursor: 'pointer',
                    background: crmV2.bg, border: `1px solid ${crmV2.border}`, color: crmV2.text,
                    fontSize: 13, lineHeight: 1.45, fontFamily: 'inherit',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {entries.map((e, i) => e.kind === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', background: crmV2.primary, color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {e.text}
            </div>
          ) : e.kind === 'error' ? (
            <div key={i} style={{ alignSelf: 'flex-start', background: crmV2.dangerSoft, color: crmV2.danger, border: `1px solid ${crmV2.danger}`, padding: '10px 14px', borderRadius: 12, fontSize: 13 }}>
              {e.text}
            </div>
          ) : (
            <div key={i} style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {e.text && (
                <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 14, padding: '12px 16px', fontSize: 14, lineHeight: 1.55, color: crmV2.text, overflowX: 'auto' }}>
                  <Markdown text={e.text} />
                </div>
              )}
              {e.proposals.map(p => (
                <ProposalCard
                  key={p.id}
                  p={p}
                  onApply={() => apply(p)}
                  onDismiss={() => updateProposal(p.id, { status: 'dismissed' })}
                  onToggleKeep={v => updateProposal(p.id, { keepStatus: v })}
                />
              ))}
            </div>
          ))}

          {busy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: crmV2.textMuted, fontSize: 13 }}>
              <Loader2 size={14} style={{ animation: 'crm-v2-spin 0.9s linear infinite' }} /> L&apos;assistant analyse les données…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${crmV2.border}`, background: crmV2.bg, padding: `12px ${pad}px` }}>
        <form
          onSubmit={ev => { ev.preventDefault(); void send(input) }}
          style={{ maxWidth: 860, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}
        >
          <textarea
            value={input}
            onChange={ev => setInput(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void send(input) } }}
            placeholder="Ex. : donne 200 leads Terminale hors IDF chauds à Nora, dans une vue « BONS LEADS »"
            rows={2}
            disabled={busy}
            style={{
              flex: 1, resize: 'none', padding: '10px 12px', borderRadius: crmV2.radius, border: `1px solid ${crmV2.borderStrong}`,
              fontSize: 14, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, outline: 'none', minHeight: 44,
            }}
          />
          <CrmV2Button
            variant="accent"
            disabled={busy || !input.trim()}
            onClick={() => void send(input)}
            icon={busy ? <Loader2 size={14} style={{ animation: 'crm-v2-spin 0.9s linear infinite' }} /> : <Send size={14} />}
            style={{ minHeight: 44 }}
          >
            Envoyer
          </CrmV2Button>
        </form>
      </div>
    </CrmV2Page>
  )
}

function ProposalCard({ p, onApply, onDismiss, onToggleKeep }: {
  p: ProposalState
  onApply: () => void
  onDismiss: () => void
  onToggleKeep: (v: boolean) => void
}) {
  const top = (m: Record<string, number> | undefined, n = 4) =>
    Object.entries(m ?? {}).slice(0, n).map(([k, v]) => `${k} : ${v}`).join(' · ')
  const done = p.status === 'done'
  const closed = done || p.status === 'dismissed'
  return (
    <div style={{
      border: `1px solid ${done ? crmV2.successStrong : crmV2.goldBorder}`, background: done ? 'rgba(22,163,74,0.06)' : crmV2.goldSoft,
      borderRadius: 14, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, opacity: p.status === 'dismissed' ? 0.55 : 1,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: crmV2.goldDark }}>
        Proposition d&apos;attribution
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>
        {p.count} leads → {p.telepro.name}
        {p.viewName && <span style={{ fontWeight: 500, color: crmV2.textMuted }}> · vue « {p.viewName} »</span>}
      </div>
      <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>{p.criteriaLabel}</div>
      <div style={{ fontSize: 12.5, color: crmV2.text, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {top(p.summary.signaux) && <div><b>Signaux</b> — {top(p.summary.signaux)}</div>}
        {top(p.summary.zones) && <div><b>Zones</b> — {top(p.summary.zones)}</div>}
        {top(p.summary.derniere_activite) && <div><b>Dernière activité</b> — {top(p.summary.derniere_activite)}</div>}
      </div>
      {!closed && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: crmV2.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={p.keepStatus} disabled={p.status === 'applying'} onChange={ev => onToggleKeep(ev.target.checked)} />
          Garder leur statut actuel (sinon ils repassent en « Nouveau »)
        </label>
      )}
      {p.result && (
        <div style={{ fontSize: 13, fontWeight: 600, color: p.status === 'error' ? crmV2.danger : crmV2.successStrong }}>
          {done && <Check size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />}{p.result}
        </div>
      )}
      {!closed && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CrmV2Button
            variant="accent"
            onClick={onApply}
            disabled={p.status === 'applying'}
            icon={p.status === 'applying' ? <Loader2 size={14} style={{ animation: 'crm-v2-spin 0.9s linear infinite' }} /> : <Check size={14} />}
          >
            {p.status === 'applying' ? 'Attribution…' : p.status === 'error' ? 'Réessayer' : 'Confirmer l\'attribution'}
          </CrmV2Button>
          <CrmV2Button onClick={onDismiss} disabled={p.status === 'applying'} icon={<X size={14} />}>Ignorer</CrmV2Button>
        </div>
      )}
      {p.status === 'dismissed' && <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>Proposition ignorée.</div>}
    </div>
  )
}

// ── Markdown minimal (titres, listes, tableaux, gras) sans HTML brut ─────────

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: crmV2.chipBg, padding: '1px 4px', borderRadius: 4, fontSize: '0.92em' }}>{part.slice(1, -1)}</code>
    return part
  })
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map(c => c.trim()))
        i++
      }
      const [head, ...body] = rows
      out.push(
        <table key={out.length} style={{ borderCollapse: 'collapse', margin: '6px 0', fontSize: 13, width: '100%' }}>
          <thead><tr>{head.map((c, j) => <th key={j} style={{ textAlign: 'left', padding: '5px 8px', background: crmV2.thBg, borderBottom: `1px solid ${crmV2.thBorder}`, whiteSpace: 'nowrap' }}>{inline(c)}</th>)}</tr></thead>
          <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={{ padding: '5px 8px', borderBottom: `1px solid ${crmV2.borderLight}` }}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>,
      )
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      out.push(<Tag key={out.length} style={{ margin: '4px 0', paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it)}</li>)}</Tag>)
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      out.push(<div key={out.length} style={{ fontWeight: 700, fontSize: h[1].length <= 2 ? 15 : 14, margin: '8px 0 2px' }}>{inline(h[2])}</div>)
      i++
      continue
    }
    if (line.trim()) out.push(<p key={out.length} style={{ margin: '4px 0' }}>{inline(line)}</p>)
    i++
  }
  return <>{out}</>
}
