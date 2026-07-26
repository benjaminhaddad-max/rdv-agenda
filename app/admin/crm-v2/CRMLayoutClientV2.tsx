'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import CRMSidebarV2 from '@/components/crm-v2/CRMSidebarV2'
import CRMGlobalSearchBar from '@/components/CRMGlobalSearchBar'
import LogoutButton from '@/components/LogoutButton'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'

type Me = {
  role?: string
  slug?: string
  name?: string
}

/* Sections classiques qui existent aussi en V2 (routes bridgées). */
const V2_SEGMENTS = new Set([
  'contacts', 'deals', 'transactions', 'tasks', 'agenda', 'dashboard',
  'import', 'doublons', 'recherche-prop', 'proprietes', 'users', 'parametres',
  'campaigns', 'email-templates', 'workflows', 'forms', 'meta-ads',
  'ads-dashboard', 'sms-factor', 'events', 'alternance', 'reports',
])

/**
 * Design only : les pages classiques génèrent des liens vers /admin/crm/…
 * On réécrit leurs href vers /admin/crm-v2/… pour rester dans le shell V2.
 * Aucune logique métier n'est modifiée (le comportement du lien reste natif).
 */
function useV2LinkRewriter(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const rewrite = (a: HTMLAnchorElement) => {
      const href = a.getAttribute('href')
      if (!href || href.startsWith('/admin/crm-v2')) return
      if (href === '/admin/crm' || href.startsWith('/admin/crm?')) {
        a.setAttribute('href', '/admin/crm-v2' + href.slice('/admin/crm'.length))
        return
      }
      if (!href.startsWith('/admin/crm/')) return
      const rest = href.slice('/admin/crm/'.length)
      const seg = rest.split(/[/?#]/)[0]
      if (!V2_SEGMENTS.has(seg)) return
      a.setAttribute('href', '/admin/crm-v2/' + rest)
    }

    let scheduled = false
    const scan = () => {
      scheduled = false
      root.querySelectorAll<HTMLAnchorElement>('a[href^="/admin/crm"]').forEach(rewrite)
    }
    const schedule = () => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(scan)
    }

    scan()
    const mo = new MutationObserver(schedule)
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] })
    return () => mo.disconnect()
  }, [rootRef])
}

function Inner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const rootRef = useRef<HTMLDivElement>(null)
  useV2LinkRewriter(rootRef)
  const embed = searchParams.get('embed') === '1'
  const hideSearchBar = pathname?.startsWith('/admin/crm-v2/agenda')
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        if (!cancelled) setMe(u ?? {})
      })
      .catch(() => {
        if (!cancelled) setMe({})
      })
    return () => { cancelled = true }
  }, [])

  const role = me?.role
  const showAdminChrome = !embed && role === 'admin'
  const mobileBottomPad = showAdminChrome && isMobile ? 56 : 0
  const showUserChrome = !embed && (role === 'closer' || role === 'telepro')

  const backHref =
    role === 'telepro'
      ? '/telepro'
      : role === 'closer' && me?.slug
        ? `/closer/${me.slug}`
        : '/'

  return (
    <div
      ref={rootRef}
      className="crm-v2 crm-v2-skin"
      style={{ display: 'flex', minHeight: '100vh', background: crmV2.bgSoft, fontFamily: crmV2.font }}
    >
      {showAdminChrome && <CRMSidebarV2 />}
      <main style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        maxHeight: '100vh', boxSizing: 'border-box', gap: 12,
        padding: isMobile ? `0 0 ${mobileBottomPad}px` : (showAdminChrome ? '12px 12px 12px 0' : 0),
      }}>
        {showAdminChrome && !hideSearchBar && (
          <div style={{
            background: crmV2.bg, border: `1px solid ${crmV2.border}`,
            borderRadius: isMobile ? 0 : 18, boxShadow: crmV2.shadow, flexShrink: 0,
          }}>
            <CRMGlobalSearchBar />
          </div>
        )}

        {showUserChrome && (
          <div style={{ flexShrink: 0 }}>
            <div style={{
              background: crmV2.bg,
              borderBottom: `1px solid ${crmV2.border}`,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <a
                href={backHref}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: `1px solid ${crmV2.border}`,
                  borderRadius: crmV2.radiusSm, padding: '6px 12px',
                  color: crmV2.textMuted, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}
              >
                <ArrowLeft size={14} /> Retour à mon espace
              </a>
              {me?.name && (
                <div style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 600 }}>{me.name}</div>
              )}
              <LogoutButton />
            </div>
            {!hideSearchBar && <CRMGlobalSearchBar />}
          </div>
        )}

        <div style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          background: crmV2.bg,
          border: (isMobile || !showAdminChrome) ? 'none' : `1px solid ${crmV2.border}`,
          borderRadius: (isMobile || !showAdminChrome) ? 0 : 20,
          boxShadow: (isMobile || !showAdminChrome) ? 'none' : crmV2.shadow,
        }}>
          {children}
        </div>
      </main>
    </div>
  )
}

export default function CRMLayoutClientV2({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="crm-v2" style={{ display: 'flex', minHeight: '100vh', background: crmV2.bgSoft }}>
        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ padding: 40, color: crmV2.textMuted, fontSize: 13 }}>Chargement…</div>
        </main>
      </div>
    }>
      <Inner>{children}</Inner>
    </Suspense>
  )
}
