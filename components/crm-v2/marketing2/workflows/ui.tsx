'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2BottomSheet, CrmV2CloseButton, CrmV2StatusPill } from '@/components/crm-v2/primitives'

/** Statuts d'un workflow (pastilles V2). */
export const WF_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Brouillon', color: '#516f90', bg: '#f1f4f9' },
  active:   { label: 'Actif',     color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  paused:   { label: 'En pause',  color: '#8a6d22', bg: 'rgba(204,172,113,0.16)' },
  archived: { label: 'Archivé',   color: '#516f90', bg: '#f1f4f9' },
}

export function WfStatusPill({ status }: { status: string }) {
  const s = WF_STATUS[status] ?? { label: status, color: crmV2.textMuted, bg: crmV2.chipBg }
  return <CrmV2StatusPill label={s.label} color={s.color} bg={s.bg} />
}

/** Icône 28 px dans un carré arrondi (première colonne des tableaux). */
export function WfIconSquare({ children, color = crmV2.textMuted, bg = crmV2.bgSoft, size = 28 }: {
  children: ReactNode
  color?: string
  bg?: string
  size?: number
}) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 10, background: bg, color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

/** Bouton icône rond (actions de ligne). 40 px sur mobile. */
export function WfIconButton({ title, onClick, children, danger = false, disabled = false, size }: {
  title: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  size?: number
}) {
  const isMobile = useIsMobile()
  const [hover, setHover] = useState(false)
  const s = size ?? (isMobile ? 40 : 30)
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: s, height: s, borderRadius: 999, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid transparent',
        background: hover && !disabled ? (danger ? crmV2.dangerSoft : crmV2.bgHover) : 'transparent',
        color: danger ? '#d13a41' : crmV2.textMuted,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1,
        fontFamily: 'inherit', padding: 0,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Fenêtre modale V2 : centrée (rayon 16) sur ordinateur, panneau qui monte du bas sur mobile.
 * Un clic sur le fond ferme la fenêtre (comme avant).
 */
export function WfModal({ title, icon, subtitle, onClose, children, footer, width = 480 }: {
  title: ReactNode
  icon?: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const isMobile = useIsMobile()
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {icon && <WfIconSquare color={crmV2.goldDark} bg={crmV2.goldSoft} size={34}>{icon}</WfIconSquare>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: crmV2.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <CrmV2CloseButton onClick={onClose} />
    </div>
  )
  if (isMobile) {
    return (
      <CrmV2BottomSheet open onClose={onClose} header={header} footer={footer}>
        <div style={{ padding: 16 }}>{children}</div>
      </CrmV2BottomSheet>
    )
  }
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.40)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        onClick={e => e.stopPropagation()}
        style={{
          background: crmV2.bg, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowPanel,
          maxWidth: width, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', fontFamily: crmV2.font, color: crmV2.text,
        }}
      >
        <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>{header}</div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>{children}</div>
        {footer && (
          <div style={{
            padding: '12px 20px', borderTop: `1px solid ${crmV2.border}`, display: 'flex',
            justifyContent: 'flex-end', gap: 8, flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Encadré d'information / d'erreur (rayon 10). */
export function WfNotice({ tone = 'info', icon, children, style }: {
  tone?: 'info' | 'danger' | 'gold'
  icon?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  const t = tone === 'danger'
    ? { color: '#d13a41', bg: crmV2.dangerSoft, border: 'rgba(242,84,91,0.30)' }
    : tone === 'gold'
      ? { color: crmV2.goldDark, bg: crmV2.goldSoft, border: crmV2.goldBorder }
      : { color: '#007a8c', bg: 'rgba(0,145,174,0.07)', border: 'rgba(0,145,174,0.25)' }
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: crmV2.radius,
      background: t.bg, border: `1px solid ${t.border}`, color: t.color, fontSize: 12, lineHeight: 1.5, ...style,
    }}>
      {icon && <span style={{ display: 'inline-flex', marginTop: 1, flexShrink: 0 }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}
