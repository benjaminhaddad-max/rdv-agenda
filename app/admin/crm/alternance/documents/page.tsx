'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import AlternanceShellV2 from '@/components/crm-v2/deal/AlternanceShellV2'
import { DOCUMENT_TYPE_META } from '@/lib/alternance/constants'
import type { AlternanceDocument } from '@/lib/alternance/types'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Pagination, CrmV2Empty,
  CrmV2Spinner, CrmV2Pill,
} from '@/components/crm-v2/primitives'

const PAGE_SIZE = 25

export default function DocumentsPage() {
  const [items, setItems] = useState<AlternanceDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/alternance/documents')
    setItems(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const downloadDoc = async (docId: string) => {
    const res = await fetch(`/api/alternance/documents/${docId}/download`)
    const data = await res.json()
    if (res.ok && data.url) window.open(data.url, '_blank')
    else alert(data.error || 'Erreur')
  }

  const list = Array.isArray(items) ? items : []
  const pageItems = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const dateOf = (d: AlternanceDocument) => d.created_at ? new Date(d.created_at).toLocaleDateString('fr-FR') : ''

  return (
    <AlternanceShellV2
      title="Documents"
      subtitle="Dossiers documentaires archivés par contrat"
    >
      <CrmV2TableCard
        footer={list.length > 0 ? <CrmV2Pagination page={page} pageSize={PAGE_SIZE} total={list.length} onChange={setPage} /> : undefined}
      >
        {loading ? <CrmV2Spinner /> : list.length === 0 ? (
          <CrmV2Empty
            icon={<FileText size={26} />}
            title="Aucun document"
            description="Les CERFA et conventions générés apparaîtront ici."
          />
        ) : isMobile ? (
          <div>
            {pageItems.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 12px', borderBottom: `1px solid ${crmV2.border}` }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: crmV2.goldSoft, color: crmV2.gold, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[DOCUMENT_TYPE_META[d.doc_type]?.label, d.generated ? 'Généré automatiquement' : 'Upload manuel', dateOf(d)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {d.file_url && (
                  <button
                    type="button"
                    onClick={() => downloadDoc(d.id)}
                    aria-label="Télécharger"
                    style={{
                      width: 40, height: 40, borderRadius: 999, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg,
                      color: crmV2.link, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <Download size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <CrmV2Table>
            <thead>
              <tr>
                <CrmV2Th>Document</CrmV2Th>
                <CrmV2Th>Type</CrmV2Th>
                <CrmV2Th>Origine</CrmV2Th>
                <CrmV2Th>Fichier</CrmV2Th>
                <CrmV2Th>Date</CrmV2Th>
                <CrmV2Th style={{ textAlign: 'right' }}>{''}</CrmV2Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(d => (
                <CrmV2Tr key={d.id}>
                  <CrmV2Td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: crmV2.goldSoft, color: crmV2.gold, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText size={14} />
                      </span>
                      {d.label}
                    </span>
                  </CrmV2Td>
                  <CrmV2Td>{DOCUMENT_TYPE_META[d.doc_type]?.label ? <CrmV2Pill>{DOCUMENT_TYPE_META[d.doc_type].label}</CrmV2Pill> : '—'}</CrmV2Td>
                  <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{d.generated ? 'Généré automatiquement' : 'Upload manuel'}</CrmV2Td>
                  <CrmV2Td style={{ color: crmV2.textMuted, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name || '—'}</CrmV2Td>
                  <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{dateOf(d) || '—'}</CrmV2Td>
                  <CrmV2Td style={{ textAlign: 'right' }}>
                    {d.file_url && (
                      <CrmV2Button variant="secondary" size="sm" icon={<Download size={13} />} onClick={() => downloadDoc(d.id)}>Télécharger</CrmV2Button>
                    )}
                  </CrmV2Td>
                </CrmV2Tr>
              ))}
            </tbody>
          </CrmV2Table>
        )}
      </CrmV2TableCard>
    </AlternanceShellV2>
  )
}
