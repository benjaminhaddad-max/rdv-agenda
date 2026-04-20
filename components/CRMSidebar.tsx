'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Users, Briefcase, Mail, FileText, FileCode, Target, LayoutDashboard,
  Rocket, ChevronLeft, ChevronRight, LogOut, Calendar, Settings, Search,
} from 'lucide-react'

interface NavItem {
  key: string
  label: string
  href: string
  icon: typeof Users
  color?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'CRM',
    items: [
      { key: 'contacts',     label: 'Contacts',     href: '/admin/crm',              icon: Users,       color: '#06b6d4' },
      { key: 'transactions', label: 'Transactions', href: '/admin/crm/transactions', icon: Briefcase,   color: '#ccac71' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { key: 'campaigns', label: 'Campagnes',  href: '/admin/crm/campaigns', icon: Mail,     color: '#a855f7' },
      { key: 'forms',     label: 'Formulaires', href: '/admin/crm/forms',    icon: FileText, color: '#22c55e' },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { key: 'dashboard', label: 'Dashboard',  href: '/admin',               icon: LayoutDashboard, color: '#8b8fa8' },
      { key: 'agenda',    label: 'Mon agenda', href: '/closer',              icon: Calendar,        color: '#8b8fa8' },
      { key: 'migration', label: 'Migration',  href: '/admin/migration',     icon: Rocket,          color: '#ef4444' },
    ],
  },
]

export default function CRMSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Charge l'état "collapsed" depuis localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('crm-sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem('crm-sidebar-collapsed', String(next))
    }
  }

  const isActive = (href: string): boolean => {
    if (href === '/admin/crm') return pathname === '/admin/crm'
    return pathname.startsWith(href)
  }

  const width = collapsed ? 64 : 240

  return (
    <>
      <aside
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width,
          background: '#0b1624',
          borderRight: '1px solid #2d4a6b',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width .2s ease',
          zIndex: 30,
          overflow: 'hidden',
        }}
      >
        {/* Logo + nom */}
        <div style={{
          padding: collapsed ? '16px 12px' : '16px 18px',
          borderBottom: '1px solid #1d2f4b',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 52,
          boxSizing: 'border-box',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 22, width: 'auto', flexShrink: 0 }} />
          {!collapsed && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e4e7eb', letterSpacing: 0.3 }}>
              Diploma CRM
            </span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          {NAV_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 18 }}>
              {!collapsed && (
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#8b8fa8',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  padding: '0 10px 6px',
                }}>
                  {section.title}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {section.items.map(item => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  const accentColor = item.color || '#ccac71'
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: collapsed ? '10px' : '9px 12px',
                        borderRadius: 8,
                        textDecoration: 'none',
                        color: active ? accentColor : '#e4e7eb',
                        background: active ? `${accentColor}18` : 'transparent',
                        borderLeft: active ? `2px solid ${accentColor}` : '2px solid transparent',
                        fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        transition: 'all .12s',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                      }}
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget.style.background = '#152438')
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget.style.background = 'transparent')
                      }}
                    >
                      <Icon size={16} style={{ color: active ? accentColor : '#8b8fa8', flexShrink: 0 }} />
                      {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bouton collapse + logout en bas */}
        <div style={{ padding: 8, borderTop: '1px solid #1d2f4b', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a
            href="/login"
            onClick={async (e) => {
              e.preventDefault()
              try { await fetch('/api/auth/signout', { method: 'POST' }) } catch {}
              // Fallback Supabase direct
              try {
                const { createClient } = await import('@/lib/supabase')
                await createClient().auth.signOut()
              } catch {}
              window.location.href = '/login'
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '10px' : '9px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              color: '#ef4444',
              fontSize: 13,
              fontWeight: 500,
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            title={collapsed ? 'Déconnexion' : undefined}
          >
            <LogOut size={15} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Déconnexion</span>}
          </a>
          <button
            onClick={toggleCollapse}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px',
              background: '#152438',
              border: '1px solid #2d4a6b',
              borderRadius: 8,
              color: '#8b8fa8',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
            }}
            title={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
          >
            {collapsed ? <ChevronRight size={13} /> : <><ChevronLeft size={13} /> Réduire</>}
          </button>
        </div>
      </aside>

      {/* Spacer pour décaler le contenu principal */}
      <div style={{ width, flexShrink: 0, transition: 'width .2s ease' }} aria-hidden />
    </>
  )
}
