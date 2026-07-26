'use client'

import { type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'

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
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div
      style={{
        background: crmV2.bg,
        borderBottom: `1px solid ${crmV2.border}`,
        padding: '20px 28px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: crmV2.text, letterSpacing: '-0.02em' }}>
            {title}
          </h1>
          {subtitle && (
            <div style={{ marginTop: 4, fontSize: 13, color: crmV2.textMuted }}>{subtitle}</div>
          )}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  )
}

export function CrmV2Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${crmV2.border}`, margin: '0 -28px', padding: '0 28px' }}>
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
            }}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span style={{ marginLeft: 6, color: crmV2.textFaint, fontWeight: 500 }}>({item.count})</span>
            )}
          </button>
        )
      })}
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
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: crmV2.bgSoft,
        border: `1px solid ${crmV2.border}`,
        borderRadius: crmV2.radius,
        padding: 3,
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
              borderRadius: crmV2.radiusSm,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? crmV2.text : crmV2.textMuted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
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

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'gold'

export function CrmV2Button({
  variant = 'secondary',
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; children: ReactNode }) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: crmV2.radiusSm,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: rest.disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: rest.disabled ? 0.55 : 1,
    transition: 'background .12s, border-color .12s, color .12s',
  }
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: {
      background: crmV2.text,
      border: `1px solid ${crmV2.text}`,
      color: '#fff',
    },
    secondary: {
      background: crmV2.bg,
      border: `1px solid ${crmV2.borderStrong}`,
      color: crmV2.text,
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: crmV2.link,
    },
    gold: {
      background: crmV2.goldSoft,
      border: `1px solid ${crmV2.goldBorder}`,
      color: crmV2.gold,
    },
  }
  return (
    <button type="button" style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  )
}

export function CrmV2Search({
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: crmV2.bg,
        border: `1px solid ${crmV2.borderStrong}`,
        borderRadius: crmV2.radiusSm,
        padding: '0 12px',
        minWidth: 220,
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
}: {
  name?: string | null
  color?: string
  size?: number
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
        borderRadius: '50%',
        background: color || crmV2.gold,
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
        background: sorted ? '#e8f4f7' : crmV2.bgSoft,
        borderBottom: `1px solid ${crmV2.border}`,
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
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <td
      style={{
        padding: '14px 14px',
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
