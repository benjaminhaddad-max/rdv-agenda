'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { AlertCircle, Check, CheckCircle2, Info } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2CloseButton } from '../primitives'

/**
 * Coque commune des modales / tiroirs CRM V2.
 * - variant 'modal'  : modale centrée, rayon 20 (panneau du bas sur mobile)
 * - variant 'drawer' : tiroir à droite 460 px, rayon 20 (panneau du bas sur mobile)
 * Le zIndex est paramétrable pour conserver l'empilement des anciens composants.
 */
export function CrmV2ModalShell({
  variant = 'modal',
  onClose,
  header,
  footer,
  children,
  width,
  zIndex = 1000,
  closeOnBackdrop = true,
  closeOnEscape = false,
  bodyStyle,
  maxHeight = '88vh',
}: {
  variant?: 'modal' | 'drawer'
  onClose: () => void
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  width?: number
  zIndex?: number
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  bodyStyle?: CSSProperties
  maxHeight?: string
}) {
  const isMobile = useIsMobile()
  const downOnBackdrop = useRef(false)

  useEffect(() => {
    if (!closeOnEscape) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeOnEscape, onClose])

  const w = width ?? (variant === 'drawer' ? 460 : 480)

  const panel: CSSProperties = isMobile
    ? {
        position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '92dvh',
        borderRadius: '22px 22px 0 0', animation: 'crm-v2-sheet-up .22s ease-out',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }
    : variant === 'drawer'
      ? { position: 'fixed', top: 12, right: 12, bottom: 12, width: w, maxWidth: 'calc(100vw - 24px)', borderRadius: 20 }
      : { position: 'relative', width: '100%', maxWidth: w, maxHeight, borderRadius: 20 }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: isMobile ? 'rgba(15,31,61,0.40)' : 'rgba(15,31,61,0.28)',
        display: !isMobile && variant === 'modal' ? 'flex' : 'block',
        alignItems: 'center', justifyContent: 'center',
        padding: !isMobile && variant === 'modal' ? 24 : 0,
      }}
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        if (closeOnBackdrop && downOnBackdrop.current && e.target === e.currentTarget) onClose()
        downOnBackdrop.current = false
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        onClick={e => e.stopPropagation()}
        style={{
          ...panel,
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, boxShadow: crmV2.shadowPanel,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: crmV2.font, color: crmV2.text, boxSizing: 'border-box',
        }}
      >
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0', flexShrink: 0 }}>
            <span style={{ width: 40, height: 4, borderRadius: 999, background: crmV2.borderStrong }} />
          </div>
        )}
        {header && (
          <div style={{ padding: isMobile ? '8px 16px 12px' : '16px 18px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>
            {header}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? 16 : 18, ...bodyStyle }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: isMobile ? '12px 16px' : '12px 18px', borderTop: `1px solid ${crmV2.border}`,
            display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** En-tête standard : icône or facultative, titre 17 px, sous-titre, bouton fermer. */
export function CrmV2ModalHeader({
  title, subtitle, icon, onClose, extra,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  onClose: () => void
  /** Contenu sous le titre (pastilles, onglets…) */
  extra?: ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {icon && (
          <span style={{
            width: 34, height: 34, borderRadius: 10, background: crmV2.goldSoft, color: crmV2.goldDark,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{icon}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: crmV2.text, lineHeight: 1.3 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <CrmV2CloseButton onClick={onClose} />
      </div>
      {extra && <div style={{ marginTop: 12 }}>{extra}</div>}
    </div>
  )
}

/** Encadré d'information / d'erreur / de succès. */
export function CrmV2Notice({ tone = 'info', children, style }: {
  tone?: 'info' | 'error' | 'success' | 'warning'
  children: ReactNode
  style?: CSSProperties
}) {
  const c = {
    info: { fg: crmV2.link, bg: 'rgba(0,145,174,0.08)', bd: 'rgba(0,145,174,0.25)', Icon: Info },
    error: { fg: '#d13a41', bg: crmV2.dangerSoft, bd: 'rgba(242,84,91,0.30)', Icon: AlertCircle },
    success: { fg: '#00866f', bg: 'rgba(0,189,165,0.08)', bd: 'rgba(0,189,165,0.30)', Icon: CheckCircle2 },
    warning: { fg: '#b45309', bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.30)', Icon: AlertCircle },
  }[tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, background: c.bg, border: `1px solid ${c.bd}`,
      borderRadius: crmV2.radius, padding: '9px 12px', color: c.fg, fontSize: 13, lineHeight: 1.45, ...style,
    }}>
      <c.Icon size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  )
}

/** Champ 38 px, rayon 10 (pour les <input>/<select> natifs). */
export const crmV2FieldStyle: CSSProperties = {
  height: 38, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '0 12px',
  fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, outline: 'none',
  boxSizing: 'border-box', width: '100%',
}

/** Libellé de section : 11 px / 700 / MAJUSCULES. */
export const crmV2LabelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.textMuted,
}

/** Case à cocher visuelle 18 px (or quand cochée). */
export function CrmV2CheckBox({ checked, size = 18 }: { checked: boolean; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 5, flexShrink: 0,
      border: `1.5px solid ${checked ? crmV2.gold : crmV2.borderStrong}`,
      background: checked ? crmV2.gold : crmV2.bg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s',
    }}>
      {checked && <Check size={Math.round(size * 0.62)} color="#ffffff" strokeWidth={3} />}
    </span>
  )
}

/** Ligne cliquable d'une liste à cocher (hauteur ≥ 40 px). */
export function CrmV2CheckRow({ checked, onClick, children, disabled, style }: {
  checked: boolean
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, width: '100%',
        padding: '6px 10px', borderRadius: crmV2.radius, cursor: disabled ? 'default' : 'pointer',
        background: checked ? crmV2.goldSoft : 'transparent',
        border: `1px solid ${checked ? crmV2.goldBorder : 'transparent'}`,
        fontFamily: 'inherit', fontSize: 13, color: crmV2.text, textAlign: 'left', boxSizing: 'border-box',
        opacity: disabled ? 0.6 : 1, ...style,
      }}
    >
      <CrmV2CheckBox checked={checked} />
      {children}
    </button>
  )
}
