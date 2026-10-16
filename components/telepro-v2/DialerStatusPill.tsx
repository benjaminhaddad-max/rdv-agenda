'use client'

import { BellRing, PhoneCall, PhoneOff, Voicemail } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import type { DialerLiveState } from '@/lib/dialer-live'
import { tint } from './ui'

/** Pastille d'état de l'appel (icône + mots), même code couleur que la liste */
export default function StatusPill({ state, label, size = 'md' }: { state: DialerLiveState; label: string; size?: 'sm' | 'md' }) {
  const c = state === 'live' ? crmV2.successStrong
    : state === 'ringing' ? crmV2.goldDark
    : state === 'error' ? crmV2.danger
    : crmV2.textMuted
  const Icon = state === 'live' ? PhoneCall : state === 'ringing' ? BellRing : state === 'voicemail' ? Voicemail : state === 'error' || state === 'ended' ? PhoneOff : null
  const sm = size === 'sm'
  if (!label) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: sm ? '1px 8px' : '4px 10px',
      fontSize: sm ? 11 : 12, fontWeight: 700, color: c, background: tint(c, 0.1), border: `1px solid ${tint(c, 0.3)}`, whiteSpace: 'nowrap',
    }}>
      {Icon ? <Icon size={sm ? 11 : 13} /> : <AdminSpin size={sm ? 10 : 12} color={c} />}
      {label}
    </span>
  )
}

