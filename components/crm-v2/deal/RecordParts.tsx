'use client'

/**
 * Briques du gabarit B (fiche détail) partagées par la fiche transaction
 * et la fiche contrat alternance : en-tête, colonne en carte, ligne de propriété.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

/** En-tête de fiche : retour, avatar 56 px, nom 24 px, méta, actions, pastilles. */
export function RecordHeader({
  back, avatar, title, meta, actions, pills,
}: {
  back?: { href: string; label: string }
  /** Contenu de l'avatar (initiales ou icône) */
  avatar?: ReactNode
  title: ReactNode
  /** Ligne sous le nom (e-mail, téléphone, ville…) */
  meta?: ReactNode
  actions?: ReactNode
  pills?: ReactNode
}) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      background: crmV2.bg, borderBottom: `1px solid ${crmV2.thBorder}`,
      padding: isMobile ? '12px 12px 14px' : '16px 28px', flexShrink: 0,
    }}>
      {back && (
        <a
          href={back.href}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: isMobile ? 32 : undefined,
            fontSize: 13, fontWeight: 600, color: crmV2.textMuted, textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> {back.label}
        </a>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, marginTop: back ? (isMobile ? 8 : 14) : 0, flexWrap: 'wrap' }}>
        {avatar && (
          <div style={{
            width: isMobile ? 48 : 56, height: isMobile ? 48 : 56, borderRadius: '32%', background: crmV2.goldGradient,
            color: '#fff', fontSize: isMobile ? 17 : 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(184,150,62,0.35)', flexShrink: 0,
          }}>
            {avatar}
          </div>
        )}
        <div style={{ flex: isMobile ? '1 1 0' : '1 1 320px', minWidth: isMobile ? 0 : 260 }}>
          <h1 style={{
            margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 600, letterSpacing: '-0.02em', color: crmV2.text,
            overflowWrap: 'anywhere',
          }}>
            {title}
          </h1>
          {meta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px 14px', marginTop: 4, fontSize: 13, color: crmV2.textMuted, flexWrap: 'wrap' }}>
              {meta}
            </div>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...(isMobile ? { flexBasis: '100%' } : {}) }}>
            {actions}
          </div>
        )}
      </div>
      {pills && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: isMobile ? 10 : 14, flexWrap: 'wrap' }}>
          {pills}
        </div>
      )}
    </div>
  )
}

/** Élément de la ligne méta de l'en-tête (icône 13 px + texte). */
export function RecordMeta({ icon, children, href }: { icon: ReactNode; children: ReactNode; href?: string }) {
  const content = <>{icon}{children}</>
  const style: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, overflowWrap: 'anywhere' }
  return href
    ? <a href={href} style={{ ...style, color: crmV2.link, textDecoration: 'none' }}>{content}</a>
    : <span style={style}>{content}</span>
}

/** Corps du gabarit B : 3 colonnes qui défilent séparément (empilées sur mobile). */
export function RecordBody({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
  }
  return (
    <div style={{
      flex: 1, minHeight: 0, padding: '16px 28px 20px', overflowX: 'auto', display: 'grid',
      gridTemplateColumns: 'minmax(240px,300px) minmax(420px,1fr) minmax(260px,320px)', gridTemplateRows: 'minmax(0, 1fr)',
      gap: 16, alignItems: 'stretch',
    }}>
      {children}
    </div>
  )
}

/** Colonne droite : pile de sections repliables qui défile seule. */
export function RecordSideStack({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, minWidth: 0,
      ...(isMobile ? {} : { overflowY: 'auto', paddingBottom: 4 }),
    }}>
      {children}
    </div>
  )
}

/** Carte de colonne (gauche / centre) avec en-tête repliable optionnel. */
export function RecordCard({
  title, action, children, collapsible = false, bodyStyle, style,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  collapsible?: boolean
  bodyStyle?: CSSProperties
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(true)
  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowRecord,
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', ...style,
    }}>
      {title && (
        <div style={{
          padding: '14px 16px 12px', borderBottom: open ? `1px solid ${crmV2.border}` : 'none', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <button
            type="button"
            onClick={() => collapsible && setOpen(o => !o)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: crmV2.text,
              background: 'none', border: 'none', padding: 0, cursor: collapsible ? 'pointer' : 'default', fontFamily: 'inherit',
              minWidth: 0, textAlign: 'left',
            }}
          >
            {collapsible && (
              <ChevronDown size={14} color={crmV2.textFaint} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
            )}
            {title}
          </button>
          {action}
        </div>
      )}
      {open && (
        <div style={{ flex: 1, minHeight: 0, ...(isMobile ? {} : { overflowY: 'auto' }), ...bodyStyle }}>
          {children}
        </div>
      )}
    </div>
  )
}

/** Propriété : libellé 12 px au-dessus de la valeur 14 px, survol gris. */
export function PropRow({ label, children, onClick }: { label: ReactNode; children: ReactNode; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 8px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
        background: hover && onClick ? crmV2.bgHover : 'transparent', cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 12, color: crmV2.textMuted }}>{label}</span>
      <span style={{ fontSize: 14, color: crmV2.text, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  )
}

/** Bouton icône rond 30 px (valider / annuler une édition, ajouter…). */
export function RoundIconButton({
  icon, onClick, title, variant = 'secondary', disabled,
}: {
  icon: ReactNode
  onClick?: () => void
  title: string
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: 30, height: 30, borderRadius: 999, flexShrink: 0, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1,
        background: variant === 'primary' ? crmV2.primary : crmV2.bg,
        border: `1px solid ${variant === 'primary' ? crmV2.primary : crmV2.borderStrong}`,
        color: variant === 'primary' ? '#fff' : crmV2.text,
      }}
    >
      {icon}
    </button>
  )
}

/** Message vide en pointillés (sections de la colonne droite). */
export function EmptyBlock({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 12, color: crmV2.textFaint, textAlign: 'center', padding: '12px 8px',
      border: `1px dashed ${crmV2.borderStrong}`, borderRadius: 10,
    }}>
      {text}
    </div>
  )
}
