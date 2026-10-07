'use client'

import type { CSSProperties, ReactNode, SelectHTMLAttributes } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Info } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'

/** Animation de rotation (keyframes globales `crm-v2-spin`). */
export const adsSpin: CSSProperties = { animation: 'crm-v2-spin 0.8s linear infinite' }

/** Bandeau d'information (erreur, succès, info). */
export function AdsBanner({ kind, children, style }: { kind: 'error' | 'success' | 'info' | 'warning'; children: ReactNode; style?: CSSProperties }) {
  const tones = {
    error: { bg: crmV2.dangerSoft, border: 'rgba(242,84,91,0.30)', color: '#d13a41', icon: <AlertCircle size={16} /> },
    success: { bg: 'rgba(0,189,165,0.08)', border: 'rgba(0,189,165,0.30)', color: '#00866f', icon: <CheckCircle2 size={16} /> },
    info: { bg: 'rgba(0,145,174,0.06)', border: 'rgba(0,145,174,0.25)', color: crmV2.text, icon: <Info size={16} color={crmV2.link} /> },
    warning: { bg: crmV2.goldSoft, border: crmV2.goldBorder, color: crmV2.goldDark, icon: <AlertCircle size={16} /> },
  }[kind]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
      background: tones.bg, border: `1px solid ${tones.border}`, borderRadius: crmV2.radius,
      color: tones.color, fontSize: 13, lineHeight: 1.45, ...style,
    }}>
      <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>{tones.icon}</span>
      <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

/** Icône dans un carré arrondi (première colonne des tableaux, 28 px). */
export function AdsIconTile({ icon, color = crmV2.link, size = 28, bg }: { icon: ReactNode; color?: string; size?: number; bg?: string }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 8, background: bg ?? crmV2.bgSoft, color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {icon}
    </span>
  )
}

/** Sélecteur en pilule (même gabarit qu'un bouton secondaire), avec icône et chevron. */
export function AdsPillSelect({
  icon, children, style, ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', maxWidth: '100%', ...style }}>
      {icon && (
        <span style={{ position: 'absolute', left: 14, display: 'inline-flex', color: crmV2.textMuted, pointerEvents: 'none' }}>{icon}</span>
      )}
      <select
        {...rest}
        style={{
          appearance: 'none', WebkitAppearance: 'none', height: 36, maxWidth: '100%',
          padding: `0 32px 0 ${icon ? 36 : 14}px`, borderRadius: crmV2.radiusPill,
          border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text,
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </select>
      <ChevronDown size={14} color={crmV2.textMuted} style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
    </span>
  )
}

/** Ligne de liste compacte mobile : une ligne par objet, zone cliquable ≥ 48 px. */
export function AdsMobileRow({
  icon, title, subtitle, right, onClick, children,
}: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  onClick?: () => void
  /** Contenu supplémentaire sous la ligne (actions, champs) */
  children?: ReactNode
}) {
  return (
    <div style={{ borderBottom: `1px solid ${crmV2.borderLight}`, padding: '8px 12px' }}>
      <div
        onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, cursor: onClick ? 'pointer' : undefined }}
      >
        {icon}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
          )}
        </div>
        {right && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>{right}</div>}
      </div>
      {children}
    </div>
  )
}

/** Petit texte discret (identifiants techniques). */
export function AdsFaint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontSize: 11, color: crmV2.textFaint, ...style }}>{children}</span>
}
