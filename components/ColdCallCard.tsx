'use client'

/**
 * Débrief de l'appel froid d'un lead (aperçu du CRM, vue « À réattribuer ») :
 * approche (Diploma / asso), quand, combien de temps, par qui, pourquoi pas de
 * RDV, résumé, ce qui a manqué, conseil, enregistrement. Rien si le lead
 * n'est pas concerné (ou si l'utilisateur n'est pas admin).
 */
import { useEffect, useState } from 'react'
import { Headphones, Lightbulb, MessageSquareText, PhoneOutgoing, TriangleAlert } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  APPROACH_COLORS, APPROACH_LABELS, APPROACH_SHORT, formatCallWhen, formatTalk, type TransferCandidate,
} from '@/lib/telepro-transfers-shared'

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em',
  display: 'flex', alignItems: 'center', gap: 5, marginTop: 6,
}
const text: React.CSSProperties = { fontSize: 13, color: crmV2.text, lineHeight: 1.5 }

export default function ColdCallCard({ contactId }: { contactId: string }) {
  const [c, setC] = useState<TransferCandidate | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/crm/transfers/context', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_ids: [contactId] }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setC(j?.context?.[contactId] ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [contactId])

  if (!c) return null
  const ap = c.call.approach
  const waiting = !!c.retry_after && Date.parse(c.retry_after) > Date.now()
  const verdict = c.transferred
    ? `Déjà transféré à ${c.transferred.to_name} le ${new Date(c.transferred.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
    : ap === 'diploma'
      ? 'Approche Diploma ratée → à redonner tout de suite pour un essai en approche asso / groupe d’étudiants.'
      : ap === 'etudiants'
        ? waiting
          ? `Approche asso déjà tentée → à replacer à partir du ${new Date(c.retry_after!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
          : 'Approche asso déjà tentée il y a plus de 3 semaines → peut être replacé, en changeant d’angle.'
        : 'Approche pas détectée (appel non analysé) : écoute l’appel avant de décider.'

  return (
    <div style={{
      background: 'rgba(234,88,12,0.05)', border: '1px solid rgba(234,88,12,0.30)', borderRadius: 14,
      padding: '12px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <PhoneOutgoing size={14} color="#c2410c" />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Appel froid sans RDV</span>
        {ap && (
          <span title={APPROACH_LABELS[ap]} style={{ background: APPROACH_COLORS[ap], color: '#fff', borderRadius: 999, padding: '1px 9px', fontSize: 11, fontWeight: 800 }}>
            {APPROACH_SHORT[ap]}
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>
        {formatCallWhen(c.call.started_at)} · {formatTalk(c.call.talk_sec)}{c.call.caller ? ` · par ${c.call.caller.name}` : ''}
      </div>
      <div style={{ fontSize: 12, color: crmV2.textMuted }}>
        {ap ? APPROACH_LABELS[ap] : 'Approche non détectée'} · attribué à {c.telepro.name}
        {c.relance_at && <> · relance prévue le {formatCallWhen(c.relance_at)} <strong style={{ color: '#b91c1c' }}>dépassée</strong></>}
      </div>
      {c.call.cause_label && (
        <div style={{ marginTop: 4 }}>
          <span style={{ background: 'rgba(220,38,38,0.08)', color: '#b91c1c', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
            Pas de RDV : {c.call.cause_label}
          </span>
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9a3412', marginTop: 4 }}>{verdict}</div>
      {c.call.summary && (<><div style={label}><MessageSquareText size={12} /> Ce qui s’est dit</div><div style={text}>{c.call.summary}</div></>)}
      {c.call.missing && (<><div style={label}><TriangleAlert size={12} /> Pourquoi ça n’a pas abouti</div><div style={text}>{c.call.missing}</div></>)}
      {c.call.advice && (<><div style={label}><Lightbulb size={12} /> Comment le reprendre</div><div style={text}>{c.call.advice}</div></>)}
      {c.call.recording_url && (
        <a href={c.call.recording_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: crmV2.link, textDecoration: 'none', marginTop: 6 }}>
          <Headphones size={14} /> Écouter l’appel
        </a>
      )}
    </div>
  )
}
