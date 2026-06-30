'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import { Mail } from 'lucide-react'

const LINKS = [
  { href: '/admin/crm/campaigns', label: 'Campagnes' },
  { href: '/admin/crm/campaigns/programs', label: 'Programmes' },
  { href: '/admin/crm/campaigns/brands', label: 'Marques' },
  { href: '/admin/crm/campaigns/marketing-lists', label: 'Listes marketing' },
  { href: '/admin/crm/campaigns/templates', label: 'Templates' },
  { href: '/admin/crm/campaigns/segments', label: 'Segments CRM' },
]

export default function MarketingNav({ title }: { title?: string }) {
  const path = usePathname()

  return (
    <div style={{ padding: '0 20px', height: 52, background: '#fff', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <a href="/admin/crm" style={{ color: '#4a6070', textDecoration: 'none', fontSize: 12 }}>← CRM</a>
        <div style={{ width: 1, height: 22, background: '#e5ddc8' }} />
        <Mail size={16} style={{ color: '#C9A84C' }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title || 'Email Marketing'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              textDecoration: 'none',
              border: '1px solid #e5ddc8',
              background: path === l.href || path.startsWith(l.href + '/') ? '#0e1e35' : '#fff',
              color: path === l.href || path.startsWith(l.href + '/') ? '#fff' : '#4a6070',
            }}
          >
            {l.label}
          </Link>
        ))}
        <LogoutButton />
      </div>
    </div>
  )
}
