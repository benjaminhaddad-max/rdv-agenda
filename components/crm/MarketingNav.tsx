'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import { Mail, LogOut } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase'

const LINKS = [
  { href: '/admin/crm/campaigns', label: 'Campagnes' },
  { href: '/admin/crm/campaigns/webinars', label: 'Présentation' },
  { href: '/admin/crm/campaigns/programs', label: 'Programmes' },
  { href: '/admin/crm/campaigns/brands', label: 'Marques' },
  { href: '/admin/crm/campaigns/marketing-lists', label: 'Listes marketing' },
  { href: '/admin/crm/email-templates', label: 'Templates' },
  { href: '/admin/crm/campaigns/segments', label: 'Segments CRM' },
  { href: '/admin/crm/events', label: 'Événements' },
]

export default function MarketingNav({ title }: { title?: string }) {
  const path = usePathname()
  const pathNorm = path.replace(/^\/admin\/crm-v2/, '/admin/crm')
  const isMobile = useIsMobile()

  const isActive = (href: string) => {
    const nestedHit = LINKS.some(other =>
      other.href !== href &&
      other.href.startsWith(href + '/') &&
      (pathNorm === other.href || pathNorm.startsWith(other.href + '/'))
    )
    return !nestedHit && (pathNorm === href || pathNorm.startsWith(href + '/'))
  }

  // Mobile : ligne 1 = retour + titre + déconnexion compacte (icône),
  // ligne 2 = liens de navigation sur une seule rangée scrollable.
  if (isMobile) {
    return (
      <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e5ddc8', color: '#0e1e35', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <a href="/admin/crm" style={{ color: '#4a6070', textDecoration: 'none', fontSize: 12, flexShrink: 0 }}>← CRM</a>
          <div style={{ width: 1, height: 20, background: '#e5ddc8', flexShrink: 0 }} />
          <Mail size={16} style={{ color: '#C9A84C', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Email Marketing'}</span>
          <button
            type="button"
            aria-label="Déconnexion"
            title="Déconnexion"
            onClick={async () => {
              await createClient().auth.signOut()
              window.location.href = '/login'
            }}
            style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, color: '#ef4444', cursor: 'pointer' }}
          >
            <LogOut size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap', margin: '0 -12px', padding: '0 12px 2px', WebkitOverflowScrolling: 'touch' }}>
          {LINKS.map(l => {
            const active = isActive(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  padding: '8px 12px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  fontWeight: active ? 600 : 500,
                  border: active ? '1px solid #C9A84C' : '1px solid #e5ddc8',
                  background: active ? '#0e1e35' : '#fff',
                  color: active ? '#fff' : '#4a6070',
                }}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 20px', minHeight: 52, background: '#fff', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0e1e35', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <a href="/admin/crm" style={{ color: '#4a6070', textDecoration: 'none', fontSize: 12 }}>← CRM</a>
        <div style={{ width: 1, height: 22, background: '#e5ddc8' }} />
        <Mail size={16} style={{ color: '#C9A84C' }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title || 'Email Marketing'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {LINKS.map(l => {
          const active = isActive(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: active ? 600 : 500,
                border: active ? '1px solid #C9A84C' : '1px solid #e5ddc8',
                background: active ? '#0e1e35' : '#fff',
                color: active ? '#fff' : '#4a6070',
              }}
            >
              {l.label}
            </Link>
          )
        })}
        <LogoutButton />
      </div>
    </div>
  )
}
