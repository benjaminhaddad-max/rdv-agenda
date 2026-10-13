/** Couleurs et styles partagés du dashboard Créas Ads. */
import type { CSSProperties } from 'react'
import { crmV2 } from '@/lib/crm-v2-theme'

export type Tone = 'done' | 'plan' | 'warn' | 'late' | 'idle' | 'off'

export const TONES: Record<Tone, { color: string; bg: string; border: string }> = {
  done: { color: '#15803d', bg: '#ecfdf3', border: '#bbf7d0' },
  plan: { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  warn: { color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  late: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  idle: { color: crmV2.textMuted, bg: crmV2.bg, border: crmV2.border },
  off: { color: crmV2.textFaint, bg: crmV2.bgHover, border: crmV2.borderLight },
}

/** Couleur d'un pilier (légende du planning Medibox), sinon or. */
export function pilierColor(p: string | null): { color: string; bg: string } {
  const s = (p || '').toLowerCase()
  if (/r[ée]forme|pass|las/.test(s)) return { color: '#7c3aed', bg: '#f3e8ff' }
  if (/parcoursup|fac/.test(s)) return { color: '#1d4ed8', bg: '#dbeafe' }
  if (/local|ville|excellence/.test(s)) return { color: '#c2410c', bg: '#ffedd5' }
  if (/conversion/.test(s)) return { color: '#15803d', bg: '#dcfce7' }
  if (/premi[èe]re/.test(s)) return { color: '#be185d', bg: '#fce7f3' }
  return { color: crmV2.goldDark, bg: crmV2.goldSoft }
}

export function funnelColor(f: string | null): { color: string; bg: string } {
  const s = (f || '').toLowerCase()
  if (s.startsWith('découverte') || s.startsWith('decouverte')) return { color: '#0369a1', bg: '#e0f2fe' }
  if (s.startsWith('consid')) return { color: '#a16207', bg: '#fef9c3' }
  if (s.startsWith('conversion')) return { color: '#15803d', bg: '#dcfce7' }
  return { color: crmV2.textMuted, bg: crmV2.chipBg }
}

export function statusColor(st: string | null): { color: string; bg: string } {
  const s = (st || '').toLowerCase()
  if (s.startsWith('valid')) return { color: '#15803d', bg: '#dcfce7' }
  if (s.startsWith('annul')) return { color: '#dc2626', bg: '#fee2e2' }
  if (s.startsWith('en pause')) return { color: crmV2.textMuted, bg: crmV2.chipBg }
  return { color: '#a16207', bg: '#fef9c3' } // À valider
}

/** Couleur de l'étiquette de type : Webinaire, JPO, Présentiel, Guide. */
export function typeColor(ev: { kind: string; event_type: string | null }): { color: string; bg: string } {
  if (ev.kind === 'guide') return { color: crmV2.goldDark, bg: crmV2.goldSoft }
  if (ev.event_type === 'jpo') return { color: '#7c3aed', bg: '#f3e8ff' }
  if (ev.event_type === 'presentiel') return { color: '#0f766e', bg: '#ccfbf1' }
  return { color: '#0369a1', bg: '#e0f2fe' } // webinaire
}

export const pill: CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: crmV2.radiusPill, whiteSpace: 'nowrap',
}

export const iconBtn: CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', color: crmV2.textMuted, padding: 3, display: 'inline-flex', flexShrink: 0,
}
