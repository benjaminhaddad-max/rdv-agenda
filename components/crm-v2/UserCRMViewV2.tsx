'use client'

import UserCRMView from '@/components/UserCRMView'
import { ClassicBridgeBanner } from '@/components/crm-v2/ClassicBridge'
import { crmV2 } from '@/lib/crm-v2-theme'

type Props = React.ComponentProps<typeof UserCRMView>

/**
 * Variante Design B pour closer / télépro.
 * Même logique métier (UserCRMView), chrome V2 + bandeau.
 * Activation : ?ui=v2 sur /closer/[slug] ou /telepro
 */
export default function UserCRMViewV2(props: Props) {
  return (
    <div
      className="crm-v2"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: crmV2.bgSoft,
        fontFamily: crmV2.font,
        minHeight: 0,
      }}
    >
      <ClassicBridgeBanner
        classicHref={typeof window !== 'undefined' ? window.location.pathname : '/'}
        label="Design B — Mes contacts"
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <UserCRMView {...props} />
      </div>
    </div>
  )
}
