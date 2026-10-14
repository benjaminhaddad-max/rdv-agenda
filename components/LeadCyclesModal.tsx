'use client'

/** Fenêtre « Cycles de vente » ouverte depuis le tableau du CRM. */
import { RefreshCcw } from 'lucide-react'
import { CrmV2ModalHeader, CrmV2ModalShell } from '@/components/crm-v2/modals/ModalShell'
import LeadCycleControl, { type CyclePanel } from './LeadCycleControl'

export default function LeadCyclesModal({ contactId, name, initialPanel = null, canManageProducts = false, onClose, onStatusChange }: {
  contactId: string
  name: string
  initialPanel?: CyclePanel
  canManageProducts?: boolean
  onClose: () => void
  onStatusChange?: (status: string | null) => void
}) {
  return (
    <CrmV2ModalShell
      onClose={onClose}
      width={620}
      closeOnEscape
      header={
        <CrmV2ModalHeader
          title={name}
          subtitle="Statut du lead, cycle de vente en cours et historique"
          icon={<RefreshCcw size={16} />}
          onClose={onClose}
        />
      }
    >
      <LeadCycleControl
        contactId={contactId}
        initialPanel={initialPanel}
        canManageProducts={canManageProducts}
        onStatusChange={onStatusChange}
      />
      <a
        href={`/admin/crm/contacts/${contactId}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-block', marginTop: 14, fontSize: 12, fontWeight: 600, color: '#0091ae', textDecoration: 'none' }}
      >
        Ouvrir la fiche complète →
      </a>
    </CrmV2ModalShell>
  )
}
