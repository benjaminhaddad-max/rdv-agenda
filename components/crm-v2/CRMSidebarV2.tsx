'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Users, Briefcase, Mail, FileText, LayoutDashboard,
  ChevronLeft, ChevronRight, ChevronDown, LogOut, Calendar, CalendarDays,
  BarChart3, CheckSquare, Workflow, Upload, GitMerge, Settings as SettingsIcon,
  Database, Facebook, AlertTriangle, MessageSquare, Search, Menu, X, List,
  Palette, Repeat2, FileSignature, Phone, ExternalLink, Presentation, PhoneCall, LifeBuoy,
} from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2BottomSheet } from '@/components/crm-v2/primitives'

interface NavItem {
  key: string
  label: string
  href: string
  icon: typeof Users
  badgeKey?: 'errors' | 'support'
  ready?: boolean
  external?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

/** Toutes les routes sidebar ont une page V2 (redesign ou bridge classique). */
const READY = new Set([
  'crm-dashboard', 'agenda', 'contacts', 'transactions', 'tasks',
  'import', 'doublons', 'recherche-prop', 'proprietes', 'users', 'parametres',
  'campaigns', 'programs', 'mkt-lists', 'brands', 'segments', 'templates',
  'workflows', 'forms', 'meta-ads', 'ads-dashboard', 'sms-factor', 'events',
  'alternance', 'reports', 'suivi-commercial', 'telepro-rdv-report', 'dashboard', 'errors',
  'webinars',
])

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'CRM',
    items: [
      { key: 'crm-dashboard', label: 'Dashboard', href: '/admin/crm-v2/dashboard', icon: LayoutDashboard, ready: true },
      { key: 'agenda', label: 'Agenda', href: '/admin/crm-v2/agenda', icon: Calendar, ready: true },
      { key: 'contacts', label: 'Contacts', href: '/admin/crm-v2', icon: Users, ready: true },
      { key: 'transactions', label: 'Transactions', href: '/admin/crm-v2/transactions', icon: Briefcase, ready: true },
      { key: 'tasks', label: 'Mes tâches', href: '/admin/crm-v2/tasks', icon: CheckSquare, ready: true },
      { key: 'service-technique', label: 'Service technique', href: '/admin/crm-v2/service-technique', icon: LifeBuoy, badgeKey: 'support', ready: true },
      { key: 'import', label: 'Import CSV', href: '/admin/crm-v2/import', icon: Upload, ready: true },
      { key: 'doublons', label: 'Doublons', href: '/admin/crm-v2/doublons', icon: GitMerge, ready: true },
      { key: 'recherche-prop', label: 'Recherche propriété', href: '/admin/crm-v2/recherche-prop', icon: Search, ready: true },
      { key: 'proprietes', label: 'Propriétés', href: '/admin/crm-v2/proprietes', icon: Database, ready: true },
      { key: 'users', label: 'Utilisateurs', href: '/admin/crm-v2/users', icon: Users, ready: true },
      { key: 'parametres', label: 'Paramètres', href: '/admin/crm-v2/parametres', icon: SettingsIcon, ready: true },
    ],
  },
  {
    title: 'Équipe',
    items: [
      { key: 'espace-telepro', label: 'Espace télépro', href: '/telepro', icon: Phone, ready: true, external: true },
      { key: 'manage-telepros', label: 'Télépros', href: '/admin/crm-v2/agenda?open=telepros', icon: Users, ready: true },
      { key: 'manage-closers', label: 'Closers', href: '/admin/crm-v2/agenda?open=closers', icon: Briefcase, ready: true },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { key: 'campaigns', label: 'Campagnes', href: '/admin/crm-v2/campaigns', icon: Mail },
      { key: 'webinars', label: 'Présentation webinaire', href: '/admin/crm-v2/campaigns/webinars', icon: Presentation },
      { key: 'programs', label: 'Programmes', href: '/admin/crm-v2/campaigns/programs', icon: Repeat2 },
      { key: 'mkt-lists', label: 'Listes marketing', href: '/admin/crm-v2/campaigns/marketing-lists', icon: List },
      { key: 'brands', label: 'Marques', href: '/admin/crm-v2/campaigns/brands', icon: Palette },
      { key: 'segments', label: 'Segments', href: '/admin/crm-v2/campaigns/segments', icon: Users },
      { key: 'templates', label: 'Modèles email', href: '/admin/crm-v2/email-templates', icon: FileText },
      { key: 'workflows', label: 'Workflows', href: '/admin/crm-v2/workflows', icon: Workflow },
      { key: 'forms', label: 'Formulaires', href: '/admin/crm-v2/forms', icon: FileText },
      { key: 'meta-ads', label: 'Meta Lead Ads', href: '/admin/crm-v2/meta-ads', icon: Facebook },
      { key: 'ads-dashboard', label: 'Dashboard Ads', href: '/admin/crm-v2/ads-dashboard', icon: BarChart3 },
      { key: 'sms-factor', label: 'SMS Factor', href: '/admin/crm-v2/sms-factor', icon: MessageSquare },
      { key: 'events', label: 'Événements', href: '/admin/crm-v2/events', icon: CalendarDays },
    ],
  },
  {
    title: 'Alternance',
    items: [
      { key: 'alternance', label: 'Contrats alternance', href: '/admin/crm-v2/alternance', icon: FileSignature },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { key: 'reports', label: 'Dashboards & Rapports', href: '/admin/crm-v2/reports', icon: BarChart3 },
      { key: 'suivi-commercial', label: 'Suivi commercial', href: '/admin/crm-v2/reports/suivi-commercial', icon: PhoneCall, ready: true },
      { key: 'telepro-rdv-report', label: 'RDV par télépro', href: '/admin/crm-v2/reports/telepro-rdv', icon: Phone },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/admin', icon: LayoutDashboard, ready: true },
      { key: 'errors', label: 'Erreurs', href: '/admin/crm-v2/errors', icon: AlertTriangle, badgeKey: 'errors', ready: true },
    ],
  },
]

/* Palette navy Diploma — utilisée uniquement pour le chrome V2 (design only) */
const NAVY = {
  bg: '#241F3F',
  solid: '#241F3F',
  border: 'rgba(255, 255, 255, 0.08)',
  text: '#eef2f8',
  muted: '#ffffff',
  faint: 'rgba(255, 255, 255, 0.72)',
  goldIcon: '#e3c878',
  goldText: '#f0d999',
  goldBg: 'rgba(201, 168, 76, 0.22)',
  logout: '#ff9298',
}

const MOBILE_TABS = [
  { key: 'contacts', label: 'Contacts', href: '/admin/crm-v2', icon: Users },
  { key: 'tasks', label: 'Tâches', href: '/admin/crm-v2/tasks', icon: CheckSquare },
  { key: 'transactions', label: 'Deals', href: '/admin/crm-v2/transactions', icon: Briefcase },
  { key: 'agenda', label: 'Agenda', href: '/admin/crm-v2/agenda', icon: Calendar },
] as const

export default function CRMSidebarV2() {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [errorCount, setErrorCount] = useState(0)
  const [supportCount, setSupportCount] = useState(0)
  // Rubriques repliées (mémorisées dans le navigateur)
  const [foldedSections, setFoldedSections] = useState<string[]>([])

  // Service technique : demandes à valider par un admin + réponses non lues
  useEffect(() => {
    let cancelled = false
    async function fetchSupport() {
      try {
        const res = await fetch('/api/support/tickets?scope=all', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        const toValidate = (j.tickets || []).filter((t: { status: string }) => t.status === 'validation').length
        if (!cancelled) setSupportCount(toValidate + (j.unread || 0))
      } catch { /* ignore */ }
    }
    fetchSupport()
    const id = setInterval(fetchSupport, 120_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('crm-v2-sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
    try {
      const folded = JSON.parse(localStorage.getItem('crm-v2-sidebar-folded-sections') || '[]')
      if (Array.isArray(folded)) setFoldedSections(folded.filter((t): t is string => typeof t === 'string'))
    } catch { /* ignore */ }
  }, [])

  const toggleSection = (title: string) => {
    setFoldedSections(prev => {
      const next = prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
      try { localStorage.setItem('crm-v2-sidebar-folded-sections', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    async function fetchCount() {
      try {
        const res = await fetch('/api/admin/errors?resolved=0&limit=1', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled) setErrorCount(typeof j.total === 'number' ? j.total : 0)
      } catch { /* ignore */ }
    }
    fetchCount()
    const id = setInterval(fetchCount, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const badgeFor = (key?: string) => (key === 'errors' ? errorCount : key === 'support' ? supportCount : 0)

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('crm-v2-sidebar-collapsed', String(next))
  }

  const navHrefs = NAV_SECTIONS.flatMap(s => s.items.map(i => i.href.split('?')[0]))

  const isActive = (href: string) => {
    // Liens d'ouverture de panneau : pas d'état actif (évite le double highlight avec Agenda)
    if (href.includes('?open=')) return false
    const pathOnly = href.split('?')[0]
    if (pathOnly === '/admin/crm-v2') return pathname === '/admin/crm-v2'
    if (pathOnly === '/telepro') return pathname.startsWith('/telepro')
    const nestedHit = navHrefs.some(other =>
      other !== pathOnly &&
      other.startsWith(pathOnly + '/') &&
      (pathname === other || pathname.startsWith(other + '/'))
    )
    if (nestedHit) return false
    return pathname === pathOnly || pathname.startsWith(pathOnly + '/')
  }

  const width = isMobile ? 0 : (collapsed ? 60 : 240)

  const linkStyle = (active: boolean, compact = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: compact ? '10px' : '9px 14px',
    borderRadius: crmV2.radiusPill,
    textDecoration: 'none',
    color: active ? NAVY.goldText : NAVY.muted,
    background: active ? NAVY.goldBg : 'transparent',
    fontSize: 13,
    fontWeight: active ? 700 : 600,
    justifyContent: compact ? 'center' : 'flex-start',
    transition: 'background .12s ease',
  })

  const renderNav = (onNavigate?: () => void) => (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
      {NAV_SECTIONS.map(section => {
        // En mode réduit (icônes), on affiche toujours tout. Rubrique repliée : seule la page active reste visible.
        const folded = !collapsed && foldedSections.includes(section.title)
        return (
        <div key={section.title} style={{ marginBottom: folded ? 8 : 18 }}>
          {!collapsed && (
            <button
              type="button"
              onClick={() => toggleSection(section.title)}
              title={folded ? 'Déplier' : 'Replier'}
              className="crm-v2-nav-section"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 10, fontWeight: 700, color: NAVY.faint,
                textTransform: 'uppercase', letterSpacing: 1, padding: '0 12px 8px',
              }}
            >
              <span>{section.title}</span>
              <ChevronDown size={13} style={{ transition: 'transform .15s ease', transform: folded ? 'rotate(-90deg)' : 'none' }} />
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {section.items.map(item => {
              const active = isActive(item.href)
              if (folded && !active) return null
              const Icon = item.icon
              const badge = badgeFor(item.badgeKey)
              const ready = item.ready ?? READY.has(item.key)
              return (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className="crm-v2-nav-link"
                  data-active={active ? 'true' : undefined}
                  style={linkStyle(active, collapsed)}
                >
                  <Icon size={16} strokeWidth={2} style={{ color: active ? NAVY.goldIcon : NAVY.faint, flexShrink: 0 }} />
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
                      {item.external && (
                        <ExternalLink size={11} style={{ color: NAVY.faint, flexShrink: 0, opacity: 0.7 }} />
                      )}
                      {!ready && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: NAVY.faint,
                          background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '1px 6px',
                        }}>
                          bientôt
                        </span>
                      )}
                      {badge > 0 && (
                        <span style={{
                          background: crmV2.danger, color: '#fff', fontSize: 10, fontWeight: 700,
                          minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, boxSizing: 'border-box',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </a>
              )
            })}
          </div>
        </div>
        )
      })}
    </nav>
  )

  const signOut = async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      const { createClient } = await import('@/lib/supabase')
      await createClient().auth.signOut()
    } catch { /* ignore */ }
    window.location.href = '/login'
  }

  if (isMobile) {
    // Onglet « Menu » actif quand le menu est ouvert ou qu'aucun autre onglet ne correspond à la page
    const tabActive = MOBILE_TABS.some(t => isActive(t.href))
    const menuActive = mobileMenuOpen || !tabActive
    const tabStyle = (active: boolean): React.CSSProperties => ({
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 2, textDecoration: 'none', background: 'none', border: 'none',
      padding: 0, cursor: 'pointer', fontFamily: 'inherit',
      color: active ? NAVY.goldIcon : '#ffffff', fontSize: 10, fontWeight: active ? 700 : 600,
    })
    return (
      <>
        <CrmV2BottomSheet
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          dark
          maxHeight="92dvh"
          header={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY.text }}>Hub Diploma</div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fermer le menu"
                style={{
                  width: 40, height: 40, marginRight: -8, background: 'none', border: 'none', cursor: 'pointer',
                  color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>
          }
        >
          <div style={{ padding: '8px 8px 12px' }}>
            {NAV_SECTIONS.map(section => (
              <div key={section.title} style={{ marginBottom: 8 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: NAVY.faint, textTransform: 'uppercase',
                  letterSpacing: 1, padding: '4px 10px 2px',
                }}>
                  {section.title}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0 2px' }}>
                  {section.items.map(item => {
                    const active = isActive(item.href)
                    const Icon = item.icon
                    const badge = badgeFor(item.badgeKey)
                    return (
                      <a
                        key={item.key}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 10px',
                          borderRadius: crmV2.radiusPill, textDecoration: 'none', boxSizing: 'border-box',
                          color: active ? NAVY.goldText : '#ffffff', background: active ? NAVY.goldBg : 'transparent',
                          fontSize: 13, fontWeight: active ? 700 : 600, whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0,
                        }}
                      >
                        <Icon size={16} strokeWidth={2} style={{ flexShrink: 0, color: active ? NAVY.goldIcon : NAVY.faint }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{item.label}</span>
                        {item.external && <ExternalLink size={11} style={{ color: NAVY.faint, flexShrink: 0, opacity: 0.7 }} />}
                        {badge > 0 && (
                          <span style={{
                            background: crmV2.danger, color: '#fff', fontSize: 10, fontWeight: 700,
                            minWidth: 18, height: 18, padding: '0 6px', borderRadius: 9, boxSizing: 'border-box',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}
            <a
              href="/login"
              onClick={signOut}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 10px', marginTop: 4,
                borderTop: `1px solid ${NAVY.border}`, color: NAVY.logout, fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}
            >
              <LogOut size={16} style={{ flexShrink: 0 }} /> Déconnexion
            </a>
          </div>
        </CrmV2BottomSheet>
        <nav style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, height: 56, boxSizing: 'content-box',
          background: NAVY.solid, borderTop: `1px solid ${NAVY.border}`,
          display: 'flex', zIndex: 40, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          fontFamily: crmV2.font,
        }}>
          {MOBILE_TABS.map(item => {
            const active = !mobileMenuOpen && isActive(item.href)
            const Icon = item.icon
            return (
              <a key={item.key} href={item.href} style={tabStyle(active)}>
                <Icon size={18} strokeWidth={2} />
                <span>{item.label}</span>
              </a>
            )
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-expanded={mobileMenuOpen}
            style={tabStyle(menuActive)}
          >
            <Menu size={18} strokeWidth={2} />
            <span>Menu</span>
          </button>
        </nav>
      </>
    )
  }

  return (
    <>
      {/* Survols (impossibles en style inline) */}
      <style>{`
        .crm-v2-nav-link:not([data-active="true"]):hover { background-color: rgba(255,255,255,0.07) !important; }
        .crm-v2-nav-section:hover { color: #ffffff !important; }
      `}</style>
      <aside style={{
        position: 'fixed', left: 12, top: 12, bottom: 12, width,
        background: NAVY.bg, border: `1px solid ${NAVY.border}`,
        borderRadius: 24, boxShadow: '0 8px 28px rgba(15, 31, 61, 0.28)',
        display: 'flex', flexDirection: 'column', transition: 'width .18s ease',
        zIndex: 30, overflow: 'hidden', fontFamily: crmV2.font,
      }}>
        <div style={{
          padding: collapsed ? '12px 10px' : '12px 14px',
          borderBottom: `1px solid ${NAVY.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          height: 64, boxSizing: 'border-box',
        }}>
          {collapsed ? (
            <div style={{
              width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
              flexShrink: 0, background: '#241F3F',
              boxShadow: '0 0 0 2px rgba(94, 188, 227, 0.35)',
            }}>
              <img
                src="/logo-hub-diploma-mark.png"
                alt="Hub Diploma"
                width={34}
                height={34}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          ) : (
            <img
              src="/logo-hub-diploma.png"
              alt="Hub Diploma"
              width={196}
              height={70}
              style={{ width: '100%', maxWidth: 196, height: 'auto', display: 'block' }}
            />
          )}
        </div>

        {renderNav()}

        <div style={{ padding: 8, borderTop: `1px solid ${NAVY.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a
            href="/login"
            onClick={signOut}
            className="crm-v2-nav-link"
            style={{ ...linkStyle(false, collapsed), color: NAVY.logout }}
            title={collapsed ? 'Déconnexion' : undefined}
          >
            <LogOut size={15} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Déconnexion</span>}
          </a>
          <button
            type="button"
            onClick={toggleCollapse}
            className="crm-v2-nav-link"
            title={collapsed ? 'Déplier la barre' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '10px' : '8px 12px',
              borderRadius: crmV2.radiusPill, border: 'none', background: 'transparent',
              color: NAVY.muted, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
              fontWeight: 600,
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            {!collapsed && <span>Réduire</span>}
          </button>
        </div>
      </aside>
      <div style={{ width: width ? width + 24 : 0, flexShrink: 0, transition: 'width .18s ease' }} />
    </>
  )
}
