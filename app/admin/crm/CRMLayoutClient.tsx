'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import CRMSidebar from '@/components/CRMSidebar'
import CRMGlobalSearchBar from '@/components/CRMGlobalSearchBar'
import LogoutButton from '@/components/LogoutButton'

type Me = {
  role?: string
  slug?: string
  name?: string
  avatar_color?: string
}

function Inner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const embed = searchParams.get('embed') === '1'
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
  // Sidebar + barre de recherche admin réservées aux admins.
  const showAdminChrome = !embed && role === 'admin'
  // Closers/télépros : pas de navigation admin, mais une barre du haut
  // (retour vers leur espace + recherche globale) pour pouvoir se balader
  // dans le CRM et traiter des leads même non attribués.
  const showUserChrome = !embed && (role === 'closer' || role === 'telepro')

  const backHref =
    role === 'telepro'
      ? '/telepro'
      : role === 'closer' && me?.slug
        ? `/closer/${me.slug}`
        : '/'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f4ee' }}>
      {showAdminChrome && <CRMSidebar />}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>
        {showAdminChrome && <CRMGlobalSearchBar />}

        {showUserChrome && (
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                background: '#ffffff',
                borderBottom: '1px solid #e5ddc8',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <a
                href={backHref}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: '1px solid #e5ddc8',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: '#4a6070',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <ArrowLeft size={14} /> Retour à mon espace
              </a>
              {me?.name && (
                <div style={{ fontSize: 12, color: '#4a6070', fontWeight: 600 }}>{me.name}</div>
              )}
              <LogoutButton />
            </div>
            <CRMGlobalSearchBar />
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {children}
        </div>
      </main>
    </div>
  )
}

export default function CRMLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f4ee' }}>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
        </main>
      </div>
    }>
      <Inner>{children}</Inner>
    </Suspense>
  )
}
