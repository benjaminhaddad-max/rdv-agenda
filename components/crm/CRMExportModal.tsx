'use client'

/**
 * Modale d'export CSV de la liste de contacts CRM.
 * Extrait de app/admin/crm/page.tsx — composant autonome avec son state interne.
 *
 * L'appelant fournit `buildParams` (qui rassemble les filtres actifs) et
 * `onExport(cols)` qui déclenche le téléchargement avec les colonnes choisies.
 */

import { useState, useEffect } from 'react'
import { X, Check, Download, RefreshCw } from 'lucide-react'

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
  { key: 'closer',              label: 'Closer' },
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
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 14, width: 440, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #cbd6e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#33475b' }}>Exporter en CSV</div>
            <div style={{ fontSize: 12, color: '#7c98b6', marginTop: 2 }}>{exportCount !== null ? `${exportCount.toLocaleString('fr-FR')} contacts correspondent aux filtres actuels` : 'Calcul en cours…'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: '16px 20px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#516f90' }}>Colonnes à exporter</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSelected(EXPORT_COLUMNS.map(c => c.key))} style={{ background: 'none', border: 'none', color: '#4cabdb', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                Tout cocher
              </button>
              <button onClick={() => setSelected([])} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                Tout décocher
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {EXPORT_COLUMNS.map(col => (
              <button
                key={col.key}
                type="button"
                onClick={() => toggleCol(col.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: selected.includes(col.key) ? 'rgba(204,172,113,0.06)' : 'transparent',
                  border: '1px solid', borderColor: selected.includes(col.key) ? 'rgba(204,172,113,0.2)' : 'transparent',
                  fontFamily: 'inherit', fontSize: 13, color: '#516f90', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: selected.includes(col.key) ? '2px solid #ccac71' : '2px solid #3a5070',
                  background: selected.includes(col.key) ? '#ccac71' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected.includes(col.key) && <Check size={11} color="#ffffff" strokeWidth={3} />}
                </span>
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #cbd6e2', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, color: '#516f90', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button
            onClick={() => selected.length > 0 && onExport(selected)}
            disabled={selected.length === 0 || exporting}
            style={{
              flex: 1, padding: '10px',
              background: selected.length > 0 ? 'rgba(204,172,113,0.15)' : '#f5f8fa',
              border: '1px solid', borderColor: selected.length > 0 ? 'rgba(204,172,113,0.4)' : '#cbd6e2',
              borderRadius: 8, color: selected.length > 0 ? '#ccac71' : '#7c98b6',
              fontSize: 13, fontWeight: 700, cursor: selected.length > 0 ? 'pointer' : 'default',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? (
              <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Export en cours…</>
            ) : (
              <><Download size={13} /> Exporter ({selected.length} col.)</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
