'use client'

import { makeClassicPage } from '@/components/crm-v2/makeClassicPage'

/** Design B = même page Contacts (toutes fonctionnalités), shell V2 uniquement. */
export default makeClassicPage(
  () => import('../crm/page'),
  '/admin/crm',
  'Contacts',
)
