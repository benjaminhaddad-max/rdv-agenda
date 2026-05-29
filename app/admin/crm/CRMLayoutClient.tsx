'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import CRMSidebar from '@/components/CRMSidebar'

function Inner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const embed = searchParams.get('embed') === '1'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f4ee' }}>
      {!embed && <CRMSidebar />}
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}

export default function CRMLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f4ee' }}>
        <CRMSidebar />
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>{children}</main>
      </div>
    }>
      <Inner>{children}</Inner>
    </Suspense>
  )
}
