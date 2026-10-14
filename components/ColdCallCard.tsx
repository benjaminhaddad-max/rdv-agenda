'use client'

/**
 * Débrief d'un lead de la vue « À réattribuer » (aperçu du CRM) :
 *  - appel froid sans RDV : approche (Diploma / asso), quand, combien de temps,
 *    par qui, pourquoi pas de RDV, résumé, ce qui a manqué, conseil, enregistrement ;
 *  - « A relancer » sans date : dernier appel et son débrief s'il y en a un.
 * Rien si le lead n'est pas concerné (ou si l'utilisateur n'est pas admin).
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
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

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
  const call = c.call
  const ap = call?.approach ?? null
  const isRelance = c.kind === 'relance_sans_date'
  const waiting = !!c.retry_after && Date.parse(c.retry_after) > Date.now()
  const verdict = c.transferred
    ? `Déjà transféré à ${c.transferred.to_name} le ${fmtLong(c.transferred.created_at)}.`
    : isRelance
      ? (c.relance_at
        ? `Relance prévue le ${formatCallWhen(c.relance_at)} passée sans RDV → à faire bouger (autre télépro, autre approche).`
        : 'Statut « A relancer » sans date de relance → à faire bouger (autre télépro, autre approche).')
      : ap === 'diploma'
        ? 'Approche Diploma ratée → à redonner tout de suite pour un essai en approche asso / groupe d’étudiants.'
        : ap === 'etudiants'
          ? waiting
            ? `Approche asso déjà tentée → à replacer à partir du ${fmtLong(c.retry_after!)}.`
            : 'Approche asso déjà tentée il y a plus de 3 semaines → peut être replacé, en changeant d’angle.'
          : 'Approche pas détectée (appel non analysé) : écoute l’appel avant de décider.'

  return (
    <div style={{
      background: 'rgba(234,88,12,0.05)', border: '1px solid rgba(234,88,12,0.30)', borderRadius: 14,
      padding: '12px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <PhoneOutgoing size={14} color="#c2410c" />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {isRelance ? '« A relancer » sans date' : 'Appel froid sans RDV'}
        </span>
        {ap && (
          <span title={APPROACH_LABELS[ap]} style={{ background: APPROACH_COLORS[ap], color: '#fff', borderRadius: 999, padding: '1px 9px', fontSize: 11, fontWeight: 800 }}>
            {APPROACH_SHORT[ap]}
          </span>
        )}
      </div>
      {call ? (
        <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>
          {isRelance ? 'Dernier appel : ' : ''}{formatCallWhen(call.started_at)} · {formatTalk(call.talk_sec)}{call.caller ? ` · par ${call.caller.name}` : ''}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun appel de plus de 2 min ces 60 derniers jours.</div>
      )}
      <div style={{ fontSize: 12, color: crmV2.textMuted }}>
        {isRelance ? 'Statut « A relancer »' : ap ? APPROACH_LABELS[ap] : 'Approche non détectée'} · attribué à {c.telepro.name}
        {!isRelance && c.relance_at && <> · relance prévue le {formatCallWhen(c.relance_at)} <strong style={{ color: '#b91c1c' }}>dépassée</strong></>}
      </div>
      {call?.cause_label && (
        <div style={{ marginTop: 4 }}>
          <span style={{ background: 'rgba(220,38,38,0.08)', color: '#b91c1c', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
            Pas de RDV : {call.cause_label}
          </span>
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9a3412', marginTop: 4 }}>{verdict}</div>
      {call?.summary && (<><div style={label}><MessageSquareText size={12} /> Ce qui s’est dit</div><div style={text}>{call.summary}</div></>)}
      {call?.missing && (<><div style={label}><TriangleAlert size={12} /> Pourquoi ça n’a pas abouti</div><div style={text}>{call.missing}</div></>)}
      {call?.advice && (<><div style={label}><Lightbulb size={12} /> Comment le reprendre</div><div style={text}>{call.advice}</div></>)}
      {call?.recording_url && (
        <a href={call.recording_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: crmV2.link, textDecoration: 'none', marginTop: 6 }}>
          <Headphones size={14} /> Écouter l’appel
        </a>
      )}
    </div>
  )
}
