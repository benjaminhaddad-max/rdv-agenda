'use client'

import { useEffect, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import SuiviRdvPanel from '@/components/SuiviRdvPanel'
import { CrmV2Body, CrmV2Header, CrmV2Page, CrmV2Select } from '@/components/crm-v2/primitives'

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
    <CrmV2Page>
      <CrmV2Header
        back={{ href: '/admin/crm/reports', label: isMobile ? 'Rapports' : 'Dashboards & Rapports' }}
        title="Suivi des RDV par télépro"
        subtitle="Rempli automatiquement à chaque RDV placé — statut issu de l’agenda"
        actions={
          <CrmV2Select
            value={teleproId}
            onChange={e => setTeleproId(e.target.value)}
            aria-label="Télépro"
            style={{ width: 'auto', minWidth: isMobile ? 0 : 220, maxWidth: '100%', borderRadius: 999, fontWeight: 600, height: 36 }}
          >
            <option value="all">Tous les télépros</option>
            {telepros.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </CrmV2Select>
        }
      />
      <CrmV2Body>
        <SuiviRdvPanel key={teleproId} teleproId={teleproId} showTelepro={teleproId === 'all'} />
      </CrmV2Body>
    </CrmV2Page>
  )
}
