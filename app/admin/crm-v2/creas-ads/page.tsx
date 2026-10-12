'use client'

import AdsCreativesBoard from '@/components/crm-v2/marketing2/ads-creatives/AdsCreativesBoard'
import { usePageTitle } from '@/components/DocumentTitle'

export default function CreasAdsPage() {
  usePageTitle('Créas Ads')
  return <AdsCreativesBoard />
}
