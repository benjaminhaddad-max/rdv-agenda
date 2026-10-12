'use client'

import { useEffect } from 'react'
import AdsCreativesBoard from '@/components/crm-v2/marketing2/ads-creatives/AdsCreativesBoard'
import LogoutButton from '@/components/LogoutButton'
import { crmV2 } from '@/lib/crm-v2-theme'

/** Espace des comptes créatifs (rôle « creatif ») : seulement le tableau Créas Ads. */
export default function CreasPage() {
  useEffect(() => { document.title = 'Créas Ads — Diploma Santé' }, [])
  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft, fontFamily: crmV2.font }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
        <LogoutButton />
      </div>
      <AdsCreativesBoard />
    </div>
  )
}
