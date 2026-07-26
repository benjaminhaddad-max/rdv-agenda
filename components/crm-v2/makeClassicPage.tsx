'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { ClassicBridgeBanner } from '@/components/crm-v2/ClassicBridge'
import { crmV2 } from '@/lib/crm-v2-theme'

/**
 * Règle Design B : aucune logique métier réécrite.
 * On monte la page classique telle quelle dans le shell V2 (+ bandeau).
 */
export function makeClassicPage(
  loader: () => Promise<{ default: ComponentType }>,
  classicHref: string,
  label: string,
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
      <div className="crm-v2 crm-v2-bridge" style={{ minHeight: '100%', background: crmV2.bgSoft }}>
        <ClassicBridgeBanner classicHref={classicHref} label={`Design B — ${label}`} />
        <div className="crm-v2-bridge-body">
          <Classic />
        </div>
      </div>
    )
  }
}
