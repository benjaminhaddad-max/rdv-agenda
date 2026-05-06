'use client'

import { useSearchParams } from 'next/navigation'
import CRMSidebar from '@/components/CRMSidebar'

export default function CRMLayoutClient({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const embed = searchParams.get('embed') === '1'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {!embed && <CRMSidebar />}
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
