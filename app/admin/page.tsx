'use client'

import { useState, useCallback } from 'react'
import { LayoutDashboard, Calendar, Clock, Users, Briefcase, GitMerge, AlertTriangle } from 'lucide-react'
import UnassignedQueue from '@/components/UnassignedQueue'
import WeekCalendar from '@/components/WeekCalendar'
import AdminAvailability from '@/components/AdminAvailability'
import TeleproManager from '@/components/TeleproManager'
import CloserManager from '@/components/CloserManager'
import DoublonsManager from '@/components/DoublonsManager'
import CheckRdvCloserPanel from '@/components/CheckRdvCloserPanel'
import LogoutButton from '@/components/LogoutButton'

export default function AdminPage() {
  const [calendarKey, setCalendarKey] = useState(0)
  const [showAvailability, setShowAvailability] = useState(false)
  const [showTelepros, setShowTelepros] = useState(false)
  const [showClosers, setShowClosers] = useState(false)
  const [showDoublons, setShowDoublons] = useState(false)
  const [showCheckRdv, setShowCheckRdv] = useState(false)

  // Quand un RDV est assigné, on rafraîchit le calendrier
  const handleAssigned = useCallback(() => {
    setCalendarKey(k => k + 1)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1117' }}>
      {/* Top bar admin */}
      <div style={{
        padding: '0 24px',
        height: 56,
        background: '#1a1d27',
        borderBottom: '1px solid #2a2d3e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(245,158,11,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LayoutDashboard size={16} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>Admin</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#555870' }}>Vue de Pascal — Chef des closers</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowTelepros(true)}
            style={{
              background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.25)',
              borderRadius: 8, padding: '6px 14px',
              color: '#6b87ff', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <Users size={13} />
            Télépros
          </button>
          <button
            onClick={() => setShowClosers(true)}
            style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8, padding: '6px 14px',
              color: '#f59e0b', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <Briefcase size={13} />
            Closers
          </button>
          <button
            onClick={() => setShowCheckRdv(true)}
            style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8, padding: '6px 14px',
              color: '#f59e0b', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <AlertTriangle size={13} />
            Check RDV Closer
          </button>
          <button
            onClick={() => setShowDoublons(true)}
            style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8, padding: '6px 14px',
              color: '#ef4444', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <GitMerge size={13} />
            Doublons
          </button>
          <button
            onClick={() => setShowAvailability(true)}
            style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 8, padding: '6px 14px',
              color: '#22c55e', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <Clock size={13} />
            Disponibilités
          </button>
          <a
            href="/closer"
            style={{
              background: '#252840', border: '1px solid #2a2d3e',
              borderRadius: 8, padding: '6px 14px',
              color: '#8b8fa8', fontSize: 12, cursor: 'pointer',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Calendar size={13} />
            Mon agenda
          </a>
          <a
            href="/telepro"
            style={{
              background: 'rgba(79,110,247,0.1)', border: '1px solid rgba(79,110,247,0.25)',
              borderRadius: 8, padding: '6px 14px',
              color: '#6b87ff', fontSize: 12, cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            + Nouveau RDV
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* Main content — split layout */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* File d'attente non-assignés */}
        <div style={{
          background: '#1a1d27',
          borderBottom: '2px solid #f59e0b',
          flexShrink: 0,
        }}>
          <UnassignedQueue onAssigned={handleAssigned} />
        </div>

        {/* Calendrier global (tous les closers) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '10px 24px',
            background: '#1a1d27',
            borderBottom: '1px solid #2a2d3e',
            fontSize: 12, fontWeight: 600, color: '#555870',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            📅 Agenda des closers
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WeekCalendar key={calendarKey} adminMode />
          </div>
        </div>
      </div>
      {/* Modal disponibilités */}
      {showAvailability && (
        <AdminAvailability onClose={() => setShowAvailability(false)} />
      )}
      {/* Panel télépros */}
      {showTelepros && (
        <TeleproManager onClose={() => setShowTelepros(false)} />
      )}
      {/* Panel closers */}
      {showClosers && (
        <CloserManager onClose={() => setShowClosers(false)} />
      )}
      {/* Panel doublons */}
      {showDoublons && (
        <DoublonsManager onClose={() => setShowDoublons(false)} />
      )}
      {/* Panel check RDV closer */}
      {showCheckRdv && (
        <CheckRdvCloserPanel onClose={() => setShowCheckRdv(false)} />
      )}
    </div>
  )
}
