'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileSignature } from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import { ALTERNANCE_COLORS, ALTERNANCE_NAV } from '@/lib/alternance/constants'

export default function AlternanceShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div style={{
      minHeight: '100vh',
      background: ALTERNANCE_COLORS.bg,
      color: ALTERNANCE_COLORS.text,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        padding: '0 20px',
        height: 52,
        background: '#ffffff',
        borderBottom: `1px solid ${ALTERNANCE_COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/admin/crm" style={{ color: ALTERNANCE_COLORS.muted, textDecoration: 'none', fontSize: 12 }}>
            ← CRM
          </Link>
          <div style={{ width: 1, height: 22, background: ALTERNANCE_COLORS.border }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSignature size={16} style={{ color: ALTERNANCE_COLORS.accent }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Alternance — Diploma Santé</span>
          </div>
        </div>
        <LogoutButton />
      </div>

      <div style={{
        background: '#ffffff',
        borderBottom: `1px solid ${ALTERNANCE_COLORS.border}`,
        padding: '0 20px',
        display: 'flex',
        gap: 4,
        overflowX: 'auto',
      }}>
        {ALTERNANCE_NAV.map(item => {
          const active = item.href === '/admin/crm/alternance'
            ? pathname === item.href
            : pathname?.startsWith(item.href)
          return (
            <Link
              key={item.key}
              href={item.href}
              style={{
                padding: '12px 14px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? ALTERNANCE_COLORS.text : ALTERNANCE_COLORS.muted,
                textDecoration: 'none',
                borderBottom: active ? `2px solid ${ALTERNANCE_COLORS.accent}` : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
            {subtitle && <p style={{ margin: '6px 0 0', color: ALTERNANCE_COLORS.muted, fontSize: 13 }}>{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  )
}

export function AlternanceCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: ALTERNANCE_COLORS.card,
      border: `1px solid ${ALTERNANCE_COLORS.border}`,
      borderRadius: 10,
      padding: 16,
      ...style,
    }}>
      {children}
    </div>
  )
}

export function AlternanceBtn({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: ALTERNANCE_COLORS.accent, color: '#fff', border: 'none' },
    secondary: { background: '#fff', color: ALTERNANCE_COLORS.text, border: `1px solid ${ALTERNANCE_COLORS.border}` },
    danger: { background: '#ef6b51', color: '#fff', border: 'none' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant],
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

export function StatusPill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      color,
      background: bg,
    }}>
      {label}
    </span>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 48, color: ALTERNANCE_COLORS.muted, fontSize: 14 }}>
      {message}
    </div>
  )
}
