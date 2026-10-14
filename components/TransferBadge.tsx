'use client'

/** Pastille « Transfert » : le lead vient d'un autre télépro ; clic → contexte de l'appel. */
import { useState } from 'react'
import { Forward } from 'lucide-react'
import { APPROACH_LABELS, formatCallWhen, type TransferBadgeInfo } from '@/lib/telepro-transfers-shared'
import TransferContextModal from './TransferContextModal'

export default function TransferBadge({ info, onSeen }: { info: TransferBadgeInfo; onSeen?: () => void }) {
  const [open, setOpen] = useState(false)
  const title = [
    `Lead transféré${info.from_name ? ` (avant : ${info.from_name})` : ''} le ${formatCallWhen(info.created_at)}`,
    info.call_started_at ? `Premier appel : ${formatCallWhen(info.call_started_at)}${info.approach ? ` · ${APPROACH_LABELS[info.approach]}` : ''}` : null,
    'Cliquer pour voir le contexte de l’appel',
  ].filter(Boolean).join('\n')
  return (
    <>
      <button
        type="button"
        title={title}
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          background: info.seen ? 'rgba(234,88,12,0.08)' : '#ea580c',
          color: info.seen ? '#c2410c' : '#fff',
          border: `1px solid ${info.seen ? 'rgba(234,88,12,0.35)' : '#ea580c'}`,
          borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        <Forward size={11} /> Transfert
      </button>
      {open && (
        <TransferContextModal
          transferId={info.id}
          onClose={() => { setOpen(false); if (!info.seen) onSeen?.() }}
        />
      )}
    </>
  )
}
