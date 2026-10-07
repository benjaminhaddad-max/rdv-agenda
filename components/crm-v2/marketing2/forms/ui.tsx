'use client'

/**
 * Briques de l'éditeur de formulaire V2 (gabarit E) : carte de section repliable
 * rayon 16, champ avec libellé (div, pas <label> : plusieurs contrôles par champ),
 * grille 2 colonnes, sélecteur de couleur, styles de champs.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

/** Carte de section repliable : icône or, titre 15 px, description, chevron. */
export function FormsSection({
  title, description, icon, actions, defaultOpen = true, storageKey, children, style, bodyStyle,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  defaultOpen?: boolean
  /** Mémorise l'état replié dans localStorage */
  storageKey?: string
  children: ReactNode
  style?: CSSProperties
  bodyStyle?: CSSProperties
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(() => {
    if (!storageKey || typeof window === 'undefined') return defaultOpen
    try {
      const v = localStorage.getItem(storageKey)
      return v === '0' || v === '1' ? v === '1' : defaultOpen
    } catch { return defaultOpen }
  })
  const toggle = () => {
    setOpen(o => {
      const next = !o
      if (storageKey) { try { localStorage.setItem(storageKey, next ? '1' : '0') } catch { /* ignore */ } }
      return next
    })
  }
  const pad = isMobile ? 14 : 20
  return (
    <section style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, minWidth: 0, boxSizing: 'border-box', ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `${isMobile ? 10 : 14}px ${pad}px` }}>
        <button type="button" onClick={toggle} aria-expanded={open} style={{
          flex: 1, minWidth: 0, minHeight: 40, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: crmV2.text,
        }}>
          {icon && (
            <span style={{
              width: 28, height: 28, borderRadius: 8, background: crmV2.goldSoft, color: crmV2.goldDark,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{icon}</span>
          )}
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
            {description && <span style={{ fontSize: 13, color: crmV2.textMuted, fontWeight: 400 }}>{description}</span>}
          </span>
          <span style={{ flex: 1 }} />
          <ChevronDown size={16} color={crmV2.textFaint} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
        </button>
        {actions}
      </div>
      {open && <div style={{ padding: `0 ${pad}px ${pad}px`, ...bodyStyle }}>{children}</div>}
    </section>
  )
}

/** Grille de champs : 2 colonnes sur ordinateur, 1 sur mobile. */
export function FormsGrid({ children, columns = 2, style }: { children: ReactNode; columns?: 1 | 2; style?: CSSProperties }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: isMobile || columns === 1 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
      gap: '14px 16px', ...style,
    }}>
      {children}
    </div>
  )
}

/** Champ : libellé 12 px / 700 au-dessus, aide en dessous. */
export function FormsField({ label, hint, children, span = 1, style }: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  span?: 1 | 2
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, gridColumn: span === 2 ? '1 / -1' : undefined, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: crmV2.textFaint, lineHeight: 1.45 }}>{hint}</span>}
    </div>
  )
}

/** Style des champs de saisie V2 (rayon 10, hauteur 38). Compatible textarea. */
export const formsInput: CSSProperties = {
  width: '100%', minHeight: 38, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
  padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg,
  outline: 'none', boxSizing: 'border-box', minWidth: 0,
}

/** Bloc de code (intégration). */
export const formsCode: CSSProperties = {
  background: crmV2.bgSoft, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: 14,
  color: crmV2.text, fontSize: 12, lineHeight: 1.55, fontFamily: 'inherit',
  overflow: 'auto', margin: 0, whiteSpace: 'pre',
}

/** Pastille carrée 38 px ouvrant le sélecteur de couleur natif. */
export function FormsColorSwatch({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  return (
    <span title={title} style={{
      position: 'relative', width: 38, height: 38, borderRadius: crmV2.radius, flexShrink: 0, overflow: 'hidden',
      border: `1px solid ${crmV2.borderStrong}`, background: value, boxShadow: 'inset 0 0 0 2px #fff',
    }}>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={title || 'Couleur'}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
      />
    </span>
  )
}

/** Curseur (range) teinté or. */
export const formsRange: CSSProperties = { width: '100%', accentColor: crmV2.gold, cursor: 'pointer' }
