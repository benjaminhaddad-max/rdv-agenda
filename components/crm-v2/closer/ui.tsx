'use client'

import { useEffect, type CSSProperties, type ReactNode } from 'react'
import {
  AlertCircle, CalendarCheck, Check, CheckCircle, Clock, LifeBuoy, Menu, Plus, Users,
} from 'lucide-react'
import { crmV2, crmV2Navy } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2CloseButton, hexA } from '@/components/crm-v2/primitives'

/* ─────────────────────────────────────────────────────────────────────────
 * Éléments partagés de l'espace closer V2 et des modales de prise de RDV
 * ───────────────────────────────────────────────────────────────────────── */

/** Style de champ V2 (rayon 10) : 44 px sur mobile, 40 px sur ordinateur. */
export function closerInput(isMobile: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', height: isMobile ? 44 : 40, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
    padding: '0 12px', fontSize: isMobile ? 15 : 14, color: crmV2.text, background: crmV2.bg, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', minWidth: 0, ...extra,
  }
}

/** Libellé de champ (12 px / 700) avec icône or optionnelle. */
export function FieldLabel({ icon, children, extra }: { icon?: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6,
      fontSize: 12, fontWeight: 700, color: crmV2.textMuted,
    }}>
      {icon && <span style={{ display: 'inline-flex', color: crmV2.gold }}>{icon}</span>}
      {children}
      {extra}
    </div>
  )
}

/** Encadré d'erreur, de succès ou d'information. */
export function Notice({
  tone = 'error', children, style,
}: {
  tone?: 'error' | 'success' | 'info' | 'warning'
  children: ReactNode
  style?: CSSProperties
}) {
  const map = {
    error: { color: '#d13a41', bg: 'rgba(242,84,91,0.08)', border: 'rgba(242,84,91,0.30)', icon: <AlertCircle size={14} /> },
    success: { color: '#15803d', bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.28)', icon: <CheckCircle size={14} /> },
    info: { color: crmV2.goldDark, bg: crmV2.goldSoft, border: crmV2.goldBorder, icon: <Clock size={14} /> },
    warning: { color: '#b45309', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)', icon: <AlertCircle size={14} /> },
  }[tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, background: map.bg, border: `1px solid ${map.border}`,
      borderRadius: 12, padding: '10px 14px', color: map.color, fontSize: 13, lineHeight: 1.45, ...style,
    }}>
      <span style={{ display: 'inline-flex', marginTop: 2, flexShrink: 0 }}>{map.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  )
}

/** Bouton d'option (choix de mode, de jour, de créneau…) : actif = bordure navy. */
export function ChoiceButton({
  active, onClick, children, disabled, style, tone,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  style?: CSSProperties
  /** Couleur quand actif (par défaut navy) */
  tone?: string
}) {
  const c = tone || crmV2.primary
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: 40, padding: '0 14px', borderRadius: 999, fontFamily: 'inherit',
        fontSize: 13, fontWeight: active ? 700 : 600, cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? hexA(c, 0.08) : crmV2.bg,
        border: `1px solid ${active ? c : crmV2.borderStrong}`,
        boxShadow: active ? `0 0 0 1px ${c}` : 'none',
        color: active ? c : crmV2.text, opacity: disabled ? 0.5 : 1,
        transition: 'background .12s, border-color .12s', ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Barre d'étapes numérotées (Contact · Créneau · Infos…). */
export function StepBar({ labels, step, done }: { labels: string[]; step: number; done: boolean[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {labels.map((label, i) => {
        const n = i + 1
        const current = n === step
        const isDone = !!done[i] && !current
        const on = current || isDone
        return (
          <span key={label} style={{ display: 'contents' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, boxSizing: 'border-box',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? crmV2.success : current ? crmV2.primary : crmV2.bg,
                color: on ? '#fff' : crmV2.textFaint,
                border: on ? 'none' : `1.5px solid ${crmV2.borderStrong}`,
              }}>
                {isDone ? <Check size={12} strokeWidth={3} /> : n}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: on ? crmV2.text : crmV2.textFaint }}>{label}</span>
            </span>
            {i < labels.length - 1 && (
              <span style={{ flex: 1, height: 2, borderRadius: 2, background: isDone ? crmV2.success : crmV2.border, minWidth: 10 }} />
            )}
          </span>
        )
      })}
    </div>
  )
}

/** Carte d'étape numérotée (rayon 16) : pastille, titre, sous-titre, action à droite. */
export function StepCard({
  n, title, subtitle, done = false, action, children, style,
}: {
  n: number
  title: ReactNode
  subtitle?: ReactNode
  done?: boolean
  action?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()
  return (
    <section style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, padding: isMobile ? 14 : 18, minWidth: 0, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0, fontSize: 12, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: done ? crmV2.success : crmV2.primary, color: '#fff',
        }}>
          {done ? <Check size={13} strokeWidth={3} /> : n}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Ferme sur Échap et bloque le défilement de la page tant que le panneau est ouvert. */
function useSheetOverlay(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

/**
 * Panneau de saisie V2 : tiroir à droite sur ordinateur (rayon 20), panneau qui
 * monte du bas sur mobile (poignée, rayon 22). zIndex réglable (au-dessus des fiches).
 */
export function CloserSheet({
  onClose, header, footer, children, width = 520, zIndex = 1000,
}: {
  onClose: () => void
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  width?: number
  zIndex?: number
}) {
  const isMobile = useIsMobile()
  useSheetOverlay(onClose)
  const panel: CSSProperties = isMobile
    ? {
        position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '92dvh',
        borderRadius: '22px 22px 0 0', paddingBottom: 'env(safe-area-inset-bottom)',
        animation: 'crm-v2-sheet-up .22s ease-out',
      }
    : {
        position: 'fixed', top: 12, right: 12, bottom: 12, width, maxWidth: 'calc(100vw - 24px)',
        borderRadius: 20, border: `1px solid ${crmV2.border}`,
      }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: isMobile ? 'rgba(15,31,61,0.40)' : 'rgba(15,31,61,0.28)', zIndex }} />
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        style={{
          ...panel, background: crmV2.bg, boxShadow: crmV2.shadowPanel, zIndex: zIndex + 1,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: crmV2.font, color: crmV2.text,
        }}
      >
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px', flexShrink: 0 }}>
            <span style={{ width: 40, height: 4, borderRadius: 999, background: crmV2.borderStrong }} />
          </div>
        )}
        {header && (
          <div style={{ padding: isMobile ? '8px 16px 12px' : '16px 18px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>
            {header}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: crmV2.bgSoft }}>{children}</div>
        {footer && (
          <div style={{
            padding: isMobile ? '10px 16px 12px' : '12px 18px', borderTop: `1px solid ${crmV2.border}`,
            display: 'flex', gap: 8, flexShrink: 0, background: crmV2.bg,
          }}>
            {footer}
          </div>
        )}
      </div>
    </>
  )
}

/** En-tête de panneau : surtitre (icône + majuscules), titre, sous-titre, fermer. */
export function SheetHeader({
  kicker, icon, title, subtitle, onClose, children,
}: {
  kicker?: ReactNode
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          {kicker && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
              fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              {icon && <span style={{ display: 'inline-flex', color: crmV2.gold }}>{icon}</span>}
              {kicker}
            </div>
          )}
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: crmV2.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4 }}>{subtitle}</div>}
        </div>
        <CrmV2CloseButton onClick={onClose} />
      </div>
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </>
  )
}

/** Gros bouton or 48 px (validation d'un RDV). */
export function GoldButton({
  children, onClick, disabled, style,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', height: 48, border: 'none', borderRadius: 999, flexShrink: 0,
        background: disabled ? crmV2.borderStrong : crmV2.goldGradient, color: disabled ? crmV2.textMuted : '#fff',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(184,150,62,0.28)',
        fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Lien « Service technique » en pilule, avec pastille de réponses non lues. */
export function SupportPill({ unread, compact = false }: { unread: number; compact?: boolean }) {
  return (
    <a href="/support" title="Service technique" style={{
      position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999,
      padding: compact ? 0 : '8px 16px', width: compact ? 38 : undefined, height: compact ? 38 : undefined,
      justifyContent: 'center', boxSizing: 'border-box',
      fontSize: 13, fontWeight: 600, color: crmV2.text, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
      textDecoration: 'none', flexShrink: 0,
    }}>
      <LifeBuoy size={compact ? 16 : 14} color={compact ? crmV2.textMuted : undefined} />
      {!compact && 'Service technique'}
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 999, background: crmV2.danger,
          color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
        }}>{unread}</span>
      )}
    </a>
  )
}

/* ─── Barre d'onglets du bas (mobile closer) ────────────────────────────── */

export type CloserMobileTab = 'planning' | 'contacts' | 'rdv' | 'dispos' | 'plus'

export function CloserTabBar({
  active, onPlanning, onContacts, onNew, onDispos, onPlus,
}: {
  active: CloserMobileTab
  onPlanning: () => void
  onContacts: () => void
  onNew: () => void
  onDispos: () => void
  onPlus: () => void
}) {
  const item = (key: CloserMobileTab, label: string, icon: ReactNode, onClick: () => void) => {
    const on = active === key
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        style={{
          flex: 1, minWidth: 0, height: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          color: on ? crmV2Navy.goldIcon : crmV2Navy.text, fontSize: 10, fontWeight: on ? 700 : 600,
        }}
      >
        {icon}
        <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      </button>
    )
  }
  return (
    <nav style={{
      flexShrink: 0, background: crmV2Navy.bg, borderTop: `1px solid ${crmV2Navy.border}`,
      paddingBottom: 'env(safe-area-inset-bottom)', position: 'relative', zIndex: 20,
    }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center' }}>
        {item('planning', 'Planning', <CalendarCheck size={18} />, onPlanning)}
        {item('contacts', 'Contacts', <Users size={18} />, onContacts)}
        <button
          type="button"
          onClick={onNew}
          style={{
            flex: 1, minWidth: 0, height: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            color: active === 'rdv' ? crmV2Navy.goldIcon : crmV2Navy.text, fontSize: 10, fontWeight: active === 'rdv' ? 700 : 600,
          }}
        >
          <span style={{
            width: 44, height: 44, borderRadius: 999, background: crmV2.goldGradient, color: crmV2Navy.bg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(184,150,62,0.45)', marginTop: -14,
          }}>
            <Plus size={22} strokeWidth={2.4} />
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>Nouveau RDV</span>
        </button>
        {item('dispos', 'Dispos', <Clock size={18} />, onDispos)}
        {item('plus', 'Plus', <Menu size={18} />, onPlus)}
      </div>
    </nav>
  )
}
