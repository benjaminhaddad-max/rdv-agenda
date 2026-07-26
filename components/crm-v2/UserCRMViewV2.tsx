'use client'

import UserCRMView from '@/components/UserCRMView'
import { crmV2 } from '@/lib/crm-v2-theme'

type Props = React.ComponentProps<typeof UserCRMView>

/**
 * Variante Design B pour closer / télépro.
 * Même logique métier (UserCRMView), chrome V2 via skin CSS.
 */
export default function UserCRMViewV2(props: Props) {
  return (
    <div
      className="crm-v2 crm-v2-skin"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: crmV2.bgSoft,
        fontFamily: crmV2.font,
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <UserCRMView {...props} />
      </div>
    </div>
  )
}
