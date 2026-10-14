'use client'

/** Contexte d'un lead transféré : l'appel à froid raté, pourquoi, et comment le reprendre. */
import { useEffect, useState } from 'react'
import { Forward, Headphones, Lightbulb, MessageSquareText, TriangleAlert } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2ModalHeader, CrmV2ModalShell } from '@/components/crm-v2/modals/ModalShell'
import { APPROACH_LABELS, formatCallWhen, formatTalk, type TransferDetail } from '@/lib/telepro-transfers-shared'

const block: React.CSSProperties = {
  background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 4,
}
const blockTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'flex', alignItems: 'center', gap: 6,
}

export default function TransferContextModal({ transferId, onClose }: { transferId: string; onClose: () => void }) {
  const [t, setT] = useState<TransferDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/crm/transfers/${transferId}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erreur'); setT(j) })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [transferId])

  const approach = t?.call.approach
  const tip = approach === 'diploma'
    ? 'Le premier appel a été fait avec l’approche « Diploma Santé » : reprends-le avec l’approche étudiants / asso.'
    : approach === 'etudiants'
      ? 'L’approche étudiants / asso a déjà été tentée : change d’angle (présentation Diploma, un autre interlocuteur, les parents…).'
      : null

  return (
    <CrmV2ModalShell
      onClose={onClose}
      width={600}
      closeOnEscape
      header={
        <CrmV2ModalHeader
          title={t ? `Lead transféré : ${t.contact_name}` : 'Lead transféré'}
          subtitle={t ? `Transféré${t.from_name ? ` par ${t.from_name} → ` : ' → '}${t.to_name ?? 'toi'} le ${formatCallWhen(t.created_at)}${t.created_by ? ` (par ${t.created_by})` : ''}` : undefined}
          icon={<Forward size={16} />}
          onClose={onClose}
        />
      }
    >
      {error && <div style={{ fontSize: 13, color: '#d13a41' }}>{error}</div>}
      {!t && !error && <div style={{ fontSize: 13, color: crmV2.textMuted }}>Chargement…</div>}
      {t && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...block, background: 'rgba(234,88,12,0.06)', borderColor: 'rgba(234,88,12,0.30)' }}>
            <div style={{ ...blockTitle, color: '#c2410c' }}>Premier appel (appel à froid) sans RDV</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>
              {formatCallWhen(t.call.started_at)} · {formatTalk(t.call.talk_sec)} de conversation{t.caller_name ? ` · par ${t.caller_name}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {approach && (
                <span style={{ background: approach === 'diploma' ? 'rgba(37,99,235,0.10)' : 'rgba(124,58,237,0.10)', color: approach === 'diploma' ? '#1d4ed8' : '#6d28d9', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                  {APPROACH_LABELS[approach]}
                </span>
              )}
              {t.call.cause_label && (
                <span style={{ background: 'rgba(220,38,38,0.08)', color: '#b91c1c', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                  Pas de RDV : {t.call.cause_label}
                </span>
              )}
              {t.lead_status_at_transfer && (
                <span style={{ background: crmV2.chipBg, color: crmV2.text, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                  Statut au transfert : {t.lead_status_at_transfer}
                </span>
              )}
            </div>
            {tip && <div style={{ fontSize: 12, color: '#9a3412', fontWeight: 600, marginTop: 4 }}>{tip}</div>}
          </div>

          {t.note && (
            <div style={block}>
              <div style={blockTitle}><MessageSquareText size={12} /> Mot de l’admin</div>
              <div style={{ fontSize: 13, color: crmV2.text, whiteSpace: 'pre-wrap' }}>{t.note}</div>
            </div>
          )}
          {t.call.summary && (
            <div style={block}>
              <div style={blockTitle}><MessageSquareText size={12} /> Ce qui s’est dit</div>
              <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5 }}>{t.call.summary}</div>
            </div>
          )}
          {t.call.missing && (
            <div style={block}>
              <div style={blockTitle}><TriangleAlert size={12} /> Pourquoi ça n’a pas abouti</div>
              <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5 }}>{t.call.missing}</div>
            </div>
          )}
          {t.call.advice && (
            <div style={block}>
              <div style={blockTitle}><Lightbulb size={12} /> Comment le reprendre</div>
              <div style={{ fontSize: 13, color: crmV2.text, lineHeight: 1.5 }}>{t.call.advice}</div>
            </div>
          )}
          {!t.call.analysed && (
            <div style={{ fontSize: 12, color: crmV2.textMuted }}>
              Cet appel n’a pas été analysé automatiquement : écoute l’enregistrement pour avoir le contexte.
            </div>
          )}
          {t.call.recording_url && (
            <a href={t.call.recording_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: crmV2.link, textDecoration: 'none' }}>
              <Headphones size={14} /> Écouter l’appel
            </a>
          )}
          <a href={`/admin/crm/contacts/${t.hubspot_contact_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: crmV2.link, textDecoration: 'none' }}>
            Ouvrir la fiche complète →
          </a>
        </div>
      )}
    </CrmV2ModalShell>
  )
}
