'use client'

/**
 * Briques partagées par les pages Marketing V2 (campagnes, programmes, listes,
 * segments, modèles email, marques, webinaires). Complète primitives.tsx sans le modifier.
 */

import { useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2BottomSheet, CrmV2CloseButton } from '@/components/crm-v2/primitives'

/** Tons de pastilles de statut de la maquette (texte, fond). */
export const MKT_TONES = {
  green: { color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  blue: { color: '#1f7ca8', bg: 'rgba(76,171,219,0.12)' },
  gold: { color: '#8a6d22', bg: 'rgba(204,172,113,0.16)' },
  red: { color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
  purple: { color: '#7e22ce', bg: 'rgba(168,85,247,0.10)' },
  grey: { color: '#516f90', bg: '#f1f4f9' },
} as const
export type MktTone = keyof typeof MKT_TONES

/** Libellé + ton de la pastille de statut d'un programme. */
export function programStatusMeta(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'active': return { label: 'Actif', ...MKT_TONES.green }
    case 'paused': return { label: 'En pause', ...MKT_TONES.gold }
    case 'draft': return { label: 'Brouillon', ...MKT_TONES.grey }
    case 'completed': return { label: 'Terminé', ...MKT_TONES.blue }
    case 'archived': return { label: 'Archivé', ...MKT_TONES.grey }
    default: return { label: status || '—', ...MKT_TONES.grey }
  }
}

/**
 * Préfixe des routes CRM selon le shell courant (/admin/crm-v2 ou /admin/crm),
 * pour les navigations faites en JS (window.location) qui ne passent pas par un <a>.
 */
export function useCrmBase() {
  const path = usePathname() || ''
  return path.startsWith('/admin/crm-v2') ? '/admin/crm-v2' : '/admin/crm'
}

/** Icône 28 px sur fond #eef1f6 (cellule « lien » du gabarit A). */
export function MktIconBox({ children, size = 28, color = crmV2.textMuted, bg = crmV2.bgSoft, radius = 10 }: {
  children: ReactNode
  size?: number
  color?: string
  bg?: string
  radius?: number
}) {
  return (
    <span style={{
      width: size, height: size, borderRadius: radius, background: bg, color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
    }}>
      {children}
    </span>
  )
}

/** Cellule « nom » : icône 28 px + lien + sous-titre discret optionnel. */
export function MktNameCell({ icon, href, onClick, title, subtitle, iconColor, iconBg }: {
  icon: ReactNode
  href?: string
  onClick?: () => void
  title: ReactNode
  subtitle?: ReactNode
  iconColor?: string
  iconBg?: string
}) {
  const [hover, setHover] = useState(false)
  const linkStyle: CSSProperties = {
    color: hover ? crmV2.linkHover : crmV2.link, fontWeight: 600, textDecoration: hover ? 'underline' : 'none',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <MktIconBox color={iconColor} bg={iconBg}>{icon}</MktIconBox>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {href ? (
          <a href={href} style={linkStyle} onClick={e => e.stopPropagation()} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{title}</a>
        ) : (
          <button type="button" onClick={e => { e.stopPropagation(); onClick?.() }} style={linkStyle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{title}</button>
        )}
        {subtitle && (
          <span style={{ fontSize: 12, color: crmV2.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
        )}
      </span>
    </span>
  )
}

/** Barre de progression (taux d'ouverture…). */
export function MktBar({ pct, color = crmV2.link, label }: { pct: number; color?: string; label?: ReactNode }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <span style={{ flex: 1, height: 6, background: crmV2.bgMuted, borderRadius: 3, overflow: 'hidden', display: 'block' }}>
        <span style={{ display: 'block', width: `${w}%`, height: '100%', background: color, borderRadius: 3 }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{label ?? `${Math.round(pct)} %`}</span>
    </span>
  )
}

/** Valeur numérique alignée à droite, en gras. */
export const numCell: CSSProperties = { textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
/** Texte discret (dates, critères). */
export const mutedCell: CSSProperties = { color: crmV2.textMuted, whiteSpace: 'nowrap' }

/** Bouton icône rond 32 px (40 px sur mobile) pour les actions de ligne. */
export function MktIconButton({ title, onClick, children, danger = false, disabled = false }: {
  title: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  const isMobile = useIsMobile()
  const [hover, setHover] = useState(false)
  const size = isMobile ? 40 : 32
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${hover && !disabled ? crmV2.borderStrong : crmV2.border}`,
        background: hover && !disabled ? (danger ? crmV2.dangerSoft : crmV2.bgHover) : crmV2.bg,
        color: danger ? '#d13a41' : crmV2.textMuted, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, fontFamily: 'inherit', padding: 0,
      }}
    >
      {children}
    </button>
  )
}

/** Menu « … » (actions secondaires d'une ligne ou d'un en-tête). */
export function MktMenu({ items, label = 'Plus d’actions' }: {
  items: { label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }[]
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
      <MktIconButton title={label} onClick={() => setOpen(o => !o)}><MoreHorizontal size={15} /></MktIconButton>
      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <span style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41, minWidth: 200,
            background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, boxShadow: crmV2.shadowPanel,
            padding: 6, display: 'flex', flexDirection: 'column',
          }}>
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', minHeight: 36, borderRadius: 8,
                  background: 'none', border: 'none', cursor: it.disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
                  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
                  color: it.danger ? '#d13a41' : crmV2.text, opacity: it.disabled ? 0.5 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = it.danger ? crmV2.dangerSoft : crmV2.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  )
}

/** Filtre de barre d'outils : <select> natif habillé en pilule avec chevron. */
export function MktSelectPill({ active = false, style, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { active?: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0, ...style }}>
      <select
        {...rest}
        style={{
          appearance: 'none', WebkitAppearance: 'none', height: 36, borderRadius: 999, padding: '0 32px 0 14px',
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', maxWidth: '100%',
          background: active ? 'rgba(0,145,174,0.08)' : crmV2.bg,
          border: `1px solid ${active ? 'rgba(0,145,174,0.45)' : crmV2.borderStrong}`,
          color: active ? crmV2.link : crmV2.text,
        }}
      >
        {children}
      </select>
      <ChevronDown size={13} color={crmV2.textFaint} style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
    </span>
  )
}

/** Ligne mobile « une ligne par objet » (min. 56 px, zone cliquable entière). */
export function MktMobileRow({ icon, title, subtitle, right, href, onClick, actions }: {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  href?: string
  onClick?: () => void
  actions?: ReactNode
}) {
  const inner = (
    <>
      {icon}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {subtitle && <span style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>}
      </span>
      {right && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{right}</span>}
    </>
  )
  const rowStyle: CSSProperties = {
    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit',
    background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 40,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', minHeight: 56, borderBottom: `1px solid ${crmV2.borderLight}` }}>
      {href ? <a href={href} style={rowStyle}>{inner}</a> : <button type="button" onClick={onClick} style={rowStyle}>{inner}</button>}
      {actions}
    </div>
  )
}

/**
 * Fenêtre modale V2 (création rapide) : carte centrée rayon 16 sur ordinateur,
 * panneau qui monte du bas sur mobile. Pied aligné à droite (Annuler / Créer).
 */
export function MktModal({ open, onClose, title, children, footer, width = 480 }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const isMobile = useIsMobile()
  if (!open) return null
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: crmV2.text }}>{title}</div>
      <CrmV2CloseButton onClick={onClose} />
    </div>
  )
  if (isMobile) {
    return (
      <CrmV2BottomSheet open={open} onClose={onClose} header={header}
        footer={footer ? <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>{footer}</div> : undefined}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
      </CrmV2BottomSheet>
    )
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.28)', zIndex: 1000 }} />
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001,
          width: `min(${width}px, calc(100vw - 48px))`, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column',
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowPanel,
          fontFamily: crmV2.font, color: crmV2.text, overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${crmV2.border}` }}>{header}</div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${crmV2.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </>
  )
}

/** Pastilles de couleur (marques). */
export function MktSwatches({ colors, size = 28 }: { colors: string[]; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {colors.map((c, i) => (
        <span key={`${c}-${i}`} title={c} style={{
          width: size, height: size, borderRadius: '50%', background: c, flexShrink: 0,
          boxShadow: 'inset 0 0 0 1px rgba(15,31,61,0.08)',
        }} />
      ))}
    </div>
  )
}

/** Encadré d'information (or doux) — remplace les bandeaux jaunes de l'ancien design. */
export function MktNotice({ icon, children, tone = 'gold' }: { icon?: ReactNode; children: ReactNode; tone?: 'gold' | 'blue' | 'red' }) {
  const t = tone === 'blue'
    ? { bg: 'rgba(0,145,174,0.06)', border: 'rgba(0,145,174,0.25)', color: '#0b6b80' }
    : tone === 'red'
      ? { bg: crmV2.dangerSoft, border: 'rgba(242,84,91,0.35)', color: '#b42318' }
      : { bg: crmV2.goldSoft, border: crmV2.goldBorder, color: crmV2.goldDark }
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12,
      background: t.bg, border: `1px solid ${t.border}`, color: t.color, fontSize: 13, lineHeight: 1.5,
    }}>
      {icon && <span style={{ display: 'inline-flex', marginTop: 1, flexShrink: 0 }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}
