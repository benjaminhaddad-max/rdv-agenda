'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import CRMSidebar from '@/components/CRMSidebar'
import CRMGlobalSearchBar from '@/components/CRMGlobalSearchBar'

function Inner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const embed = searchParams.get('embed') === '1'
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        if (!cancelled) setIsAdmin(u?.role === 'admin')
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false)
      })
    return () => { cancelled = true }
  }, [])

  // Sidebar + barre de recherche réservées aux admins.
  // Les closers/télépros peuvent ouvrir une fiche contact partagée
  // (/admin/crm/contacts/[id]) mais ne doivent pas voir la navigation admin.
  const showAdminChrome = !embed && isAdmin === true

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f4ee' }}>
      {showAdminChrome && <CRMSidebar />}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>
        {showAdminChrome && <CRMGlobalSearchBar />}
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
