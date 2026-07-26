'use client'

import dynamic from 'next/dynamic'
import { ClassicBridgeBanner } from '@/components/crm-v2/ClassicBridge'
import { crmV2 } from '@/lib/crm-v2-theme'

/**
 * Contacts Design B : table complète (aperçu, ouvrir, toutes les colonnes,
 * scroll horizontal) via la page CRM classique, dans le shell V2.
 * Le redesign HubSpot pur reviendra une fois la table V2 à parité.
 */
const ClassicContactsPage = dynamic(() => import('../crm/page'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 48, color: crmV2.textMuted, fontSize: 13, fontFamily: crmV2.font }}>
      Chargement des contacts…
    </div>
  ),
})

export default function ContactsV2Page() {
  return (
    <div className="crm-v2" style={{ minHeight: '100%', background: crmV2.bgSoft }}>
      <ClassicBridgeBanner classicHref="/admin/crm" label="Design B — Contacts" />
      <ClassicContactsPage />
    </div>
  )
}
