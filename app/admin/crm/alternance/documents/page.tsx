'use client'

import { useCallback, useEffect, useState } from 'react'
import AlternanceShell, { AlternanceCard, EmptyState } from '@/components/alternance/AlternanceShell'
import { DOCUMENT_TYPE_META } from '@/lib/alternance/constants'
import type { AlternanceDocument } from '@/lib/alternance/types'

export default function DocumentsPage() {
  const [items, setItems] = useState<AlternanceDocument[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <AlternanceShell
      title="Documents"
      subtitle="Dossiers documentaires archivés par contrat"
    >
      {loading ? <p>Chargement…</p> : items.length === 0 ? (
        <EmptyState message="Aucun document. Les CERFA et conventions générés apparaîtront ici." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(d => (
            <AlternanceCard key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{d.label}</div>
                  <div style={{ fontSize: 12, color: '#4a6070', marginTop: 4 }}>
                    {DOCUMENT_TYPE_META[d.doc_type]?.label}
                    {d.generated ? ' · Généré automatiquement' : ' · Upload manuel'}
                    {d.file_name ? ` · ${d.file_name}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#4a6070' }}>
                    {d.created_at ? new Date(d.created_at).toLocaleDateString('fr-FR') : ''}
                  </span>
                  {d.file_url && (
                    <button
                      onClick={() => downloadDoc(d.id)}
                      style={{ fontSize: 12, color: '#C9A84C', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Télécharger
                    </button>
                  )}
                </div>
              </div>
            </AlternanceCard>
          ))}
        </div>
      )}
    </AlternanceShell>
  )
}
