'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { crmV2 } from '@/lib/crm-v2-theme'

/**
 * Règle Design B : aucune logique métier réécrite.
 * On monte la page classique telle quelle dans le shell V2,
 * la skin CSS (.crm-v2-skin) fait tout l'habillage visuel.
 */
export function makeClassicPage(
  loader: () => Promise<{ default: ComponentType }>,
  _classicHref: string,
  _label: string,
) {
  const Classic = dynamic(loader, {
    ssr: false,
    loading: () => (
      <div style={{ padding: 48, color: crmV2.textMuted, fontSize: 13, fontFamily: crmV2.font }}>
        Chargement…
      </div>
    ),
  })

  return function BridgedClassicPage() {
    return (
      <div className="crm-v2 crm-v2-bridge" style={{ minHeight: '100%' }}>
        <div className="crm-v2-bridge-body">
          <Classic />
        </div>
      </div>
    )
  }
}
