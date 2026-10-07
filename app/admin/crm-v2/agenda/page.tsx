'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Clock, Users, Briefcase, Inbox, Link2 } from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'
import AdminAvailability from '@/components/AdminAvailability'
import TeleproManager from '@/components/TeleproManager'
import CloserManager from '@/components/CloserManager'
import UnassignedQueue from '@/components/UnassignedQueue'
import SiteContenusPanel from '@/components/SiteContenusPanel'
import { CrmV2CloseButton, CrmV2Drawer, CrmV2Page } from '@/components/crm-v2/primitives'
import { AgendaToolButton } from '@/components/crm-v2/agenda/AgendaControls'
import { crmV2 } from '@/lib/crm-v2-theme'

function AgendaV2Inner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [calendarKey, setCalendarKey] = useState(0)
  const [showAvailability, setShowAvailability] = useState(false)
  const [showTelepros, setShowTelepros] = useState(false)
  const [showClosers, setShowClosers] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [showSite, setShowSite] = useState(false)
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null)

  // Ouverture directe des panneaux depuis la sidebar (?open=telepros|closers)
  useEffect(() => {
    const open = searchParams.get('open')
    if (open === 'telepros') setShowTelepros(true)
    if (open === 'closers') setShowClosers(true)
    if (open === 'telepros' || open === 'closers') {
      router.replace('/admin/crm-v2/agenda', { scroll: false })
    }
  }, [searchParams, router])

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/appointments?unassigned=true')
      if (res.ok) {
        const data = await res.json()
        setUnassignedCount(Array.isArray(data) ? data.length : 0)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchCount() }, [fetchCount])

  const handleAssigned = useCallback(() => {
    setCalendarKey(k => k + 1)
    fetchCount()
  }, [fetchCount])

  const tools = (
    <>
      <AgendaToolButton
        icon={<Inbox size={14} />}
        label="File d'attente"
        onClick={() => setShowQueue(true)}
        badge={unassignedCount}
        warn={!!unassignedCount && unassignedCount > 0}
      />
      <AgendaToolButton icon={<Users size={14} />} label="Télépros" onClick={() => setShowTelepros(true)} />
      <AgendaToolButton icon={<Briefcase size={14} />} label="Closers" onClick={() => setShowClosers(true)} />
      <AgendaToolButton icon={<Clock size={14} />} label="Disponibilités" onClick={() => setShowAvailability(true)} />
      <AgendaToolButton icon={<Link2 size={14} />} label="Site & Contenus" onClick={() => setShowSite(true)} />
    </>
  )

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Gabarit D : l'en-tête (titre, navigation, vues, Nouveau RDV, filtres, légende) est rendu par WeekCalendar */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <WeekCalendar
          key={calendarKey}
          adminMode
          title="Agenda"
          onNewRdv={() => { window.location.href = '/telepro' }}
          toolbarExtra={tools}
        />
      </div>

      <CrmV2Drawer
        open={showQueue}
        onClose={() => setShowQueue(false)}
        width={640}
        header={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: crmV2.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Inbox size={16} color={crmV2.gold} /> File d&apos;attente — RDV non assignés
            </span>
            <CrmV2CloseButton onClick={() => setShowQueue(false)} />
          </div>
        }
      >
        <UnassignedQueue onAssigned={() => { handleAssigned(); fetchCount() }} />
      </CrmV2Drawer>

      {showAvailability && <AdminAvailability onClose={() => setShowAvailability(false)} />}
      {showTelepros && <TeleproManager onClose={() => setShowTelepros(false)} />}
      {showClosers && <CloserManager onClose={() => setShowClosers(false)} />}
      {showSite && <SiteContenusPanel onClose={() => setShowSite(false)} />}
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
