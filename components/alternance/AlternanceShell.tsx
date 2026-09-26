'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileSignature } from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import { ALTERNANCE_COLORS, ALTERNANCE_NAV } from '@/lib/alternance/constants'
import { useIsMobile } from '@/lib/useIsMobile'

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
  const isMobile = useIsMobile()

  return (
    <div style={{
      minHeight: '100vh',
      background: ALTERNANCE_COLORS.bg,
      color: ALTERNANCE_COLORS.text,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        padding: isMobile ? '0 12px' : '0 20px',
        height: 52,
        gap: 8,
        background: '#ffffff',
        borderBottom: `1px solid ${ALTERNANCE_COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, minWidth: 0 }}>
          <Link href="/admin/crm" style={{ color: ALTERNANCE_COLORS.muted, textDecoration: 'none', fontSize: 12 }}>
            ← CRM
          </Link>
          <div style={{ width: 1, height: 22, background: ALTERNANCE_COLORS.border }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FileSignature size={16} style={{ color: ALTERNANCE_COLORS.accent, flexShrink: 0 }} />
            {/* Mobile : libellé raccourci pour laisser la place au bouton de déconnexion */}
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isMobile ? 'Alternance' : 'Alternance — Diploma Santé'}
            </span>
          </div>
        </div>
        <LogoutButton />
      </div>

      <div style={{
        background: '#ffffff',
        borderBottom: `1px solid ${ALTERNANCE_COLORS.border}`,
        padding: isMobile ? '0 8px' : '0 20px',
        display: 'flex',
        gap: isMobile ? 0 : 4,
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
                flexShrink: 0,
                ...(isMobile ? { padding: '12px 10px' } : {}),
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      <div style={{ padding: isMobile ? '16px 12px' : '24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Mobile : titre et actions passent à la ligne si besoin ; les boutons ne rétrécissent jamais */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: isMobile ? 14 : 20, gap: isMobile ? 10 : 16,
          ...(isMobile ? { flexWrap: 'wrap' as const } : {}),
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 700, margin: 0, wordBreak: 'break-word' }}>{title}</h1>
            {subtitle && <p style={{ margin: '6px 0 0', color: ALTERNANCE_COLORS.muted, fontSize: 13 }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ flexShrink: 0, maxWidth: '100%' }}>{actions}</div>}
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
        // Icône + libellé toujours sur une seule ligne (les SVG sont en
        // display:block via le preflight Tailwind)
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        flexShrink: 0,
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
