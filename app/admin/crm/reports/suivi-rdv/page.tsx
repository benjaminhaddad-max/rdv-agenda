'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import SuiviRdvPanel from '@/components/SuiviRdvPanel'

type Telepro = { id: string; name: string }

export default function SuiviRdvTeleproPage() {
  const isMobile = useIsMobile()
  const [telepros, setTelepros] = useState<Telepro[]>([])
  const [teleproId, setTeleproId] = useState('all')

  useEffect(() => {
    fetch('/api/users?role=telepro')
      .then(r => r.ok ? r.json() : [])
      .then((rows: Telepro[]) => setTelepros([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', color: '#0e1e35', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: isMobile ? '0 12px' : '0 24px', height: 52, background: '#ffffff', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <ClipboardList size={16} style={{ color: '#C9A84C', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>Suivi RDV télépros</span>
          {!isMobile && (
            <span style={{ fontSize: 11, color: '#4a6070' }}>
              Rempli automatiquement à chaque RDV placé — statut issu de l’agenda
            </span>
          )}
        </div>
        <Link href="/admin/crm/reports" style={{ fontSize: 12, color: '#4a6070', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {isMobile ? '← Rapports' : '← Dashboards & Rapports'}
        </Link>
      </div>

      <div style={{ padding: isMobile ? '16px 12px' : '24px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 700 }}>Suivi des RDV par télépro</h1>
          <select
            value={teleproId}
            onChange={e => setTeleproId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', minWidth: 220 }}
          >
            <option value="all">Tous les télépros</option>
            {telepros.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <SuiviRdvPanel key={teleproId} teleproId={teleproId} showTelepro={teleproId === 'all'} />
      </div>
    </div>
  )
}
