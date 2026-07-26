'use client'

import { usePathname } from 'next/navigation'
import ComingSoon, { classicPathFromV2 } from '@/components/crm-v2/ComingSoon'

export default function CRMV2CatchAllPage() {
  const pathname = usePathname() || '/admin/crm-v2'
  return <ComingSoon classicHref={classicPathFromV2(pathname)} />
}
