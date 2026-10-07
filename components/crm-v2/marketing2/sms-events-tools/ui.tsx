'use client'

/**
 * Petits blocs V2 partagés par SMS Factor et les outils Événements
 * (import CSV, planning) : barre de progression, icône de lien de tableau,
 * bandeaux, étapes, modale de création.
 */

import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { AlertCircle, Check, CheckCircle2, Info } from 'lucide-react'
import { CrmV2CloseButton } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

/** Barre de progression de tableau (gabarit A) : barre 6 px + pourcentage. */
export function V2ProgressBar({ pct, color = crmV2.success, width = 120 }: { pct: number; color?: string; width?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width, height: 6, borderRadius: 999, background: crmV2.bgSoft, overflow: 'hidden', flexShrink: 0 }}>
        <span style={{ display: 'block', width: `${v}%`, height: '100%', borderRadius: 999, background: color }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, minWidth: 34 }}>{v} %</span>
    </span>
  )
}

/** Icône 28 px dans un carré arrondi (première colonne d'un tableau). */
export function V2IconSquare({ children, color = crmV2.link, size = 28 }: { children: ReactNode; color?: string; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 8, background: crmV2.bgSoft, color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

/** Bandeau d'information (erreur, succès, info). */
export function V2Banner({ kind, children, style }: { kind: 'error' | 'success' | 'info'; children: ReactNode; style?: CSSProperties }) {
  const tone = kind === 'error'
    ? { bg: crmV2.dangerSoft, border: 'rgba(242,84,91,0.30)', color: '#d13a41', icon: <AlertCircle size={16} /> }
    : kind === 'success'
      ? { bg: 'rgba(0,189,165,0.08)', border: 'rgba(0,189,165,0.30)', color: '#00866f', icon: <CheckCircle2 size={16} /> }
      : { bg: 'rgba(0,145,174,0.06)', border: 'rgba(0,145,174,0.25)', color: crmV2.link, icon: <Info size={16} /> }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: crmV2.radius,
      background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, fontSize: 13, ...style,
    }}>
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{tone.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  )
}

/**
 * Bloc libellé + contenu, comme CrmV2Field mais en <div> : à utiliser quand le
 * contenu contient plusieurs contrôles (boutons, cases), qu'un <label> casserait.
 */
export function V2FieldBlock({ label, hint, children, span = 1, style }: {
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

/** Étapes d'un parcours (Import CSV) : pastille 28 px, libellé, trait. */
export function V2Steps({ steps, current }: { steps: string[]; current: number }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
              background: done ? crmV2.success : active ? crmV2.primary : crmV2.bg,
              color: done || active ? '#fff' : crmV2.textFaint,
              border: done || active ? 'none' : `1.5px solid ${crmV2.borderStrong}`,
              fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {done ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: done || active ? crmV2.text : crmV2.textFaint }}>{label}</span>
            {i < steps.length - 1 && (
              <span style={{ width: isMobile ? 16 : 48, height: 2, borderRadius: 2, background: crmV2.border, margin: '0 4px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Modale de création V2 : en-tête blanc (titre, sous-titre, fermer),
 * corps sur fond #eef1f6 avec des cartes de sections, pied « Annuler / Créer »
 * aligné à droite. Plein écran (panneau du bas) sur mobile.
 */
export function V2Modal({
  title, subtitle, onClose, footer, children, maxWidth = 760,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
  maxWidth?: number
}) {
  const isMobile = useIsMobile()
  // Bloque le défilement de la page derrière la modale
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,31,61,0.40)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        onClick={e => e.stopPropagation()}
        style={{
          background: crmV2.bgSoft, width: '100%', maxWidth: isMobile ? '100%' : maxWidth,
          maxHeight: isMobile ? '94dvh' : '92vh', display: 'flex', flexDirection: 'column',
          borderRadius: isMobile ? '22px 22px 0 0' : crmV2.radiusLg, overflow: 'hidden',
          boxShadow: crmV2.shadowPanel, fontFamily: crmV2.font, color: crmV2.text,
        }}
      >
        <div style={{
          background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, padding: isMobile ? '14px 12px' : '16px 20px',
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 17 : 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <CrmV2CloseButton onClick={onClose} />
        </div>
        <div style={{
          padding: isMobile ? 12 : 20, overflowY: 'auto', flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 14,
        }}>
          {children}
        </div>
        {footer && (
          <div style={{
            background: crmV2.bg, borderTop: `1px solid ${crmV2.border}`, padding: isMobile ? '12px 12px calc(12px + env(safe-area-inset-bottom))' : '12px 20px',
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Carte blanche rayon 16 avec titre de section (15 px) et description. */
export function V2CardTitle({ icon, title, description, right }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
      {right}
    </div>
  )
}
