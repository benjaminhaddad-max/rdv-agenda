'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Calendar as CalendarIcon, Clock, Users, Briefcase, Plus, Inbox, Link2 } from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'
import AdminAvailability from '@/components/AdminAvailability'
import TeleproManager from '@/components/TeleproManager'
import CloserManager from '@/components/CloserManager'
import UnassignedQueue from '@/components/UnassignedQueue'
import SiteContenusPanel from '@/components/SiteContenusPanel'
import { CrmV2Button, CrmV2Header, CrmV2Page } from '@/components/crm-v2/primitives'
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

  return (
    <CrmV2Page style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <CrmV2Header
        title="Agenda"
        subtitle="Planification et RDV de toute l’équipe"
        actions={
          <CrmV2Button variant="gold" onClick={() => { window.location.href = '/telepro' }}>
            <Plus size={14} /> Nouveau RDV
          </CrmV2Button>
        }
      />

      <div style={{
        background: crmV2.bg,
        borderBottom: `1px solid ${crmV2.border}`,
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <ToolBtn
          icon={<Inbox size={12} />}
          label="File d'attente"
          onClick={() => setShowQueue(true)}
          badge={unassignedCount}
          warn={!!unassignedCount && unassignedCount > 0}
        />
        <Sep />
        <ToolBtn icon={<Users size={12} />} label="Télépros" onClick={() => setShowTelepros(true)} />
        <ToolBtn icon={<Briefcase size={12} />} label="Closers" onClick={() => setShowClosers(true)} />
        <ToolBtn icon={<Clock size={12} />} label="Disponibilités" onClick={() => setShowAvailability(true)} />
        <Sep />
        <ToolBtn icon={<Link2 size={12} />} label="Site & Contenus" onClick={() => setShowSite(true)} />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: crmV2.bg }}>
        <WeekCalendar key={calendarKey} adminMode />
      </div>

      {showQueue && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(45,62,80,0.45)',
            display: 'flex', justifyContent: 'flex-end',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowQueue(false) }}
        >
          <div style={{
            width: '100%', maxWidth: 640, background: crmV2.bg,
            borderLeft: `1px solid ${crmV2.border}`, height: '100%',
            overflow: 'auto', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '14px 20px', borderBottom: `2px solid ${crmV2.gold}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: crmV2.gold, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <CalendarIcon size={14} /> File d&apos;attente — RDV non assignés
              </span>
              <button
                type="button"
                onClick={() => setShowQueue(false)}
                style={{ background: 'none', border: 'none', color: crmV2.textMuted, cursor: 'pointer', fontSize: 18 }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <UnassignedQueue onAssigned={() => { handleAssigned(); fetchCount() }} />
            </div>
          </div>
        </div>
      )}

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

function Sep() {
  return <div style={{ width: 1, height: 20, background: crmV2.border, margin: '0 4px' }} />
}

function ToolBtn({
  icon, label, onClick, badge, warn,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  badge?: number | null
  warn?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        borderRadius: crmV2.radiusSm,
        border: `1px solid ${warn ? '#f5c26b' : crmV2.border}`,
        background: warn ? '#fff8e6' : crmV2.bgSoft,
        color: warn ? '#b7791f' : crmV2.textMuted,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
      {typeof badge === 'number' && (
        <span style={{
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
          background: badge > 0 ? crmV2.link : crmV2.borderStrong,
          color: '#fff', fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}
