'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

/**
 * Affiche une page CRM classique (A) dans le shell V2, avec bandeau
 * « Design B — contenu en migration » et lien vers l’URL classique.
 * Évite de dupliquer la logique métier des pages monolithes.
 */
export function ClassicBridgeBanner({ classicHref, label }: { classicHref: string; label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 20px',
        background: crmV2.goldSoft,
        borderBottom: `1px solid ${crmV2.goldBorder}`,
        fontFamily: crmV2.font,
      }}
    >
      <div style={{ fontSize: 13, color: crmV2.text }}>
        <strong style={{ color: crmV2.gold }}>{label || 'Design B'}</strong>
        <span style={{ color: crmV2.textMuted }}> — chrome V2 · contenu métier partagé avec la version classique</span>
      </div>
      <CrmV2Button variant="ghost" onClick={() => { window.location.href = classicHref }}>
        Ouvrir version classique
      </CrmV2Button>
    </div>
  )
}

export function makeClassicBridge(
  loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>,
  classicHref: string,
  label?: string,
) {
  const Classic = dynamic(loader, {
    ssr: false,
    loading: () => (
      <div style={{ padding: 40, color: crmV2.textMuted, fontSize: 13, fontFamily: crmV2.font }}>
        Chargement…
      </div>
    ),
  })

  return function BridgedPage(props: Record<string, unknown>) {
    return (
      <div className="crm-v2 crm-v2-bridge" style={{ minHeight: '100%', background: crmV2.bgSoft }}>
        <ClassicBridgeBanner classicHref={classicHref} label={label} />
        <div className="crm-v2-bridge-body">
          <Classic {...props} />
        </div>
      </div>
    )
  }
}
