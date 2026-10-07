'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import { Mail, LogOut, ChevronLeft } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase'

/** Lien pilule : actif = fond principal, sinon blanc bordé. */
function pillStyle(active: boolean, mobile: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    height: mobile ? 36 : 30,
    boxSizing: 'border-box',
    fontSize: mobile ? 13 : 12,
    padding: mobile ? '0 14px' : '0 12px',
    borderRadius: crmV2.radiusPill,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    border: `1px solid ${active ? crmV2.primary : crmV2.borderStrong}`,
    background: active ? crmV2.primary : crmV2.bg,
    color: active ? '#fff' : crmV2.textMuted,
  }
}

const backLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
  color: crmV2.link, textDecoration: 'none', fontSize: 13, fontWeight: 600,
}

const LINKS = [
  { href: '/admin/crm/campaigns', label: 'Campagnes' },
  { href: '/admin/crm/campaigns/webinars', label: 'Présentation' },
  { href: '/admin/crm/campaigns/programs', label: 'Programmes' },
  { href: '/admin/crm/campaigns/brands', label: 'Marques' },
  { href: '/admin/crm/campaigns/marketing-lists', label: 'Listes marketing' },
  { href: '/admin/crm/email-templates', label: 'Templates' },
  { href: '/admin/crm/campaigns/segments', label: 'Segments CRM' },
  { href: '/admin/crm/events', label: 'Événements' },
  { href: '/admin/crm/podcast', label: 'Podcast' },
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
      <div style={{ padding: '10px 12px', background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, color: crmV2.text, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <a href="/admin/crm" style={backLink}><ChevronLeft size={14} strokeWidth={2} /> CRM</a>
          <div style={{ width: 1, height: 20, background: crmV2.border, flexShrink: 0 }} />
          <Mail size={16} style={{ color: crmV2.gold, flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Email Marketing'}</span>
          <button
            type="button"
            aria-label="Déconnexion"
            title="Déconnexion"
            onClick={async () => {
              await createClient().auth.signOut()
              window.location.href = '/login'
            }}
            style={{ flexShrink: 0, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: crmV2.dangerSoft, border: '1px solid rgba(242,84,91,0.30)', borderRadius: crmV2.radiusPill, color: '#d13a41', cursor: 'pointer' }}
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
                style={pillStyle(active, true)}
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
    <div style={{ padding: '10px 28px', minHeight: 56, background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: crmV2.text, gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <a href="/admin/crm" style={backLink}><ChevronLeft size={14} strokeWidth={2} /> CRM</a>
        <div style={{ width: 1, height: 22, background: crmV2.border }} />
        <Mail size={16} style={{ color: crmV2.gold }} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title || 'Email Marketing'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {LINKS.map(l => {
          const active = isActive(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              style={pillStyle(active, false)}
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
