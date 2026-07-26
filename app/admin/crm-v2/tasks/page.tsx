'use client'

import { makeClassicPage } from '@/components/crm-v2/makeClassicPage'

/** Design B = même page Tâches, shell V2 uniquement. */
export default makeClassicPage(
  () => import('../../crm/tasks/page'),
  '/admin/crm/tasks',
  'Tâches',
)
