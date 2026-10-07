'use client'

import { useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'

/** Bouton rond 36 px (précédent / suivant de l'agenda). */
export function AgendaRoundButton({
  onClick, label, children, size = 36,
}: {
  onClick: () => void
  label: string
  children: ReactNode
  size?: number
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: crmV2.radiusPill,
        border: `1px solid ${crmV2.borderStrong}`, background: hover ? crmV2.bgHover : crmV2.bg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: crmV2.text, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

/** Liste déroulante native habillée en pilule avec chevron (filtre closers). */
export function AgendaSelectPill({
  icon, style, children, ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode; children: ReactNode }) {
  return (
    <span style={{
      position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0,
      background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill,
      height: 32, ...style,
    }}>
      {icon && (
        <span style={{ position: 'absolute', left: 11, display: 'inline-flex', color: crmV2.textFaint, pointerEvents: 'none' }}>
          {icon}
        </span>
      )}
      <select
        {...rest}
        style={{
          appearance: 'none', WebkitAppearance: 'none', border: 'none', outline: 'none', background: 'transparent',
          height: '100%', padding: `0 30px 0 ${icon ? 30 : 12}px`, borderRadius: crmV2.radiusPill,
          fontSize: 12, fontWeight: 600, color: crmV2.text, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {children}
      </select>
      <ChevronDown size={12} style={{ position: 'absolute', right: 11, color: crmV2.textFaint, pointerEvents: 'none' }} />
    </span>
  )
}

/** Pastille de légende (carré de couleur + libellé). */
export function AgendaLegendChip({ color, label, swatch }: { color?: string; label: ReactNode; swatch?: ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
      background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, borderRadius: crmV2.radiusPill,
      padding: '4px 10px', fontSize: 12, fontWeight: 700, color: crmV2.text,
    }}>
      {swatch ?? <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />}
      {label}
    </span>
  )
}

/** Bouton d'outil secondaire en pilule (File d'attente, Télépros…), avec compteur optionnel. */
export function AgendaToolButton({
  icon, label, onClick, badge, warn, style,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  badge?: number | null
  warn?: boolean
  style?: CSSProperties
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 32, padding: '0 12px',
        borderRadius: crmV2.radiusPill, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 600,
        border: `1px solid ${warn ? crmV2.goldBorder : crmV2.borderStrong}`,
        background: warn ? crmV2.goldSoft : hover ? crmV2.bgHover : crmV2.bg,
        color: warn ? crmV2.goldDark : crmV2.text,
        ...style,
      }}
    >
      {icon}
      {label}
      {typeof badge === 'number' && (
        <span style={{
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, boxSizing: 'border-box',
          background: badge > 0 ? crmV2.danger : crmV2.borderStrong,
          color: '#fff', fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}
