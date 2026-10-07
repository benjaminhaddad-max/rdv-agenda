'use client'

/**
 * Modale d'export CSV de la liste de contacts CRM.
 * Extrait de app/admin/crm/page.tsx — composant autonome avec son state interne.
 *
 * L'appelant fournit `buildParams` (qui rassemble les filtres actifs) et
 * `onExport(cols)` qui déclenche le téléchargement avec les colonnes choisies.
 */

import { useState, useEffect } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import { CrmV2CheckRow, CrmV2ModalHeader, CrmV2ModalShell, crmV2LabelStyle } from '@/components/crm-v2/modals/ModalShell'

const EXPORT_COLUMNS = [
  { key: 'contact',             label: 'Contact (Prénom + Nom)' },
  { key: 'email',               label: 'Email' },
  { key: 'phone',               label: 'Téléphone' },
  { key: 'formation_souhaitee', label: 'Formation souhaitée' },
  { key: 'classe',              label: 'Classe' },
  { key: 'zone',                label: 'Zone' },
  { key: 'departement',         label: 'Département' },
  { key: 'etape',               label: 'Étape' },
  { key: 'lead_status',         label: 'Statut lead' },
  { key: 'origine',             label: 'Origine' },
  { key: 'closer',              label: 'Closer du contact' },
  { key: 'telepro',             label: 'Télépro' },
  { key: 'createdat_contact',   label: 'Date création (contact)' },
  { key: 'createdat_deal',      label: 'Date création (deal)' },
  { key: 'form_submission',     label: 'Soumission formulaire' },
]

export default function ExportCSVModal({ buildParams, exporting, onClose, onExport }: {
  buildParams: () => URLSearchParams
  exporting: boolean
  onClose: () => void
  onExport: (cols: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>(EXPORT_COLUMNS.map(c => c.key))
  const [exportCount, setExportCount] = useState<number | null>(null)

  useEffect(() => {
    const params = buildParams()
    params.set('limit', '0')
    fetch(`/api/crm/contacts?${params.toString()}`)
      .then(r => r.json())
      .then(d => setExportCount(d.total ?? 0))
      .catch(() => setExportCount(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleCol = (key: string) => {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  return (
    <CrmV2ModalShell
      onClose={onClose}
      width={460}
      maxHeight="84vh"
      header={
        <CrmV2ModalHeader
          title="Exporter en CSV"
          icon={<Download size={16} />}
          subtitle={exportCount !== null ? `${exportCount.toLocaleString('fr-FR')} contacts correspondent aux filtres actuels` : 'Calcul en cours…'}
          onClose={onClose}
        />
      }
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button
            variant="primary"
            onClick={() => selected.length > 0 && onExport(selected)}
            disabled={selected.length === 0 || exporting}
            icon={exporting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
          >
            {exporting ? 'Export en cours…' : `Exporter (${selected.length} col.)`}
          </CrmV2Button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <span style={crmV2LabelStyle}>Colonnes à exporter</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <CrmV2Button variant="ghost" size="sm" onClick={() => setSelected(EXPORT_COLUMNS.map(c => c.key))}>
            Tout cocher
          </CrmV2Button>
          <CrmV2Button variant="ghost" size="sm" onClick={() => setSelected([])} style={{ color: '#d13a41' }}>
            Tout décocher
          </CrmV2Button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {EXPORT_COLUMNS.map(col => (
          <CrmV2CheckRow key={col.key} checked={selected.includes(col.key)} onClick={() => toggleCol(col.key)}>
            {col.label}
          </CrmV2CheckRow>
        ))}
      </div>
    </CrmV2ModalShell>
  )
}
