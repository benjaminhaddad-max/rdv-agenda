'use client'

import {
  useEffect, useState,
  type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

export function CrmV2Page({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="crm-v2"
      style={{
        minHeight: '100%',
        background: crmV2.bgSoft,
        color: crmV2.text,
        fontFamily: crmV2.font,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CrmV2Header({
  title,
  subtitle,
  actions,
  back,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Lien retour « ← Contacts » au-dessus du titre */
  back?: { href: string; label: string }
  /** Onglets (CrmV2Tabs) collés sous le titre */
  children?: ReactNode
}) {
  const isMobile = useIsMobile()
  return (
    <div
      style={{
        background: crmV2.bg,
        borderBottom: `1px solid ${crmV2.border}`,
        padding: isMobile ? '14px 12px 0' : '20px 28px 0',
        flexShrink: 0,
      }}
    >
      {back && (
        <a
          href={back.href}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8,
            fontSize: 13, fontWeight: 600, color: crmV2.link, textDecoration: 'none',
          }}
        >
          <ChevronLeft size={14} strokeWidth={2} /> {back.label}
        </a>
      )}
      {/* Mobile : titre et actions passent à la ligne au lieu de déborder */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: isMobile ? 10 : '12px 16px', marginBottom: children ? 12 : (isMobile ? 12 : 16),
        flexWrap: 'wrap',
      }}>
        <div style={isMobile ? { minWidth: 0 } : undefined}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 600, color: crmV2.text, letterSpacing: '-0.02em' }}>
            {title}
          </h1>
          {subtitle && (
            <div style={{ marginTop: 4, fontSize: 13, color: crmV2.textMuted }}>{subtitle}</div>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

export function CrmV2Tabs({
  items,
  value,
  onChange,
  leading,
  trailing,
  bordered = true,
}: {
  items: { id: string; label: ReactNode; count?: number }[]
  value: string
  onChange: (id: string) => void
  /** Élément avant les onglets (ex. recherche « Rechercher une vue ») */
  leading?: ReactNode
  /** Élément après les onglets (ex. « + Ajouter une vue ») */
  trailing?: ReactNode
  /** false quand les onglets sont dans un CrmV2Header (qui a déjà sa bordure) */
  bordered?: boolean
}) {
  const isMobile = useIsMobile()
  return (
    // Rangée d'onglets qui défile horizontalement, sans retour à la ligne
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 0,
      borderBottom: bordered ? `1px solid ${crmV2.border}` : 'none',
      margin: isMobile ? '0 -12px' : '0 -28px', padding: isMobile ? '0 12px' : '0 28px',
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {leading}
      {items.map(item => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              appearance: 'none',
              background: 'none',
              border: 'none',
              borderBottom: active ? `3px solid ${crmV2.text}` : '3px solid transparent',
              marginBottom: -1,
              padding: '10px 14px',
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              color: active ? crmV2.text : crmV2.textMuted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              ...(isMobile ? { padding: '10px 12px' } : {}),
            }}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span style={{ marginLeft: 6, color: crmV2.textFaint, fontWeight: 500 }}>({item.count.toLocaleString('fr-FR')})</span>
            )}
          </button>
        )
      })}
      {trailing}
    </div>
  )
}

export function CrmV2PillTabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[]
  value: string
  onChange: (id: string) => void
}) {
  const isMobile = useIsMobile()
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: crmV2.bgSoft,
        border: `1px solid ${crmV2.border}`,
        borderRadius: crmV2.radiusPill,
        padding: 3,
        // Mobile : pilules scrollables horizontalement plutôt que coupées
        ...(isMobile ? { maxWidth: '100%', overflowX: 'auto' as const, scrollbarWidth: 'none' as const } : {}),
      }}
    >
      {items.map(item => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              appearance: 'none',
              border: 'none',
              background: active ? crmV2.bg : 'transparent',
              boxShadow: active ? crmV2.shadow : 'none',
              borderRadius: crmV2.radiusPill,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? crmV2.text : crmV2.textMuted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {item.label}
            {typeof item.count === 'number' ? ` (${item.count})` : ''}
          </button>
        )
      })}
    </div>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'accent' | 'danger'

export function CrmV2Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
  /** Icône Lucide (14 px) avant le libellé */
  icon?: ReactNode
  children?: ReactNode
}) {
  const [hover, setHover] = useState(false)
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: crmV2.radiusPill,
    padding: size === 'sm' ? '6px 12px' : size === 'lg' ? '12px 20px' : '8px 16px',
    fontSize: size === 'sm' ? 12 : 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    justifyContent: 'center',
    cursor: rest.disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: rest.disabled ? 0.55 : 1,
    transition: 'background .12s, border-color .12s, color .12s',
  }
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: {
      background: hover && !rest.disabled ? crmV2.primaryHover : crmV2.primary,
      border: `1px solid ${hover && !rest.disabled ? crmV2.primaryHover : crmV2.primary}`,
      color: '#fff',
    },
    secondary: {
      background: hover && !rest.disabled ? crmV2.bgHover : crmV2.bg,
      border: `1px solid ${crmV2.borderStrong}`,
      color: crmV2.text,
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: hover && !rest.disabled ? crmV2.linkHover : crmV2.link,
    },
    gold: {
      background: crmV2.goldSoft,
      border: `1px solid ${crmV2.goldBorder}`,
      color: crmV2.goldDark,
    },
    /** Dégradé or — action phare (« Prendre RDV », « + Nouveau RDV ») */
    accent: {
      background: crmV2.goldGradient,
      border: '1px solid transparent',
      color: '#fff',
      boxShadow: hover && !rest.disabled ? '0 4px 14px rgba(184,150,62,0.40)' : '0 2px 8px rgba(184,150,62,0.28)',
    },
    danger: {
      background: hover && !rest.disabled ? 'rgba(242,84,91,0.14)' : crmV2.dangerSoft,
      border: '1px solid rgba(242,84,91,0.35)',
      color: '#d13a41',
    },
  }
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...style }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function CrmV2Search({
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  const isMobile = useIsMobile()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: crmV2.bg,
        border: `1px solid ${crmV2.borderStrong}`,
        borderRadius: crmV2.radiusPill,
        padding: '0 14px',
        minWidth: isMobile ? 0 : 220,
        height: 36,
        ...style,
      }}
    >
      <Search size={15} color={crmV2.textFaint} strokeWidth={2} />
      <input
        {...rest}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 13,
          color: crmV2.text,
          fontFamily: 'inherit',
          height: '100%',
        }}
      />
    </div>
  )
}

export function CrmV2Avatar({
  name,
  color,
  size = 24,
  radius = '50%',
  ring = false,
}: {
  name?: string | null
  /** Couleur ou dégradé CSS (ex. crmV2.goldGradient) */
  color?: string
  size?: number
  /** '50%' rond · '36%' lien de tableau · '32%' fiche */
  radius?: string | number
  /** Liseré blanc + ombre (avatars de liste) */
  ring?: boolean
}) {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('') || '?'
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: color || crmV2.gold,
        boxShadow: ring ? '0 0 0 2px #ffffff, 0 2px 6px rgba(15,31,61,0.22)' : undefined,
        color: '#fff',
        fontSize: Math.max(10, Math.round(size * 0.38)),
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        letterSpacing: 0.2,
      }}
      title={name || undefined}
    >
      {initials}
    </span>
  )
}

export function CrmV2Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: crmV2.bg,
        border: `1px solid ${crmV2.border}`,
        borderRadius: crmV2.radiusLg,
        boxShadow: crmV2.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CrmV2Table({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontSize: 13,
        }}
      >
        {children}
      </table>
    </div>
  )
}

export function CrmV2Th({
  children,
  sorted,
  onClick,
  style,
}: {
  children: ReactNode
  sorted?: 'asc' | 'desc' | false
  onClick?: () => void
  style?: CSSProperties
}) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '10px 14px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: crmV2.textMuted,
        background: sorted ? crmV2.thSortedBg : crmV2.thBg,
        borderBottom: `2px solid ${crmV2.thBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 1,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {sorted === 'asc' && <span aria-hidden>↑</span>}
        {sorted === 'desc' && <span aria-hidden>↓</span>}
      </span>
    </th>
  )
}

export function CrmV2Td({
  children,
  style,
  colSpan,
}: {
  children?: ReactNode
  style?: CSSProperties
  colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: '3px 14px',
        height: 40,
        boxSizing: 'border-box',
        borderBottom: `1px solid ${crmV2.border}`,
        color: crmV2.text,
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {children}
    </td>
  )
}

export function CrmV2Link({
  href,
  children,
  style,
}: {
  href: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <a
      href={href}
      style={{
        color: crmV2.link,
        fontWeight: 600,
        textDecoration: 'none',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.color = crmV2.linkHover; e.currentTarget.style.textDecoration = 'underline' }}
      onMouseLeave={e => { e.currentTarget.style.color = crmV2.link; e.currentTarget.style.textDecoration = 'none' }}
    >
      {children}
    </a>
  )
}

export function CrmV2Empty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px' }}>
      {icon && (
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: crmV2.goldSoft,
            color: crmV2.gold,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ fontSize: 16, fontWeight: 600, color: crmV2.text }}>{title}</div>
      {description && (
        <p style={{ margin: '8px auto 0', maxWidth: 420, fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  )
}

export function CrmV2Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <div
        style={{
          width: 28,
          height: 28,
          border: `2px solid ${crmV2.border}`,
          borderTopColor: crmV2.gold,
          borderRadius: '50%',
          animation: 'crm-v2-spin 0.7s linear infinite',
        }}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
 * Socle V2 (brief « Templates CRM V2 ») : gabarits A à F
 * ───────────────────────────────────────────────────────────────────────── */

/** Zone de contenu d'une page, sur fond #eef1f6 (28 px, 12 px sur mobile). */
export function CrmV2Body({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      padding: isMobile ? 12 : '16px 28px 20px',
      display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16,
      ...style,
    }}>
      {children}
    </div>
  )
}

/** Libellé de section : 11 px / 700 / MAJUSCULES. */
export function CrmV2SectionLabel({ children, icon, style }: { children: ReactNode; icon?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
      color: crmV2.textMuted, ...style,
    }}>
      {icon}
      {children}
    </div>
  )
}

/** Pastille neutre grise. */
export function CrmV2Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, color: crmV2.text,
      borderRadius: crmV2.radiusPill, padding: '2px 10px',
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', ...style,
    }}>
      {children}
    </span>
  )
}

/** Pastille de statut colorée avec un point (étapes, statuts…). */
export function CrmV2StatusPill({
  label, color, bg, dot = true, bordered = false, size = 'sm', style,
}: {
  label: ReactNode
  color: string
  /** Fond ; par défaut la couleur à 10 % */
  bg?: string
  dot?: boolean
  bordered?: boolean
  size?: 'sm' | 'md'
  style?: CSSProperties
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: bg ?? hexA(color, 0.10), color,
      border: bordered ? `1px solid ${hexA(color, 0.35)}` : 'none',
      borderRadius: crmV2.radiusPill, padding: size === 'md' ? '3px 10px' : '2px 10px',
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', ...style,
    }}>
      {dot && <span style={{ width: size === 'md' ? 7 : 6, height: size === 'md' ? 7 : 6, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      {label}
    </span>
  )
}

/** '#rrggbb' → rgba(r,g,b,a). Les autres formats sont renvoyés tels quels. */
export function hexA(color: string, alpha: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Filtre en pilule avec chevron (barre d'outils de tableau). */
export function CrmV2FilterPill({
  label, active = false, count, onClick, style,
}: {
  label: ReactNode
  active?: boolean
  count?: number
  onClick?: () => void
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
        display: 'inline-flex', alignItems: 'center', gap: 6,
        borderRadius: crmV2.radiusPill, padding: '7px 14px',
        fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
        background: active ? 'rgba(0,145,174,0.08)' : hover ? crmV2.bgHover : crmV2.bg,
        border: `1px solid ${active ? 'rgba(0,145,174,0.45)' : crmV2.borderStrong}`,
        color: active ? crmV2.link : crmV2.text, ...style,
      }}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: 999, background: crmV2.link, color: '#fff',
          fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
        }}>{count}</span>
      )}
      <ChevronDown size={13} color={crmV2.textFaint} strokeWidth={2} />
    </button>
  )
}

/** Carte indicateur (KPI) : icône 28 px, libellé, valeur 28 px colorée, détail. */
export function CrmV2KpiCard({
  label, value, icon, color = crmV2.text, detail, onClick, style,
}: {
  label: ReactNode
  value: ReactNode
  icon?: ReactNode
  color?: string
  detail?: ReactNode
  onClick?: () => void
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()
  return (
    <div
      onClick={onClick}
      style={{
        background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
        boxShadow: crmV2.shadow, padding: isMobile ? 12 : 16, minWidth: 0,
        cursor: onClick ? 'pointer' : 'default', ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isMobile ? 6 : 10 }}>
        {icon && (
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: crmV2.bgSoft, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
        <div style={{
          fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</div>
      </div>
      <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
      {detail && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>{detail}</div>}
    </div>
  )
}

/** Grille d'indicateurs : auto-fit 200 px (2 colonnes sur mobile). */
export function CrmV2KpiGrid({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: isMobile ? 8 : 12, ...style,
    }}>
      {children}
    </div>
  )
}

/** Carte tableau du gabarit A : barre d'outils + tableau + pied. */
export function CrmV2TableCard({
  toolbar, footer, children, style, scrollStyle,
}: {
  toolbar?: ReactNode
  footer?: ReactNode
  children: ReactNode
  style?: CSSProperties
  scrollStyle?: CSSProperties
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minWidth: 0,
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, overflow: 'hidden', ...style,
    }}>
      {toolbar && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
          borderBottom: `1px solid ${crmV2.border}`, flexWrap: 'wrap',
        }}>
          {toolbar}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', ...scrollStyle }}>{children}</div>
      {footer && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          padding: '10px 14px', borderTop: `1px solid ${crmV2.border}`, fontSize: 13, color: crmV2.textMuted,
        }}>
          {footer}
        </div>
      )}
    </div>
  )
}

/** Ligne de tableau 40 px avec survol or léger. */
export function CrmV2Tr({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  const [hover, setHover] = useState(false)
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ height: 40, background: hover ? crmV2.rowHover : undefined, cursor: onClick ? 'pointer' : undefined, ...style }}
    >
      {children}
    </tr>
  )
}

/** Pied de tableau : « 1–25 sur N » + pagination ronde 32 px. */
export function CrmV2Pagination({
  page, pageSize, total, onChange,
}: {
  /** Page courante, à partir de 1 */
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const nums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const round: CSSProperties = {
    minWidth: 32, height: 32, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '0 6px',
  }
  return (
    <>
      <span>{from.toLocaleString('fr-FR')}–{to.toLocaleString('fr-FR')} sur {total.toLocaleString('fr-FR')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Page précédente"
          style={{ ...round, width: 32, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: page <= 1 ? crmV2.textFaint : crmV2.text, cursor: page <= 1 ? 'default' : 'pointer' }}>
          <ChevronLeft size={14} />
        </button>
        {nums.map((n, i) => n === '…'
          ? <span key={`e${i}`} style={{ padding: '0 4px' }}>…</span>
          : (
            <button key={n} type="button" onClick={() => onChange(n)}
              style={{
                ...round,
                border: `1px solid ${n === page ? crmV2.primary : 'transparent'}`,
                background: n === page ? crmV2.primary : 'transparent',
                color: n === page ? '#fff' : crmV2.text, fontWeight: n === page ? 700 : 600,
              }}>
              {n}
            </button>
          ))}
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Page suivante"
          style={{ ...round, width: 32, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: page >= pages ? crmV2.textFaint : crmV2.text, cursor: page >= pages ? 'default' : 'pointer' }}>
          <ChevronRight size={14} />
        </button>
      </div>
    </>
  )
}

/** Ferme sur Échap et bloque le défilement de la page tant que le panneau est ouvert. */
function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
}

/**
 * Tiroir à droite (ordinateur : 460 px, rayon 20, fond sombre derrière).
 * Sur mobile, bascule automatiquement en panneau qui monte du bas.
 */
export function CrmV2Drawer({
  open, onClose, header, footer, children, width = 460,
}: {
  open: boolean
  onClose: () => void
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  width?: number
}) {
  const isMobile = useIsMobile()
  useOverlay(open, onClose)
  if (!open) return null
  if (isMobile) {
    return <CrmV2BottomSheet open={open} onClose={onClose} header={header} footer={footer}>{children}</CrmV2BottomSheet>
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.28)', zIndex: 1000 }} />
      <aside
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        style={{
          position: 'fixed', top: 12, right: 12, bottom: 12, width, maxWidth: 'calc(100vw - 24px)',
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 20, boxShadow: crmV2.shadowPanel,
          zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: crmV2.font, color: crmV2.text,
        }}
      >
        {header && <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>{header}</div>}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '12px 18px', borderTop: `1px solid ${crmV2.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>{footer}</div>}
      </aside>
    </>
  )
}

/** Panneau mobile qui monte du bas, avec poignée (rayon 22). */
export function CrmV2BottomSheet({
  open, onClose, header, footer, children, dark = false, maxHeight = '88dvh',
}: {
  open: boolean
  onClose: () => void
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  /** Variante navy (menu « Plus ») */
  dark?: boolean
  maxHeight?: string
}) {
  useOverlay(open, onClose)
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.40)', zIndex: 1000 }} />
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight,
          background: dark ? '#241F3F' : crmV2.bg, color: dark ? '#fff' : crmV2.text,
          borderRadius: '22px 22px 0 0', boxShadow: crmV2.shadowPanel, zIndex: 1001,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: crmV2.font,
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'crm-v2-sheet-up .22s ease-out',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px', flexShrink: 0 }}>
          <span style={{ width: 40, height: 4, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.25)' : crmV2.borderStrong }} />
        </div>
        {header && <div style={{ padding: '6px 16px 12px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : crmV2.border}`, flexShrink: 0 }}>{header}</div>}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '12px 16px', borderTop: `1px solid ${crmV2.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>{footer}</div>}
      </div>
    </>
  )
}

/** Bouton rond « fermer » 34 px. */
export function CrmV2CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Fermer" aria-label="Fermer" style={{
      width: 34, height: 34, borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
      color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
    }}>
      <X size={16} />
    </button>
  )
}

/**
 * Section repliable (colonne droite des fiches) : icône or, titre en majuscules,
 * compteur et chevron. L'état peut être mémorisé via storageKey.
 */
export function CrmV2Section({
  title, icon, count, defaultOpen = true, storageKey, actions, children, style,
}: {
  title: ReactNode
  icon?: ReactNode
  count?: number
  defaultOpen?: boolean
  storageKey?: string
  actions?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
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
  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadowRecord, overflow: 'hidden', ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
        <button type="button" onClick={toggle} style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}>
          {icon && <span style={{ color: crmV2.gold, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          {typeof count === 'number' && (
            <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, background: crmV2.bgSoft, borderRadius: 999, padding: '1px 7px' }}>{count}</span>
          )}
          <span style={{ flex: 1 }} />
          <ChevronDown size={14} color={crmV2.textFaint} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
        </button>
        {actions}
      </div>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
    </div>
  )
}

/** Carte de section de formulaire (gabarit E) : titre 15 px, description, grille 2 colonnes. */
export function CrmV2FormSection({
  title, description, children, columns = 2, style,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  columns?: 1 | 2
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, padding: isMobile ? 14 : 20, maxWidth: 880, width: '100%', boxSizing: 'border-box', ...style,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4 }}>{description}</div>}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile || columns === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))',
        gap: '14px 16px', marginTop: 16,
      }}>
        {children}
      </div>
    </div>
  )
}

const fieldBox: CSSProperties = {
  height: 38, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, padding: '0 12px',
  fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, outline: 'none',
  boxSizing: 'border-box', width: '100%',
}

/** Champ avec libellé 12 px / 700 au-dessus. */
export function CrmV2Field({ label, hint, children, span = 1, style }: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  /** 2 = pleine largeur dans la grille d'un CrmV2FormSection */
  span?: 1 | 2
  style?: CSSProperties
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, gridColumn: span === 2 ? '1 / -1' : undefined, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: crmV2.textFaint }}>{hint}</span>}
    </label>
  )
}

export function CrmV2Input({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} style={{ ...fieldBox, ...style }} />
}

export function CrmV2Select({ style, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} style={{ ...fieldBox, cursor: 'pointer', ...style }}>{children}</select>
}

export function CrmV2Textarea({ style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} style={{ ...fieldBox, height: 'auto', minHeight: 80, padding: '10px 12px', lineHeight: 1.5, resize: 'vertical', ...style }} />
}

/** Interrupteur 40×22, or quand activé. */
export function CrmV2Toggle({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, color: crmV2.text, opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ width: 40, height: 22, borderRadius: 999, background: checked ? crmV2.gold : crmV2.borderStrong, position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 3px rgba(15,31,61,0.25)', transition: 'left .15s',
        }} />
      </span>
      {label}
    </button>
  )
}

/** Choix segmenté en pilule (Jour / Semaine / Mois, Visio / Téléphone / Présentiel…). */
export function CrmV2Segmented<T extends string>({ items, value, onChange, stretch = false, size = 'md' }: {
  items: { id: T; label: ReactNode; disabled?: boolean }[]
  value: T
  onChange: (id: T) => void
  stretch?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <div style={{
      display: stretch ? 'flex' : 'inline-flex', gap: 2, background: crmV2.bgSoft, border: `1px solid ${crmV2.border}`,
      borderRadius: 999, padding: 3, maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {items.map(it => {
        const active = it.id === value
        return (
          <button key={it.id} type="button" disabled={it.disabled} onClick={() => onChange(it.id)} style={{
            flex: stretch ? 1 : undefined, appearance: 'none', border: 'none', borderRadius: 999,
            padding: size === 'sm' ? '5px 12px' : '6px 14px', fontSize: size === 'sm' ? 12 : 13,
            fontWeight: active ? 700 : 500, color: active ? crmV2.text : crmV2.textMuted,
            background: active ? crmV2.bg : 'transparent', boxShadow: active ? crmV2.shadow : 'none',
            cursor: it.disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            opacity: it.disabled ? 0.5 : 1,
          }}>
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/** Carte du gabarit F (grille de cartes) : icône 40 px, statut, titre, description, pied. */
export function CrmV2TileCard({
  icon, iconColor = crmV2.gold, status, title, description, meta, href, onClick, cta = 'Ouvrir',
}: {
  icon?: ReactNode
  iconColor?: string
  status?: ReactNode
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  href?: string
  onClick?: () => void
  cta?: ReactNode
}) {
  const [hover, setHover] = useState(false)
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {icon && (
          <span style={{
            width: 40, height: 40, borderRadius: 12, background: hexA(iconColor, 0.12), color: iconColor,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{icon}</span>
        )}
        {status}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, marginTop: 12 }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4, lineHeight: 1.45, flex: 1 }}>{description}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${crmV2.borderLight}`, fontSize: 12, color: crmV2.textMuted }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
        <span style={{ color: crmV2.link, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>{cta}<ChevronRight size={13} /></span>
      </div>
    </>
  )
  const style: CSSProperties = {
    display: 'flex', flexDirection: 'column', background: crmV2.bg, border: `1px solid ${hover ? crmV2.borderStrong : crmV2.border}`,
    borderRadius: crmV2.radiusLg, boxShadow: hover ? '0 6px 18px rgba(45,62,80,0.12)' : crmV2.shadow, padding: 16,
    textDecoration: 'none', color: 'inherit', cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s', textAlign: 'left', fontFamily: 'inherit',
  }
  return href
    ? <a href={href} style={style} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{body}</a>
    : <button type="button" onClick={onClick} style={{ ...style, width: '100%' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{body}</button>
}

/** Grille du gabarit F. */
export function CrmV2TileGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>{children}</div>
}
