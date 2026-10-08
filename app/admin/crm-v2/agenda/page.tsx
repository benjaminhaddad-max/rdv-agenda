'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import WeekCalendar from '@/components/WeekCalendar'
import { CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'

function AgendaV2Inner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Anciens liens ?open=telepros|closers → page « Télépros / Closers »
  useEffect(() => {
    const open = searchParams.get('open')
    if (open === 'telepros' || open === 'closers') {
      router.replace(`/admin/crm-v2/equipe?tab=${open}`, { scroll: false })
    }
  }, [searchParams, router])

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Gabarit D : l'en-tête (titre, navigation, vues, Nouveau RDV, filtres, légende) est rendu par WeekCalendar */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <WeekCalendar
          adminMode
          title="Agenda"
          onNewRdv={() => { window.location.href = '/telepro' }}
        />
      </div>
    </CrmV2Page>
  )
}

export default function AgendaV2Page() {
  return (
    <Suspense fallback={
      <CrmV2Page>
        <div style={{ padding: 40, color: crmV2.textMuted, fontSize: 13 }}>Chargement…</div>
      </CrmV2Page>
    }>
      <AgendaV2Inner />
    </Suspense>
  )
}
