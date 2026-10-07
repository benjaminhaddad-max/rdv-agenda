'use client'

/**
 * Petites briques partagées par les pages d'administration V2
 * (Utilisateurs, Doublons, Propriétés, Erreurs, Service technique…).
 * Complètent components/crm-v2/primitives.tsx sans le modifier.
 */

import { useEffect, useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from 'react'
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, Info, Loader2, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2BottomSheet, CrmV2CloseButton, hexA } from '@/components/crm-v2/primitives'

/** Icône de chargement qui tourne (animation définie dans globals.css). */
export function AdminSpin({ size = 14, color }: { size?: number; color?: string }) {
  return <Loader2 size={size} color={color} style={{ animation: 'crm-v2-spin 0.8s linear infinite', flexShrink: 0 }} />
}

type Tone = 'success' | 'error' | 'warning' | 'info'
const TONES: Record<Tone, { color: string; bg: string; border: string; Icon: typeof Info }> = {
  success: { color: '#00866f', bg: 'rgba(0,189,165,0.08)', border: 'rgba(0,189,165,0.30)', Icon: CheckCircle2 },
  error: { color: '#d13a41', bg: crmV2.dangerSoft, border: 'rgba(242,84,91,0.30)', Icon: AlertCircle },
  warning: { color: '#8a6d22', bg: crmV2.goldSoft, border: crmV2.goldBorder, Icon: AlertTriangle },
  info: { color: '#007a8c', bg: 'rgba(0,145,174,0.07)', border: 'rgba(0,145,174,0.25)', Icon: Info },
}

/** Bandeau de message (succès, erreur, avertissement, info). */
export function AdminNotice({
  tone = 'info', children, onClose, icon, style,
}: {
  tone?: Tone
  children: ReactNode
  onClose?: () => void
  icon?: ReactNode
  style?: CSSProperties
}) {
  const t = TONES[tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12,
      color: t.color, fontSize: 13, lineHeight: 1.5, ...style,
    }}>
      <span style={{ display: 'inline-flex', marginTop: 2, flexShrink: 0 }}>{icon ?? <t.Icon size={15} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fermer" style={{
          background: 'none', border: 'none', color: t.color, cursor: 'pointer', padding: 2, display: 'inline-flex', flexShrink: 0,
        }}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}

/**
 * Fenêtre centrée (ordinateur, rayon 16) ; panneau qui monte du bas sur mobile.
 * Ferme sur Échap et au clic sur le fond.
 */
export function AdminModal({
  open, onClose, title, subtitle, footer, children, width = 520, closeDisabled = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  footer?: ReactNode
  children: ReactNode
  width?: number
  /** Empêche la fermeture (enregistrement en cours) */
  closeDisabled?: boolean
}) {
  const isMobile = useIsMobile()
  const close = () => { if (!closeDisabled) onClose() }
  useEffect(() => {
    if (!open || isMobile) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !closeDisabled) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isMobile, onClose, closeDisabled])
  if (!open) return null

  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: crmV2.text, letterSpacing: '-0.01em', wordBreak: 'break-word' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 3, wordBreak: 'break-word' }}>{subtitle}</div>}
      </div>
      <CrmV2CloseButton onClick={close} />
    </div>
  )

  if (isMobile) {
    return (
      <CrmV2BottomSheet open={open} onClose={close} header={header} footer={footer}>
        <div style={{ padding: 16 }}>{children}</div>
      </CrmV2BottomSheet>
    )
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) close() }}
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
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
          boxShadow: crmV2.shadowPanel, overflow: 'hidden', fontFamily: crmV2.font, color: crmV2.text,
        }}
      >
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>{header}</div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>{children}</div>
        {footer && (
          <div style={{
            padding: '12px 20px', borderTop: `1px solid ${crmV2.border}`, display: 'flex',
            justifyContent: 'flex-end', gap: 8, flexShrink: 0, flexWrap: 'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Cellule « lien » avec icône 28 px (gabarit A). */
export function AdminIconCell({
  icon, color = crmV2.gold, children, sub, style,
}: {
  icon: ReactNode
  color?: string
  children: ReactNode
  sub?: ReactNode
  style?: CSSProperties
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '100%', ...style }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8, background: hexA(color, 0.12), color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ color: crmV2.link, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
        {sub && <span style={{ fontSize: 11, color: crmV2.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
    </span>
  )
}

/** Cellule propriétaire : avatar or 22 px + nom. */
export function AdminOwnerCell({ name, color, empty = 'Non attribué' }: { name?: string | null; color?: string; empty?: string }) {
  const label = name || empty
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, color: name ? crmV2.text : crmV2.textMuted }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', background: name ? (color || crmV2.gold) : crmV2.borderStrong,
        color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{initials}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </span>
  )
}

/**
 * Case ronde de tâche (18 px, verte cochée). La zone cliquable fait 28 px
 * (40 px sur mobile) pour rester confortable au doigt.
 */
export function AdminRoundCheck({
  done, onClick, disabled, title, size = 18,
}: {
  done: boolean
  onClick?: () => void
  disabled?: boolean
  title?: string
  size?: number
}) {
  const isMobile = useIsMobile()
  const hit = isMobile ? 40 : 28
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={done}
      style={{
        width: hit, height: hit, margin: (hit - size) / -2, padding: 0, border: 'none', background: 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        cursor: disabled ? 'default' : 'pointer', verticalAlign: 'middle',
      }}
    >
      <span style={{
        width: size, height: size, borderRadius: '50%', boxSizing: 'border-box',
        border: `1.5px solid ${done ? crmV2.success : crmV2.borderStrong}`, background: done ? crmV2.success : '#fff',
        color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done && <Check size={Math.round(size * 0.6)} strokeWidth={3} />}
      </span>
    </button>
  )
}

/** Barre de progression (cellule de tableau). */
export function AdminProgress({ pct, color = crmV2.link, label }: { pct: number; color?: string; label?: ReactNode }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <span style={{ flex: 1, height: 6, background: crmV2.bgMuted, borderRadius: 3, overflow: 'hidden', display: 'block' }}>
        <span style={{ display: 'block', width: `${p}%`, height: '100%', background: color, borderRadius: 3 }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>{label ?? `${Math.round(p)} %`}</span>
    </span>
  )
}

/**
 * Liste déroulante en pilule (filtre de barre d'outils ou statut éditable).
 * `color` colore le texte et le fond (pastille de statut).
 */
export function AdminPillSelect({
  color, style, children, ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', maxWidth: '100%' }}>
      <select
        {...rest}
        style={{
          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          borderRadius: crmV2.radiusPill, padding: color ? '3px 26px 3px 10px' : '7px 30px 7px 14px',
          fontSize: color ? 12 : 13, fontWeight: color ? 700 : 600, fontFamily: 'inherit', cursor: rest.disabled ? 'not-allowed' : 'pointer',
          background: color ? hexA(color, 0.10) : crmV2.bg,
          border: `1px solid ${color ? hexA(color, 0.30) : crmV2.borderStrong}`,
          color: color || crmV2.text, outline: 'none', maxWidth: '100%', minHeight: color ? 26 : 36,
          textOverflow: 'ellipsis', ...style,
        }}
      >
        {children}
      </select>
      <ChevronDown size={13} color={color || crmV2.textFaint} style={{ position: 'absolute', right: color ? 9 : 12, pointerEvents: 'none' }} />
    </span>
  )
}

/** Carte liste mobile : une ligne par objet. */
export function AdminMobileList({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, overflow: 'hidden', ...style,
    }}>
      {children}
    </div>
  )
}

export function AdminMobileRow({
  children, onClick, href, style, last = false,
}: {
  children: ReactNode
  onClick?: () => void
  href?: string
  style?: CSSProperties
  last?: boolean
}) {
  const [hover, setHover] = useState(false)
  const s: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '10px 12px', boxSizing: 'border-box',
    borderBottom: last ? 'none' : `1px solid ${crmV2.borderLight}`, background: hover ? crmV2.rowHover : 'transparent',
    color: 'inherit', textDecoration: 'none', cursor: onClick || href ? 'pointer' : 'default', minWidth: 0, ...style,
  }
  if (href) {
    return <a href={href} style={s} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{children}</a>
  }
  return <div onClick={onClick} style={s} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{children}</div>
}

/** Texte tronqué sur une ligne. */
export function AdminEllipsis({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}>{children}</span>
}

/** Bouton rond d'action (icône) 32 px — 40 px sur mobile. */
export function AdminIconButton({
  icon, title, onClick, tone = 'default', disabled,
}: {
  icon: ReactNode
  title: string
  onClick?: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}) {
  const isMobile = useIsMobile()
  const [hover, setHover] = useState(false)
  const size = isMobile ? 40 : 32
  const danger = tone === 'danger'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${hover && !disabled ? (danger ? 'rgba(242,84,91,0.35)' : crmV2.borderStrong) : crmV2.border}`,
        background: hover && !disabled ? (danger ? crmV2.dangerSoft : crmV2.bgHover) : crmV2.bg,
        color: danger ? '#d13a41' : crmV2.textMuted, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
    </button>
  )
}

/** Remplace les mentions de l'ancien outil dans un texte venu de la base. */
export function hideLegacyBrand(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/lectures\s+hubspot/gi, 'lectures de l’ancien CRM')
    .replace(/dans\s+hubspot/gi, 'dans l’ancien CRM')
    .replace(/couper\s+proprement\s+hubspot/gi, 'couper proprement l’ancien CRM')
    .replace(/hubspot/gi, 'ancien CRM')
}
