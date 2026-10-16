'use client'

import { BellRing, PhoneOff, Voicemail } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import type { DialerLiveState } from '@/lib/dialer-live'
import { tint } from './ui'

/** Animations des icônes d'appel (injectées une fois, partagées par le dialer et la liste) */
export function DialerAnimations() {
  return (
    <style>{`
@keyframes dq-ring { 0%,100% { transform: rotate(0) } 10%,30%,50% { transform: rotate(-14deg) } 20%,40% { transform: rotate(14deg) } 60% { transform: rotate(0) } }
@keyframes dq-pulse { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.45) } 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0) } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0) } }
@keyframes dq-bar { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
@keyframes dq-halo { 0% { box-shadow: 0 0 0 0 rgba(201,168,76,.55) } 70% { box-shadow: 0 0 0 9px rgba(201,168,76,0) } 100% { box-shadow: 0 0 0 0 rgba(201,168,76,0) } }
`}</style>
  )
}

export function liveColor(state: DialerLiveState): string {
  return state === 'live' ? crmV2.successStrong
    : state === 'ringing' ? crmV2.goldDark
    : state === 'error' ? crmV2.danger
    : crmV2.textMuted
}

/** Icône animée : ça sonne (téléphone qui vibre), en ligne (barres de voix), messagerie, terminé */
export function LiveIcon({ state, size = 13 }: { state: DialerLiveState; size?: number }) {
  const c = liveColor(state)
  if (state === 'ringing') return <BellRing size={size} color={c} style={{ animation: 'dq-ring 1.2s ease-in-out infinite', transformOrigin: '50% 10%', flexShrink: 0 }} />
  if (state === 'live') {
    return (
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: size, flexShrink: 0 }}>
        {[0, 0.2, 0.4].map(d => (
          <span key={d} style={{ width: 3, height: size, borderRadius: 2, background: c, transformOrigin: 'bottom', animation: `dq-bar .9s ${d}s ease-in-out infinite` }} />
        ))}
      </span>
    )
  }
  if (state === 'voicemail') return <Voicemail size={size} color={c} style={{ flexShrink: 0 }} />
  if (state === 'error' || state === 'ended') return <PhoneOff size={size} color={c} style={{ flexShrink: 0 }} />
  return <AdminSpin size={size - 1} color={c} />
}

/** Pastille d'état de l'appel (icône animée + mots), même code couleur dans le dialer et la liste */
export default function StatusPill({ state, label, size = 'md' }: { state: DialerLiveState; label: string; size?: 'sm' | 'md' }) {
  const c = liveColor(state)
  const sm = size === 'sm'
  if (!label) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: sm ? '1px 8px' : '4px 11px',
      fontSize: sm ? 11 : 12, fontWeight: 700, color: c, background: tint(c, 0.1), border: `1px solid ${tint(c, 0.3)}`, whiteSpace: 'nowrap',
      animation: state === 'live' ? 'dq-pulse 1.6s infinite' : undefined,
    }}>
      <DialerAnimations />
      <LiveIcon state={state} size={sm ? 11 : 13} />
      {label}
    </span>
  )
}

