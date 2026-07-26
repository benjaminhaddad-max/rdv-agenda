'use client'

import { makeClassicPage } from '@/components/crm-v2/makeClassicPage'

/** Design B = même page Dashboard, shell V2 uniquement. */
export default makeClassicPage(
  () => import('../../crm/dashboard/page'),
  '/admin/crm/dashboard',
  'Dashboard',
)
