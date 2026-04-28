'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Users, Briefcase, Mail, FileText, LayoutDashboard,
  Rocket, ChevronLeft, ChevronRight, LogOut, Calendar, CalendarDays,
  ExternalLink, BarChart3, CheckSquare, Workflow, Upload,
} from 'lucide-react'

interface NavItem {
  key: string
  label: string
  href: string
  icon: typeof Users
  external?: boolean // ouvre dans un nouvel onglet
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'CRM',
    items: [
      { key: 'crm-dashboard', label: 'Dashboard',    href: '/admin/crm/dashboard',    icon: LayoutDashboard },
      { key: 'contacts',      label: 'Contacts',     href: '/admin/crm',              icon: Users },
      { key: 'transactions',  label: 'Transactions', href: '/admin/crm/transactions', icon: Briefcase },
      { key: 'tasks',         label: 'Mes tâches',   href: '/admin/crm/tasks',        icon: CheckSquare },
      { key: 'import',        label: 'Import CSV',   href: '/admin/crm/import',       icon: Upload },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { key: 'campaigns', label: 'Campagnes',     href: '/admin/crm/campaigns',       icon: Mail },
      { key: 'templates', label: 'Modèles email', href: '/admin/crm/email-templates', icon: FileText },
      { key: 'workflows', label: 'Workflows',     href: '/admin/crm/workflows',       icon: Workflow },
      { key: 'forms',     label: 'Formulaires',   href: '/admin/crm/forms',           icon: FileText },
      { key: 'events',    label: 'Événements',    href: '/admin/crm/events',          icon: CalendarDays },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { key: 'reports', label: 'Dashboards & Rapports', href: '/admin/crm/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { key: 'dashboard', label: 'Dashboard',  href: '/admin',           icon: LayoutDashboard },
      { key: 'agenda',    label: 'Mon agenda', href: '/closer',          icon: Calendar },
      { key: 'migration', label: 'Migration',  href: '/admin/migration', icon: Rocket },
    ],
  },
]

// ─── Charte HubSpot ────────────────────────────────────────────────────────
const COLORS = {
  bg:           '#ffffff',   // fond sidebar
  bgAlt:        '#f5f8fa',   // fond hover/section
  border:       '#cbd6e2',   // bordures
  textPrimary:  '#33475b',   // texte principal
  textMuted:    '#516f90',   // texte secondaire
  textLight:    '#7c98b6',   // icônes
  accent:       '#ccac71',   // doré Diploma Santé (accent)
  accentBg:     'rgba(204, 172, 113, 0.12)',
  danger:       '#ef6b51',   // rouge HubSpot-style
}

export default function CRMSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

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

  const width = collapsed ? 60 : 232

  return (
    <>
      <aside
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width,
          background: COLORS.bg,
          borderRight: `1px solid ${COLORS.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width .18s ease',
          zIndex: 30,
          overflow: 'hidden',
          fontFamily: '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Avenir Next", Avenir, "Helvetica Neue", sans-serif',
        }}
      >
        {/* Header : Logo + Diploma CRM */}
        <div style={{
          padding: collapsed ? '14px 10px' : '14px 18px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 56,
          boxSizing: 'border-box',
          background: COLORS.bg,
        }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            background: COLORS.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fff',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: 0.5,
          }}>
            DS
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, lineHeight: 1.2 }}>
                Diploma Santé
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>
                CRM
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          {NAV_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              {!collapsed && (
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: COLORS.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  padding: '0 12px 8px',
                }}>
                  {section.title}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {section.items.map(item => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      target={item.external ? '_blank' : undefined}
                      rel={item.external ? 'noopener noreferrer' : undefined}
                      title={collapsed ? item.label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: collapsed ? '10px' : '8px 12px',
                        borderRadius: 6,
                        textDecoration: 'none',
                        color: active ? COLORS.textPrimary : COLORS.textMuted,
                        background: active ? COLORS.accentBg : 'transparent',
                        borderLeft: active ? `3px solid ${COLORS.accent}` : '3px solid transparent',
                        paddingLeft: collapsed ? '10px' : '9px',
                        fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        transition: 'all .12s',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                      }}
                      onMouseEnter={e => {
                        if (!active) e.currentTarget.style.background = COLORS.bgAlt
                      }}
                      onMouseLeave={e => {
                        if (!active) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <Icon
                        size={16}
                        strokeWidth={2}
                        style={{
                          color: active ? COLORS.accent : COLORS.textLight,
                          flexShrink: 0,
                        }}
                      />
                      {!collapsed && (
                        <>
                          <span style={{ whiteSpace: 'nowrap', flex: 1 }}>{item.label}</span>
                          {item.external && (
                            <ExternalLink size={11} style={{ color: COLORS.textLight, flexShrink: 0, opacity: 0.6 }} />
                          )}
                        </>
                      )}
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer : logout + collapse */}
        <div style={{
          padding: 8,
          borderTop: `1px solid ${COLORS.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: COLORS.bg,
        }}>
          <a
            href="/login"
            onClick={async (e) => {
              e.preventDefault()
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
              padding: collapsed ? '10px' : '8px 12px',
              borderRadius: 6,
              textDecoration: 'none',
              color: COLORS.danger,
              fontSize: 13,
              fontWeight: 500,
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'background .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 107, 81, 0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title={collapsed ? 'Déconnexion' : undefined}
          >
            <LogOut size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
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
              background: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              color: COLORS.textMuted,
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
              fontWeight: 500,
              transition: 'all .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = COLORS.bgAlt; e.currentTarget.style.color = COLORS.textPrimary }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = COLORS.textMuted }}
            title={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
          >
            {collapsed ? <ChevronRight size={13} /> : <><ChevronLeft size={13} /> Réduire</>}
          </button>
        </div>
      </aside>

      {/* Spacer : décale le contenu principal */}
      <div style={{ width, flexShrink: 0, transition: 'width .18s ease' }} aria-hidden />
    </>
  )
}
