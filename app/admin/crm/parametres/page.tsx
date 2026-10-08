'use client'

import { useEffect, useState } from 'react'
import { CrmV2Page, CrmV2Header, CrmV2Tabs } from '@/components/crm-v2/primitives'
import IntegrationsPanel from '@/components/crm-v2/parametres/IntegrationsPanel'
import ProprietesPanel from '@/components/crm-v2/parametres/ProprietesPanel'
import { useIsMobile } from '@/lib/useIsMobile'

type Tab = 'integrations' | 'proprietes'
const TABS: Tab[] = ['integrations', 'proprietes']

export default function ParametresPage() {
  const [tab, setTab] = useState<Tab>('integrations')
  const isMobile = useIsMobile()

  // Onglet lu / écrit dans l'URL (?tab=proprietes) pour pouvoir partager un lien direct
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
    if (t && TABS.includes(t)) setTab(t)
  }, [])

  function changeTab(t: Tab) {
    setTab(t)
    const url = new URL(window.location.href)
    if (t === 'integrations') url.searchParams.delete('tab')
    else url.searchParams.set('tab', t)
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column' }}>
      <CrmV2Header
        title="Paramètres"
        subtitle="Les outils connectés au CRM et les champs des fiches"
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={id => changeTab(id as Tab)}
          items={[
            { id: 'integrations', label: 'Intégrations' },
            { id: 'proprietes', label: 'Propriétés' },
          ]}
        />
      </CrmV2Header>

      <div style={{ padding: isMobile ? 12 : '24px 28px 32px' }}>
        <div style={{ maxWidth: tab === 'integrations' ? 1180 : undefined }}>
          {tab === 'integrations' ? <IntegrationsPanel /> : <ProprietesPanel />}
        </div>
      </div>
    </CrmV2Page>
  )
}
