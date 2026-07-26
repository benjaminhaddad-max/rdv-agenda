'use client'

import { makeClassicPage } from '@/components/crm-v2/makeClassicPage'

/**
 * Contacts Design B : page classique complète (filtres avancés, Journal Repop,
 * export/import CSV, outils, aperçu, ouvrir, colonnes…) + skin visuelle V2.
 */
export default makeClassicPage(
  () => import('../crm/page'),
  '/admin/crm',
  'Contacts',
)
