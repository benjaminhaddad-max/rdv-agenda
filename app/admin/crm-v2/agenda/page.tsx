'use client'

import { makeClassicPage } from '@/components/crm-v2/makeClassicPage'

/** Design B = même page Agenda, shell V2 uniquement. */
export default makeClassicPage(
  () => import('../../crm/agenda/page'),
  '/admin/crm/agenda',
  'Agenda',
)
