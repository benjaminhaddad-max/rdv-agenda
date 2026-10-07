'use client'

/**
 * Briques communes des panneaux V2 ouverts depuis l'Agenda admin
 * (Télépros, Closers, Disponibilités, Site & Contenus) et des panneaux d'aide
 * (Boîte à outils, Guide). Complètent components/crm-v2/primitives.tsx.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2BottomSheet, CrmV2CloseButton, CrmV2Drawer, hexA } from '@/components/crm-v2/primitives'

/** Carré d'icône arrondi (en-têtes de panneau, sections). */
export function PanelIconTile({ icon, color = crmV2.gold, size = 34 }: { icon: ReactNode; color?: string; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), background: hexA(color, 0.12), color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {icon}
    </span>
  )
}

/**
 * Coque de panneau : tiroir à droite (variant « drawer ») ou fenêtre centrée
 * (variant « modal »). Sur mobile, les deux deviennent un panneau qui monte du bas.
 */
export function PanelShell({
  onClose, icon, title, subtitle, actions, tabs, footer, children, width = 560, variant = 'drawer',
}: {
  onClose: () => void
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Boutons à gauche du bouton fermer */
  actions?: ReactNode
  /** Onglets sous le titre (PanelTabs) */
  tabs?: ReactNode
  footer?: ReactNode
  children: ReactNode
  width?: number
  variant?: 'drawer' | 'modal'
}) {
  const isMobile = useIsMobile()

  // Fenêtre centrée : fermeture sur Échap (le tiroir le gère déjà)
  useEffect(() => {
    if (variant !== 'modal' || isMobile) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [variant, isMobile, onClose])

  const header = (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {icon && <PanelIconTile icon={icon} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 17 : 18, fontWeight: 600, color: crmV2.text, letterSpacing: '-0.02em', lineHeight: 1.3 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 3, lineHeight: 1.45 }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {actions}
          <CrmV2CloseButton onClick={onClose} />
        </div>
      </div>
      {tabs && <div style={{ marginTop: 12, marginBottom: isMobile ? -12 : -14 }}>{tabs}</div>}
    </div>
  )

  const body = (
    <div style={{
      padding: isMobile ? 12 : 20, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16,
      background: crmV2.bgSoft, minHeight: '100%', boxSizing: 'border-box',
    }}>
      {children}
    </div>
  )

  if (variant === 'drawer' || isMobile) {
    if (isMobile) {
      return <CrmV2BottomSheet open onClose={onClose} header={header} footer={footer} maxHeight="92dvh">{body}</CrmV2BottomSheet>
    }
    return <CrmV2Drawer open onClose={onClose} header={header} footer={footer} width={width}>{body}</CrmV2Drawer>
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,31,61,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        style={{
          width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column',
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 20,
          boxShadow: crmV2.shadowPanel, overflow: 'hidden', fontFamily: crmV2.font, color: crmV2.text,
        }}
      >
        <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>{header}</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: crmV2.bgSoft }}>{body}</div>
        {footer && (
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${crmV2.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Onglets soulignés (3 px) pour l'en-tête d'un panneau. */
export function PanelTabs<T extends string>({ items, value, onChange }: {
  items: { id: T; label: ReactNode; icon?: ReactNode; count?: number }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {items.map(it => {
        const active = it.id === value
        return (
          <button key={it.id} type="button" onClick={() => onChange(it.id)} style={{
            appearance: 'none', background: 'none', border: 'none',
            borderBottom: `3px solid ${active ? crmV2.text : 'transparent'}`,
            padding: '10px 14px', fontSize: 14, fontWeight: active ? 600 : 500,
            color: active ? crmV2.text : crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0, minHeight: 40,
          }}>
            {it.icon}
            {it.label}
            {typeof it.count === 'number' && <span style={{ color: crmV2.textFaint, fontWeight: 500 }}>({it.count})</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Libellé de section 11 px / 700 / MAJUSCULES, avec compteur optionnel. */
export function PanelSectionTitle({ children, count, icon, right, style }: {
  children: ReactNode
  count?: number
  icon?: ReactNode
  right?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      {icon && <span style={{ color: crmV2.gold, display: 'inline-flex' }}>{icon}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.textMuted }}>{children}</span>
      {typeof count === 'number' && (
        <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, background: crmV2.bgSoft, borderRadius: 999, padding: '1px 7px' }}>{count}</span>
      )}
      {right && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{right}</span>}
    </div>
  )
}

/** Carte blanche (rayon 16) pour regrouper un bloc dans un panneau. */
export function PanelCard({ children, style, accent }: { children: ReactNode; style?: CSSProperties; accent?: boolean }) {
  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${accent ? crmV2.goldBorder : crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, ...style,
    }}>
      {children}
    </div>
  )
}

/** Bouton pilule « Copier » qui affiche « Copié » pendant 2 s. */
export function PanelCopyButton({ text, label = 'Copier', copiedLabel = 'Copié', size = 'sm', stretch = false, iconOnly = false }: {
  text: string
  label?: ReactNode
  copiedLabel?: ReactNode
  size?: 'sm' | 'md'
  stretch?: boolean
  /** Bouton rond 32 px (40 px sur mobile), sans libellé */
  iconOnly?: boolean
}) {
  const isMobile = useIsMobile()
  const [copied, setCopied] = useState(false)
  const round = iconOnly ? (isMobile ? 40 : 32) : undefined
  return (
    <button
      type="button"
      title={iconOnly ? 'Copier' : undefined}
      aria-label={iconOnly ? 'Copier' : undefined}
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => { /* silencieux */ })
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
        width: round ?? (stretch ? '100%' : undefined), height: round,
        borderRadius: 999, padding: iconOnly ? 0 : size === 'md' ? '8px 16px' : '6px 12px', fontSize: size === 'md' ? 13 : 12, fontWeight: 600,
        fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
        background: copied ? 'rgba(0,189,165,0.10)' : crmV2.bg,
        border: `1px solid ${copied ? 'rgba(0,189,165,0.35)' : crmV2.borderStrong}`,
        color: copied ? '#00866f' : crmV2.text,
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {!iconOnly && (copied ? copiedLabel : label)}
    </button>
  )
}

/** Petit champ (ligne de formulaire compacte) : 34 px, rayon 10. */
export const panelFieldStyle: CSSProperties = {
  height: 34, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '0 10px',
  fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, outline: 'none',
  boxSizing: 'border-box',
}

/** Bloc de chargement centré. */
export function PanelLoading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0', color: crmV2.textMuted, fontSize: 13 }}>
      <span style={{
        width: 18, height: 18, border: `2px solid ${crmV2.border}`, borderTopColor: crmV2.gold,
        borderRadius: '50%', animation: 'crm-v2-spin 0.7s linear infinite', flexShrink: 0,
      }} />
      {label}
    </div>
  )
}
