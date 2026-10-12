'use client'

import { use, useEffect } from 'react'
import AdsCreativesBoard from '@/components/crm-v2/marketing2/ads-creatives/AdsCreativesBoard'
import { crmV2 } from '@/lib/crm-v2-theme'

/** Lien partagé avec les créatifs (sans compte CRM) : même tableau, sans les réglages. */
export default function CreasAdsSharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  useEffect(() => { document.title = 'Créas Ads — Diploma Santé' }, [])
  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft, fontFamily: crmV2.font }}>
      <AdsCreativesBoard token={token} />
    </div>
  )
}
