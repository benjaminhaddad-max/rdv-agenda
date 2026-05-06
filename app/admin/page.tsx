'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, Clock, Users, Briefcase,
  Plus, Inbox, Link2,
} from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'
import AdminAvailability from '@/components/AdminAvailability'
import TeleproManager from '@/components/TeleproManager'
import CloserManager from '@/components/CloserManager'
import UnassignedQueue from '@/components/UnassignedQueue'
import SiteContenusPanel from '@/components/SiteContenusPanel'
import LogoutButton from '@/components/LogoutButton'
import PlatformGuide from '@/components/PlatformGuide'
import ResourcesPanel from '@/components/ResourcesPanel'

export default function AdminPage() {
  const [calendarKey, setCalendarKey] = useState(0)
  const [showAvailability, setShowAvailability]   = useState(false)
  const [showTelepros, setShowTelepros]           = useState(false)
  const [showClosers, setShowClosers]             = useState(false)
  const [showQueue, setShowQueue]         = useState(false)
  const [showSite, setShowSite]           = useState(false)
  const [showGuide, setShowGuide]         = useState(false)
  const [showResources, setShowResources] = useState(false)
  const [unassignedCount, setUnassignedCount]     = useState<number | null>(null)

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624' }}>

      {/* ── Topbar principale ── */}
      <div style={{
        padding: '0 20px', height: 52, background: '#1d2f4b',
        borderBottom: '1px solid #2d4a6b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, width: 'auto', display: 'block' }} />
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LayoutDashboard size={13} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600 }}>Dashboard Admin</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href="/closer" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={12} /> Mon agenda
          </a>
          <a href="/admin/crm" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={12} /> CRM
          </a>
          <a href="/admin/users" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={12} /> Utilisateurs
          </a>
          <a href="/admin/migration" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '5px 12px', color: '#ef4444', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            🚀 Migration
          </a>
          <a href="/telepro" style={{ background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '5px 12px', color: '#ccac71', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={12} /> Nouveau RDV
          </a>
          <button
            onClick={() => setShowResources(true)}
            style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.25)', borderRadius: 8, padding: '6px 14px', color: '#ccac71', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            📦 Boîte à outils
          </button>
          <button
            onClick={() => setShowGuide(true)}
            style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 8, padding: '6px 14px', color: '#06b6d4', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            📖 Guide
          </button>
          <LogoutButton />
        </div>
      </div>

      {/* ── Barre secondaire — groupes d'outils ── */}
      <div style={{
        padding: '0 20px', height: 44, background: '#152438',
        borderBottom: '1px solid #2d4a6b',
        display: 'flex', alignItems: 'center', gap: 0,
        flexShrink: 0, overflowX: 'auto',
      }}>
        {/* File d'attente */}
        <button
          onClick={() => setShowQueue(true)}
          style={{
            position: 'relative',
            background: unassignedCount ? 'rgba(204,172,113,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${unassignedCount ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`,
            borderRadius: 7, padding: '4px 11px',
            color: unassignedCount ? '#ccac71' : '#555870',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
            marginRight: 16,
          }}
        >
          <Inbox size={12} />
          File d&apos;attente
          {unassignedCount !== null && (
            <span style={{ background: unassignedCount > 0 ? '#4cabdb' : '#243d5c', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, lineHeight: 1, flexShrink: 0 }}>
              {unassignedCount}
            </span>
          )}
        </button>

        <div style={{ width: 1, height: 22, background: '#2d4a6b', marginRight: 16 }} />

        {/* Équipe */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>Équipe</span>
          <ToolBtn icon={<Users size={12} />}     label="Télépros"        onClick={() => setShowTelepros(true)} />
          <ToolBtn icon={<Briefcase size={12} />} label="Closers"         onClick={() => setShowClosers(true)} />
          <ToolBtn icon={<Clock size={12} />}     label="Disponibilités"  onClick={() => setShowAvailability(true)} color="green" />
        </div>

        <div style={{ width: 1, height: 22, background: '#2d4a6b', marginRight: 16 }} />

        {/* Outils */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ToolBtn icon={<Link2 size={12} />} label="Site & Contenus" onClick={() => setShowSite(true)} color="blue" />
        </div>
      </div>

      {/* ── Calendrier ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <WeekCalendar key={calendarKey} adminMode />
      </div>

      {/* ── Drawer File d'attente ── */}
      {showQueue && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowQueue(false) }}>
          <div style={{ width: '100%', maxWidth: 620, background: '#1d2f4b', borderLeft: '1px solid #2d4a6b', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '2px solid #ccac71', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#ccac71' }}>📥 File d&apos;attente — RDV non assignés</span>
              <button onClick={() => setShowQueue(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>✕</button>
            </div>
            <div style={{ flex: 1 }}>
              <UnassignedQueue onAssigned={() => { handleAssigned(); fetchCount() }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showAvailability && <AdminAvailability onClose={() => setShowAvailability(false)} />}
      {showTelepros     && <TeleproManager    onClose={() => setShowTelepros(false)} />}
      {showClosers      && <CloserManager     onClose={() => setShowClosers(false)} />}
      {showSite         && <SiteContenusPanel onClose={() => setShowSite(false)} />}
      {showGuide        && <PlatformGuide     onClose={() => setShowGuide(false)} />}
      {showResources    && <ResourcesPanel role="admin" onClose={() => setShowResources(false)} />}
    </div>
  )
}

function ToolBtn({ icon, label, onClick, color = 'gold' }: {
  icon: React.ReactNode; label: string; onClick: () => void; color?: 'gold' | 'green' | 'red' | 'blue'
}) {
  const p = {
    gold:  { bg: 'rgba(204,172,113,0.1)', border: 'rgba(204,172,113,0.25)', text: '#ccac71' },
    green: { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)',   text: '#22c55e' },
    red:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   text: '#ef4444' },
    blue:  { bg: 'rgba(76,171,219,0.1)',  border: 'rgba(76,171,219,0.25)',  text: '#4cabdb' },
  }[color]
  const textColor = label === 'Site & Contenus' ? '#ffffff' : p.text
  return (
    <button onClick={onClick} style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: 7, padding: '4px 11px', color: textColor, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      {icon}{label}
    </button>
  )
}
