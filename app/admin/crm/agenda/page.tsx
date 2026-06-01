'use client'

import { useState, useCallback, useEffect } from 'react'
import { Calendar as CalendarIcon, Clock, Users, Briefcase, Plus, Inbox, Link2 } from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'
import AdminAvailability from '@/components/AdminAvailability'
import TeleproManager from '@/components/TeleproManager'
import CloserManager from '@/components/CloserManager'
import UnassignedQueue from '@/components/UnassignedQueue'
import SiteContenusPanel from '@/components/SiteContenusPanel'

export default function AgendaPage() {
  const [calendarKey, setCalendarKey] = useState(0)
  const [showAvailability, setShowAvailability] = useState(false)
  const [showTelepros, setShowTelepros] = useState(false)
  const [showClosers, setShowClosers] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [showSite, setShowSite] = useState(false)
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null)

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
    <div className="min-h-screen bg-[#f7f4ee] flex flex-col">
      {/* Header principal */}
      <div className="bg-white border-b border-[#e5ddc8]">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2ea3f2] to-[#0038f0] flex items-center justify-center">
              <CalendarIcon size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#0e1e35]">Agenda</h1>
              <p className="text-xs text-[#4a6070]">Planification et RDV de toute l&apos;équipe</p>
            </div>
          </div>
          <a
            href="/telepro"
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b89a5e] text-white transition-colors"
          >
            <Plus size={13} /> Nouveau RDV
          </a>
        </div>
      </div>

      {/* Barre secondaire — outils */}
      <div className="bg-white border-b border-[#e5ddc8]">
        <div className="max-w-[1600px] mx-auto px-6 py-2.5 flex items-center gap-3 flex-wrap">
          {/* File d'attente */}
          <button
            onClick={() => setShowQueue(true)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              unassignedCount
                ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                : 'bg-[#f7f4ee] border-[#e5ddc8] text-[#4a6070] hover:bg-slate-100'
            }`}
          >
            <Inbox size={12} />
            File d&apos;attente
            {unassignedCount !== null && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                unassignedCount > 0 ? 'bg-blue-500 text-white' : 'bg-slate-200 text-[#4a6070]'
              }`}>
                {unassignedCount}
              </span>
            )}
          </button>

          <div className="w-px h-5 bg-slate-200" />

          {/* Équipe */}
          <span className="text-[10px] font-bold text-[#a89e8a] uppercase tracking-wider">Équipe</span>
          <ToolBtn icon={<Users size={12} />}     label="Télépros"       onClick={() => setShowTelepros(true)} />
          <ToolBtn icon={<Briefcase size={12} />} label="Closers"        onClick={() => setShowClosers(true)} />
          <ToolBtn icon={<Clock size={12} />}     label="Disponibilités" onClick={() => setShowAvailability(true)} color="green" />

          <div className="w-px h-5 bg-slate-200" />

          {/* Outils */}
          <ToolBtn icon={<Link2 size={12} />} label="Site & Contenus" onClick={() => setShowSite(true)} color="blue" />
        </div>
      </div>

      {/* Calendrier */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <WeekCalendar key={calendarKey} adminMode />
      </div>

      {/* Drawer File d'attente (charte claire) */}
      {showQueue && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end"
          onClick={e => { if (e.target === e.currentTarget) setShowQueue(false) }}
        >
          <div className="w-full max-w-2xl bg-white border-l border-[#e5ddc8] h-full overflow-auto flex flex-col">
            <div className="px-5 py-4 border-b-2 border-[#C9A84C] flex items-center justify-between flex-shrink-0">
              <span className="font-bold text-sm text-[#C9A84C]">📥 File d&apos;attente — RDV non assignés</span>
              <button
                onClick={() => setShowQueue(false)}
                className="text-[#a89e8a] hover:text-[#4a6070] text-lg leading-none px-1.5"
              >
                ✕
              </button>
            </div>
            <div className="flex-1">
              <UnassignedQueue onAssigned={() => { handleAssigned(); fetchCount() }} />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAvailability && <AdminAvailability onClose={() => setShowAvailability(false)} />}
      {showTelepros     && <TeleproManager    onClose={() => setShowTelepros(false)} />}
      {showClosers      && <CloserManager     onClose={() => setShowClosers(false)} />}
      {showSite         && <SiteContenusPanel onClose={() => setShowSite(false)} />}
    </div>
  )
}

function ToolBtn({ icon, label, onClick, color = 'gold' }: {
  icon: React.ReactNode; label: string; onClick: () => void; color?: 'gold' | 'green' | 'red' | 'blue'
}) {
  const palette = {
    gold:  'bg-amber-50  border-amber-200 text-amber-700  hover:bg-amber-100',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
    red:   'bg-red-50    border-red-200    text-red-700    hover:bg-red-100',
    blue:  'bg-sky-50    border-sky-200    text-sky-700    hover:bg-sky-100',
  }[color]
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${palette}`}
    >
      {icon}{label}
    </button>
  )
}
