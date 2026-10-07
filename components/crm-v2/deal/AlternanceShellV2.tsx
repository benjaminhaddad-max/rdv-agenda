'use client'

/**
 * Coque V2 du module Alternance (gabarit A) : en-tête blanc avec titre,
 * sous-titre, actions et onglets de navigation (Tableau de bord, Entreprises…).
 * Remplace visuellement components/alternance/AlternanceShell.
 */

import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ALTERNANCE_NAV } from '@/lib/alternance/constants'
import { CrmV2Body, CrmV2Header, CrmV2Page, CrmV2Tabs } from '@/components/crm-v2/primitives'

/** Préfixe des liens : /admin/crm-v2 dans le shell V2, /admin/crm sinon. */
export function useAlternanceBase() {
  const pathname = usePathname() || ''
  return pathname.startsWith('/admin/crm-v2') ? '/admin/crm-v2/alternance' : '/admin/crm/alternance'
}

export default function AlternanceShellV2({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname() || ''
  const router = useRouter()
  const base = useAlternanceBase()

  // Onglet actif : le plus long suffixe qui correspond au chemin courant
  const items = ALTERNANCE_NAV.map(item => ({
    id: item.key,
    label: item.label,
    suffix: item.href.slice('/admin/crm/alternance'.length),
  }))
  const rest = pathname.replace(/^\/admin\/crm(-v2)?\/alternance/, '')
  const active = items
    .filter(it => (it.suffix === '' ? rest === '' || rest === '/' : rest.startsWith(it.suffix)))
    .sort((a, b) => b.suffix.length - a.suffix.length)[0]?.id ?? 'dashboard'

  return (
    <CrmV2Page>
      <CrmV2Header title={title} subtitle={subtitle} actions={actions}>
        <CrmV2Tabs
          bordered={false}
          items={items.map(it => ({ id: it.id, label: it.label }))}
          value={active}
          onChange={id => {
            const it = items.find(x => x.id === id)
            if (it) router.push(base + it.suffix)
          }}
        />
      </CrmV2Header>
      <CrmV2Body>{children}</CrmV2Body>
    </CrmV2Page>
  )
}
