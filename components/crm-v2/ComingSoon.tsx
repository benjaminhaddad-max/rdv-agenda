'use client'

import { Sparkles } from 'lucide-react'
import { CrmV2Button, CrmV2Empty, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

/** Mappe une route V2 vers l’équivalent classique. */
export function classicPathFromV2(pathname: string): string {
  if (pathname === '/admin/crm-v2') return '/admin/crm'
  return pathname.replace(/^\/admin\/crm-v2/, '/admin/crm')
}

export default function ComingSoon({
  title,
  classicHref,
}: {
  title?: string
  classicHref?: string
}) {
  const href =
    classicHref ||
    (typeof window !== 'undefined' ? classicPathFromV2(window.location.pathname) : '/admin/crm')

  return (
    <CrmV2Page>
      <div style={{ padding: '48px 28px' }}>
        <div style={{
          background: crmV2.bg,
          border: `1px solid ${crmV2.border}`,
          borderRadius: crmV2.radiusLg,
          boxShadow: crmV2.shadow,
        }}>
          <CrmV2Empty
            icon={<Sparkles size={28} />}
            title={title || 'Design B en cours'}
            description="Cette page n’est pas encore redesignée. Les Contacts et Tâches sont déjà disponibles en Version B. Tu peux ouvrir la version classique pour continuer à travailler."
            action={
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <CrmV2Button variant="gold" onClick={() => { window.location.href = '/admin/crm-v2' }}>
                  Voir Contacts B
                </CrmV2Button>
                <CrmV2Button variant="secondary" onClick={() => { window.location.href = '/admin/crm-v2/tasks' }}>
                  Voir Tâches B
                </CrmV2Button>
                <CrmV2Button variant="ghost" onClick={() => { window.location.href = href }}>
                  Ouvrir version classique
                </CrmV2Button>
              </div>
            }
          />
        </div>
      </div>
    </CrmV2Page>
  )
}
